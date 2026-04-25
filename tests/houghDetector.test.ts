import { describe, it, expect } from "vitest";
import { detectCircle } from "@/scan/detector";
import { makeWhiteBuffer, strokeCircle, fillCircle } from "./helpers";

describe("detectCircle (Hough)", () => {
  it("returns a DetectionResult with required fields", () => {
    const buf = makeWhiteBuffer(320);
    const result = detectCircle(buf);
    expect(result).toHaveProperty("cx");
    expect(result).toHaveProperty("cy");
    expect(result).toHaveProperty("r");
    expect(result).toHaveProperty("confidence");
    expect(typeof result.cx).toBe("number");
    expect(typeof result.confidence).toBe("number");
  });

  it("returns low confidence for blank buffer", () => {
    const buf = makeWhiteBuffer(320);
    const result = detectCircle(buf);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("detects a drawn circle near the correct position and radius", () => {
    const buf = makeWhiteBuffer(320);
    strokeCircle(buf, 160, 160, 80, 0, 0, 0, 4);
    const result = detectCircle(buf);
    expect(result.r).toBeGreaterThan(50);
    expect(result.r).toBeLessThan(120);
    expect(Math.abs(result.cx - 160)).toBeLessThan(40);
    expect(Math.abs(result.cy - 160)).toBeLessThan(40);
  });

  it("detects concentric circles with higher confidence than blank", () => {
    const blank = makeWhiteBuffer(320);
    const blankResult = detectCircle(blank);

    const buf = makeWhiteBuffer(320);
    for (let r = 30; r <= 120; r += 20) {
      strokeCircle(buf, 160, 160, r, 0, 0, 0, 3);
    }
    fillCircle(buf, 160, 160, 10, 0, 0, 0);
    const result = detectCircle(buf);
    expect(result.confidence).toBeGreaterThan(blankResult.confidence);
    expect(result.r).toBeGreaterThan(20);
  });

  it("radius is within Hough search bounds", () => {
    const buf = makeWhiteBuffer(320);
    strokeCircle(buf, 160, 160, 100, 0, 0, 0, 3);
    const result = detectCircle(buf);
    expect(result.r).toBeGreaterThanOrEqual(320 * 0.1);
    expect(result.r).toBeLessThanOrEqual(320 * 0.45);
  });

  it("cx and cy are within frame bounds", () => {
    const buf = makeWhiteBuffer(320);
    strokeCircle(buf, 160, 160, 80, 0, 0, 0, 3);
    const result = detectCircle(buf);
    expect(result.cx).toBeGreaterThanOrEqual(0);
    expect(result.cx).toBeLessThanOrEqual(320);
    expect(result.cy).toBeGreaterThanOrEqual(0);
    expect(result.cy).toBeLessThanOrEqual(320);
  });

  it("off-center circle shifts the detected center", () => {
    const buf = makeWhiteBuffer(320);
    strokeCircle(buf, 220, 220, 60, 0, 0, 0, 4);
    const result = detectCircle(buf);
    expect(result.cx).toBeGreaterThan(160);
    expect(result.cy).toBeGreaterThan(160);
  });
});
