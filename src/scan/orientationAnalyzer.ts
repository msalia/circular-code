import type { ImageBuffer } from "@/types";

import { getOrientationArcs, getOrientationRingRadius } from "@/core/layout";
import { toGrayscale } from "@/utils/image";

/** Result of analyzing the orientation ring pattern. */
export type OrientationAnalysis = {
  angle: number;
  reflected: boolean;
  confidence: number;
};

/** Analyzes the orientation ring in a rectified image to determine rotation and reflection. */
export function analyzeOrientation(
  buf: ImageBuffer,
  rings: number,
  size: number,
  numSamples = 360,
): OrientationAnalysis {
  const { data, width, height } = buf;
  const gray = toGrayscale(data, width * height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = getOrientationRingRadius(rings, size);
  const arcs = getOrientationArcs();

  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const angle = (i / numSamples) * Math.PI * 2;
    const x = Math.round(cx + radius * Math.cos(angle));
    const y = Math.round(cy + radius * Math.sin(angle));
    if (x >= 0 && x < width && y >= 0 && y < height) {
      samples[i] = gray[y * width + x];
    } else {
      samples[i] = 128;
    }
  }

  let bgSum = 0;
  let bgCount = 0;
  const bgRadius = radius * 0.5;
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    const x = Math.round(cx + bgRadius * Math.cos(angle));
    const y = Math.round(cy + bgRadius * Math.sin(angle));
    if (x >= 0 && x < width && y >= 0 && y < height) {
      bgSum += gray[y * width + x];
      bgCount++;
    }
  }
  const bgLevel = bgCount > 0 ? bgSum / bgCount : 200;

  const sorted = Array.from(samples).sort((a, b) => a - b);
  const darkLevel = sorted[Math.floor(numSamples * 0.1)];
  const threshold = (darkLevel + bgLevel) / 2;

  const dark = new Uint8Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    dark[i] = samples[i] < threshold ? 1 : 0;
  }

  const expectedDark = buildExpectedPattern(arcs, numSamples, false);
  const expectedDarkRefl = buildExpectedPattern(arcs, numSamples, true);

  let bestScore = -1;
  let bestAngle = 0;
  let bestReflected = false;

  for (let offset = 0; offset < numSamples; offset++) {
    let score = 0;
    let scoreRefl = 0;
    for (let i = 0; i < numSamples; i++) {
      const si = (i + offset) % numSamples;
      if (dark[si] === expectedDark[i]) score++;
      if (dark[si] === expectedDarkRefl[i]) scoreRefl++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAngle = (offset / numSamples) * Math.PI * 2;
      bestReflected = false;
    }
    if (scoreRefl > bestScore) {
      bestScore = scoreRefl;
      bestAngle = (offset / numSamples) * Math.PI * 2;
      bestReflected = true;
    }
  }

  return {
    angle: bestAngle,
    reflected: bestReflected,
    confidence: bestScore / numSamples,
  };
}

function buildExpectedPattern(
  arcs: { start: number; end: number }[],
  numSamples: number,
  reflected: boolean,
): Uint8Array {
  const pattern = new Uint8Array(numSamples);
  const src = reflected ? [...arcs].reverse() : arcs;
  for (const arc of src) {
    const span = arc.end - arc.start;
    const startIdx = reflected
      ? Math.round(((2 * Math.PI - arc.end) / (Math.PI * 2)) * numSamples)
      : Math.round((arc.start / (Math.PI * 2)) * numSamples);
    const count = Math.round((span / (Math.PI * 2)) * numSamples);
    for (let i = 0; i < count; i++) {
      pattern[(startIdx + i + numSamples) % numSamples] = 1;
    }
  }
  return pattern;
}
