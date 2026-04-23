import { describe, it, expect } from "vitest";
import { encode } from "@/core/encoder";
import { decode } from "@/core/decoder";

describe("e2e", () => {
  it("encode and decode a URL", () => {
    const input = "https://example.com";
    const code = encode(input);
    const out = decode(code.bits);
    expect(out).toBe(input);
  });

  it("encode and decode multiple strings", () => {
    const inputs = [
      "hello",
      "circular-code-v1",
      "https://example.com/path?q=1",
      "12345678",
    ];

    for (const input of inputs) {
      const code = encode(input);
      const out = decode(code.bits);
      expect(out).toBe(input);
    }
  });
});
