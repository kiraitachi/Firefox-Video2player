import { findPrimaryVideo } from '../detect.js';

const POLL_MS = 120;
// A feed starts the video that has scrolled into view on its own; one that is
// still paused after this long is started by the player instead.
const SETTLE_MS = 1200;
const GIVE_UP_MS = 4000;
const SCROLLING = new Set(['auto', 'scroll']);
const ARROW_KEY_CODES = { ArrowDown: 40, ArrowUp: 38 };

const isScroller = (element) => {
  if (element.scrollHeight <= element.clientHeight) return false;
  return SCROLLING.has(getComputedStyle(element).overflowY);
};

// Walks out of shadow roots too: a feed built from web components keeps its
// column on the far side of one.
const parentOf = (node) => node.parentElement ?? node.getRootNode().host;

// The column a feed scrolls is the nearest ancestor of the video that can
// scroll vertically, or the page itself when the feed is the whole document.
export const findFeedScroller = (video) => {
  for (let node = parentOf(video); node; node = parentOf(node)) {
    if (isScroller(node)) return node;
  }
  return document.scrollingElement;
};

const pressArrow = (key) => {
  const init = {
    key,
    code: key,
    keyCode: ARROW_KEY_CODES[key],
    bubbles: true,
    cancelable: true,
  };
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
};

// The site's own column is moved one screen on, and the scroll snapping every
// such feed uses settles it on the next video. The site sees an ordinary
// scroll, so it loads, starts and counts the next video just as it would for a
// swipe of its own. A feed that does not scroll — one that pages by key, the
// way desktop layouts do — is sent the arrow key instead.
export const stepFeed = (scroller, direction) => {
  if (scroller) {
    const before = scroller.scrollTop;
    const top = direction * scroller.clientHeight;
    scroller.scrollBy({ top, behavior: 'instant' });
    if (scroller.scrollTop !== before) return;
  }
  pressArrow(direction > 0 ? 'ArrowDown' : 'ArrowUp');
};

// The next video is whichever one now fills the screen and is not the one we
// left — or is the same element playing something else, since some feeds keep
// one element and swap its source. One that is already playing is taken at
// once; a paused one only after the site has had a moment to start it itself.
export const waitForNextVideo = (previous, previousSource) =>
  new Promise((resolve) => {
    const startedAt = performance.now();

    const poll = () => {
      const elapsed = performance.now() - startedAt;
      const candidate = findPrimaryVideo();
      const isNew =
        candidate !== null &&
        (candidate !== previous || candidate.currentSrc !== previousSource);
      if (isNew && (!candidate.paused || elapsed >= SETTLE_MS)) {
        resolve(candidate);
        return;
      }
      if (elapsed >= GIVE_UP_MS) {
        resolve(null);
        return;
      }
      setTimeout(poll, POLL_MS);
    };

    setTimeout(poll, POLL_MS);
  });
