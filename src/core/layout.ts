export function getRingWidth(rings: number, size: number): number {
  return size / (2 * (rings + 3));
}

export function getOrientationRingRadius(rings: number, size: number): number {
  return (rings + 1) * getRingWidth(rings, size);
}

export type OrientationArc = { start: number; end: number };

export function getOrientationArcs(): OrientationArc[] {
  const GAP = Math.PI / 18; // 10° gap between arcs
  const arcs: OrientationArc[] = [];
  let cursor = 0;

  // Long arc: ~180°
  arcs.push({ start: cursor, end: cursor + Math.PI });
  cursor += Math.PI + GAP;

  // Medium arc: ~90°
  arcs.push({ start: cursor, end: cursor + Math.PI / 2 });
  cursor += Math.PI / 2 + GAP;

  // Short arc: ~45°
  arcs.push({ start: cursor, end: cursor + Math.PI / 4 });

  return arcs;
}

export function getRingRadius(ring: number, rings: number, size: number): number {
  return (ring + 1) * getRingWidth(rings, size);
}

export function getSegmentAngle(segment: number, segmentsInRing: number): number {
  return (segment / segmentsInRing) * Math.PI * 2;
}

export function isDataRing(ring: number): boolean {
  return ring > 0;
}

export function getSegmentsForRing(ring: number, rings: number, baseSegments: number): number {
  return Math.max(8, Math.round((baseSegments * (ring + 1)) / rings));
}

export function getTotalSegments(rings: number, baseSegments: number): number {
  let total = 0;
  for (let r = 0; r < rings; r++) {
    if (isDataRing(r)) total += getSegmentsForRing(r, rings, baseSegments);
  }
  return total;
}
