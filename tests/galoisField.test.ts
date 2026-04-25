import { describe, it, expect } from "vitest";
import {
  gfMul,
  gfDiv,
  gfPow,
  gfInverse,
  gfPolyMul,
  gfPolyEval,
  gfPolyScale,
  gfPolyAdd,
  generatorPoly,
  EXP_TABLE,
  LOG_TABLE,
} from "@/ecc/galoisField";

describe("galoisField", () => {
  describe("tables", () => {
    it("EXP_TABLE[0] is 1 (alpha^0)", () => {
      expect(EXP_TABLE[0]).toBe(1);
    });

    it("LOG_TABLE[1] is 0", () => {
      expect(LOG_TABLE[1]).toBe(0);
    });

    it("EXP and LOG are inverses for non-zero values", () => {
      for (let i = 1; i < 256; i++) {
        expect(EXP_TABLE[LOG_TABLE[i]]).toBe(i);
      }
    });

    it("EXP wraps at index 255", () => {
      expect(EXP_TABLE[255]).toBe(EXP_TABLE[0]);
      expect(EXP_TABLE[300]).toBe(EXP_TABLE[45]);
    });
  });

  describe("gfMul", () => {
    it("multiplying by 0 gives 0", () => {
      expect(gfMul(0, 42)).toBe(0);
      expect(gfMul(42, 0)).toBe(0);
    });

    it("multiplying by 1 is identity", () => {
      expect(gfMul(1, 42)).toBe(42);
      expect(gfMul(42, 1)).toBe(42);
    });

    it("is commutative", () => {
      expect(gfMul(7, 13)).toBe(gfMul(13, 7));
    });

    it("result is within GF(256)", () => {
      for (let i = 1; i < 256; i += 17) {
        for (let j = 1; j < 256; j += 19) {
          const r = gfMul(i, j);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThan(256);
        }
      }
    });
  });

  describe("gfDiv", () => {
    it("division by 1 is identity", () => {
      expect(gfDiv(42, 1)).toBe(42);
    });

    it("a / a = 1 for non-zero a", () => {
      for (let a = 1; a < 256; a += 13) {
        expect(gfDiv(a, a)).toBe(1);
      }
    });

    it("is inverse of multiplication", () => {
      const a = 37;
      const b = 91;
      const product = gfMul(a, b);
      expect(gfDiv(product, b)).toBe(a);
    });

    it("throws on division by zero", () => {
      expect(() => gfDiv(42, 0)).toThrow("Division by zero");
    });

    it("0 / anything = 0", () => {
      expect(gfDiv(0, 42)).toBe(0);
    });
  });

  describe("gfPow", () => {
    it("a^0 = 1 for non-zero a", () => {
      expect(gfPow(5, 0)).toBe(1);
    });

    it("a^1 = a", () => {
      expect(gfPow(42, 1)).toBe(42);
    });

    it("0^n = 0 for n > 0", () => {
      expect(gfPow(0, 5)).toBe(0);
    });

    it("matches repeated multiplication", () => {
      const a = 7;
      expect(gfPow(a, 3)).toBe(gfMul(gfMul(a, a), a));
    });
  });

  describe("gfInverse", () => {
    it("a * inverse(a) = 1", () => {
      for (let a = 1; a < 256; a += 11) {
        expect(gfMul(a, gfInverse(a))).toBe(1);
      }
    });

    it("throws for zero", () => {
      expect(() => gfInverse(0)).toThrow("Zero has no inverse");
    });

    it("inverse(1) = 1", () => {
      expect(gfInverse(1)).toBe(1);
    });
  });

  describe("polynomial operations", () => {
    it("gfPolyMul multiplies polynomials", () => {
      const result = gfPolyMul([1], [1, 1]);
      expect(result).toEqual([1, 1]);
    });

    it("gfPolyMul identity: p * [1] = p", () => {
      const p = [3, 5, 7];
      expect(gfPolyMul(p, [1])).toEqual(p);
    });

    it("gfPolyEval evaluates at zero", () => {
      expect(gfPolyEval([3, 5, 7], 0)).toBe(7);
    });

    it("gfPolyEval evaluates at one", () => {
      const result = gfPolyEval([1, 1, 1], 1);
      expect(result).toBe(1 ^ 1 ^ 1);
    });

    it("gfPolyScale scales all coefficients", () => {
      expect(gfPolyScale([0, 1], 5)).toEqual([0, 5]);
    });

    it("gfPolyAdd XORs aligned coefficients", () => {
      const result = gfPolyAdd([1, 2], [3, 4]);
      expect(result).toEqual([1 ^ 3, 2 ^ 4]);
    });

    it("gfPolyAdd pads shorter polynomial", () => {
      const result = gfPolyAdd([1], [1, 2, 3]);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(1);
      expect(result[2]).toBe(1 ^ 3);
    });
  });

  describe("generatorPoly", () => {
    it("returns polynomial of correct degree", () => {
      const g = generatorPoly(4);
      expect(g).toHaveLength(5);
    });

    it("leading coefficient is 1", () => {
      expect(generatorPoly(8)[0]).toBe(1);
    });

    it("roots are consecutive powers of alpha", () => {
      const nsym = 4;
      const g = generatorPoly(nsym);
      for (let i = 0; i < nsym; i++) {
        expect(gfPolyEval(g, EXP_TABLE[i])).toBe(0);
      }
    });
  });
});
