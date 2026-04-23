import { encode } from "@/core/encoder";
import { decode } from "@/core/decoder";
import { renderSVG } from "@/render/svgRenderer";
import { renderCanvas } from "@/render/canvasRenderer";
import type { EncodedCode } from "@/types";

let lastCode: EncodedCode | null = null;
let lastSvg = "";
let lastSize = 400;

const textInput = document.getElementById("text-input") as HTMLInputElement;
const generateBtn = document.getElementById("generate-btn") as HTMLButtonElement;
const codeOutput = document.getElementById("code-output") as HTMLDivElement;
const decodeResult = document.getElementById("decode-result") as HTMLDivElement;
const statsEl = document.getElementById("stats") as HTMLDivElement;
const downloadRow = document.getElementById("download-row") as HTMLDivElement;
const downloadSvgBtn = document.getElementById("download-svg") as HTMLButtonElement;
const downloadPngBtn = document.getElementById("download-png") as HTMLButtonElement;
const optRings = document.getElementById("opt-rings") as HTMLSelectElement;
const optSegments = document.getElementById("opt-segments") as HTMLSelectElement;
const optEcc = document.getElementById("opt-ecc") as HTMLSelectElement;
const optSize = document.getElementById("opt-size") as HTMLInputElement;

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
    decodeResult.className =
      "decode-result " + (decoded === text ? "success" : "error");

    const totalBits = code.bits.length;
    const dataBits = totalBits - eccBytes * 8;
    const usedBits = rings * segmentsPerRing;

    statsEl.innerHTML = [
      `<div class="stat">Bits: <span>${totalBits}</span></div>`,
      `<div class="stat">Data: <span>${dataBits}</span></div>`,
      `<div class="stat">ECC: <span>${eccBytes * 8}</span></div>`,
      `<div class="stat">Grid: <span>${rings}&times;${segmentsPerRing} = ${usedBits}</span></div>`,
      `<div class="stat">Match: <span>${decoded === text ? "Yes" : "No"}</span></div>`,
    ].join("");
  } catch (e: any) {
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
