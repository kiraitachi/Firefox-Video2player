import { clampPan, clampScale, computeCoverScale, snapScale } from './zoom.js';

const TRANSFORM_TRANSITION = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';
const FILTER_TRANSITION = 'filter 320ms ease';

// Every filter function is always present and always in the same order, so the
// browser can interpolate between two states smoothly.
const buildFilter = ({ saturate, contrast, brightness }) => {
  // Untouched settings mean no filter at all, so the film is passed through
  // exactly as the site encoded it.
  const isNeutral = saturate === 1 && contrast === 1 && brightness === 1;
  if (isNeutral) return 'none';
  const tone = `contrast(${contrast}) brightness(${brightness})`;
  return `saturate(${saturate}) ${tone}`;
};

// What the zoom means, rather than the number it currently works out to. The
// stage changes size whenever the phone rotates, the system takes the video
// into a floating window, or the app comes back from the background — and the
// same intent has to survive all three.
const FIT = 'fit';
const FILL = 'fill';
const FREE = 'free';

export const createVisuals = (video, stage) => {
  const colour = { saturate: 1, contrast: 1, brightness: 1 };
  const view = { scale: 1, x: 0, y: 0 };

  let intent = FIT;
  let freeFactor = 1;
  let isPinching = false;

  const apply = () => {
    const filter = buildFilter(colour);
    const isUnzoomed = view.scale === 1 && view.x === 0 && view.y === 0;
    const offset = `translate(${view.x}px, ${view.y}px)`;
    const transform = isUnzoomed ? 'none' : `${offset} scale(${view.scale})`;
    const transition = isPinching
      ? FILTER_TRANSITION
      : `${FILTER_TRANSITION}, ${TRANSFORM_TRANSITION}`;

    video.style.setProperty('filter', filter, 'important');
    video.style.setProperty('transform', transform, 'important');
    video.style.setProperty('transition', transition, 'important');
  };

  const stageSize = () => {
    const rect = stage.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const coverScale = () => {
    const size = stageSize();
    return computeCoverScale(
      video.videoWidth,
      video.videoHeight,
      size.width,
      size.height,
    );
  };

  const place = (scale) => {
    const size = stageSize();
    const cover = computeCoverScale(
      video.videoWidth,
      video.videoHeight,
      size.width,
      size.height,
    );
    view.scale = snapScale(clampScale(scale, cover), [1, cover]);
    const pan = clampPan(view.x, view.y, view.scale, size.width, size.height);
    view.x = pan.x;
    view.y = pan.y;
    apply();
    return view.scale;
  };

  const remember = (scale) => {
    const cover = coverScale();
    if (scale === 1) {
      intent = FIT;
    } else if (scale === cover) {
      intent = FILL;
    } else {
      intent = FREE;
      freeFactor = cover > 0 ? scale / cover : 1;
    }
  };

  const setScale = (scale) => {
    const applied = place(scale);
    remember(applied);
    return applied;
  };

  // Re-derives the scale the intent asks for at the current stage size. This is
  // what stops the picture from being left at yesterday's crop — blown up and
  // stretched — after the window has changed shape underneath it.
  const relayout = () => {
    if (video.videoWidth === 0) return false;
    const cover = coverScale();
    if (intent === FIT) {
      place(1);
    } else if (intent === FILL) {
      place(cover);
    } else {
      place(freeFactor * cover);
    }
    return true;
  };

  apply();

  return {
    relayout,
    // The site rewrites the video's inline style and the guard puts the
    // position and the size back — but the crop lives in `transform`, which
    // the guard knows nothing about, so it has to be written again here or the
    // picture drops back into its letterbox the moment the site touches it.
    repin: apply,
    // Crops the letterbox away, which is what most people want on a phone.
    setColour: (patch) => {
      Object.assign(colour, patch);
      apply();
    },
    getColour: () => ({ ...colour }),
    beginPinch: () => {
      isPinching = true;
      return view.scale;
    },
    pinchTo: (scale) => setScale(scale),
    endPinch: () => {
      isPinching = false;
      return setScale(view.scale);
    },
    reset: () => {
      view.x = 0;
      view.y = 0;
      return setScale(1);
    },
    getScale: () => view.scale,
  };
};
