let cachedCanvas: HTMLCanvasElement | null = null;
let cachedCtx: CanvasRenderingContext2D | null = null;

export function normalizeFrame(frame: HTMLCanvasElement, size = 320): HTMLCanvasElement {
  if (frame.width === size && frame.height === size) return frame;

  if (!cachedCanvas) {
    cachedCanvas = document.createElement("canvas");
  }
  if (cachedCanvas.width !== size || cachedCanvas.height !== size) {
    cachedCanvas.width = size;
    cachedCanvas.height = size;
    cachedCtx = null;
  }
  if (!cachedCtx) {
    cachedCtx = cachedCanvas.getContext("2d");
  }
  if (!cachedCtx) {
    throw new Error("Unable to normalize frame: canvas context unavailable.");
  }

  cachedCtx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, size, size);
  return cachedCanvas;
}
