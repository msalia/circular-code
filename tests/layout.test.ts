import { describe, it, expect } from "vitest";
import {
  getRingRadius,
  getRingWidth,
  getSegmentAngle,
  getSegmentsForRing,
  getTotalSegments,
  getOrientationRingRadius,
  getOrientationArcs,
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

  describe("getRingWidth", () => {
    it("accounts for data rings, spacer ring, and orientation ring", () => {
      const width = getRingWidth(5, 300);
      expect(width).toBeCloseTo(300 / (2 * (5 + 3)), 5);
    });

    it("decreases as ring count increases", () => {
      expect(getRingWidth(3, 300)).toBeGreaterThan(getRingWidth(5, 300));
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
      let totalWithAll = 0;
      for (let r = 0; r < 5; r++) {
        totalWithAll += getSegmentsForRing(r, 5, 48);
        if (isDataRing(r)) manualTotal += getSegmentsForRing(r, 5, 48);
      }
      expect(total).toBe(manualTotal);
      expect(total).toBe(totalWithAll - ring0Segs);
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

  describe("getOrientationRingRadius", () => {
    it("is beyond the outermost data ring", () => {
      const outerDataRadius = getRingRadius(4, 5, 300);
      const orientationRadius = getOrientationRingRadius(5, 300);
      expect(orientationRadius).toBeGreaterThan(outerDataRadius);
    });

    it("equals (rings + 1) * ringWidth", () => {
      const ringWidth = getRingWidth(5, 300);
      expect(getOrientationRingRadius(5, 300)).toBeCloseTo((5 + 1) * ringWidth, 5);
    });

    it("fits within the SVG bounds", () => {
      const size = 300;
      const radius = getOrientationRingRadius(5, size);
      const strokeHalf = getRingWidth(5, size) * 0.5 / 2;
      expect(radius + strokeHalf).toBeLessThan(size / 2);
    });
  });

  describe("getOrientationArcs", () => {
    const arcs = getOrientationArcs();

    it("returns exactly 3 arcs", () => {
      expect(arcs).toHaveLength(3);
    });

    it("arcs are ordered long, medium, short", () => {
      const spans = arcs.map((a) => a.end - a.start);
      expect(spans[0]).toBeCloseTo(Math.PI, 5);
      expect(spans[1]).toBeCloseTo(Math.PI / 2, 5);
      expect(spans[2]).toBeCloseTo(Math.PI / 4, 5);
    });

    it("arcs do not overlap", () => {
      for (let i = 1; i < arcs.length; i++) {
        expect(arcs[i].start).toBeGreaterThan(arcs[i - 1].end);
      }
    });

    it("all arcs fit within a full circle", () => {
      const lastEnd = arcs[arcs.length - 1].end;
      expect(lastEnd).toBeLessThan(2 * Math.PI);
    });

    it("has uniform gap size between arcs", () => {
      const gap1 = arcs[1].start - arcs[0].end;
      const gap2 = arcs[2].start - arcs[1].end;
      expect(gap1).toBeCloseTo(gap2, 5);
      expect(gap1).toBeCloseTo(Math.PI / 18, 5);
    });

    it("pattern is asymmetric for unique orientation", () => {
      const spans = arcs.map((a) => a.end - a.start);
      expect(spans[0]).not.toBeCloseTo(spans[1], 3);
      expect(spans[1]).not.toBeCloseTo(spans[2], 3);
      expect(spans[0]).not.toBeCloseTo(spans[2], 3);
    });
  });
});
