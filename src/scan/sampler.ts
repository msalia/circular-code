import type { ImageBuffer } from "@/types";

import { getRingRadius, getSegmentAngle, getSegmentsForRing, isDataRing } from "@/core/layout";

export function samplePolarGrid(
  frame: ImageBuffer,
  cx: number,
  cy: number,
  codeSize: number,
  rings = 5,
  segmentsPerRing = 48,
  orientationOffset = 0,
): number[] {
  const { data, width, height } = frame;
  const bits: number[] = [];

  for (let r = 0; r < rings; r++) {
    if (!isDataRing(r)) continue;
    const segs = getSegmentsForRing(r, rings, segmentsPerRing);
    const sampleRadius = getRingRadius(r, rings, codeSize);
    for (let segment = 0; segment < segs; segment++) {
      const angle = getSegmentAngle(segment, segs) + orientationOffset;
      const x = Math.round(cx + sampleRadius * Math.cos(angle));
      const y = Math.round(cy + sampleRadius * Math.sin(angle));
      if (x < 0 || x >= width || y < 0 || y >= height) {
        bits.push(0);
        continue;
      }
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      bits.push(brightness < 128 ? 1 : 0);
    }
  }

  return bits;
}
