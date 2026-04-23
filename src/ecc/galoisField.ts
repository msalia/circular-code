const GF_SIZE = 256;
const PRIM_POLY = 0x11d;

export const EXP_TABLE = new Uint8Array(512);
export const LOG_TABLE = new Uint8Array(256);

let x = 1;
for (let i = 0; i < 255; i++) {
  EXP_TABLE[i] = x;
  LOG_TABLE[x] = i;
  x <<= 1;
  if (x & 256) x ^= PRIM_POLY;
}
for (let i = 255; i < 512; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 255];
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero in GF(256)");
  if (a === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
}

export function gfPow(a: number, n: number): number {
  if (a === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] * n) % 255];
}

export function gfInverse(a: number): number {
  if (a === 0) throw new Error("Zero has no inverse in GF(256)");
  return EXP_TABLE[255 - LOG_TABLE[a]];
}

export function gfPolyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

export function gfPolyEval(poly: number[], x: number): number {
  let result = poly[0];
  for (let i = 1; i < poly.length; i++) {
    result = gfMul(result, x) ^ poly[i];
  }
  return result;
}

export function gfPolyScale(poly: number[], scalar: number): number[] {
  return poly.map((c) => gfMul(c, scalar));
}

export function gfPolyAdd(p: number[], q: number[]): number[] {
  const result = new Array(Math.max(p.length, q.length)).fill(0);
  const pOff = result.length - p.length;
  const qOff = result.length - q.length;
  for (let i = 0; i < p.length; i++) result[pOff + i] ^= p[i];
  for (let i = 0; i < q.length; i++) result[qOff + i] ^= q[i];
  return result;
}

export function generatorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    g = gfPolyMul(g, [1, EXP_TABLE[i]]);
  }
  return g;
}
