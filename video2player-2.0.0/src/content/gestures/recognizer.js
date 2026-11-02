import { hitTest, isDragZone, isHoldZone, ZONE } from './zones.js';
import { isVerticalMove, readSwipe } from './swipe.js';

const HOLD_DELAY_MS = 350;
// How long a lone tap on a side waits for a second one before it is taken to
// mean "show the controls". Acting on it at once turned a double-tap that was
// not quite quick enough into the controls popping up instead of a seek.
const MULTI_TAP_WINDOW_MS = 320;
// Once a side is seeking, a tap on it keeps seeking for a little longer than
// the double-tap window: tapping on to go further is a slower rhythm than the
// two taps that started it.
const SEEK_RUN_MS = 700;
const MOVE_TOLERANCE_PX = 12;

const MODE = {
  IDLE: 'idle',
  PENDING: 'pending',
  DRAG: 'drag',
  HOLD: 'hold',
  PINCH: 'pinch',
  SWIPE: 'swipe',
  ABANDONED: 'abandoned',
};

const distanceBetween = (first, second) => {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return Math.hypot(dx, dy);
};

// `canSwipe` is asked at the moment a finger starts to travel, not once up
// front: the phone may have been turned, or the feed moved on to a film of a
// different shape, since the player opened.
export const createRecognizer = (
  surface,
  handlers,
  { canSwipe = () => false } = {},
) => {
  const pointers = new Map();

  let mode = MODE.IDLE;
  let anchor = null;
  let holdTimer = null;
  let tapTimer = null;
  let tapCount = 0;
  let tapZone = ZONE.DEAD;
  let pinchStartDistance = 0;
  let isEnabled = true;

  const emit = (name, detail) => {
    const handler = handlers[name];
    if (handler) handler(detail);
  };

  const localPoint = (event) => {
    const rect = surface.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const clearHoldTimer = () => {
    if (holdTimer === null) return;
    clearTimeout(holdTimer);
    holdTimer = null;
  };

  const flushTaps = () => {
    tapTimer = null;
    // A run of seeks in a side box has already been sent tap by tap.
    const isSeekRun = isHoldZone(tapZone);
    if (tapCount === 1) emit('tap', { zone: tapZone });
    else if (!isSeekRun) emit('multiTap', { zone: tapZone, count: tapCount });
    tapCount = 0;
  };

  // The neutral middle has no double-tap, so a tap there acts at once: the
  // controls come up under the finger and a quick second tap lands on pause.
  // Only a tap that strays there in the middle of a side run waits, and counts
  // towards that run — a second tap rarely lands exactly where the first did.
  // Tapping the other side mid-run starts a run of its own.
  const registerTap = (zone, point) => {
    const isSideRun = tapCount > 0 && isHoldZone(tapZone);
    if (zone === ZONE.DEAD && !isSideRun) {
      emit('tap', { zone });
      return;
    }
    if (tapCount === 0 || (zone !== ZONE.DEAD && zone !== tapZone)) {
      tapCount = 0;
      tapZone = zone;
    }
    tapCount += 1;
    if (tapTimer !== null) clearTimeout(tapTimer);

    // In the side boxes every tap from the second on is a seek, sent the moment
    // the finger lifts. Waiting the window out first put a quarter of a second
    // between the tap and the jump, on top of whatever the seek itself takes.
    if (tapCount >= 2 && isHoldZone(tapZone)) {
      emit('multiTap', {
        zone: tapZone,
        count: tapCount,
        x: point.x,
        y: point.y,
      });
      tapTimer = setTimeout(flushTaps, SEEK_RUN_MS);
      return;
    }
    tapTimer = setTimeout(flushTaps, MULTI_TAP_WINDOW_MS);
  };

  const startPinch = () => {
    clearHoldTimer();
    if (mode === MODE.DRAG) emit('dragEnd', { zone: anchor.zone });
    if (mode === MODE.HOLD) emit('holdEnd', { zone: anchor.zone });
    const points = Array.from(pointers.values());
    pinchStartDistance = distanceBetween(points[0], points[1]);
    mode = MODE.PINCH;
    emit('pinchStart', {});
  };

  const handleDown = (event) => {
    if (!isEnabled) return;
    surface.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointers.set(event.pointerId, point);

    if (pointers.size === 2) {
      startPinch();
      return;
    }
    if (pointers.size > 2) return;

    anchor = {
      x: point.x,
      y: point.y,
      lastX: point.x,
      lastY: point.y,
      zone: hitTest(point.x, point.y, point.width, point.height),
    };
    mode = MODE.PENDING;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (mode !== MODE.PENDING || !isHoldZone(anchor.zone)) return;
      mode = MODE.HOLD;
      emit('holdStart', { zone: anchor.zone });
    }, HOLD_DELAY_MS);
  };

  const handlePinchMove = () => {
    const points = Array.from(pointers.values());
    if (points.length < 2) return;
    const spread = distanceBetween(points[0], points[1]);
    if (pinchStartDistance === 0) return;
    emit('pinchMove', { scale: spread / pinchStartDistance });
  };

  const handleMove = (event) => {
    if (!pointers.has(event.pointerId)) return;
    const point = localPoint(event);
    pointers.set(event.pointerId, point);

    if (mode === MODE.PINCH) {
      handlePinchMove();
      return;
    }
    const isSettled =
      mode === MODE.ABANDONED || mode === MODE.HOLD || mode === MODE.SWIPE;
    if (isSettled) return;

    if (mode === MODE.PENDING) {
      const dx = point.x - anchor.x;
      const dy = point.y - anchor.y;
      if (Math.hypot(dx, dy) < MOVE_TOLERANCE_PX) return;
      clearHoldTimer();
      // Checked before the zones: a flick up is the same gesture wherever on
      // the picture it starts, the seek band and the side boxes included.
      if (isVerticalMove(dx, dy) && canSwipe()) {
        mode = MODE.SWIPE;
        return;
      }
      if (!isDragZone(anchor.zone)) {
        mode = MODE.ABANDONED;
        return;
      }
      mode = MODE.DRAG;
      emit('dragStart', { zone: anchor.zone, x: anchor.x, y: anchor.y });
    }

    if (mode !== MODE.DRAG) return;
    emit('dragMove', {
      zone: anchor.zone,
      dx: point.x - anchor.lastX,
      dy: point.y - anchor.lastY,
      x: point.x,
      y: point.y,
      width: point.width,
      height: point.height,
    });
    anchor.lastX = point.x;
    anchor.lastY = point.y;
  };

  const finishSwipe = (event) => {
    const point = localPoint(event);
    const direction = readSwipe(point.y - anchor.y, point.height);
    if (direction !== null) emit('swipe', { direction });
  };

  const handleUp = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);

    if (mode === MODE.PINCH) {
      if (pointers.size >= 2) return;
      emit('pinchEnd', {});
      mode = pointers.size === 0 ? MODE.IDLE : MODE.ABANDONED;
      return;
    }
    if (pointers.size > 0) return;

    clearHoldTimer();
    if (mode === MODE.DRAG) emit('dragEnd', { zone: anchor.zone });
    else if (mode === MODE.HOLD) emit('holdEnd', { zone: anchor.zone });
    else if (mode === MODE.SWIPE) finishSwipe(event);
    else if (mode === MODE.PENDING) registerTap(anchor.zone, anchor);
    mode = MODE.IDLE;
  };

  const handleCancel = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    clearHoldTimer();
    if (mode === MODE.DRAG) emit('dragEnd', { zone: anchor.zone });
    if (mode === MODE.HOLD) emit('holdEnd', { zone: anchor.zone });
    if (mode === MODE.PINCH && pointers.size < 2) emit('pinchEnd', {});
    if (pointers.size === 0) mode = MODE.IDLE;
  };

  // Without this, a long press raises the system context menu and Gecko
  // cancels the pointer, which used to drop hold-to-2x after a second or two.
  const blockContextMenu = (event) => event.preventDefault();

  surface.addEventListener('contextmenu', blockContextMenu);
  surface.addEventListener('pointerdown', handleDown);
  surface.addEventListener('pointermove', handleMove);
  surface.addEventListener('pointerup', handleUp);
  surface.addEventListener('pointercancel', handleCancel);

  return {
    setEnabled: (value) => {
      isEnabled = value;
    },
    destroy: () => {
      clearHoldTimer();
      if (tapTimer !== null) clearTimeout(tapTimer);
      surface.removeEventListener('contextmenu', blockContextMenu);
      surface.removeEventListener('pointerdown', handleDown);
      surface.removeEventListener('pointermove', handleMove);
      surface.removeEventListener('pointerup', handleUp);
      surface.removeEventListener('pointercancel', handleCancel);
    },
  };
};
