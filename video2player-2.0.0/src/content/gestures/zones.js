export const ZONE = {
  SEEK: 'seek',
  HOLD_LEFT: 'holdLeft',
  HOLD_RIGHT: 'holdRight',
  DEAD: 'dead',
};

// The bottom fifth of the screen belongs to Android: that is where the home
// swipe starts, and a seek band reaching into it turned "put the app away" into
// "jump to the middle of the film". Everything of ours stays above it.
const SEEK_TOP = 0.72;
const SEEK_BOTTOM = 0.88;

// The sides are wide, the way a phone video app draws them: two fifths of the
// picture each. Narrow boxes meant the second tap of a double-tap often landed
// just outside one, on bare picture, and brought the controls up instead of
// seeking. The strip in the middle stays neutral, so a tap aimed at the centre
// is never read as a seek.
const SIDES_TOP = 0.1;
const LEFT_EDGE = 0.4;
const RIGHT_EDGE = 0.6;

// Pausing is not a zone any more. It is the play button and nothing else, so a
// tap on the picture can only ever bring the controls up or put them away.
export const hitTest = (x, y, width, height) => {
  if (y >= SEEK_TOP * height && y <= SEEK_BOTTOM * height) return ZONE.SEEK;
  if (y < SIDES_TOP * height || y > SEEK_TOP * height) return ZONE.DEAD;
  if (x < LEFT_EDGE * width) return ZONE.HOLD_LEFT;
  if (x > RIGHT_EDGE * width) return ZONE.HOLD_RIGHT;
  return ZONE.DEAD;
};

export const isDragZone = (zone) => zone === ZONE.SEEK;

export const isHoldZone = (zone) =>
  zone === ZONE.HOLD_LEFT || zone === ZONE.HOLD_RIGHT;
