export function getRingRadius(ring: number, rings: number, size: number): number {
  const ringWidth = size / (2 * (rings + 2));
  return (ring + 1) * ringWidth;
}

export function getSegmentAngle(segment: number, segmentsInRing: number): number {
  return (segment / segmentsInRing) * Math.PI * 2;
}

export function isDataRing(ring: number): boolean {
  return ring > 0;
}

export function getSegmentsForRing(ring: number, rings: number, baseSegments: number): number {
  return Math.max(8, Math.round(baseSegments * (ring + 1) / rings));
}

export function getTotalSegments(rings: number, baseSegments: number): number {
  let total = 0;
  for (let r = 0; r < rings; r++) {
    if (isDataRing(r)) total += getSegmentsForRing(r, rings, baseSegments);
  }
  return total;
}
