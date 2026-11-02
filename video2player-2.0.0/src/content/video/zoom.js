export const MIN_SCALE = 1;
export const SNAP_TOLERANCE = 0.04;

// With object-fit: contain the picture is letterboxed; this is the factor that
// makes it fill the stage instead, which is what crops the black bars away.
export const computeCoverScale = (
  videoWidth,
  videoHeight,
  stageWidth,
  stageHeight,
) => {
  if (videoWidth <= 0 || videoHeight <= 0) return 1;
  if (stageWidth <= 0 || stageHeight <= 0) return 1;
  const videoAspect = videoWidth / videoHeight;
  const stageAspect = stageWidth / stageHeight;
  const ratio =
    videoAspect > stageAspect
      ? videoAspect / stageAspect
      : stageAspect / videoAspect;
  return Number.isFinite(ratio) ? ratio : 1;
};

// Zooming stops exactly where the black bars disappear: going further would
// only crop the picture for no reason.
export const clampScale = (scale, maxScale) =>
  Math.min(Math.max(MIN_SCALE, maxScale), Math.max(MIN_SCALE, scale));

export const snapScale = (scale, targets) => {
  for (const target of targets) {
    if (Math.abs(scale - target) <= SNAP_TOLERANCE * target) return target;
  }
  return scale;
};

// Panning may never reveal a gap at an edge, so the offset is bounded by how
// much the scaled picture actually overflows the stage.
export const clampPan = (x, y, scale, stageWidth, stageHeight) => {
  const maxX = Math.max(0, (stageWidth * (scale - 1)) / 2);
  const maxY = Math.max(0, (stageHeight * (scale - 1)) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
};
