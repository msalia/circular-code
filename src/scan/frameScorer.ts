import type { FrameScore } from "@/types";

export function scoreFrame(
  canvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  r: number,
): FrameScore {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { sharpness: 0, contrast: 0, overall: 0 };

  const left = Math.max(0, Math.floor(cx - r));
  const top = Math.max(0, Math.floor(cy - r));
  const regionW = Math.min(Math.ceil(r * 2), canvas.width - left);
  const regionH = Math.min(Math.ceil(r * 2), canvas.height - top);

  if (regionW <= 2 || regionH <= 2) return { sharpness: 0, contrast: 0, overall: 0 };

  const imageData = ctx.getImageData(left, top, regionW, regionH);
  const gray = toGrayscale(imageData.data, regionW, regionH);

  const sharpness = laplacianVariance(gray, regionW, regionH);
  const contrast = computeContrast(gray);

  const normalizedSharpness = Math.min(sharpness / 500, 1);
  const normalizedContrast = Math.min(contrast / 80, 1);
  const overall = normalizedSharpness * 0.6 + normalizedContrast * 0.4;

  return { sharpness, contrast, overall };
}

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  return gray;
}

function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width];
      sum += laplacian * laplacian;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

function computeContrast(gray: Float32Array): number {
  if (gray.length === 0) return 0;

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    sumSq += gray[i] * gray[i];
  }

  const mean = sum / gray.length;
  const variance = sumSq / gray.length - mean * mean;
  return Math.sqrt(Math.max(0, variance));
}
