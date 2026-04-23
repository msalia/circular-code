export function normalizeFrame(frame: HTMLCanvasElement, size = 320): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to normalize frame: canvas context unavailable.");
  }

  ctx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, size, size);
  return canvas;
}
