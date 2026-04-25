import type { ImageBuffer } from "@/types";
import { createCanvas } from "canvas";

export function makeBuffer(width: number, height: number, r = 255, g = 255, b = 255): ImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = 255;
  }
  return { data, width, height };
}

export function makeWhiteBuffer(size: number): ImageBuffer {
  return makeBuffer(size, size, 255, 255, 255);
}

export function makeBlackBuffer(size: number): ImageBuffer {
  return makeBuffer(size, size, 0, 0, 0);
}

export function makeGrayBuffer(size: number, value: number): ImageBuffer {
  return makeBuffer(size, size, value, value, value);
}

export function setPixel(buf: ImageBuffer, x: number, y: number, r: number, g: number, b: number): void {
  const idx = (y * buf.width + x) * 4;
  buf.data[idx] = r;
  buf.data[idx + 1] = g;
  buf.data[idx + 2] = b;
  buf.data[idx + 3] = 255;
}

export function fillRect(buf: ImageBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
  for (let dy = y; dy < y + h && dy < buf.height; dy++) {
    for (let dx = x; dx < x + w && dx < buf.width; dx++) {
      setPixel(buf, dx, dy, r, g, b);
    }
  }
}

export function fillCircle(buf: ImageBuffer, cx: number, cy: number, radius: number, r: number, g: number, b: number): void {
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(buf.height - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(buf.width - 1, Math.ceil(cx + radius)); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(buf, x, y, r, g, b);
      }
    }
  }
}

export function strokeCircle(buf: ImageBuffer, cx: number, cy: number, radius: number, r: number, g: number, b: number, lineWidth = 3): void {
  const inner = radius - lineWidth / 2;
  const outer = radius + lineWidth / 2;
  for (let y = Math.max(0, Math.floor(cy - outer)); y <= Math.min(buf.height - 1, Math.ceil(cy + outer)); y++) {
    for (let x = Math.max(0, Math.floor(cx - outer)); x <= Math.min(buf.width - 1, Math.ceil(cx + outer)); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist >= inner && dist <= outer) {
        setPixel(buf, x, y, r, g, b);
      }
    }
  }
}

export function canvasToImageBuffer(canvas: any): ImageBuffer {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}
