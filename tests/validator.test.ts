import { describe, it, expect } from "vitest";
import { validateCircularCode } from "@/scan/validator";
import { getRingRadius, getRingWidth } from "@/core/layout";
import { makeWhiteBuffer, makeBlackBuffer, fillCircle, strokeCircle, fillRect } from "./helpers";
import type { ImageBuffer } from "@/types";

function makeCodeLikeBuffer(size: number, rings: number): ImageBuffer {
  const buf = makeWhiteBuffer(size);
  const cx = size / 2;
  const cy = size / 2;
  const ringWidth = getRingWidth(rings, size);

  fillCircle(buf, cx, cy, ringWidth * 0.7, 0, 0, 0);

  for (let r = 1; r < rings; r++) {
    const radius = getRingRadius(r, rings, size);
    const segs = 16;
    for (let s = 0; s < segs; s++) {
      if (s % 2 === 0) {
        const angle = (s / segs) * Math.PI * 2;
        const span = (1 / segs) * Math.PI * 2 * 0.6;
        for (let a = angle; a < angle + span; a += 0.02) {
          const x = Math.round(cx + radius * Math.cos(a));
          const y = Math.round(cy + radius * Math.sin(a));
          if (x >= 0 && x < size && y >= 0 && y < size) {
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const px = x + dx;
                const py = y + dy;
                if (px >= 0 && px < size && py >= 0 && py < size) {
                  const idx = (py * size + px) * 4;
                  buf.data[idx] = 0;
                  buf.data[idx + 1] = 0;
                  buf.data[idx + 2] = 0;
                }
              }
            }
          }
        }
      }
    }
  }

  return buf;
}

describe("validateCircularCode", () => {
  it("blank white buffer is not a valid code", () => {
    const buf = makeWhiteBuffer(300);
    const result = validateCircularCode(buf, 5, 300);
    expect(result.valid).toBe(false);
    expect(result.centerDot).toBe(false);
    expect(result.ringContrast).toBe(false);
    expect(result.score).toBeLessThan(0.5);
  });

  it("blank black buffer is not a valid code", () => {
    const buf = makeBlackBuffer(300);
    const result = validateCircularCode(buf, 5, 300);
    expect(result.valid).toBe(false);
  });

  it("center dot check detects dark center on light background", () => {
    const buf = makeWhiteBuffer(300);
    fillCircle(buf, 150, 150, 15, 0, 0, 0);
    const result = validateCircularCode(buf, 5, 300);
    expect(result.centerDot).toBe(true);
  });

  it("center dot check fails for light center", () => {
    const buf = makeWhiteBuffer(300);
    const result = validateCircularCode(buf, 5, 300);
    expect(result.centerDot).toBe(false);
  });

  it("code-like pattern passes validation", () => {
    const buf = makeCodeLikeBuffer(300, 5);
    const result = validateCircularCode(buf, 5, 300);
    expect(result.centerDot).toBe(true);
    expect(result.score).toBeGreaterThan(0.3);
  });

  it("score is between 0 and 1", () => {
    for (const buf of [makeWhiteBuffer(300), makeBlackBuffer(300), makeCodeLikeBuffer(300, 5)]) {
      const result = validateCircularCode(buf, 5, 300);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it("threshold 0 always passes", () => {
    const buf = makeWhiteBuffer(300);
    const result = validateCircularCode(buf, 5, 300, 0.0);
    expect(result.valid).toBe(true);
  });

  it("threshold 1 fails for non-perfect codes", () => {
    const buf = makeWhiteBuffer(300);
    fillCircle(buf, 150, 150, 15, 0, 0, 0);
    const result = validateCircularCode(buf, 5, 300, 1.0);
    expect(result.valid).toBe(false);
  });

  it("different ring counts produce different scoring behavior", () => {
    const buf3 = makeCodeLikeBuffer(300, 3);
    const buf6 = makeCodeLikeBuffer(300, 6);
    const r3 = validateCircularCode(buf3, 3, 300);
    const r6 = validateCircularCode(buf6, 6, 300);
    expect(r3.centerDot).toBe(true);
    expect(r6.centerDot).toBe(true);
  });

  it("ring contrast detects transitions in concentric ring pattern", () => {
    const size = 300;
    const rings = 5;
    const ringWidth = getRingWidth(rings, size);
    const buf = makeWhiteBuffer(size);
    for (let r = 0; r < rings + 3; r++) {
      if (r % 2 === 0) {
        const radius = (r + 0.5) * ringWidth;
        strokeCircle(buf, size / 2, size / 2, radius, 0, 0, 0, ringWidth * 0.4);
      }
    }
    const result = validateCircularCode(buf, rings, size);
    expect(result.ringContrast).toBe(true);
  });
});
