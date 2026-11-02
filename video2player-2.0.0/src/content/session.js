import { createOverlay } from './ui.js';
import { createShadowHost, el, pinStyle } from './shell.js';
import { findApiAncestor } from './video/pageapi.js';
import { findFeedScroller, stepFeed, waitForNextVideo } from './video/feed.js';
import { lockPageFullscreen } from './fullscreenlock.js';
import playerCss from './player.css';

// The names a site's own player hangs off the element wrapping the video.
const PLAYER_API_MARKERS = [
  'getAvailableQualityLevels',
  'setPlaybackQualityRange',
  'getOption',
  'levels',
];

const STALL_GRACE_MS = 400;
// Long enough for a site to finish re-attaching its stream. A scrub past the
// buffer makes YouTube tear its stream down and build it again, which on a slow
// connection takes seconds — and the player used to back out from under the
// finger that was scrubbing. A few seconds of black is a far smaller price than
// being thrown out of the film.
const EMPTIED_GRACE_MS = 6000;
const NETWORK_EMPTY = 0;
const RECOVER_DELAY_MS = 250;
const MAX_REPINS = 240;
// Below this share of the screen, a player that has lost fullscreen is playing
// in the box the site gave it — an embedded player's frame — rather than over
// the whole page, where it would still want its full set of controls.
const COMPACT_SCREEN_SHARE = 0.6;
// Turning the phone can cost the stage its fullscreen — the browser re-laying
// the screen out, or a site that reached it before the lock did. Losing it
// this close to a turn is not the user backing out.
const TURN_GRACE_MS = 1500;

const STAGE_STYLE = {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  margin: '0',
  padding: '0',
  border: '0',
  display: 'flex',
  'align-items': 'center',
  'justify-content': 'center',
  overflow: 'hidden',
  background: '#000',
  'z-index': '2147483646',
};

// A site's own player keeps rewriting the video's inline style — YouTube sets
// a pixel width, height and offset on every layout pass — which is what used to
// leave the picture stuck against the left edge or stretched across the screen
// after coming back from another app. Position and offsets are pinned here too,
// not only the size, and re-pinned whenever the site writes over them.
const VIDEO_STYLE = {
  position: 'relative',
  left: '0',
  top: '0',
  right: 'auto',
  bottom: 'auto',
  float: 'none',
  width: '100%',
  height: '100%',
  'max-width': 'none',
  'max-height': 'none',
  'min-width': '0',
  'min-height': '0',
  margin: '0',
  padding: '0',
  border: '0',
  display: 'block',
  'object-fit': 'contain',
  'object-position': '50% 50%',
  background: '#000',
  'transform-origin': 'center center',
};

// The crop and the colour are written by the visuals rather than pinned from
// the table above, but they are watched all the same: a site that rewrites the
// video's style wipes them, and the guard has to notice that it did.
const VIDEO_STYLE_KEYS = Object.keys(VIDEO_STYLE).concat([
  'transform',
  'filter',
]);

const captureVideoState = (video) => ({
  cssText: video.style.cssText,
  hasControlsAttribute: video.hasAttribute('controls'),
  playbackRate: video.playbackRate,
  volume: video.volume,
  isMuted: video.muted,
  parent: video.parentNode,
  nextSibling: video.nextSibling,
});

const restoreVideoState = (video, state) => {
  video.style.cssText = state.cssText;
  if (state.hasControlsAttribute) video.setAttribute('controls', '');
  else video.removeAttribute('controls');
  video.playbackRate = state.playbackRate;
  video.volume = state.volume;
  video.muted = state.isMuted;
};

const auditRestore = (video, state) => {
  const isSameParent = video.parentNode === state.parent;
  const isSameSibling = video.nextSibling === state.nextSibling;
  if (isSameParent && isSameSibling) return true;
  console.warn('Video2Player: video was not restored to its original position', {
    isSameParent,
    isSameSibling,
  });
  return false;
};

// The style is compared against what the browser serialised, never against
// what we asked for: setting `left: 0` reads back as `0px`, so comparing with
// the input would find a difference every time and re-pin on the strength of
// its own mutation record — a loop that recalculates style until the phone
// crawls.
const readStyle = (video) => {
  const seen = {};
  for (const name of VIDEO_STYLE_KEYS) {
    seen[name] = video.style.getPropertyValue(name);
  }
  return seen;
};

const isSameStyle = (first, second) => {
  if (first === null) return false;
  return VIDEO_STYLE_KEYS.every((name) => first[name] === second[name]);
};

// navigationUI is deliberately left at its default. Asking Gecko to hide it put
// Android into sticky immersive mode, where the first swipe up only brings the
// system bars back and a second one is needed to leave the app.
const requestFullscreen = async (element) => {
  if (!document.fullscreenEnabled) return false;
  try {
    await element.requestFullscreen();
    return true;
  } catch (error) {
    console.warn('Video2Player: fullscreen refused', error);
    return false;
  }
};

// Losing fullscreen is how the user leaves the player, and it is also how
// Android announces that it is taking the video into a floating window. The two
// look identical at the moment they happen and only differ a beat later, when
// an app that has gone into the background is no longer the focused one.
const isBackgrounded = () => document.hidden || !document.hasFocus();

const readOrientation = () => {
  const type = window.screen.orientation?.type;
  if (type) return type.split('-')[0];
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
};

const isSmallerThanScreen = () => {
  const screenArea = window.screen.width * window.screen.height;
  if (screenArea === 0) return false;
  const viewArea = window.innerWidth * window.innerHeight;
  return viewArea < screenArea * COMPACT_SCREEN_SHARE;
};

// Everything a part of the player hooks into the page is undone together. The
// stage keeps one scope for as long as the player is open; each video it shows
// gets a scope of its own, which goes when a feed moves on to the next one.
const createScope = () => {
  const undos = [];
  const timers = new Set();

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    undos.push(() => target.removeEventListener(type, handler, options));
  };

  const later = (handler, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      handler();
    }, delay);
    timers.add(timer);
    return timer;
  };

  const cancel = (timer) => {
    clearTimeout(timer);
    timers.delete(timer);
  };

  const dispose = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const undo of undos) undo();
    undos.length = 0;
  };

  return { listen, later, cancel, dispose };
};

// Gecko keeps a media element playing across a re-parent, but a site shim
// that reloads it leaves us holding an empty player. A quality switch empties
// the element too, so the verdict waits until the dust settles.
const watchForTeardown = (video, scope, onTornDown) => {
  let pending = null;

  // Any sign of life cancels the verdict. An element that is loading again is
  // an element the site is still using, whatever its readyState says at the
  // moment we happen to look.
  const revive = () => {
    if (pending === null) return;
    scope.cancel(pending);
    pending = null;
  };

  const LIFE_SIGNS = [
    'loadstart',
    'loadedmetadata',
    'progress',
    'seeked',
    'canplay',
    'playing',
  ];

  for (const name of LIFE_SIGNS) {
    scope.listen(video, name, revive);
  }

  scope.listen(video, 'emptied', () => {
    revive();
    pending = scope.later(() => {
      pending = null;
      const hasSource = video.currentSrc !== '' || video.srcObject !== null;
      // networkState is the honest one: NETWORK_EMPTY means the element has
      // no source at all, where a seek in progress reads as loading.
      const isEmpty = video.networkState === NETWORK_EMPTY;
      if (hasSource || video.readyState > 0 || !isEmpty) return;
      console.warn('Video2Player: the video was torn down, backing out');
      onTornDown();
    }, EMPTIED_GRACE_MS);
  });
};

// The screen is left to follow the phone. Locking it to landscape turned an
// upright TikTok or Reels video on its side the moment the player opened, and
// a film shot wide is one turn of the wrist away, which Android offers even
// with auto-rotate switched off.
export const createSession = (firstVideo, { onExit, settings, onPersist }) => {
  const stage = document.createElement('div');
  const ui = createShadowHost(playerCss);
  const scope = createScope();

  const layers = {
    warm: el('div', { class: 'layer warm' }),
    dim: el('div', { class: 'layer dim' }),
  };
  const loader = el('div', { class: 'feed-loader', hidden: '' });

  let isActive = false;
  let isStepping = false;
  let shown = null;
  let lastVideo = firstVideo;
  let relayoutFrame = 0;
  let unlockPageFullscreen = () => {};
  let lastTurnAt = -Infinity;
  let heldOrientation = readOrientation();

  const readScreen = () => {
    const isFullscreen = document.fullscreenElement === stage;
    return {
      isFullscreen,
      isCompact: !isFullscreen && isSmallerThanScreen(),
    };
  };

  const isTurning = () =>
    performance.now() - lastTurnAt < TURN_GRACE_MS ||
    readOrientation() !== heldOrientation;

  const relayout = () => {
    relayoutFrame = 0;
    if (shown) shown.relayout();
  };

  const scheduleRelayout = () => {
    if (relayoutFrame !== 0) return;
    relayoutFrame = requestAnimationFrame(relayout);
  };

  // Late-bound: showing a video needs the way out and the way to the next
  // video, and both of those need to be able to show one.
  const actions = { exit: () => {}, step: () => {}, fullscreen: () => {} };

  // Takes one video out of the page, puts it on the stage with the controls
  // over it, and returns what is needed to hand it back exactly as it was.
  const show = (video, { shouldPlay, isChromeShown }) => {
    const state = captureVideoState(video);
    const playerHost = findApiAncestor(video, PLAYER_API_MARKERS);
    const anchor = document.createComment('video2player');
    const own = createScope();

    let styleGuard = null;
    let pinnedStyle = null;
    let repinCount = 0;
    let overlay = null;

    // Re-pinning is bounded: a site that fights back with !important of its
    // own would otherwise trade writes with us for as long as the film lasts.
    // After the budget runs out the guard steps aside and the picture is
    // re-fitted on the ordinary relayout events instead.
    const pin = () => {
      if (isSameStyle(pinnedStyle, readStyle(video))) return;

      repinCount += 1;
      if (repinCount > MAX_REPINS) {
        if (styleGuard) styleGuard.disconnect();
        styleGuard = null;
        console.warn(
          'Video2Player: the site keeps rewriting the video, leaving it',
        );
        return;
      }

      pinStyle(video, VIDEO_STYLE);
      if (overlay) overlay.repin();
      pinnedStyle = readStyle(video);
    };

    video.replaceWith(anchor);
    video.removeAttribute('controls');
    pin();

    // The site is free to keep laying its player out; it just does not get to
    // move the picture we are showing.
    styleGuard = new MutationObserver(pin);
    styleGuard.observe(video, {
      attributes: true,
      attributeFilter: ['style', 'width', 'height'],
    });

    stage.prepend(video);
    watchForTeardown(video, own, () => actions.exit());
    own.listen(video, 'loadedmetadata', scheduleRelayout);
    own.listen(video, 'resize', scheduleRelayout);

    overlay = createOverlay({
      video,
      stage,
      shadow: ui.shadow,
      layers,
      onExit: () => actions.exit(),
      settings,
      onPersist,
      playerHost,
      onFeedStep: (direction) => actions.step(direction),
      onFullscreen: () => actions.fullscreen(),
      isChromeShown,
    });
    overlay.setScreen(readScreen());

    own.later(() => {
      if (shouldPlay && video.paused) video.play().catch(() => {});
    }, STALL_GRACE_MS);

    const release = () => {
      own.dispose();
      if (styleGuard) styleGuard.disconnect();
      styleGuard = null;
      overlay.destroy();
      restoreVideoState(video, state);
      if (anchor.isConnected) anchor.replaceWith(video);
      else video.remove();
      auditRestore(video, state);
    };

    lastVideo = video;
    return {
      video,
      release,
      notify: (text) => overlay.notify(text),
      showControls: () => overlay.showControls(),
      relayout: () => {
        pin();
        overlay.setScreen(readScreen());
        overlay.relayout();
      },
    };
  };

  const exit = () => {
    if (!isActive) return;
    isActive = false;

    if (relayoutFrame !== 0) cancelAnimationFrame(relayoutFrame);
    relayoutFrame = 0;
    scope.dispose();
    unlockPageFullscreen();

    if (document.fullscreenElement === stage) {
      document.exitFullscreen().catch(() => {});
    }

    if (shown) shown.release();
    shown = null;
    stage.remove();
    onExit(lastVideo);
  };

  // The video goes back into the page before the feed is moved: the site has
  // to find it where it left it, or it cannot pause it, recycle it, or tell
  // which one is next. The stage stays in fullscreen the whole time, so moving
  // on never needs a fresh gesture from the user to take the screen again.
  const step = async (direction) => {
    if (isStepping || shown === null) return;
    isStepping = true;

    const previous = shown.video;
    const previousSource = previous.currentSrc;
    shown.release();
    shown = null;
    loader.hidden = false;

    stepFeed(findFeedScroller(previous), direction);
    const next = await waitForNextVideo(previous, previousSource);

    loader.hidden = true;
    isStepping = false;
    if (!isActive) return;

    const target = next ?? (previous.isConnected ? previous : null);
    if (target === null) {
      exit();
      return;
    }
    // A swipe is a request for the next video, not for the controls: it comes
    // up the way the feed shows it, with nothing drawn over the picture.
    shown = show(target, { shouldPlay: true, isChromeShown: false });
    if (next === null) shown.notify('No more videos this way');
    scheduleRelayout();
  };

  actions.exit = exit;
  actions.step = step;
  actions.fullscreen = () => {
    requestFullscreen(stage).then(scheduleRelayout);
  };

  const openStage = () => {
    stage.dataset.video2playerStage = '';
    pinStyle(stage, STAGE_STYLE);
    stage.append(ui.host);
    ui.shadow.append(layers.warm, layers.dim, loader);
    document.body.append(stage);
  };

  const restoreFullscreen = () => {
    if (document.fullscreenElement === stage) return;
    // Gecko may refuse this without a fresh gesture. The stage covers the
    // viewport on its own, so the player stays usable either way.
    requestFullscreen(stage).then(scheduleRelayout);
  };

  const watchForReturn = () => {
    const noteTurn = () => {
      lastTurnAt = performance.now();
      scheduleRelayout();
    };

    // A turn keeps the player open, out of fullscreen, with its controls up:
    // the fullscreen button is then one tap away. Gecko will not hand the
    // screen back without a tap, so the player cannot take it back itself.
    scope.listen(document, 'fullscreenchange', () => {
      scheduleRelayout();
      if (document.fullscreenElement === stage) {
        heldOrientation = readOrientation();
        return;
      }
      scope.later(() => {
        if (!isActive) return;
        if (isBackgrounded()) return;
        if (isTurning()) {
          heldOrientation = readOrientation();
          if (shown) shown.showControls();
          return;
        }
        exit();
      }, RECOVER_DELAY_MS);
    });

    // Coming back from a floating window or from another app: re-take the
    // screen and re-fit the picture to whatever shape it is now.
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden) return;
      scope.later(() => {
        if (!isActive) return;
        restoreFullscreen();
        scheduleRelayout();
      }, RECOVER_DELAY_MS);
    });

    scope.listen(window, 'resize', scheduleRelayout);
    scope.listen(window, 'orientationchange', noteTurn);
    if (window.screen.orientation) {
      scope.listen(window.screen.orientation, 'change', noteTurn);
    }
  };

  const enter = async () => {
    if (isActive) return false;
    isActive = true;

    unlockPageFullscreen = lockPageFullscreen();
    openStage();
    // The picture first: a film that is playing opens with nothing drawn over
    // it, and a tap brings the controls up. One that is paused shows them, or
    // the screen would be a still frame with no hint of what to do next.
    shown = show(firstVideo, {
      shouldPlay: !firstVideo.paused,
      isChromeShown: firstVideo.paused,
    });
    watchForReturn();

    // The button that opens the player is drawn as a fullscreen icon, so it
    // takes the screen, every time.
    await requestFullscreen(stage);
    scheduleRelayout();
    return true;
  };

  return {
    enter,
    exit,
    stage,
    shadow: ui.shadow,
    layers,
    isActive: () => isActive,
  };
};
