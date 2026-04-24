import type { EncodedCode } from "@/types";

import {
  getRingRadius,
  getRingWidth,
  getSegmentAngle,
  getSegmentsForRing,
  isDataRing,
} from "@/core/layout";

export function renderCanvas(code: EncodedCode, size = 300): HTMLCanvasElement {
  const { bits, rings, segmentsPerRing } = code;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas rendering context is unavailable.");
  }

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "black";
  ctx.lineCap = "round";
  ctx.lineWidth = getRingWidth(rings, size) * 0.5;

  let bitIndex = 0;
  const cx = size / 2;
  const cy = size / 2;

  for (let ring = 0; ring < rings; ring++) {
    if (!isDataRing(ring)) continue;
    const segs = getSegmentsForRing(ring, rings, segmentsPerRing);
    const radius = getRingRadius(ring, rings, size);
    for (let segment = 0; segment < segs; segment++) {
      const bit = bits[bitIndex++] ?? 0;
      if (!bit) continue;
      const start = getSegmentAngle(segment, segs);
      const end = start + ((2 * Math.PI) / segs) * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, end);
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy, getRingWidth(rings, size), 0, Math.PI * 2);
  ctx.fillStyle = "black";
  ctx.fill();

  return canvas;
}
