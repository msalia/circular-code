let cachedCanvas: HTMLCanvasElement | null = null;
let cachedCtx: CanvasRenderingContext2D | null = null;

export function captureFrame(
  video: HTMLVideoElement,
  targetSize = 224,
): HTMLCanvasElement {
  if (!cachedCanvas) {
    cachedCanvas = document.createElement("canvas");
  }
  if (cachedCanvas.width !== targetSize || cachedCanvas.height !== targetSize) {
    cachedCanvas.width = targetSize;
    cachedCanvas.height = targetSize;
    cachedCtx = null;
  }
  if (!cachedCtx) {
    cachedCtx = cachedCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (!cachedCtx) {
    throw new Error("Unable to capture video frame: canvas context unavailable.");
  }

  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;
  cachedCtx.drawImage(video, sx, sy, side, side, 0, 0, targetSize, targetSize);
  return cachedCanvas;
}
