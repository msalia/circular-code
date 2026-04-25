import { describe, it, expect } from "vitest";
import { scoreFrame } from "@/scan/frameScorer";
import { makeWhiteBuffer, makeGrayBuffer, fillRect } from "./helpers";

describe("scoreFrame", () => {
  it("returns FrameScore with numeric values", () => {
    const buf = makeWhiteBuffer(320);
    const result = scoreFrame(buf, 160, 160, 100);
    expect(typeof result.sharpness).toBe("number");
    expect(typeof result.contrast).toBe("number");
    expect(typeof result.overall).toBe("number");
  });

  it("uniform buffer has near-zero contrast and sharpness", () => {
    const buf = makeWhiteBuffer(320);
    const result = scoreFrame(buf, 160, 160, 100);
    expect(result.contrast).toBeLessThan(5);
    expect(result.sharpness).toBeLessThan(5);
    expect(result.overall).toBeLessThan(0.1);
  });

  it("high contrast pattern scores higher than uniform", () => {
    const uniform = makeGrayBuffer(320, 128);
    const uniformScore = scoreFrame(uniform, 160, 160, 100);

    const striped = makeWhiteBuffer(320);
    for (let y = 0; y < 320; y += 10) {
      if (y % 20 === 0) fillRect(striped, 0, y, 320, 10, 0, 0, 0);
    }
    const stripedScore = scoreFrame(striped, 160, 160, 100);

    expect(stripedScore.contrast).toBeGreaterThan(uniformScore.contrast);
    expect(stripedScore.overall).toBeGreaterThan(uniformScore.overall);
  });

  it("sharp edges score higher sharpness than uniform gray", () => {
    const sharp = makeWhiteBuffer(320);
    fillRect(sharp, 100, 100, 120, 120, 0, 0, 0);
    const sharpScore = scoreFrame(sharp, 160, 160, 100);

    const bland = makeGrayBuffer(320, 128);
    const blandScore = scoreFrame(bland, 160, 160, 100);

    expect(sharpScore.sharpness).toBeGreaterThan(blandScore.sharpness);
  });

  it("overall is between 0 and 1 for various inputs", () => {
    const inputs = [makeWhiteBuffer(320), makeGrayBuffer(320, 128)];
    const sharp = makeWhiteBuffer(320);
    fillRect(sharp, 50, 50, 220, 220, 0, 0, 0);
    inputs.push(sharp);

    for (const buf of inputs) {
      const result = scoreFrame(buf, 160, 160, 100);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(1);
    }
  });

  it("returns zeros for region too small to sample", () => {
    const buf = makeWhiteBuffer(320);
    const result = scoreFrame(buf, 160, 160, 1);
    expect(result.sharpness).toBe(0);
    expect(result.contrast).toBe(0);
    expect(result.overall).toBe(0);
  });

  it("edge region produces valid non-negative scores", () => {
    const buf = makeWhiteBuffer(320);
    fillRect(buf, 0, 0, 50, 50, 0, 0, 0);
    const result = scoreFrame(buf, 0, 0, 50);
    expect(result.sharpness).toBeGreaterThanOrEqual(0);
    expect(result.contrast).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it("scoring region is centered on cx/cy", () => {
    const buf = makeWhiteBuffer(320);
    fillRect(buf, 100, 100, 120, 120, 0, 0, 0);
    const scoreAtPattern = scoreFrame(buf, 160, 160, 80);
    const scoreAway = scoreFrame(buf, 30, 30, 20);
    expect(scoreAtPattern.contrast).toBeGreaterThan(scoreAway.contrast);
  });
});
