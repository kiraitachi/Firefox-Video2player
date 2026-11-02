import { readSiteChapters } from './video/chapters.js';
import { createColorPanel } from './controls/colorpanel.js';
import { createMenu } from './controls/menu.js';
import { createPlaylistPanel } from './controls/playlistpanel.js';
import { createAudioTracks } from './video/audiotracks.js';
import { createPlaylist } from './video/playlist.js';
import { createQuality } from './video/quality.js';
import { createRecognizer } from './gestures/recognizer.js';
import { createSeekBar } from './controls/seekbar.js';
import { createSeeker } from './video/seek.js';
import { createSkipFeedback } from './controls/skipfeedback.js';
import { createIntroSkip } from './controls/introskip.js';
import { createIntroWatch } from './video/introwatch.js';
import { createTrackManager } from './video/tracks.js';
import { createVisuals } from './video/visuals.js';
import { el } from './shell.js';
import { isFeedShaped } from './gestures/swipe.js';
import { ZONE } from './gestures/zones.js';

const CHROME_IDLE_MS = 3000;
// Holding a side plays at the speed the sheet's 2x chip sets, forward — and
// the same speed backward, which no browser plays, so it is stepped instead.
const HOLD_RATE = 2;
// Rewinding waits for each step to land before taking the next one. Firing a
// seek every tenth of a second, as it used to, aborted every seek before the
// one in flight could paint a frame: on a real film the picture froze and
// nothing moved until the finger came off.
const REWIND_SETTLE_MS = 90;
const REWIND_STALL_MS = 600;
const TOAST_MS = 900;
const HINT_MS = 2200;
// The same distance both ways, as on every other phone player: five seconds
// back was too short to be worth a tap, and the button is not one people
// expect to count differently from its twin.
const SKIP_SECONDS = 10;
const SIDE_SKIP_SECONDS = {
  [ZONE.HOLD_LEFT]: -SKIP_SECONDS,
  [ZONE.HOLD_RIGHT]: SKIP_SECONDS,
};
const PLAYLIST_SETTLE_MS = 600;
const CHAPTER_TRIES_MS = [1200, 4000, 10000];

// A gear with eight teeth, worked out rather than pasted: drawn by hand the
// path runs to six hundred characters that nobody can check by eye.
const GEAR = { teeth: 8, outer: 9.6, root: 7.4, tip: 9, base: 14, hub: 3 };

const gearPoint = (radius, degrees) => {
  const angle = ((degrees - 90) * Math.PI) / 180;
  const x = 12 + radius * Math.cos(angle);
  const y = 12 + radius * Math.sin(angle);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
};

const buildGearPath = () => {
  const { teeth, outer, root, tip, base, hub } = GEAR;
  const parts = [];
  for (let index = 0; index < teeth; index++) {
    const centre = (index * 360) / teeth;
    const start = gearPoint(root, centre - base);
    parts.push(index === 0 ? `M${start}` : `A${root} ${root} 0 0 1 ${start}`);
    parts.push(`L${gearPoint(outer, centre - tip)}`);
    parts.push(`A${outer} ${outer} 0 0 1 ${gearPoint(outer, centre + tip)}`);
    parts.push(`L${gearPoint(root, centre + base)}`);
  }
  parts.push(`A${root} ${root} 0 0 1 ${gearPoint(root, -base)}Z`);
  parts.push(`M${12 + hub} 12a${hub} ${hub} 0 1 1-${hub * 2} 0`);
  parts.push(` ${hub} ${hub} 0 1 1 ${hub * 2} 0z`);
  return parts.join('');
};

const ICON = {
  exit: 'M6 6l12 12M18 6L6 18',
  chevron: 'M7 10l5 5 5-5',
  palette:
    'M12 3c-5 0-9 3.7-9 8.4 0 4.9 4 8.6 8.7 8.6 1.4 0 2.1-.9 2.1-1.9 ' +
    '0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-1 .8-1.8 1.8-1.8H16 ' +
    'c2.8 0 5-2.2 5-5C21 6.5 17 3 12 3z',
  settings: buildGearPath(),
  play: 'M8 5 19 12 8 19z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  pause: 'M6 5h3.6v14H6zM14.4 5h3.6v14h-3.6z',
};

const buildIcon = (path) =>
  el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    el('path', { d: path }),
  ]);

const buildButton = (label, icon, onClick, className = 'button') => {
  const attributes = { class: className, type: 'button', title: label };
  const graphic = typeof icon === 'string' ? buildIcon(icon) : icon;
  const button = el('button', attributes, [graphic]);
  button.addEventListener('click', onClick);
  return button;
};

// Paint on a palette, each blob its own colour: a lone outline read as a
// blank shape, and colour is what the panel behind it is about.
const PAINTS = [
  { x: 7.4, y: 11.6, colour: '#ff6b6b' },
  { x: 9.4, y: 7.3, colour: '#ffd166' },
  { x: 14.2, y: 6.9, colour: '#6ee7a8' },
  { x: 17.4, y: 10.4, colour: '#6cb8ff' },
];

const buildPaletteIcon = () =>
  el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    el('path', { d: ICON.palette }),
    ...PAINTS.map(({ x, y, colour }) =>
      el('circle', {
        cx: String(x),
        cy: String(y),
        r: '1.5',
        fill: colour,
        stroke: 'none',
      }),
    ),
  ]);

// A ring with an arrowhead and the number inside, the way phone players draw
// their skip controls.
const buildSkipIcon = (seconds) => {
  const isForward = seconds > 0;
  const arc = isForward
    ? 'M12 4.5A7.5 7.5 0 1 0 19.5 12'
    : 'M12 4.5A7.5 7.5 0 1 1 4.5 12';
  const head = isForward
    ? 'M12 1.4 12 7.6 15.6 4.5z'
    : 'M12 1.4 12 7.6 8.4 4.5z';

  return el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    el('path', { d: arc }),
    el('path', { d: head, fill: 'currentColor', stroke: 'none' }),
    el('text', {
      x: '12',
      y: '15.6',
      'text-anchor': 'middle',
      'font-size': '8.5',
      'font-weight': '600',
      fill: 'currentColor',
      stroke: 'none',
      text: String(Math.abs(seconds)),
    }),
  ]);
};

export const createOverlay = ({
  video,
  stage,
  shadow,
  layers,
  onExit,
  settings,
  onPersist,
  playerHost,
  onFeedStep,
  onFullscreen,
  isChromeShown = true,
}) => {
  const surface = el('div', { class: 'layer surface' });
  const scrim = el('div', { class: 'layer scrim' });
  const toast = el('div', { class: 'toast' });
  const topbar = el('div', { class: 'topbar' });
  const chrome = el('div', { class: 'chrome' });
  const cueBox = el('div', { class: 'cue' });
  const filePicker = el('input', {
    type: 'file',
    class: 'file-picker',
    accept: '.srt,.vtt,text/vtt',
  });

  // Late-bound: buttons, the recognizer and the track manager all need to refer
  // to things created after them.
  const buttons = {
    exit: null,
    colour: null,
    menu: null,
    playlist: null,
    play: null,
    fullscreen: null,
  };
  const menuRef = { setSubtitle: () => {} };
  const playlistRef = {
    refresh: () => {},
    isOpen: () => false,
    close: () => {},
  };

  // Playback speed is deliberately not restored: it belongs to the film you
  // were watching, not to the next one.
  video.playbackRate = 1;

  const visuals = createVisuals(video, stage);
  const quality = createQuality(video, playerHost);
  const audio = createAudioTracks(video, playerHost);
  const playlist = createPlaylist(video, playerHost);
  const tracks = createTrackManager(
    video,
    (text) => {
      cueBox.textContent = text;
      cueBox.classList.toggle('is-visible', text !== '');
    },
    (id) => menuRef.setSubtitle(id),
    playerHost,
  );

  const seek = createSeeker(video, playerHost);
  const seekBar = createSeekBar(video, seek);
  const skipFeedback = createSkipFeedback();
  const introSkip = createIntroSkip(video, seek);
  const introWatch = createIntroWatch(video, {
    onFound: (span) => {
      introSkip.show(span);
      seekBar.setZones(span === null ? [] : [span]);
    },
  });

  let chromeTimer = null;
  let toastTimer = null;
  let pinchBase = 1;
  let skipTarget = null;
  let releaseHold = null;

  // A duration of null keeps the toast up until hideToast takes it down: the
  // 2x label stays for as long as the finger does.
  const showToast = (text, duration = TOAST_MS) => {
    toast.textContent = text;
    toast.classList.add('is-visible');
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = null;
    if (duration === null) return;
    toastTimer = setTimeout(() => {
      toastTimer = null;
      toast.classList.remove('is-visible');
    }, duration);
  };

  const hideToast = () => {
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = null;
    toast.classList.remove('is-visible');
  };

  const applyWarmth = (value) => {
    layers.warm.style.opacity = String(value);
  };

  const colorPanel = createColorPanel((key, value) => {
    if (key === 'warmth') applyWarmth(value);
    else visuals.setColour({ [key]: value });
    onPersist({ [key]: value });
  });

  const menu = createMenu({
    video,
    tracks,
    quality,
    audio,
    onPickFile: () => filePicker.click(),
    onRate: () => {},
    onNotice: (text) => showToast(text, HINT_MS),
    isIntroSkipOn: settings.isIntroSkipOn,
    onIntroSkip: (isOn) => {
      onPersist({ isIntroSkipOn: isOn });
      introWatch.setEnabled(isOn);
      if (isOn) return;
      introSkip.show(null);
      seekBar.setZones([]);
    },
  });

  menuRef.setSubtitle = menu.setSubtitle;

  const isPanelOpen = () =>
    colorPanel.isOpen() || menu.isOpen() || playlistRef.isOpen();

  // The chrome must never fade out from under an open panel: the panel lives
  // inside it, and hiding it mid-adjustment looked like the player had frozen.
  const setChromeVisible = (isVisible) => {
    // Read again on the way in: an episode that finished and rolled on to the
    // next one has left the bar naming the one before it.
    if (isVisible) playlistRef.refresh();
    chrome.toggleAttribute('hidden', !isVisible);
    if (chromeTimer !== null) clearTimeout(chromeTimer);
    chromeTimer = null;
    if (!isVisible || video.paused || isPanelOpen()) return;
    chromeTimer = setTimeout(() => {
      chromeTimer = null;
      if (isPanelOpen()) return;
      chrome.toggleAttribute('hidden', true);
    }, CHROME_IDLE_MS);
  };

  const closePanels = () => {
    playlistRef.close();
    colorPanel.close();
    menu.close();
    buttons.playlist?.setAttribute('aria-pressed', 'false');
    buttons.colour?.setAttribute('aria-pressed', 'false');
    buttons.menu?.setAttribute('aria-pressed', 'false');
    setChromeVisible(true);
  };

  const playlistPanel = createPlaylistPanel({
    onSelect: (level, option, isEpisode) => {
      // A season is half an answer: the sheet stays up until the episode in
      // it has been picked.
      if (isEpisode) {
        playlistPanel.close();
        buttons.playlist.setAttribute('aria-pressed', 'false');
      }
      playlist.select(level, option);
      // The player rewrites its own path as it switches, so the sheet is read
      // again rather than guessing what the press will have done — once now,
      // on the way back into the controls, and once more after the step it
      // had to fetch has landed.
      setChromeVisible(true);
      setTimeout(() => playlistRef.refresh(), PLAYLIST_SETTLE_MS);
    },
  });

  playlistRef.isOpen = playlistPanel.isOpen;
  playlistRef.close = playlistPanel.close;

  const togglePlay = () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    setChromeVisible(true);
  };

  // A tap that lands while the last seek is still in flight counts from where
  // that seek is going, not from the frame still on screen, so every tap in a
  // run is worth its full step.
  const skip = (seconds) => {
    const from =
      video.seeking && skipTarget !== null ? skipTarget : video.currentTime;
    skipTarget = seek(from + seconds);
  };

  // Exactly what the 2x chip in the sheet does, for as long as the finger is
  // down, and the speed that was set before comes back when it lifts.
  const holdForward = () => {
    const previousRate = video.playbackRate;
    const wasPaused = video.paused;
    video.playbackRate = HOLD_RATE;
    if (wasPaused) video.play().catch(() => {});
    return () => {
      video.playbackRate = previousRate;
      if (wasPaused) video.pause();
    };
  };

  // Each step is worked out from the time the finger has been down, not added
  // to the last one, so the picture goes back at 2x however long each seek
  // takes — a slow stream just shows fewer frames on the way.
  const holdBack = () => {
    const wasPlaying = !video.paused;
    const origin = video.currentTime;
    const startedAt = performance.now();
    let timer = null;
    let isHeld = true;

    video.pause();

    const step = () => {
      timer = null;
      if (!isHeld) return;
      const elapsed = (performance.now() - startedAt) / 1000;
      seek(origin - elapsed * HOLD_RATE);
      // In case the seek never reports back, the next one is not held up by it.
      timer = setTimeout(step, REWIND_STALL_MS);
    };

    const handleSeeked = () => {
      if (!isHeld) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(step, REWIND_SETTLE_MS);
    };

    video.addEventListener('seeked', handleSeeked);
    step();

    return () => {
      isHeld = false;
      if (timer !== null) clearTimeout(timer);
      video.removeEventListener('seeked', handleSeeked);
      if (wasPlaying) video.play().catch(() => {});
    };
  };

  const stopHold = () => {
    if (releaseHold === null) return;
    const release = releaseHold;
    releaseHold = null;
    release();
    hideToast();
  };

  const dragTargets = { [ZONE.SEEK]: seekBar };

  const canSwipe = () =>
    !isPanelOpen() &&
    isFeedShaped(
      window.innerWidth,
      window.innerHeight,
      video.videoWidth,
      video.videoHeight,
    );

  const recognizer = createRecognizer(
    surface,
    {
      tap: () => {
        if (isPanelOpen()) {
          closePanels();
          return;
        }
        setChromeVisible(chrome.hasAttribute('hidden'));
      },
      multiTap: ({ zone, x, y }) => {
        if (isPanelOpen()) {
          closePanels();
          return;
        }
        const seconds = SIDE_SKIP_SECONDS[zone];
        if (seconds === undefined) {
          setChromeVisible(chrome.hasAttribute('hidden'));
          return;
        }
        skip(seconds);
        skipFeedback.show(seconds, x, y);
      },
      holdStart: ({ zone }) => {
        if (isPanelOpen()) return;
        stopHold();
        const isForward = zone === ZONE.HOLD_RIGHT;
        releaseHold = isForward ? holdForward() : holdBack();
        showToast(isForward ? '2x ▶▶' : '◀◀ 2x', null);
      },
      holdEnd: () => stopHold(),
      dragStart: ({ zone }) => {
        setChromeVisible(true);
        dragTargets[zone]?.start();
      },
      dragMove: (detail) => dragTargets[detail.zone]?.move(detail),
      dragEnd: ({ zone }) => dragTargets[zone]?.end(),
      pinchStart: () => {
        pinchBase = visuals.beginPinch();
      },
      pinchMove: ({ scale }) => visuals.pinchTo(pinchBase * scale),
      pinchEnd: () => visuals.endPinch(),
      swipe: ({ direction }) => onFeedStep(direction),
    },
    { canSwipe },
  );

  buttons.play = buildButton(
    'Play or pause',
    video.paused ? ICON.play : ICON.pause,
    togglePlay,
    'play-button',
  );
  const playPath = buttons.play.querySelector('path');

  const buildSkipButton = (seconds) => {
    const attributes = {
      class: 'skip-button',
      type: 'button',
      title: `${seconds > 0 ? 'Forward' : 'Back'} ${Math.abs(seconds)} seconds`,
    };
    const button = el('button', attributes, [buildSkipIcon(seconds)]);
    button.addEventListener('click', () => {
      skip(seconds);
      setChromeVisible(true);
    });
    return button;
  };

  const centreRow = el('div', { class: 'centre-row' }, [
    buildSkipButton(-SKIP_SECONDS),
    buttons.play,
    buildSkipButton(SKIP_SECONDS),
  ]);

  buttons.colour = buildButton('Colour', buildPaletteIcon(), () => {
    menu.close();
    playlistPanel.close();
    buttons.menu.setAttribute('aria-pressed', 'false');
    buttons.playlist.setAttribute('aria-pressed', 'false');
    colorPanel.toggle();
    buttons.colour.setAttribute('aria-pressed', String(colorPanel.isOpen()));
    setChromeVisible(true);
  });

  buttons.menu = buildButton('Settings', ICON.settings, () => {
    colorPanel.close();
    playlistPanel.close();
    buttons.colour.setAttribute('aria-pressed', 'false');
    buttons.playlist.setAttribute('aria-pressed', 'false');
    menu.toggle();
    buttons.menu.setAttribute('aria-pressed', String(menu.isOpen()));
    setChromeVisible(true);
  });

  // The playlist sits where a thumb reaches it while the phone is held
  // sideways — beside the way out, not buried in the settings sheet, which is
  // no place to be changing episode from. The button names where in the series
  // the film is; the sheet it opens is where another episode is picked.
  const playlistLabel = el('span', { class: 'playlist-current' });
  buttons.playlist = el(
    'button',
    { class: 'playlist-button', type: 'button', title: 'Episodes' },
    [playlistLabel, buildIcon(ICON.chevron)],
  );
  buttons.playlist.addEventListener('click', () => {
    colorPanel.close();
    menu.close();
    buttons.colour.setAttribute('aria-pressed', 'false');
    buttons.menu.setAttribute('aria-pressed', 'false');
    playlistPanel.toggle();
    const isOpen = playlistPanel.isOpen();
    buttons.playlist.setAttribute('aria-pressed', String(isOpen));
    setChromeVisible(true);
  });

  // A series only admits to having a playlist once its player has drawn one, so
  // the button appears when there is something to choose from and stays away
  // when the page is a film.
  playlistRef.refresh = () => {
    playlist.refresh();
    const levels = playlist.getLevels();
    const path = levels.map((level) => level.current);
    playlistLabel.textContent = path.join(' · ');
    buttons.playlist.classList.toggle('is-empty', levels.length === 0);
    playlistPanel.setLevels(levels);
    if (levels.length === 0) {
      buttons.playlist.setAttribute('aria-pressed', 'false');
    }
  };
  playlistRef.refresh();

  buttons.exit = buildButton('Exit player', ICON.exit, () => onExit());
  buttons.fullscreen = buildButton('Fullscreen', ICON.fullscreen, () => {
    onFullscreen();
    setChromeVisible(false);
  });

  const fullOnly = [
    buttons.exit,
    buttons.playlist,
    buttons.colour,
    buttons.menu,
  ];
  for (const node of fullOnly) node.classList.add('is-full-only');
  buttons.fullscreen.classList.add('is-windowed-only');

  topbar.append(
    buttons.exit,
    buttons.playlist,
    el('div', { class: 'spacer' }),
    buttons.colour,
    buttons.menu,
    buttons.fullscreen,
  );

  // Whenever the player is out of fullscreen it offers the way back to it.
  // Playing in the box the site gave it — an embedded player's frame — it is
  // too small for the sheets as well, so they and the way out step aside.
  const setScreen = ({ isFullscreen, isCompact }) => {
    chrome.toggleAttribute('data-windowed', !isFullscreen);
    if (chrome.hasAttribute('data-compact') === isCompact) return;
    chrome.toggleAttribute('data-compact', isCompact);
    if (isCompact && isPanelOpen()) closePanels();
  };

  chrome.append(
    scrim,
    topbar,
    centreRow,
    colorPanel.root,
    menu.root,
    playlistPanel.root,
    seekBar.root,
  );

  // Reading a file the user picked themselves, straight into the cue list.
  // Nothing leaves the device and nothing is parsed as markup.
  const loadSubtitleFile = async () => {
    const file = filePicker.files?.[0];
    if (!file) return;
    const text = await file.text();
    filePicker.value = '';
    const id = tracks.addCues(file.name.replace(/\.(srt|vtt)$/i, ''), text);
    if (id === null) {
      showToast('No subtitles in that file', HINT_MS);
      return;
    }
    tracks.select(id);
    menu.refresh();
    showToast('Subtitles loaded', HINT_MS);
  };

  filePicker.addEventListener('change', () => {
    loadSubtitleFile().catch((error) => {
      console.error('Video2Player: could not read the subtitle file', error);
      showToast('Could not read that file', HINT_MS);
    });
  });

  // Only the path data changes, so swapping play for pause cannot make the
  // button flicker or shift. A pause brings the controls up, since the next
  // thing wanted is usually one of them; a start only restarts their idle
  // timer if they are already up. A feed starts every video it moves on to,
  // and that is no reason to cover the picture.
  // A hold pauses and resumes the film on its own account, and that is no
  // reason to bring the controls up over the picture it is running through.
  const handlePlaybackChange = () => {
    playPath.setAttribute('d', video.paused ? ICON.play : ICON.pause);
    if (releaseHold !== null) return;
    const isChromeHidden = chrome.hasAttribute('hidden');
    if (video.paused || !isChromeHidden) setChromeVisible(true);
  };
  video.addEventListener('pause', handlePlaybackChange);
  video.addEventListener('play', handlePlaybackChange);

  const restoreSettings = () => {
    visuals.setColour({
      brightness: settings.brightness,
      contrast: settings.contrast,
      saturate: settings.saturate,
    });
    for (const key of ['brightness', 'contrast', 'saturate', 'warmth']) {
      colorPanel.setValue(key, settings[key]);
    }
    applyWarmth(settings.warmth);
  };

  // Walking the site's page data is not free, so it happens after the picture
  // is up rather than in the way of it — and more than once, because a page
  // that was navigated to fills its data in some time after the video starts.
  const chapterTimers = CHAPTER_TRIES_MS.map((delay) =>
    setTimeout(() => {
      const chapters = readSiteChapters(playerHost);
      if (chapters.length > 0) seekBar.setChapters(chapters);
    }, delay),
  );

  restoreSettings();
  // Kept as a list so the overlay can take itself off the screen again: the
  // shadow root outlives it when a feed moves on to its next video.
  const roots = [
    surface,
    ...skipFeedback.roots,
    cueBox,
    chrome,
    introSkip.root,
    toast,
    filePicker,
  ];
  shadow.append(...roots);
  introWatch.setEnabled(settings.isIntroSkipOn);
  setChromeVisible(isChromeShown);

  return {
    relayout: () => visuals.relayout(),
    repin: () => visuals.repin(),
    notify: (text) => showToast(text, HINT_MS),
    setScreen,
    showControls: () => setChromeVisible(true),
    destroy: () => {
      for (const node of roots) node.remove();
      recognizer.destroy();
      seekBar.destroy();
      skipFeedback.destroy();
      introWatch.destroy();
      introSkip.destroy();
      tracks.destroy();
      stopHold();
      if (chromeTimer !== null) clearTimeout(chromeTimer);
      if (toastTimer !== null) clearTimeout(toastTimer);
      for (const timer of chapterTimers) clearTimeout(timer);
      video.removeEventListener('pause', handlePlaybackChange);
      video.removeEventListener('play', handlePlaybackChange);
    },
  };
};
