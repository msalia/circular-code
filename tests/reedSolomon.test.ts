import { describe, it, expect } from "vitest";
import { rsEncode, rsDecode } from "../src/ecc/reedSolomon";

describe("Reed-Solomon", () => {
  it("encode adds ECC bytes", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = rsEncode(data, 4);
    expect(encoded.length).toBe(9);
    expect(encoded.slice(0, 5)).toEqual(data);
  });

  it("decode recovers original data without errors", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = rsEncode(data, 4);
    const decoded = rsDecode(encoded, 4);
    expect(decoded).toEqual(data);
  });

  it("corrects single-byte error", () => {
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const encoded = rsEncode(data, 8);
    const corrupted = new Uint8Array(encoded);
    corrupted[2] ^= 0xff;
    const decoded = rsDecode(corrupted, 8);
    expect(decoded).toEqual(data);
  });

  it("corrects two-byte errors", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encoded = rsEncode(data, 8);
    const corrupted = new Uint8Array(encoded);
    corrupted[0] ^= 0xab;
    corrupted[4] ^= 0x12;
    const decoded = rsDecode(corrupted, 8);
    expect(decoded).toEqual(data);
  });

  it("handles larger data", () => {
    const data = new Uint8Array(50);
    for (let i = 0; i < 50; i++) data[i] = i * 3;
    const encoded = rsEncode(data, 16);
    const decoded = rsDecode(encoded, 16);
    expect(decoded).toEqual(data);
  });

  it("corrects errors with 16 ECC bytes (up to 8 errors)", () => {
    const data = new Uint8Array([100, 200, 50, 75, 125]);
    const encoded = rsEncode(data, 16);
    const corrupted = new Uint8Array(encoded);
    corrupted[0] ^= 0x11;
    corrupted[1] ^= 0x22;
    corrupted[3] ^= 0x33;
    const decoded = rsDecode(corrupted, 16);
    expect(decoded).toEqual(data);
  });
});
