import { getOrCreateCanvas } from "@/utils/canvas";

export function normalizeFrame(frame: HTMLCanvasElement, size = 320): HTMLCanvasElement {
  if (frame.width === size && frame.height === size) return frame;

  const { canvas, ctx } = getOrCreateCanvas(size, "normalizeFrame");
  ctx.drawImage(frame, 0, 0, frame.width, frame.height, 0, 0, size, size);
  return canvas;
}
