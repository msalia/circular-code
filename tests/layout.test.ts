import { describe, it, expect } from "vitest";
import {
  getRingRadius,
  getSegmentAngle,
  getSegmentsForRing,
  getTotalSegments,
  isDataRing,
} from "@/core/layout";

describe("layout", () => {
  describe("isDataRing", () => {
    it("ring 0 is not a data ring", () => {
      expect(isDataRing(0)).toBe(false);
    });

    it("rings 1+ are data rings", () => {
      expect(isDataRing(1)).toBe(true);
      expect(isDataRing(2)).toBe(true);
      expect(isDataRing(5)).toBe(true);
    });
  });

  describe("getSegmentsForRing", () => {
    it("outer ring gets full base segments", () => {
      expect(getSegmentsForRing(4, 5, 48)).toBe(48);
    });

    it("inner rings get fewer segments proportional to circumference", () => {
      const inner = getSegmentsForRing(0, 5, 48);
      const outer = getSegmentsForRing(4, 5, 48);
      expect(inner).toBeLessThan(outer);
    });

    it("enforces minimum of 8 segments", () => {
      expect(getSegmentsForRing(0, 10, 10)).toBeGreaterThanOrEqual(8);
    });

    it("segments scale with ring index", () => {
      const segs = Array.from({ length: 5 }, (_, r) => getSegmentsForRing(r, 5, 48));
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i]).toBeGreaterThanOrEqual(segs[i - 1]);
      }
    });
  });

  describe("getTotalSegments", () => {
    it("only counts data rings", () => {
      const total = getTotalSegments(5, 48);
      const ring0Segs = getSegmentsForRing(0, 5, 48);
      let manualTotal = 0;
      for (let r = 0; r < 5; r++) {
        if (isDataRing(r)) manualTotal += getSegmentsForRing(r, 5, 48);
      }
      expect(total).toBe(manualTotal);
      expect(total).not.toContain(ring0Segs);
    });

    it("returns fewer total segments than rings * baseSegments", () => {
      const total = getTotalSegments(5, 48);
      expect(total).toBeLessThan(5 * 48);
    });
  });

  describe("getRingRadius", () => {
    it("inner ring has smaller radius than outer ring", () => {
      const r0 = getRingRadius(0, 5, 300);
      const r4 = getRingRadius(4, 5, 300);
      expect(r0).toBeLessThan(r4);
    });

    it("radius scales linearly with ring index", () => {
      const r0 = getRingRadius(0, 5, 300);
      const r1 = getRingRadius(1, 5, 300);
      const r2 = getRingRadius(2, 5, 300);
      expect(r2 - r1).toBeCloseTo(r1 - r0, 5);
    });
  });

  describe("getSegmentAngle", () => {
    it("first segment starts at 0", () => {
      expect(getSegmentAngle(0, 48)).toBe(0);
    });

    it("halfway segment is at PI", () => {
      expect(getSegmentAngle(24, 48)).toBeCloseTo(Math.PI, 5);
    });

    it("full rotation is 2*PI", () => {
      expect(getSegmentAngle(48, 48)).toBeCloseTo(2 * Math.PI, 5);
    });
  });
});
