export const MIN_VIEWER_SCALE = 1;
export const MAX_VIEWER_SCALE = 5;
export const DOUBLE_TAP_VIEWER_SCALE = 2.5;

export type ViewerTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export function clampViewerScale(scale: number) {
  "worklet";
  return Math.max(MIN_VIEWER_SCALE, Math.min(MAX_VIEWER_SCALE, scale));
}

export function clampViewerTranslation(
  transform: ViewerTransform,
  viewport: { width: number; height: number; contentAspectRatio?: number },
): ViewerTransform {
  "worklet";
  const scale = clampViewerScale(transform.scale);
  if (scale <= MIN_VIEWER_SCALE) return { scale: MIN_VIEWER_SCALE, translateX: 0, translateY: 0 };
  const aspect = viewport.contentAspectRatio && viewport.contentAspectRatio > 0
    ? viewport.contentAspectRatio
    : viewport.width / viewport.height;
  const viewportAspect = viewport.width / viewport.height;
  const containedWidth = aspect >= viewportAspect ? viewport.width : viewport.height * aspect;
  const containedHeight = aspect >= viewportAspect ? viewport.width / aspect : viewport.height;
  const maxX = Math.max(0, (containedWidth * scale - viewport.width) / 2);
  const maxY = Math.max(0, (containedHeight * scale - viewport.height) / 2);
  const boundedX = Math.max(-maxX, Math.min(maxX, transform.translateX));
  const boundedY = Math.max(-maxY, Math.min(maxY, transform.translateY));
  return {
    scale,
    translateX: boundedX === 0 ? 0 : boundedX,
    translateY: boundedY === 0 ? 0 : boundedY,
  };
}

export function zoomViewerAtPoint(
  current: ViewerTransform,
  nextScale: number,
  point: { x: number; y: number },
  viewport: { width: number; height: number; contentAspectRatio?: number },
) {
  "worklet";
  const scale = clampViewerScale(nextScale);
  if (scale === MIN_VIEWER_SCALE) return { scale, translateX: 0, translateY: 0 };
  const ratio = scale / current.scale;
  const centeredX = point.x - viewport.width / 2;
  const centeredY = point.y - viewport.height / 2;
  return clampViewerTranslation({
    scale,
    translateX: current.translateX * ratio + centeredX * (1 - ratio),
    translateY: current.translateY * ratio + centeredY * (1 - ratio),
  }, viewport);
}
