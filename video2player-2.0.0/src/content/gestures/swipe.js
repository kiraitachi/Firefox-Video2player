// A flick has to be mostly vertical before it counts: a thumb scrubbing along
// the seek band drifts up and down a little, and that drift must never be read
// as a request for the next video.
const VERTICAL_BIAS = 1.5;
// How far the finger has to travel, as a share of the screen's height, for the
// swipe to go through. Anything shorter is let go, the way a feed app lets a
// half-hearted flick snap back.
const MIN_TRAVEL_RATIO = 0.12;

export const SWIPE = {
  NEXT: 1,
  PREVIOUS: -1,
};

export const isVerticalMove = (dx, dy) =>
  Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS;

// Finger up means the next video, as in every short-video app: the feed is
// pushed up and the one below it comes into view.
export const readSwipe = (dy, height) => {
  if (Math.abs(dy) < height * MIN_TRAVEL_RATIO) return null;
  return dy < 0 ? SWIPE.NEXT : SWIPE.PREVIOUS;
};

// Short-video feeds — TikTok, Reels, Shorts — are the one place a vertical
// swipe means "next". They are recognised by shape rather than by site: the
// phone is held upright and the film is taller than it is wide. On a landscape
// film the same swipe would only scroll the page away from under it.
export const isFeedShaped = (viewWidth, viewHeight, videoWidth, videoHeight) =>
  viewHeight > viewWidth && videoHeight > videoWidth;
