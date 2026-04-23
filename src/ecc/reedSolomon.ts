import {
  EXP_TABLE,
  gfMul,
  gfDiv,
  gfInverse,
  gfPolyMul,
  generatorPoly,
} from "./galoisField";

export function rsEncode(data: Uint8Array, eccBytes = 16): Uint8Array {
  const gen = generatorPoly(eccBytes);
  const output = new Uint8Array(data.length + eccBytes);
  output.set(data);

  const dividend = new Array(data.length + eccBytes).fill(0);
  for (let i = 0; i < data.length; i++) dividend[i] = data[i];

  for (let i = 0; i < data.length; i++) {
    const coef = dividend[i];
    if (coef === 0) continue;
    for (let j = 1; j < gen.length; j++) {
      dividend[i + j] ^= gfMul(gen[j], coef);
    }
  }

  for (let i = 0; i < eccBytes; i++) {
    output[data.length + i] = dividend[data.length + i];
  }

  return output;
}

export function rsDecode(received: Uint8Array, eccBytes = 16): Uint8Array {
  const n = received.length;
  const msg = Array.from(received);

  const syndromes: number[] = [];
  for (let i = 0; i < eccBytes; i++) {
    let val = 0;
    for (let j = 0; j < n; j++) {
      val = gfMul(val, EXP_TABLE[i]) ^ msg[j];
    }
    syndromes.push(val);
  }

  if (syndromes.every((s) => s === 0)) {
    return new Uint8Array(msg.slice(0, n - eccBytes));
  }

  const sigma = berlekampMassey(syndromes, eccBytes);
  const numErrors = sigma.length - 1;

  if (numErrors * 2 > eccBytes) {
    throw new Error("Too many errors to correct");
  }

  const errorPositions = chienSearch(sigma, n);

  if (errorPositions.length !== numErrors) {
    throw new Error(
      `Found ${errorPositions.length} errors but expected ${numErrors}`,
    );
  }

  const omega = computeOmega(syndromes, sigma, eccBytes);
  applyForney(msg, errorPositions, sigma, omega, n);

  return new Uint8Array(msg.slice(0, n - eccBytes));
}

function berlekampMassey(syndromes: number[], nsym: number): number[] {
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;

  for (let step = 0; step < nsym; step++) {
    let d = syndromes[step];
    for (let j = 1; j <= L; j++) {
      d ^= gfMul(C[j], syndromes[step - j]);
    }

    if (d === 0) {
      m++;
    } else if (2 * L <= step) {
      const T = [...C];
      const coef = gfDiv(d, b);
      while (C.length < B.length + m) C.push(0);
      for (let j = 0; j < B.length; j++) {
        C[j + m] ^= gfMul(coef, B[j]);
      }
      L = step + 1 - L;
      B = T;
      b = d;
      m = 1;
    } else {
      const coef = gfDiv(d, b);
      while (C.length < B.length + m) C.push(0);
      for (let j = 0; j < B.length; j++) {
        C[j + m] ^= gfMul(coef, B[j]);
      }
      m++;
    }
  }

  return C;
}

function evalPolyLE(poly: number[], x: number): number {
  let result = 0;
  let xPow = 1;
  for (const coef of poly) {
    result ^= gfMul(coef, xPow);
    xPow = gfMul(xPow, x);
  }
  return result;
}

function chienSearch(sigma: number[], msgLen: number): number[] {
  const numErrors = sigma.length - 1;
  const positions: number[] = [];

  for (let i = 0; i < 255; i++) {
    if (evalPolyLE(sigma, EXP_TABLE[i]) === 0) {
      const pos = (255 - i) % 255;
      if (pos < msgLen) {
        positions.push(pos);
      }
    }
  }

  return positions;
}

function computeOmega(
  syndromes: number[],
  sigma: number[],
  nsym: number,
): number[] {
  const omega = new Array(nsym).fill(0);
  for (let i = 0; i < nsym; i++) {
    for (let j = 0; j < sigma.length; j++) {
      if (i + j < nsym) {
        omega[i + j] ^= gfMul(syndromes[i], sigma[j]);
      }
    }
  }
  return omega;
}

function applyForney(
  msg: number[],
  errorPositions: number[],
  sigma: number[],
  omega: number[],
  n: number,
): void {
  for (const pos of errorPositions) {
    const X = EXP_TABLE[pos];
    const Xinv = gfInverse(X);

    const omegaVal = evalPolyLE(omega, Xinv);

    let sigmaPrime = 0;
    let xPow = 1;
    for (let j = 1; j < sigma.length; j += 2) {
      sigmaPrime ^= gfMul(sigma[j], xPow);
      xPow = gfMul(xPow, gfMul(Xinv, Xinv));
    }

    if (sigmaPrime === 0) {
      throw new Error("Cannot compute error magnitude");
    }

    const Y = gfMul(X, gfDiv(omegaVal, sigmaPrime));
    const arrayIdx = n - 1 - pos;
    if (arrayIdx >= 0 && arrayIdx < n) {
      msg[arrayIdx] ^= Y;
    }
  }
}
