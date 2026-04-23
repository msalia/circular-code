import type { DetectionResult } from "@/types";

export function detectCircle(frame: HTMLCanvasElement): DetectionResult {
  const ctx = frame.getContext("2d");
  if (!ctx) {
    return { cx: frame.width / 2, cy: frame.height / 2, r: Math.min(frame.width, frame.height) * 0.4, confidence: 0 };
  }

  const width = frame.width;
  const height = frame.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * imageData.data[idx] +
      0.587 * imageData.data[idx + 1] +
      0.114 * imageData.data[idx + 2],
    );
  }

  const edges = sobelEdgeDetect(gray, width, height);
  const result = houghCircleDetect(edges, width, height);

  return result;
}

function sobelEdgeDetect(
  gray: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const edges = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)];

      const gy =
        -gray[(y - 1) * width + (x - 1)] +
        -2 * gray[(y - 1) * width + x] +
        -gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = Math.min(255, Math.round(magnitude));
    }
  }

  return edges;
}

function houghCircleDetect(
  edges: Uint8Array,
  width: number,
  height: number,
): DetectionResult {
  const minR = Math.min(width, height) * 0.1;
  const maxR = Math.min(width, height) * 0.45;
  const rSteps = 20;
  const threshold = 100;

  let bestCx = width / 2;
  let bestCy = height / 2;
  let bestR = Math.min(width, height) * 0.4;
  let bestVotes = 0;

  const step = Math.max(2, Math.floor(Math.min(width, height) / 80));

  for (let ri = 0; ri < rSteps; ri++) {
    const r = minR + (ri / rSteps) * (maxR - minR);
    const accumulator = new Map<string, number>();

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (edges[y * width + x] < threshold) continue;

        for (let t = 0; t < 12; t++) {
          const angle = (t / 12) * Math.PI * 2;
          const cx = Math.round(x - r * Math.cos(angle));
          const cy = Math.round(y - r * Math.sin(angle));

          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

          const qx = Math.round(cx / step) * step;
          const qy = Math.round(cy / step) * step;
          const key = `${qx},${qy}`;
          const votes = (accumulator.get(key) ?? 0) + 1;
          accumulator.set(key, votes);

          if (votes > bestVotes) {
            bestVotes = votes;
            bestCx = qx;
            bestCy = qy;
            bestR = r;
          }
        }
      }
    }
  }

  const maxPossibleVotes = ((width * height) / (step * step)) * 12;
  const confidence = Math.min(1, bestVotes / (maxPossibleVotes * 0.05));

  return {
    cx: bestCx,
    cy: bestCy,
    r: bestR,
    confidence,
  };
}
