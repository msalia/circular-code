import type { ImageBuffer } from "@/types";

import { getOrCreateCanvas } from "@/utils/canvas";

export function createBuffer(width: number, height: number): ImageBuffer {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

export function canvasToBuffer(canvas: HTMLCanvasElement): ImageBuffer {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to get canvas context");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

export function bufferToCanvas(buf: ImageBuffer): HTMLCanvasElement {
  const { canvas, ctx } = getOrCreateCanvas(buf.width, "bufferToCanvas");
  canvas.height = buf.height;
  const imageData = ctx.createImageData(buf.width, buf.height);
  imageData.data.set(buf.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function captureFrame(video: HTMLVideoElement, targetSize = 320): HTMLCanvasElement {
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

export function captureFrameToBuffer(video: HTMLVideoElement, targetSize = 320): ImageBuffer {
  const canvas = captureFrame(video, targetSize);
  return canvasToBuffer(canvas);
}

export function toGrayscale(data: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const gray = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    gray[i] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
  }
  return gray;
}

export function flipBufferHorizontal(buf: ImageBuffer): ImageBuffer {
  const { width, height, data } = buf;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = (y * width + (width - 1 - x)) * 4;
      out[dstIdx] = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return { data: out, width, height };
}

export function getPixelBrightness(buf: ImageBuffer, x: number, y: number): number {
  if (x < 0 || x >= buf.width || y < 0 || y >= buf.height) return 128;
  const idx = (y * buf.width + x) * 4;
  return (buf.data[idx] + buf.data[idx + 1] + buf.data[idx + 2]) / 3;
}
