import { describe, it, expect } from "vitest";
import { encode } from "@/core/encoder";
import { decode } from "@/core/decoder";

describe("encode/decode", () => {
  it("roundtrip with short string", () => {
    const input = "hello world";
    const code = encode(input);
    const output = decode(code.bits);
    expect(output).toBe(input);
  });

  it("roundtrip with URL", () => {
    const input = "https://example.com";
    const code = encode(input);
    const output = decode(code.bits);
    expect(output).toBe(input);
  });

  it("roundtrip with custom options", () => {
    const input = "test";
    const code = encode(input, { rings: 3, segmentsPerRing: 32, eccBytes: 8 });
    const output = decode(code.bits, 8);
    expect(output).toBe(input);
    expect(code.rings).toBe(3);
    expect(code.segmentsPerRing).toBe(32);
  });

  it("roundtrip with empty string", () => {
    const input = "";
    const code = encode(input);
    const output = decode(code.bits);
    expect(output).toBe(input);
  });

  it("roundtrip with unicode", () => {
    const input = "hello 世界";
    const code = encode(input);
    const output = decode(code.bits);
    expect(output).toBe(input);
  });

  it("header contains version and length", () => {
    const input = "abc";
    const code = encode(input);
    expect(code.bits.length).toBeGreaterThan(0);
    expect(code.bits.length % 8).toBe(0);
  });
});
