"use strict";
(() => {
  // src/core/bitstream.ts
  function bytesToBits(bytes) {
    const bits = [];
    for (const byte of bytes) {
      for (let i = 7; i >= 0; i--) {
        bits.push(byte >> i & 1);
      }
    }
    return bits;
  }
  function bitsToBytes(bits) {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
      let value = 0;
      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        value = value << 1 | (bits[byteIndex * 8 + bitIndex] ?? 0);
      }
      bytes[byteIndex] = value;
    }
    return bytes;
  }

  // src/ecc/galoisField.ts
  var PRIM_POLY = 285;
  var EXP_TABLE = new Uint8Array(512);
  var LOG_TABLE = new Uint8Array(256);
  var x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 256) x ^= PRIM_POLY;
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
  }
  function gfDiv(a, b) {
    if (b === 0) throw new Error("Division by zero in GF(256)");
    if (a === 0) return 0;
    return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
  }
  function gfInverse(a) {
    if (a === 0) throw new Error("Zero has no inverse in GF(256)");
    return EXP_TABLE[255 - LOG_TABLE[a]];
  }
  function gfPolyMul(p, q) {
    const result = new Array(p.length + q.length - 1).fill(0);
    for (let i = 0; i < p.length; i++) {
      for (let j = 0; j < q.length; j++) {
        result[i + j] ^= gfMul(p[i], q[j]);
      }
    }
    return result;
  }
  function generatorPoly(nsym) {
    let g = [1];
    for (let i = 0; i < nsym; i++) {
      g = gfPolyMul(g, [1, EXP_TABLE[i]]);
    }
    return g;
  }

  // src/ecc/reedSolomon.ts
  function rsEncode(data, eccBytes = 16) {
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
  function rsDecode(received, eccBytes = 16) {
    const n = received.length;
    const msg = Array.from(received);
    const syndromes = [];
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
        `Found ${errorPositions.length} errors but expected ${numErrors}`
      );
    }
    const omega = computeOmega(syndromes, sigma, eccBytes);
    applyForney(msg, errorPositions, sigma, omega, n);
    return new Uint8Array(msg.slice(0, n - eccBytes));
  }
  function berlekampMassey(syndromes, nsym) {
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
  function evalPolyLE(poly, x2) {
    let result = 0;
    let xPow = 1;
    for (const coef of poly) {
      result ^= gfMul(coef, xPow);
      xPow = gfMul(xPow, x2);
    }
    return result;
  }
  function chienSearch(sigma, msgLen) {
    const numErrors = sigma.length - 1;
    const positions = [];
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
  function computeOmega(syndromes, sigma, nsym) {
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
  function applyForney(msg, errorPositions, sigma, omega, n) {
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

  // src/core/encoder.ts
  function encode(input, opts = {}) {
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
      segmentsPerRing
    };
  }

  // src/core/decoder.ts
  function decode(bits, eccBytes = 16) {
    const bytes = bitsToBytes(bits);
    const decoded = rsDecode(bytes, eccBytes);
    const length = decoded[1];
    const payload = decoded.slice(2, 2 + length);
    return new TextDecoder().decode(payload);
  }

  // src/core/layout.ts
  function getRingRadius(ring, rings, size) {
    const ringWidth = size / (2 * (rings + 2));
    return (ring + 1) * ringWidth;
  }
  function getSegmentAngle(segment, segmentsInRing) {
    return segment / segmentsInRing * Math.PI * 2;
  }
  function isDataRing(ring) {
    return ring > 0;
  }
  function getSegmentsForRing(ring, rings, baseSegments) {
    return Math.max(8, Math.round(baseSegments * (ring + 1) / rings));
  }

  // src/render/svgRenderer.ts
  var DEFAULT_SIZE = 300;
  var DEFAULT_PRIMARY = "#000000";
  var DEFAULT_SECONDARY = "#d0d0d0";
  var GAP_FRACTION = 0.3;
  var STROKE_WIDTH_RATIO = 0.5;
  var CENTER_RADIUS_RATIO = 0.7;
  var SECONDARY_SEPARATION = 1;
  function renderSVG(code, opts = {}) {
    const normalized = typeof opts === "number" ? { size: opts } : opts;
    const {
      size = DEFAULT_SIZE,
      primary = DEFAULT_PRIMARY,
      secondary = DEFAULT_SECONDARY
    } = normalized;
    const { bits, rings, segmentsPerRing } = code;
    const cx = size / 2;
    const cy = size / 2;
    const ringWidth = size / (2 * (rings + 2));
    const strokeWidth = ringWidth * STROKE_WIDTH_RATIO;
    let secondaryPaths = "";
    let primaryPaths = "";
    let bitIndex = 0;
    for (let r = 0; r < rings; r++) {
      const segs = getSegmentsForRing(r, rings, segmentsPerRing);
      const segAngle = 2 * Math.PI / segs;
      const radius = getRingRadius(r, rings, size);
      const ringBits = [];
      if (isDataRing(r)) {
        for (let i2 = 0; i2 < segs; i2++) {
          ringBits.push(bits[bitIndex++] ?? 0);
        }
      } else {
        for (let i2 = 0; i2 < segs; i2++) {
          ringBits.push(0);
        }
      }
      const primaryArcs = [];
      let i = 0;
      while (i < segs) {
        if (!ringBits[i]) {
          i++;
          continue;
        }
        let runEnd = i + 1;
        while (runEnd < segs && ringBits[runEnd]) runEnd++;
        primaryArcs.push({ startSeg: i, runLen: runEnd - i });
        i = runEnd;
      }
      for (const arc of primaryArcs) {
        const start = getSegmentAngle(arc.startSeg, segs);
        const end = start + segAngle * (arc.runLen - GAP_FRACTION);
        const sweep = end - start;
        if (sweep <= 0) continue;
        const largeArc = sweep > Math.PI ? 1 : 0;
        const x1 = cx + radius * Math.cos(start);
        const y1 = cy + radius * Math.sin(start);
        const x2 = cx + radius * Math.cos(end);
        const y2 = cy + radius * Math.sin(end);
        primaryPaths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"/>`;
      }
      if (primaryArcs.length === 0) {
        i = 0;
        while (i < segs) {
          let runEnd = i + 1;
          while (runEnd < segs) runEnd++;
          const start = getSegmentAngle(i, segs);
          const end = start + segAngle * (segs - GAP_FRACTION);
          const largeArc = end - start > Math.PI ? 1 : 0;
          const x1 = cx + radius * Math.cos(start);
          const y1 = cy + radius * Math.sin(start);
          const x2 = cx + radius * Math.cos(end);
          const y2 = cy + radius * Math.sin(end);
          secondaryPaths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"/>`;
          break;
        }
      } else {
        for (let j = 0; j < primaryArcs.length; j++) {
          const cur = primaryArcs[j];
          const next = primaryArcs[(j + 1) % primaryArcs.length];
          const gapStartSeg = cur.startSeg + cur.runLen + SECONDARY_SEPARATION;
          const gapEndSeg = j + 1 < primaryArcs.length ? next.startSeg - SECONDARY_SEPARATION : next.startSeg + segs - SECONDARY_SEPARATION;
          const gapLen = gapEndSeg - gapStartSeg;
          if (gapLen < 1) continue;
          const start = getSegmentAngle(gapStartSeg % segs, segs);
          const arcSpan = segAngle * (gapLen - GAP_FRACTION);
          if (arcSpan <= 0) continue;
          const end = start + arcSpan;
          const largeArc = arcSpan > Math.PI ? 1 : 0;
          const x1 = cx + radius * Math.cos(start);
          const y1 = cy + radius * Math.sin(start);
          const x2 = cx + radius * Math.cos(end);
          const y2 = cy + radius * Math.sin(end);
          secondaryPaths += `
        <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"
          stroke-width="${strokeWidth}"
          fill="none"
          stroke-linecap="round"/>`;
        }
      }
    }
    const centerRadius = ringWidth * CENTER_RADIUS_RATIO;
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <g stroke="${secondary}">${secondaryPaths}
      </g>
      <g stroke="${primary}">${primaryPaths}
      </g>
      <circle cx="${cx}" cy="${cy}" r="${centerRadius}" fill="${primary}" />
    </svg>
  `;
  }

  // src/render/canvasRenderer.ts
  function renderCanvas(code, size = 300) {
    const { bits, rings, segmentsPerRing } = code;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas rendering context is unavailable.");
    }
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = "black";
    ctx.lineCap = "round";
    ctx.lineWidth = size / (2 * (rings + 2)) * 0.5;
    let bitIndex = 0;
    const cx = size / 2;
    const cy = size / 2;
    for (let ring = 0; ring < rings; ring++) {
      const segs = getSegmentsForRing(ring, rings, segmentsPerRing);
      const radius = getRingRadius(ring, rings, size);
      for (let segment = 0; segment < segs; segment++) {
        const bit = isDataRing(ring) ? bits[bitIndex++] ?? 0 : 0;
        if (!bit) continue;
        const start = getSegmentAngle(segment, segs);
        const end = start + 2 * Math.PI / segs * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, end);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, size / (2 * (rings + 2)), 0, Math.PI * 2);
    ctx.fillStyle = "black";
    ctx.fill();
    return canvas;
  }

  // example/app.ts
  var lastCode = null;
  var lastSvg = "";
  var lastSize = 400;
  var textInput = document.getElementById("text-input");
  var generateBtn = document.getElementById("generate-btn");
  var codeOutput = document.getElementById("code-output");
  var decodeResult = document.getElementById("decode-result");
  var statsEl = document.getElementById("stats");
  var downloadRow = document.getElementById("download-row");
  var downloadSvgBtn = document.getElementById("download-svg");
  var downloadPngBtn = document.getElementById("download-png");
  var optRings = document.getElementById("opt-rings");
  var optSegments = document.getElementById("opt-segments");
  var optEcc = document.getElementById("opt-ecc");
  var optSize = document.getElementById("opt-size");
  function generate() {
    const text = textInput.value;
    if (!text) return;
    const rings = parseInt(optRings.value);
    const segmentsPerRing = parseInt(optSegments.value);
    const eccBytes = parseInt(optEcc.value);
    const size = parseInt(optSize.value) || 400;
    lastSize = size;
    try {
      const code = encode(text, { rings, segmentsPerRing, eccBytes });
      lastCode = code;
      const svg = renderSVG(code, size);
      lastSvg = svg;
      codeOutput.innerHTML = svg;
      codeOutput.classList.remove("empty");
      downloadRow.style.display = "flex";
      const decoded = decode(code.bits, eccBytes);
      decodeResult.textContent = decoded;
      decodeResult.className = "decode-result " + (decoded === text ? "success" : "error");
      const totalBits = code.bits.length;
      const dataBits = totalBits - eccBytes * 8;
      const usedBits = rings * segmentsPerRing;
      statsEl.innerHTML = [
        `<div class="stat">Bits: <span>${totalBits}</span></div>`,
        `<div class="stat">Data: <span>${dataBits}</span></div>`,
        `<div class="stat">ECC: <span>${eccBytes * 8}</span></div>`,
        `<div class="stat">Grid: <span>${rings}&times;${segmentsPerRing} = ${usedBits}</span></div>`,
        `<div class="stat">Match: <span>${decoded === text ? "Yes" : "No"}</span></div>`
      ].join("");
    } catch (e) {
      codeOutput.innerHTML = "";
      codeOutput.classList.add("empty");
      codeOutput.textContent = `Error: ${e.message}`;
      decodeResult.textContent = e.message;
      decodeResult.className = "decode-result error";
      statsEl.innerHTML = "";
      downloadRow.style.display = "none";
    }
  }
  function downloadSvg() {
    if (!lastSvg) return;
    const blob = new Blob([lastSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "circular-code.svg";
    a.click();
    URL.revokeObjectURL(url);
  }
  function downloadPng() {
    if (!lastCode) return;
    const canvas = renderCanvas(lastCode, lastSize);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "circular-code.png";
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  generateBtn.addEventListener("click", generate);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") generate();
  });
  downloadSvgBtn.addEventListener("click", downloadSvg);
  downloadPngBtn.addEventListener("click", downloadPng);
})();
//# sourceMappingURL=app.js.map
