import type { FrameScore, ImageBuffer } from "@/types";

import { toGrayscale } from "@/utils/image";

export function scoreFrame(
  buf: ImageBuffer,
  cx: number,
  cy: number,
  r: number,
): FrameScore {
  const { data, width, height } = buf;

  const left = Math.max(0, Math.floor(cx - r));
  const top = Math.max(0, Math.floor(cy - r));
  const regionW = Math.min(Math.ceil(r * 2), width - left);
  const regionH = Math.min(Math.ceil(r * 2), height - top);

  if (regionW <= 2 || regionH <= 2) return { sharpness: 0, contrast: 0, overall: 0 };

  const regionData = new Uint8ClampedArray(regionW * regionH * 4);
  for (let y = 0; y < regionH; y++) {
    const srcOffset = ((top + y) * width + left) * 4;
    const dstOffset = y * regionW * 4;
    regionData.set(data.subarray(srcOffset, srcOffset + regionW * 4), dstOffset);
  }

  const gray = toGrayscale(regionData, regionW * regionH);

  let lapSum = 0;
  let lapCount = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 1; y < regionH - 1; y += 2) {
    for (let x = 1; x < regionW - 1; x += 2) {
      const idx = y * regionW + x;
      const v = gray[idx];
      const lap =
        -4 * v + gray[idx - 1] + gray[idx + 1] + gray[idx - regionW] + gray[idx + regionW];
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
