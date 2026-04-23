import { bitsToBytes } from "@/core/bitstream";
import { rsDecode } from "@/ecc/reedSolomon";

export function decode(bits: number[], eccBytes = 16): string {
  const bytes = bitsToBytes(bits);
  const decoded = rsDecode(bytes, eccBytes);
  const length = decoded[1];
  const payload = decoded.slice(2, 2 + length);
  return new TextDecoder().decode(payload);
}
