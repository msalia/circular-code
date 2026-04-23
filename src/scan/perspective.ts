import type { Point } from "../types";

export function solveHomography(src: Point[], dst: Point[]): number[] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error("Homography requires exactly 4 point correspondences");
  }

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: xp, y: yp } = dst[i];

    A.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]);
    b.push(xp);
    A.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]);
    b.push(yp);
  }

  const h = solveLinearSystem(A, b);
  return [...h, 1];
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) {
      throw new Error("Singular matrix in homography computation");
    }

    for (let j = col; j <= n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row[n]);
}

export function invertHomography(H: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-10) {
    throw new Error("Homography matrix is not invertible");
  }

  const inv = [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
  return inv;
}

function applyHomography(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

function bilinearSample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const cx0 = Math.max(0, Math.min(x0, width - 1));
  const cy0 = Math.max(0, Math.min(y0, height - 1));

  const idx00 = (cy0 * width + cx0) * 4;
  const idx10 = (cy0 * width + x1) * 4;
  const idx01 = (y1 * width + cx0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const result: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    result[c] = Math.round(
      data[idx00 + c] * (1 - fx) * (1 - fy) +
        data[idx10 + c] * fx * (1 - fy) +
        data[idx01 + c] * (1 - fx) * fy +
        data[idx11 + c] * fx * fy,
    );
  }
  return result;
}

export function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  srcCorners: Point[],
  outputSize: number,
): HTMLCanvasElement {
  const dstCorners: Point[] = [
    { x: 0, y: 0 },
    { x: outputSize, y: 0 },
    { x: outputSize, y: outputSize },
    { x: 0, y: outputSize },
  ];

  const H = solveHomography(dstCorners, srcCorners);

  const srcCtx = srcCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outputSize;
  outCanvas.height = outputSize;
  const outCtx = outCanvas.getContext("2d")!;
  const outData = outCtx.createImageData(outputSize, outputSize);

  for (let dy = 0; dy < outputSize; dy++) {
    for (let dx = 0; dx < outputSize; dx++) {
      const src = applyHomography(H, dx, dy);
      if (
        src.x >= 0 &&
        src.x < srcCanvas.width &&
        src.y >= 0 &&
        src.y < srcCanvas.height
      ) {
        const pixel = bilinearSample(
          srcData.data,
          srcCanvas.width,
          srcCanvas.height,
          src.x,
          src.y,
        );
        const idx = (dy * outputSize + dx) * 4;
        outData.data[idx] = pixel[0];
        outData.data[idx + 1] = pixel[1];
        outData.data[idx + 2] = pixel[2];
        outData.data[idx + 3] = pixel[3];
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

export function estimateCircleCorners(
  cx: number,
  cy: number,
  r: number,
): Point[] {
  return [
    { x: cx - r, y: cy - r },
    { x: cx + r, y: cy - r },
    { x: cx + r, y: cy + r },
    { x: cx - r, y: cy + r },
  ];
}
