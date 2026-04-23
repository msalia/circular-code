import { describe, it, expect } from "vitest";
import { bytesToBits, bitsToBytes } from "../src/core/bitstream";

describe("bitstream", () => {
  it("bytesToBits converts correctly", () => {
    const bits = bytesToBits([0b10110011]);
    expect(bits).toEqual([1, 0, 1, 1, 0, 0, 1, 1]);
  });

  it("bitsToBytes converts correctly", () => {
    const bytes = bitsToBytes([1, 0, 1, 1, 0, 0, 1, 1]);
    expect(bytes[0]).toBe(0b10110011);
  });

  it("roundtrip preserves data", () => {
    const original = [0, 255, 128, 1, 42];
    const bits = bytesToBits(original);
    const bytes = bitsToBytes(bits);
    expect(Array.from(bytes)).toEqual(original);
  });

  it("handles zero byte", () => {
    const bits = bytesToBits([0]);
    expect(bits).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("handles 0xFF", () => {
    const bits = bytesToBits([255]);
    expect(bits).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("pads incomplete byte with zeros", () => {
    const bytes = bitsToBytes([1, 0, 1]);
    expect(bytes[0]).toBe(0b10100000);
  });
});
