import { createShadowHost, el, pinStyle } from '../shell.js';
import badgeCss from './badge.css';

const HEIGHT_PX = 40;
const FALLBACK_WIDTH_PX = 130;
const GAP_PX = 6;
const INSET_PX = 12;
const MIN_VISIBLE_RATIO = 0.35;
const LABEL = 'Open Player';

// The Video2Player mark: a play button in a ring with an arrow leaving the
// top corner. Built node by node, like everything else drawn into the page.
const buildIcon = () =>
  el(
    'svg',
    { class: 'icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    [
      el('path', {
        d:
          'M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12' +
          'C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z',
        stroke: 'currentColor',
        'stroke-width': '1.5',
        fill: 'none',
      }),
      el('path', { d: 'M15.5 12L10 8.5V15.5L15.5 12Z', fill: 'currentColor' }),
      el('path', {
        d: 'M19 5L21 3M21 3H18M21 3V6',
        stroke: 'currentColor',
        'stroke-width': '1.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        fill: 'none',
      }),
    ],
  );

export const createBadge = () => {
  const shell = createShadowHost(badgeCss, {
    width: 'max-content',
    height: `${HEIGHT_PX}px`,
    opacity: '0',
    'pointer-events': 'none',
  });

  const ripple = el('div', { class: 'ripple' });
  const button = el(
    'button',
    {
      class: 'badge',
      type: 'button',
      title: 'Open in the built-in player',
      'aria-label': 'Open in the built-in player',
    },
    [buildIcon(), el('span', { class: 'label', text: LABEL }), ripple],
  );
  shell.shadow.append(button);

  let target = null;
  let frame = 0;
  let isMounted = false;

  const isMostlyVisible = (rect) => {
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);
    const visible = Math.max(0, visibleBottom - visibleTop);
    return visible / rect.height >= MIN_VISIBLE_RATIO;
  };

  const conceal = () => {
    pinStyle(shell.host, { opacity: '0', 'pointer-events': 'none' });
  };

  // Centred under the video, as the pill has always sat. When there is no room
  // below it (a player that fills its frame, a tall video, a phone held
  // upright) it moves up to sit just inside the bottom edge instead, and it
  // is always kept on screen.
  const placement = (rect, width) => {
    const centred = rect.left + rect.width / 2 - width / 2;
    const below = rect.bottom + GAP_PX;
    const fitsBelow = below + HEIGHT_PX + INSET_PX <= window.innerHeight;
    const top = fitsBelow ? below : rect.bottom - HEIGHT_PX - INSET_PX;

    const maxLeft = window.innerWidth - width - INSET_PX;
    const maxTop = window.innerHeight - HEIGHT_PX - INSET_PX;
    return {
      left: `${Math.min(maxLeft, Math.max(INSET_PX, centred))}px`,
      top: `${Math.min(maxTop, Math.max(INSET_PX, top))}px`,
    };
  };

  // Teardown is the watcher's job: when the video goes away it reports a new
  // primary and calls hide(). Here we only stop drawing.
  const reposition = () => {
    frame = 0;
    if (!target?.isConnected) {
      conceal();
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || !isMostlyVisible(rect)) {
      conceal();
      return;
    }
    const width = shell.host.offsetWidth || FALLBACK_WIDTH_PX;
    pinStyle(shell.host, {
      opacity: '1',
      'pointer-events': 'auto',
      ...placement(rect, width),
    });
  };

  const scheduleReposition = () => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(reposition);
  };

  // Each new video gets the same slide-in the pill has always had.
  const playEntrance = () => {
    button.classList.remove('is-entering');
    void button.offsetWidth;
    button.classList.add('is-entering');
  };

  const show = (video) => {
    const isNewTarget = target !== video;
    target = video;
    if (!isMounted) {
      document.body.append(shell.host);
      window.addEventListener('scroll', scheduleReposition, true);
      window.addEventListener('resize', scheduleReposition);
      isMounted = true;
      playEntrance();
    } else if (isNewTarget) {
      playEntrance();
    }
    scheduleReposition();
  };

  const hide = () => {
    target = null;
    if (!isMounted) return;
    window.removeEventListener('scroll', scheduleReposition, true);
    window.removeEventListener('resize', scheduleReposition);
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    conceal();
    shell.host.remove();
    isMounted = false;
  };

  const api = { show, hide, refresh: scheduleReposition, onActivate: null };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    ripple.classList.remove('is-active');
    void ripple.offsetWidth;
    ripple.classList.add('is-active');
    if (target && api.onActivate) api.onActivate(target);
  });

  return api;
};
