import { describe, it, expect } from "vitest";
import { solveHomography, invertHomography, warpPerspective } from "@/scan/perspective";
import type { Point } from "@/types";
import { makeWhiteBuffer, fillRect } from "./helpers";

describe("perspective", () => {
  it("identity homography for matching points", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const H = solveHomography(pts, pts);

    expect(H[0]).toBeCloseTo(1, 5);
    expect(H[4]).toBeCloseTo(1, 5);
    expect(H[8]).toBeCloseTo(1, 5);
    expect(H[1]).toBeCloseTo(0, 5);
    expect(H[3]).toBeCloseTo(0, 5);
  });

  it("scaling homography", () => {
    const src: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const H = solveHomography(src, dst);

    const w = H[6] * 25 + H[7] * 25 + H[8];
    const mappedX = (H[0] * 25 + H[1] * 25 + H[2]) / w;
    const mappedY = (H[3] * 25 + H[4] * 25 + H[5]) / w;

    expect(mappedX).toBeCloseTo(50, 3);
    expect(mappedY).toBeCloseTo(50, 3);
  });

  it("invertHomography produces identity when multiplied with original", () => {
    const src: Point[] = [
      { x: 10, y: 20 },
      { x: 90, y: 15 },
      { x: 95, y: 85 },
      { x: 5, y: 90 },
    ];
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    const H = solveHomography(src, dst);
    const Hinv = invertHomography(H);

    // H * Hinv should be proportional to identity
    const I = [
      H[0] * Hinv[0] + H[1] * Hinv[3] + H[2] * Hinv[6],
      H[0] * Hinv[1] + H[1] * Hinv[4] + H[2] * Hinv[7],
      H[0] * Hinv[2] + H[1] * Hinv[5] + H[2] * Hinv[8],
      H[3] * Hinv[0] + H[4] * Hinv[3] + H[5] * Hinv[6],
      H[3] * Hinv[1] + H[4] * Hinv[4] + H[5] * Hinv[7],
      H[3] * Hinv[2] + H[4] * Hinv[5] + H[5] * Hinv[8],
      H[6] * Hinv[0] + H[7] * Hinv[3] + H[8] * Hinv[6],
      H[6] * Hinv[1] + H[7] * Hinv[4] + H[8] * Hinv[7],
      H[6] * Hinv[2] + H[7] * Hinv[5] + H[8] * Hinv[8],
    ];
    const scale = I[0];
    expect(scale).not.toBeCloseTo(0);
    expect(I[0] / scale).toBeCloseTo(1, 3);
    expect(I[4] / scale).toBeCloseTo(1, 3);
    expect(I[8] / scale).toBeCloseTo(1, 3);
    expect(I[1] / scale).toBeCloseTo(0, 3);
    expect(I[3] / scale).toBeCloseTo(0, 3);
    expect(I[2] / scale).toBeCloseTo(0, 3);
    expect(I[6] / scale).toBeCloseTo(0, 3);
  });

  it("throws on insufficient points", () => {
    expect(() =>
      solveHomography(
        [{ x: 0, y: 0 }],
        [{ x: 0, y: 0 }],
      ),
    ).toThrow("exactly 4 point correspondences");
  });

  it("warpPerspective produces output of correct size", () => {
    const buf = makeWhiteBuffer(200);
    const corners: Point[] = [
      { x: 10, y: 10 },
      { x: 190, y: 10 },
      { x: 190, y: 190 },
      { x: 10, y: 190 },
    ];
    const result = warpPerspective(buf, corners, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.data.length).toBe(100 * 100 * 4);
  });

  it("warpPerspective copies pixel data from source region", () => {
    const buf = makeWhiteBuffer(200);
    fillRect(buf, 0, 0, 200, 200, 50, 50, 50);
    const corners: Point[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];
    const result = warpPerspective(buf, corners, 100);
    const centerPixel = result.data[(50 * 100 + 50) * 4];
    expect(centerPixel).toBeCloseTo(50, 0);
  });

  it("warpPerspective handles perspective distortion", () => {
    const buf = makeWhiteBuffer(300);
    fillRect(buf, 50, 50, 200, 200, 0, 0, 0);
    const corners: Point[] = [
      { x: 50, y: 50 },
      { x: 250, y: 70 },
      { x: 240, y: 240 },
      { x: 60, y: 250 },
    ];
    const result = warpPerspective(buf, corners, 100);
    const centerBrightness = (result.data[(50 * 100 + 50) * 4] + result.data[(50 * 100 + 50) * 4 + 1] + result.data[(50 * 100 + 50) * 4 + 2]) / 3;
    expect(centerBrightness).toBeLessThan(50);
  });
});
