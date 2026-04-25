import { describe, it, expect } from "vitest";
import { toGrayscale, createBuffer, flipBufferHorizontal, getPixelBrightness } from "@/utils/image";
import { makeWhiteBuffer, makeBlackBuffer, fillRect } from "./helpers";

describe("toGrayscale", () => {
  it("converts black pixels to 0", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    const gray = toGrayscale(data, 1);
    expect(gray[0]).toBe(0);
  });

  it("converts white pixels to ~255", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    const gray = toGrayscale(data, 1);
    expect(gray[0]).toBeGreaterThanOrEqual(254);
  });

  it("weights green higher than red and blue", () => {
    const pureRed = new Uint8ClampedArray([255, 0, 0, 255]);
    const pureGreen = new Uint8ClampedArray([0, 255, 0, 255]);
    const pureBlue = new Uint8ClampedArray([0, 0, 255, 255]);
    const grayR = toGrayscale(pureRed, 1)[0];
    const grayG = toGrayscale(pureGreen, 1)[0];
    const grayB = toGrayscale(pureBlue, 1)[0];
    expect(grayG).toBeGreaterThan(grayR);
    expect(grayR).toBeGreaterThan(grayB);
  });

  it("handles multiple pixels", () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      128, 128, 128, 255,
    ]);
    const gray = toGrayscale(data, 3);
    expect(gray).toHaveLength(3);
    expect(gray[0]).toBeGreaterThan(gray[1]);
    expect(gray[2]).toBeGreaterThan(gray[1]);
    expect(gray[2]).toBeLessThan(gray[0]);
  });

  it("ignores alpha channel", () => {
    const opaque = new Uint8ClampedArray([100, 100, 100, 255]);
    const transparent = new Uint8ClampedArray([100, 100, 100, 0]);
    expect(toGrayscale(opaque, 1)[0]).toBe(toGrayscale(transparent, 1)[0]);
  });

  it("returns Uint8Array", () => {
    const data = new Uint8ClampedArray([128, 128, 128, 255]);
    const gray = toGrayscale(data, 1);
    expect(gray).toBeInstanceOf(Uint8Array);
  });
});

describe("createBuffer", () => {
  it("creates buffer with correct dimensions", () => {
    const buf = createBuffer(100, 50);
    expect(buf.width).toBe(100);
    expect(buf.height).toBe(50);
    expect(buf.data.length).toBe(100 * 50 * 4);
  });

  it("initializes with transparent black", () => {
    const buf = createBuffer(10, 10);
    expect(buf.data[0]).toBe(0);
    expect(buf.data[3]).toBe(0);
  });
});

describe("flipBufferHorizontal", () => {
  it("preserves dimensions", () => {
    const buf = makeWhiteBuffer(50);
    const flipped = flipBufferHorizontal(buf);
    expect(flipped.width).toBe(50);
    expect(flipped.height).toBe(50);
  });

  it("flipping twice returns original data", () => {
    const buf = makeWhiteBuffer(50);
    fillRect(buf, 0, 0, 25, 50, 0, 0, 0);
    const twice = flipBufferHorizontal(flipBufferHorizontal(buf));
    expect(Array.from(twice.data)).toEqual(Array.from(buf.data));
  });

  it("swaps left and right", () => {
    const buf = makeWhiteBuffer(100);
    fillRect(buf, 0, 0, 10, 100, 0, 0, 0);
    const flipped = flipBufferHorizontal(buf);
    expect(flipped.data[(50 * 100 + 5) * 4]).toBe(255);
    expect(flipped.data[(50 * 100 + 95) * 4]).toBe(0);
  });

  it("does not modify the source buffer", () => {
    const buf = makeWhiteBuffer(50);
    const origData = new Uint8ClampedArray(buf.data);
    flipBufferHorizontal(buf);
    expect(Array.from(buf.data)).toEqual(Array.from(origData));
  });
});

describe("getPixelBrightness", () => {
  it("returns brightness for white pixel", () => {
    const buf = makeWhiteBuffer(10);
    expect(getPixelBrightness(buf, 5, 5)).toBe(255);
  });

  it("returns brightness for black pixel", () => {
    const buf = makeBlackBuffer(10);
    expect(getPixelBrightness(buf, 5, 5)).toBe(0);
  });

  it("returns 128 for out-of-bounds", () => {
    const buf = makeWhiteBuffer(10);
    expect(getPixelBrightness(buf, -1, 5)).toBe(128);
    expect(getPixelBrightness(buf, 5, -1)).toBe(128);
    expect(getPixelBrightness(buf, 10, 5)).toBe(128);
    expect(getPixelBrightness(buf, 5, 10)).toBe(128);
  });
});
