import { bitsToBytes } from "@/core/bitstream";
import { rsDecode } from "@/ecc/reedSolomon";

/** Decodes a bit array back into a string using Reed-Solomon error correction. */
export function decode(bits: number[], eccBytes = 16): string {
  const bytes = bitsToBytes(bits);
  const decoded = rsDecode(bytes, eccBytes);

  if (decoded.length < 2) {
    throw new Error("Decoded data too short for header");
  }

  const version = decoded[0];
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }

  const length = decoded[1];
  if (2 + length > decoded.length) {
    throw new Error(`Invalid payload length: ${length}`);
  }

  const payload = decoded.slice(2, 2 + length);
  return new TextDecoder().decode(payload);
}
