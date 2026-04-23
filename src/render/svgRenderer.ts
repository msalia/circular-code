import type { EncodedCode } from "@/types";
import { getRingRadius, getSegmentAngle } from "@/core/layout";

export function renderSVG(code: EncodedCode, size = 300): string {
  const { bits, rings, segmentsPerRing } = code;
  const cx = size / 2;
  const cy = size / 2;
  const ringWidth = size / (2 * (rings + 2));
  let paths = "";
  let bitIndex = 0;

  for (let r = 0; r < rings; r++) {
    const radius = getRingRadius(r, rings, size);
    for (let i = 0; i < segmentsPerRing; i++) {
      const bit = bits[bitIndex++] ?? 0;
      if (!bit) continue;
      const start = getSegmentAngle(i, segmentsPerRing);
      const end = start + (2 * Math.PI) / segmentsPerRing * 0.7;
      const x1 = cx + radius * Math.cos(start);
      const y1 = cy + radius * Math.sin(start);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);

      paths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}"
          stroke="black"
          stroke-width="${ringWidth * 0.5}"
          fill="none"
          stroke-linecap="round"/>`;
    }
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${paths}
      <circle cx="${cx}" cy="${cy}" r="${ringWidth}" fill="black" />
    </svg>
  `;
}
