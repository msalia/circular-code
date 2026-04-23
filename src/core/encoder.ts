import { bytesToBits } from "./bitstream";
import { rsEncode } from "../ecc/reedSolomon";
import type { CircularCodeOptions, EncodedCode } from "../types";

export function encode(input: string, opts: CircularCodeOptions = {}): EncodedCode {
  const { rings = 5, segmentsPerRing = 48, eccBytes = 16 } = opts;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const header = new Uint8Array([1, data.length]);
  const payload = new Uint8Array([...header, ...data]);
  const encoded = rsEncode(payload, eccBytes);
  const bits = bytesToBits(encoded);

  return {
    bits,
    rings,
    segmentsPerRing,
  };
}
