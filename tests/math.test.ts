import { describe, it, expect } from "vitest";
import { clamp, degToRad, radToDeg, distance } from "@/utils/math";

describe("math utilities", () => {
  describe("clamp", () => {
    it("returns value when in range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it("clamps to min", () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it("clamps to max", () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("handles equal min and max", () => {
      expect(clamp(5, 3, 3)).toBe(3);
    });

    it("handles boundary values", () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe("degToRad", () => {
    it("converts 0 degrees", () => {
      expect(degToRad(0)).toBe(0);
    });

    it("converts 180 degrees to PI", () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
    });

    it("converts 360 degrees to 2*PI", () => {
      expect(degToRad(360)).toBeCloseTo(2 * Math.PI, 10);
    });

    it("converts 90 degrees to PI/2", () => {
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
    });

    it("handles negative degrees", () => {
      expect(degToRad(-90)).toBeCloseTo(-Math.PI / 2, 10);
    });
  });

  describe("radToDeg", () => {
    it("converts 0 radians", () => {
      expect(radToDeg(0)).toBe(0);
    });

    it("converts PI to 180", () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
    });

    it("roundtrip with degToRad", () => {
      expect(radToDeg(degToRad(45))).toBeCloseTo(45, 10);
    });
  });

  describe("distance", () => {
    it("returns 0 for same point", () => {
      expect(distance(5, 5, 5, 5)).toBe(0);
    });

    it("computes horizontal distance", () => {
      expect(distance(0, 0, 3, 0)).toBe(3);
    });

    it("computes vertical distance", () => {
      expect(distance(0, 0, 0, 4)).toBe(4);
    });

    it("computes 3-4-5 triangle", () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
    });

    it("is symmetric", () => {
      expect(distance(1, 2, 4, 6)).toBe(distance(4, 6, 1, 2));
    });
  });
});
