import type { EncodedCode } from "@/types";

import {
  getRingRadius,
  getRingWidth,
  getSegmentAngle,
  getSegmentsForRing,
  isDataRing,
} from "@/core/layout";

const DEFAULT_SIZE = 300;
const DEFAULT_PRIMARY = "#000000";
const DEFAULT_SECONDARY = "#d0d0d0";
const GAP_FRACTION = 0.3;
const STROKE_WIDTH_RATIO = 0.5;
const CENTER_RADIUS_RATIO = 0.7;
const SECONDARY_SEPARATION = 1;

export type SVGRenderOptions = {
  size?: number;
  primary?: string;
  secondary?: string;
};

export function renderSVG(code: EncodedCode, opts: SVGRenderOptions | number = {}): string {
  const normalized = typeof opts === "number" ? { size: opts } : opts;
  const {
    size = DEFAULT_SIZE,
    primary = DEFAULT_PRIMARY,
    secondary = DEFAULT_SECONDARY,
  } = normalized;

  const { bits, rings, segmentsPerRing } = code;
  const cx = size / 2;
  const cy = size / 2;
  const ringWidth = getRingWidth(rings, size);
  const strokeWidth = ringWidth * STROKE_WIDTH_RATIO;
  let secondaryPaths = "";
  let primaryPaths = "";
  let bitIndex = 0;

  for (let r = 0; r < rings; r++) {
    const segs = getSegmentsForRing(r, rings, segmentsPerRing);
    const segAngle = (2 * Math.PI) / segs;
    const radius = getRingRadius(r, rings, size);
    if (!isDataRing(r)) continue;

    const ringBits: number[] = [];
    for (let i = 0; i < segs; i++) {
      ringBits.push(bits[bitIndex++] ?? 0);
    }

    const primaryArcs: { startSeg: number; runLen: number }[] = [];
    let i = 0;
    while (i < segs) {
      if (!ringBits[i]) {
        i++;
        continue;
      }
      let runEnd = i + 1;
      while (runEnd < segs && ringBits[runEnd]) runEnd++;
      primaryArcs.push({ startSeg: i, runLen: runEnd - i });
      i = runEnd;
    }

    for (const arc of primaryArcs) {
      const start = getSegmentAngle(arc.startSeg, segs);
      const end = start + segAngle * (arc.runLen - GAP_FRACTION);
      const sweep = end - start;
      if (sweep <= 0) continue;
      const largeArc = sweep > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(start);
      const y1 = cy + radius * Math.sin(start);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      primaryPaths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"/>`;
    }

    if (primaryArcs.length === 0) {
      i = 0;
      while (i < segs) {
        let runEnd = i + 1;
        while (runEnd < segs) runEnd++;
        const start = getSegmentAngle(i, segs);
        const end = start + segAngle * (segs - GAP_FRACTION);
        const largeArc = end - start > Math.PI ? 1 : 0;
        const x1 = cx + radius * Math.cos(start);
        const y1 = cy + radius * Math.sin(start);
        const x2 = cx + radius * Math.cos(end);
        const y2 = cy + radius * Math.sin(end);
        secondaryPaths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"/>`;
        break;
      }
    } else {
      for (let j = 0; j < primaryArcs.length; j++) {
        const cur = primaryArcs[j];
        const next = primaryArcs[(j + 1) % primaryArcs.length];
        const gapStartSeg = cur.startSeg + cur.runLen + SECONDARY_SEPARATION;
        const gapEndSeg =
          j + 1 < primaryArcs.length
            ? next.startSeg - SECONDARY_SEPARATION
            : next.startSeg + segs - SECONDARY_SEPARATION;
        const gapLen = gapEndSeg - gapStartSeg;
        if (gapLen < 1) continue;

        const start = getSegmentAngle(gapStartSeg % segs, segs);
        const arcSpan = segAngle * (gapLen - GAP_FRACTION);
        if (arcSpan <= 0) continue;
        const end = start + arcSpan;
        const largeArc = arcSpan > Math.PI ? 1 : 0;
        const x1 = cx + radius * Math.cos(start);
        const y1 = cy + radius * Math.sin(start);
        const x2 = cx + radius * Math.cos(end);
        const y2 = cy + radius * Math.sin(end);
        secondaryPaths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"/>`;
      }
    }
  }

  const centerRadius = ringWidth * CENTER_RADIUS_RATIO;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <g stroke="${secondary}">${secondaryPaths}
      </g>
      <g stroke="${primary}">${primaryPaths}
      </g>
      <circle cx="${cx}" cy="${cy}" r="${centerRadius}" fill="${primary}" />
    </svg>
  `;
}
