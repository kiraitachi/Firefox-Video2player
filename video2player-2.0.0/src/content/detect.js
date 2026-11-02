const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
const RESCAN_DELAY_MS = 250;
const HAVE_METADATA = 1;

const collectFromShadowRoots = (root, found) => {
  for (const element of root.querySelectorAll('*')) {
    if (!element.shadowRoot) continue;
    for (const video of element.shadowRoot.querySelectorAll('video')) {
      found.add(video);
    }
    collectFromShadowRoots(element.shadowRoot, found);
  }
};

// The shadow walk is the expensive branch, so it only runs when the light DOM
// turned up nothing — which is the only case where it can help.
const collectVideos = () => {
  const found = new Set(document.querySelectorAll('video'));
  if (found.size === 0) collectFromShadowRoots(document, found);
  return found;
};

const isPlayable = (video) => {
  if (!video.isConnected) return false;
  const rect = video.getBoundingClientRect();
  if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) return false;
  const style = getComputedStyle(video);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  if (Number(style.opacity) === 0) return false;
  return video.readyState >= HAVE_METADATA || video.currentSrc !== '';
};

const visibleArea = (rect) => {
  const width =
    Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  const height =
    Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  return Math.max(0, width) * Math.max(0, height);
};

// Visible area, not raw area: an unloaded player further down the page reports
// a default box that would otherwise outrank the video actually on screen.
const scoreVideo = (video) => {
  const area = visibleArea(video.getBoundingClientRect());
  if (area === 0) return 0;
  const playingWeight = video.paused ? 1 : 3;
  const readyWeight = video.readyState >= HAVE_METADATA ? 1.5 : 1;
  return area * playingWeight * readyWeight;
};

const pickPrimary = (videos) => {
  let best = null;
  let bestScore = 0;
  for (const video of videos) {
    const score = scoreVideo(video);
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  return best;
};

// A one-off answer for code that needs the video on screen right now, rather
// than a watch on it.
export const findPrimaryVideo = () => {
  const playable = Array.from(collectVideos()).filter(isPlayable);
  return pickPrimary(playable);
};

export const createVideoWatcher = (onPrimaryChange) => {
  const playable = new Set();
  let primary = null;
  let observer = null;
  let rescanTimer = null;
  let isRunning = false;

  const rescan = () => {
    rescanTimer = null;
    playable.clear();
    for (const video of collectVideos()) {
      if (isPlayable(video)) playable.add(video);
    }
    const next = pickPrimary(playable);
    if (next === primary) return;
    primary = next;
    onPrimaryChange(primary, playable.size);
  };

  const scheduleRescan = () => {
    if (rescanTimer !== null) return;
    rescanTimer = setTimeout(rescan, RESCAN_DELAY_MS);
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;
    observer = new MutationObserver(scheduleRescan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('play', scheduleRescan, true);
    document.addEventListener('pause', scheduleRescan, true);
    document.addEventListener('loadedmetadata', scheduleRescan, true);
    window.addEventListener('resize', scheduleRescan);
    window.addEventListener('scroll', scheduleRescan, true);
    rescan();
  };

  const stop = () => {
    if (!isRunning) return;
    isRunning = false;
    if (observer) observer.disconnect();
    observer = null;
    if (rescanTimer !== null) clearTimeout(rescanTimer);
    rescanTimer = null;
    document.removeEventListener('play', scheduleRescan, true);
    document.removeEventListener('pause', scheduleRescan, true);
    document.removeEventListener('loadedmetadata', scheduleRescan, true);
    window.removeEventListener('resize', scheduleRescan);
    window.removeEventListener('scroll', scheduleRescan, true);
    playable.clear();
    primary = null;
  };

  return {
    start,
    stop,
    getPrimary: () => primary,
    getCount: () => playable.size,
  };
};
