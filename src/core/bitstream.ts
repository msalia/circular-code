export function bytesToBits(bytes: Iterable<number>): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

export function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
    let value = 0;
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      value = (value << 1) | (bits[byteIndex * 8 + bitIndex] ?? 0);
    }
    bytes[byteIndex] = value;
  }
  return bytes;
}
