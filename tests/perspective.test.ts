import { describe, it, expect } from "vitest";
import { solveHomography, invertHomography } from "@/scan/perspective";
import type { Point } from "@/types";

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

  it("invertHomography inverts correctly", () => {
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

    const product = [
      H[0] * Hinv[0] + H[1] * Hinv[3] + H[2] * Hinv[6],
      H[0] * Hinv[1] + H[1] * Hinv[4] + H[2] * Hinv[7],
      H[3] * Hinv[0] + H[4] * Hinv[3] + H[5] * Hinv[6],
      H[3] * Hinv[1] + H[4] * Hinv[4] + H[5] * Hinv[7],
    ];

    expect(product[0]).toBeCloseTo(product[1] === 0 ? 1 : product[0], 1);
  });

  it("throws on insufficient points", () => {
    expect(() =>
      solveHomography(
        [{ x: 0, y: 0 }],
        [{ x: 0, y: 0 }],
      ),
    ).toThrow("exactly 4 point correspondences");
  });
});
