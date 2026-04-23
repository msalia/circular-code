export function getRingRadius(ring: number, rings: number, size: number): number {
  const ringWidth = size / (2 * (rings + 2));
  return (ring + 1) * ringWidth;
}

export function getSegmentAngle(segment: number, segmentsPerRing: number): number {
  return (segment / segmentsPerRing) * Math.PI * 2;
}
