import { describe, it, expect } from "vitest";
import { interpretPrediction } from "@/ml/detector";

describe("interpretPrediction", () => {
  it("returns null for low confidence (negative logit)", () => {
    const values = [-2.0, 0.5, 0.5, 0.3, 0.3, 0, 1];
    expect(interpretPrediction(values, 640, 480)).toBeNull();
  });

  it("returns detection at exactly 0.5 confidence (logit = 0)", () => {
    const values = [0, 0.5, 0.5, 0.3, 0.3, 0, 1];
    const result = interpretPrediction(values, 640, 480);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
  });

  it("returns detection for high confidence", () => {
    const values = [3.0, 0.5, 0.5, 0.4, 0.4, 0, 1];
    const result = interpretPrediction(values, 640, 480);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it("scales cx/cy to frame dimensions", () => {
    const values = [5.0, 0.25, 0.75, 0.3, 0.3, 0, 1];
    const result = interpretPrediction(values, 640, 480)!;
    expect(result.cx).toBeCloseTo(160);
    expect(result.cy).toBeCloseTo(360);
  });

  it("computes radius from min of w*frameW and h*frameH", () => {
    const values = [5.0, 0.5, 0.5, 0.5, 0.3, 0, 1];
    const result = interpretPrediction(values, 640, 480)!;
    expect(result.r).toBeCloseTo(Math.min(0.5 * 640, 0.3 * 480) / 2);
  });

  it("computes angle from sin/cos via atan2", () => {
    const sinA = Math.sin(Math.PI / 4);
    const cosA = Math.cos(Math.PI / 4);
    const values = [5.0, 0.5, 0.5, 0.3, 0.3, sinA, cosA];
    const result = interpretPrediction(values, 640, 480)!;
    expect(result.angle).toBeCloseTo(Math.PI / 4, 5);
  });

  it("handles negative angles correctly", () => {
    const angle = -Math.PI / 3;
    const values = [5.0, 0.5, 0.5, 0.3, 0.3, Math.sin(angle), Math.cos(angle)];
    const result = interpretPrediction(values, 640, 480)!;
    expect(result.angle).toBeCloseTo(angle, 5);
  });

  it("confidence follows sigmoid of logit", () => {
    const logit = 2.0;
    const values = [logit, 0.5, 0.5, 0.3, 0.3, 0, 1];
    const result = interpretPrediction(values, 640, 480)!;
    const expected = 1 / (1 + Math.exp(-logit));
    expect(result.confidence).toBeCloseTo(expected, 10);
  });
});
