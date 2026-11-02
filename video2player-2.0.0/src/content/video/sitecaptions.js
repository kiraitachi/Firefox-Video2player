import { call, isFunction, read, toArray, toPage } from './pageapi.js';

const PROBE_INTERVAL_MS = 1000;

// Players that paint their own captions instead of exposing a text track. The
// element the site draws into is still updated while the video sits on our
// stage, so its text is mirrored into the player's own cue layer.
const CONTAINER_SELECTORS = [
  '.ytp-caption-window-container',
  '.shaka-text-container',
  '.vjs-text-track-display',
  '.jw-captions',
  '.plyr__captions',
  '.pjscaptions',
];

// Tried in order; the first selector that matches something decides how the
// lines are split, so a nested wrapper cannot repeat the same words twice.
const LINE_SELECTORS = [
  '.ytp-caption-segment',
  '.caption-visual-line',
  '.vjs-text-track-cue',
  '.jw-text-track-cue',
  '.shaka-text-wrapper span',
];

const readLines = (container) => {
  for (const selector of LINE_SELECTORS) {
    const lines = container.querySelectorAll(selector);
    if (lines.length === 0) continue;
    return Array.from(lines)
      .map((line) => line.textContent.trim())
      .filter((line) => line !== '')
      .join('\n');
  }
  return container.textContent.trim();
};

const findContainer = () => {
  for (const selector of CONTAINER_SELECTORS) {
    const found = document.querySelector(selector);
    if (found !== null) return found;
  }
  return null;
};

const findYouTubePlayer = (host) => {
  if (host !== null && isFunction(host, 'getOption')) return host;
  const element = document.querySelector('#movie_player, .html5-video-player');
  if (element === null) return null;
  const player = element.wrappedJSObject ?? element;
  return isFunction(player, 'getOption') ? player : null;
};

// YouTube keeps its caption list behind the player API rather than in
// video.textTracks, so the list comes from there and the text comes from the
// mirror above. Other players expose the mirror only, which is still enough to
// show whatever the site has switched on.
const createYouTubeTracks = (host) => {
  const player = findYouTubePlayer(host);
  if (player === null) return null;

  const tracklist = () => {
    const list = toArray(call(player, 'getOption', 'captions', 'tracklist'));
    if (list.length > 0) return list;
    call(player, 'loadModule', 'captions');
    return toArray(call(player, 'getOption', 'captions', 'tracklist'));
  };

  const describe = (track, index) => {
    const name = read(track, 'displayName') ?? read(track, 'languageName');
    if (typeof name === 'string' && name !== '') return name;
    const code = read(track, 'languageCode');
    const isNamed = typeof code === 'string' && code !== '';
    return isNamed ? code : `Track ${index + 1}`;
  };

  return {
    list: () => tracklist().map((track, index) => describe(track, index)),
    isOn: () => {
      const track = call(player, 'getOption', 'captions', 'track');
      const code = read(track, 'languageCode');
      return typeof code === 'string' && code !== '';
    },
    activeIndex: () => {
      const current = call(player, 'getOption', 'captions', 'track');
      const code = read(current, 'languageCode');
      if (typeof code !== 'string' || code === '') return -1;
      return tracklist().findIndex(
        (track) => read(track, 'languageCode') === code,
      );
    },
    select: (index) => {
      const track = tracklist()[index];
      if (track === undefined) return false;
      call(player, 'setOption', 'captions', 'track', track);
      return true;
    },
    disable: () => {
      call(player, 'setOption', 'captions', 'track', toPage({}));
    },
  };
};

export const createSiteCaptions = (onText, host = null) => {
  const youtube = createYouTubeTracks(host);

  let container = null;
  let observer = null;
  let probeTimer = null;
  let isMirroring = false;
  let lastText = '';

  const emit = (text) => {
    if (!isMirroring || text === lastText) return;
    lastText = text;
    onText(text);
  };

  const readNow = () => {
    if (!isMirroring || container === null || !container.isConnected) return;
    emit(readLines(container));
  };

  const watch = (found) => {
    container = found;
    observer = new MutationObserver(readNow);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    readNow();
  };

  const unwatch = () => {
    if (observer !== null) observer.disconnect();
    observer = null;
    container = null;
  };

  // The container is created the moment captions are first switched on, which
  // may be long after the player opened, so it is looked for on a slow tick.
  const probe = () => {
    probeTimer = null;
    if (container !== null && !container.isConnected) unwatch();
    if (container === null) {
      const found = findContainer();
      if (found !== null) watch(found);
    } else {
      readNow();
    }
    probeTimer = setTimeout(probe, PROBE_INTERVAL_MS);
  };

  probe();

  return {
    // A site source is worth offering when the site can actually produce one.
    list: () => (youtube === null ? [] : youtube.list()),
    hasContainer: () => container !== null,
    isOn: () => (youtube === null ? container !== null : youtube.isOn()),
    activeIndex: () => (youtube === null ? 0 : youtube.activeIndex()),
    select: (index) => {
      isMirroring = true;
      lastText = '';
      if (youtube !== null) youtube.select(index);
      readNow();
    },
    // The site's own caption layer sits behind the stage where nobody can see
    // it, so turning ours off is a matter of no longer mirroring it.
    disable: () => {
      isMirroring = false;
      lastText = '';
      if (youtube !== null) youtube.disable();
      onText('');
    },
    destroy: () => {
      if (probeTimer !== null) clearTimeout(probeTimer);
      probeTimer = null;
      unwatch();
    },
  };
};
