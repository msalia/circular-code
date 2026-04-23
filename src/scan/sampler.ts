import { getSegmentAngle, getSegmentsForRing, isDataRing } from "@/core/layout";

export function samplePolarGrid(
  frame: HTMLCanvasElement,
  cx: number,
  cy: number,
  radius: number,
  rings = 5,
  segmentsPerRing = 48
): number[] {
  const ctx = frame.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to sample frame: canvas context unavailable.");
  }

  const bits: number[] = [];
  const ringSpacing = radius / (rings + 1);

  for (let r = 1; r <= rings; r++) {
    const ringIndex = r - 1;
    if (!isDataRing(ringIndex)) continue;
    const segs = getSegmentsForRing(ringIndex, rings, segmentsPerRing);
    const sampleRadius = r * ringSpacing;
    for (let segment = 0; segment < segs; segment++) {
      const angle = getSegmentAngle(segment, segs);
      const x = Math.round(cx + sampleRadius * Math.cos(angle));
      const y = Math.round(cy + sampleRadius * Math.sin(angle));
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
      bits.push(brightness < 128 ? 1 : 0);
    }
  }

  return bits;
}
