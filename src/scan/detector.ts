import type { DetectionResult, ImageBuffer } from "@/types";

import { toGrayscale } from "@/utils/image";

const HOUGH_ANGLES = 12;
const cosTable = new Float64Array(HOUGH_ANGLES);
const sinTable = new Float64Array(HOUGH_ANGLES);
for (let t = 0; t < HOUGH_ANGLES; t++) {
  const angle = (t / HOUGH_ANGLES) * Math.PI * 2;
  cosTable[t] = Math.cos(angle);
  sinTable[t] = Math.sin(angle);
}

/** Detects a circle in an image using Sobel edge detection and Hough transform. */
export function detectCircle(buf: ImageBuffer): DetectionResult {
  const { data, width, height } = buf;
  const gray = toGrayscale(data, width * height);
  const edges = sobelEdgeDetect(gray, width, height);
  return houghCircleDetect(edges, width, height);
}

function sobelEdgeDetect(gray: Uint8Array, width: number, height: number): Uint8Array {
  const edges = new Uint8Array(width * height);
  const thresholdSq = 100 * 100;

  for (let y = 1; y < height - 1; y++) {
    const rowAbove = (y - 1) * width;
    const rowCur = y * width;
    const rowBelow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const tl = gray[rowAbove + x - 1];
      const tr = gray[rowAbove + x + 1];
      const ml = gray[rowCur + x - 1];
      const mr = gray[rowCur + x + 1];
      const bl = gray[rowBelow + x - 1];
      const br = gray[rowBelow + x + 1];
      const tm = gray[rowAbove + x];
      const bm = gray[rowBelow + x];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tm - tr + bl + 2 * bm + br;
      const magSq = gx * gx + gy * gy;

      if (magSq >= thresholdSq) {
        const mag = Math.sqrt(magSq);
        edges[rowCur + x] = mag > 255 ? 255 : mag;
      }
    }
  }

  return edges;
}

function houghCircleDetect(edges: Uint8Array, width: number, height: number): DetectionResult {
  const minR = Math.min(width, height) * 0.1;
  const maxR = Math.min(width, height) * 0.45;
  const rSteps = 20;
  const threshold = 100;

  let bestCx = width / 2;
  let bestCy = height / 2;
  let bestR = Math.min(width, height) * 0.4;
  let bestVotes = 0;

  const step = Math.max(2, Math.floor(Math.min(width, height) / 80));
  const qWidth = Math.ceil(width / step);
  const qHeight = Math.ceil(height / step);
  const accumulator = new Int32Array(qWidth * qHeight);

  for (let ri = 0; ri < rSteps; ri++) {
    const r = minR + (ri / rSteps) * (maxR - minR);
    accumulator.fill(0);

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (edges[y * width + x] < threshold) continue;

        for (let t = 0; t < HOUGH_ANGLES; t++) {
          const cx = (x - r * cosTable[t] + 0.5) | 0;
          const cy = (y - r * sinTable[t] + 0.5) | 0;

          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

          const qx = (cx / step) | 0;
          const qy = (cy / step) | 0;
          const accIdx = qy * qWidth + qx;
          const votes = ++accumulator[accIdx];

          if (votes > bestVotes) {
            bestVotes = votes;
            bestCx = qx * step;
            bestCy = qy * step;
            bestR = r;
          }
        }
      }
    }
  }

  const maxPossibleVotes = ((width * height) / (step * step)) * HOUGH_ANGLES;
  const confidence = Math.min(1, bestVotes / (maxPossibleVotes * 0.05));

  return { cx: bestCx, cy: bestCy, r: bestR, confidence };
}
