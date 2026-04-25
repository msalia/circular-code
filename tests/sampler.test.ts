import { describe, it, expect } from "vitest";
import { samplePolarGrid } from "@/scan/sampler";
import { getRingRadius, getSegmentsForRing, getTotalSegments, isDataRing } from "@/core/layout";
import { makeWhiteBuffer, makeBlackBuffer, makeGrayBuffer, fillCircle } from "./helpers";
import type { ImageBuffer } from "@/types";

function makeHalfBuffer(size: number): ImageBuffer {
  const buf = makeWhiteBuffer(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size / 2; x++) {
      const idx = (y * size + x) * 4;
      buf.data[idx] = 0;
      buf.data[idx + 1] = 0;
      buf.data[idx + 2] = 0;
    }
  }
  return buf;
}

describe("samplePolarGrid", () => {
  it("returns correct number of bits for data rings", () => {
    const buf = makeWhiteBuffer(300);
    const bits = samplePolarGrid(buf, 150, 150, 300, 5, 48);
    expect(bits.length).toBe(getTotalSegments(5, 48));
  });

  it("excludes ring 0 from the bit count", () => {
    const rings = 5;
    const segs = 48;
    const buf = makeWhiteBuffer(300);
    const bits = samplePolarGrid(buf, 150, 150, 300, rings, segs);
    const ring0Segs = getSegmentsForRing(0, rings, segs);
    let totalIncludingRing0 = 0;
    for (let r = 0; r < rings; r++) totalIncludingRing0 += getSegmentsForRing(r, rings, segs);
    expect(bits.length).toBe(totalIncludingRing0 - ring0Segs);
  });

  it("samples all 0 for a white buffer", () => {
    const buf = makeWhiteBuffer(300);
    const bits = samplePolarGrid(buf, 150, 150, 300, 5, 48);
    expect(bits.every((b) => b === 0)).toBe(true);
  });

  it("samples all 1 for a black buffer", () => {
    const buf = makeBlackBuffer(300);
    const bits = samplePolarGrid(buf, 150, 150, 300, 5, 48);
    expect(bits.every((b) => b === 1)).toBe(true);
  });

  it("produces a mix of 0 and 1 on a half-black half-white buffer", () => {
    const buf = makeHalfBuffer(300);
    const bits = samplePolarGrid(buf, 150, 150, 300, 5, 48);
    const ones = bits.filter((b) => b === 1).length;
    const zeros = bits.filter((b) => b === 0).length;
    expect(ones).toBeGreaterThan(0);
    expect(zeros).toBeGreaterThan(0);
  });

  it("orientationOffset shifts which bits are sampled", () => {
    const buf = makeHalfBuffer(300);
    const bits0 = samplePolarGrid(buf, 150, 150, 300, 5, 48, 0);
    const bitsOffset = samplePolarGrid(buf, 150, 150, 300, 5, 48, Math.PI);
    let differences = 0;
    for (let i = 0; i < bits0.length; i++) {
      if (bits0[i] !== bitsOffset[i]) differences++;
    }
    expect(differences).toBeGreaterThan(bits0.length * 0.3);
  });

  it("samples at correct radii for each ring", () => {
    const size = 300;
    const rings = 5;
    const segs = 48;
    const targetRing = 2;
    const radius = getRingRadius(targetRing, rings, size);
    const buf = makeWhiteBuffer(size);
    fillCircle(buf, size / 2, size / 2, radius + 3, 0, 0, 0);
    fillCircle(buf, size / 2, size / 2, radius - 3, 255, 255, 255);

    const bits = samplePolarGrid(buf, size / 2, size / 2, size, rings, segs);
    let offset = 0;
    for (let r = 0; r < rings; r++) {
      if (!isDataRing(r)) continue;
      const ringSegs = getSegmentsForRing(r, rings, segs);
      if (r === targetRing) {
        const ringBits = bits.slice(offset, offset + ringSegs);
        const darkCount = ringBits.filter((b) => b === 1).length;
        expect(darkCount).toBeGreaterThan(ringSegs * 0.5);
      }
      offset += ringSegs;
    }
  });

  it("handles out-of-bounds samples gracefully", () => {
    const buf = makeWhiteBuffer(100);
    const bits = samplePolarGrid(buf, 50, 50, 300, 5, 48);
    expect(bits.length).toBe(getTotalSegments(5, 48));
    expect(bits.every((b) => b === 0 || b === 1)).toBe(true);
  });

  it("only contains 0 or 1 values for gray input", () => {
    const buf = makeGrayBuffer(300, 128);
    const bits = samplePolarGrid(buf, 150, 150, 300, 5, 48);
    for (const b of bits) {
      expect(b === 0 || b === 1).toBe(true);
    }
  });

  it("segment count per ring matches layout", () => {
    const buf = makeWhiteBuffer(300);
    const rings = 5;
    const segs = 48;
    const bits = samplePolarGrid(buf, 150, 150, 300, rings, segs);
    let expectedTotal = 0;
    for (let r = 0; r < rings; r++) {
      if (isDataRing(r)) expectedTotal += getSegmentsForRing(r, rings, segs);
    }
    expect(bits.length).toBe(expectedTotal);
  });
});
