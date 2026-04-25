import { describe, it, expect } from "vitest";
import { resolveCorners, flipHorizontal, rectifyCode } from "@/scan";
import type { DetectionResult, Point } from "@/types";
import { makeWhiteBuffer, fillRect } from "./helpers";

function makeDetection(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    cx: 160,
    cy: 160,
    r: 100,
    confidence: 0.9,
    ...overrides,
  };
}

describe("resolveCorners", () => {
  it("returns model corners when available", () => {
    const modelCorners: Point[] = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    const det = makeDetection({ corners: modelCorners });
    const corners = resolveCorners(det);
    expect(corners).toEqual(modelCorners);
  });

  it("estimates corners from geometry when no model corners", () => {
    const det = makeDetection({ corners: undefined });
    const corners = resolveCorners(det);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect(c).toHaveProperty("x");
      expect(c).toHaveProperty("y");
    }
  });

  it("estimated corners form a quadrilateral around the detection center", () => {
    const det = makeDetection({ cx: 100, cy: 100, r: 50 });
    const corners = resolveCorners(det);
    const avgX = corners.reduce((s, c) => s + c.x, 0) / 4;
    const avgY = corners.reduce((s, c) => s + c.y, 0) / 4;
    expect(avgX).toBeCloseTo(100, 0);
    expect(avgY).toBeCloseTo(100, 0);
  });

  it("uses angle for rotated corner estimation", () => {
    const det0 = makeDetection({ angle: 0 });
    const detRotated = makeDetection({ angle: Math.PI / 4 });
    const corners0 = resolveCorners(det0);
    const cornersR = resolveCorners(detRotated);
    expect(corners0[0].x).not.toBeCloseTo(cornersR[0].x, 0);
  });

  it("respects padding parameter", () => {
    const det = makeDetection({ cx: 100, cy: 100, r: 50 });
    const tight = resolveCorners(det, 1.0);
    const padded = resolveCorners(det, 1.5);
    const tightSpan = Math.abs(tight[1].x - tight[0].x);
    const paddedSpan = Math.abs(padded[1].x - padded[0].x);
    expect(paddedSpan).toBeGreaterThan(tightSpan);
  });

  it("ignores incomplete corners array", () => {
    const det = makeDetection({ corners: [{ x: 0, y: 0 }] });
    const corners = resolveCorners(det);
    expect(corners).toHaveLength(4);
  });
});

describe("flipHorizontal", () => {
  it("returns a buffer of the same size", () => {
    const src = makeWhiteBuffer(100);
    const flipped = flipHorizontal(src);
    expect(flipped.width).toBe(100);
    expect(flipped.height).toBe(100);
  });

  it("flipping twice restores original pixel data", () => {
    const src = makeWhiteBuffer(50);
    fillRect(src, 0, 0, 25, 50, 0, 0, 0);

    const once = flipHorizontal(src);
    const twice = flipHorizontal(once);

    let matchCount = 0;
    for (let i = 0; i < src.data.length; i += 4) {
      if (src.data[i] === twice.data[i]) matchCount++;
    }
    expect(matchCount / (src.data.length / 4)).toBe(1);
  });

  it("mirrors left-right pixel content", () => {
    const src = makeWhiteBuffer(100);
    fillRect(src, 0, 0, 10, 100, 0, 0, 0);

    const flipped = flipHorizontal(src);
    const leftPixel = flipped.data[(50 * 100 + 5) * 4];
    const rightPixel = flipped.data[(50 * 100 + 95) * 4];

    expect(leftPixel).toBe(255);
    expect(rightPixel).toBe(0);
  });
});

describe("rectifyCode", () => {
  it("returns image, corners, and validation", () => {
    const buf = makeWhiteBuffer(320);
    const det = makeDetection({ cx: 160, cy: 160, r: 120 });
    const result = rectifyCode(buf, det, 5, 300);
    expect(result.image).toBeDefined();
    expect(result.image.width).toBe(300);
    expect(result.image.height).toBe(300);
    expect(result.corners).toHaveLength(4);
    expect(result.validation).toHaveProperty("valid");
    expect(result.validation).toHaveProperty("score");
  });

  it("uses model corners when provided", () => {
    const buf = makeWhiteBuffer(320);
    const modelCorners: Point[] = [
      { x: 10, y: 10 },
      { x: 310, y: 10 },
      { x: 310, y: 310 },
      { x: 10, y: 310 },
    ];
    const det = makeDetection({ corners: modelCorners });
    const result = rectifyCode(buf, det, 5, 300);
    expect(result.corners).toEqual(modelCorners);
  });

  it("flips when reflected flag is set", () => {
    const buf = makeWhiteBuffer(300);
    fillRect(buf, 0, 0, 50, 300, 0, 0, 0);

    const normal = rectifyCode(buf, makeDetection({ cx: 150, cy: 150, r: 120 }), 5, 300);
    const reflected = rectifyCode(buf, makeDetection({ cx: 150, cy: 150, r: 120, reflected: true }), 5, 300);

    const nLeft = normal.image.data[(150 * 300 + 10) * 4];
    const rLeft = reflected.image.data[(150 * 300 + 10) * 4];
    expect(nLeft).not.toBe(rLeft);
  });

  it("respects output size", () => {
    const buf = makeWhiteBuffer(320);
    const result = rectifyCode(buf, makeDetection(), 5, 200);
    expect(result.image.width).toBe(200);
    expect(result.image.height).toBe(200);
  });
});
