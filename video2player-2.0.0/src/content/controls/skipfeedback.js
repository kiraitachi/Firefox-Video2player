import { el } from '../shell.js';

const LINGER_MS = 700;
const ARROW_COUNT = 3;
const ARROW_PATH = 'M7 5 17 12 7 19z';

const buildArrow = () =>
  el('svg', { class: 'skip-arrow', viewBox: '0 0 24 24' }, [
    el('path', { d: ARROW_PATH }),
  ]);

const buildSide = (side) => {
  const ripple = el('span', { class: 'skip-ripple' });
  const arrows = el(
    'span',
    { class: 'skip-arrows' },
    Array.from({ length: ARROW_COUNT }, buildArrow),
  );
  const label = el('span', { class: 'skip-label' });
  const root = el('div', { class: `skip-feedback is-${side}` }, [
    ripple,
    el('div', { class: 'skip-content' }, [arrows, label]),
  ]);
  return { root, ripple, label, total: 0, timer: null };
};

// The half-moon a video app lights up on the side you double-tapped: a wash
// that fills out from under the finger, arrows running the way the film is
// going, and the seconds so far. It replaces a label in the middle of the
// screen, which said the same thing somewhere the eye was not looking.
export const createSkipFeedback = () => {
  const sides = { back: buildSide('back'), forward: buildSide('forward') };

  const hide = (side) => {
    if (side.timer !== null) clearTimeout(side.timer);
    side.timer = null;
    side.total = 0;
    side.root.classList.remove('is-visible');
  };

  // Restarting a CSS animation needs a style flush between taking the class
  // off and putting it back, or the browser sees no change and does nothing.
  const ripple = (side, x, y) => {
    const { ripple: wave, root } = side;
    wave.style.left = `${x - root.offsetLeft}px`;
    wave.style.top = `${y - root.offsetTop}px`;
    wave.classList.remove('is-rippling');
    void wave.offsetWidth;
    wave.classList.add('is-rippling');
  };

  // Taps in a row add up, so the label says how far the whole run went rather
  // than how far the last tap did.
  const show = (seconds, x, y) => {
    const isForward = seconds > 0;
    const side = isForward ? sides.forward : sides.back;
    hide(isForward ? sides.back : sides.forward);

    side.total += Math.abs(seconds);
    side.label.textContent = `${side.total} seconds`;
    side.root.classList.add('is-visible');
    ripple(side, x, y);

    if (side.timer !== null) clearTimeout(side.timer);
    side.timer = setTimeout(() => hide(side), LINGER_MS);
  };

  return {
    roots: [sides.back.root, sides.forward.root],
    show,
    destroy: () => {
      hide(sides.back);
      hide(sides.forward);
    },
  };
};
