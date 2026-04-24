import type { FrameScore } from "@/types";

export function scoreFrame(
  canvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  r: number,
): FrameScore {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { sharpness: 0, contrast: 0, overall: 0 };

  const left = Math.max(0, Math.floor(cx - r));
  const top = Math.max(0, Math.floor(cy - r));
  const regionW = Math.min(Math.ceil(r * 2), canvas.width - left);
  const regionH = Math.min(Math.ceil(r * 2), canvas.height - top);

  if (regionW <= 2 || regionH <= 2) return { sharpness: 0, contrast: 0, overall: 0 };

  const data = ctx.getImageData(left, top, regionW, regionH).data;

  const gray = new Uint8Array(regionW * regionH);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
  }

  let lapSum = 0;
  let lapCount = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 1; y < regionH - 1; y += 2) {
    for (let x = 1; x < regionW - 1; x += 2) {
      const idx = y * regionW + x;
      const v = gray[idx];
      const lap = -4 * v + gray[idx - 1] + gray[idx + 1] + gray[idx - regionW] + gray[idx + regionW];
      lapSum += lap * lap;
      lapCount++;
      sum += v;
      sumSq += v * v;
    }
  }

  const sharpness = lapCount > 0 ? lapSum / lapCount : 0;
  const totalSampled = lapCount;
  const mean = totalSampled > 0 ? sum / totalSampled : 0;
  const variance = totalSampled > 0 ? sumSq / totalSampled - mean * mean : 0;
  const contrast = Math.sqrt(Math.max(0, variance));

  const normalizedSharpness = Math.min(sharpness / 500, 1);
  const normalizedContrast = Math.min(contrast / 80, 1);
  const overall = normalizedSharpness * 0.6 + normalizedContrast * 0.4;

  return { sharpness, contrast, overall };
}
