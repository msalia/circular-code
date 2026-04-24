import { getOrCreateCanvas } from "@/utils/canvas";

export function captureFrame(video: HTMLVideoElement, targetSize = 224): HTMLCanvasElement {
  const { canvas, ctx } = getOrCreateCanvas(targetSize, "captureFrame", {
    willReadFrequently: true,
  });

  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, targetSize, targetSize);
  return canvas;
}

export function toGrayscale(data: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const gray = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    gray[i] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
  }
  return gray;
}
