import { encode } from "@/core/encoder";
import { decode } from "@/core/decoder";
import { getTotalSegments } from "@/core/layout";
import { renderSVG } from "@/render/svgRenderer";
import { renderCanvas } from "@/render/canvasRenderer";
import { getRingRadius, getSegmentsForRing, getSegmentAngle, isDataRing } from "@/core/layout";
import { loadModel, isModelLoaded } from "@/ml/detector";
import { scanFrame } from "@/scan";
import { bufferToCanvas } from "@/utils/image";
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

    const svg = renderSVG(code, { size, primary: "#000000", secondary: "#d0d0d0" });
    lastSvg = svg;

    codeOutput.innerHTML = svg;
    codeOutput.classList.remove("empty");
    downloadRow.style.display = "flex";

    const decoded = decode(code.bits, eccBytes);
    decodeResult.textContent = decoded;
    decodeResult.className = "decode-result " + (decoded === text ? "success" : "error");

    const totalBits = code.bits.length;
    const dataBits = totalBits - eccBytes * 8;
    const gridSlots = getTotalSegments(rings, segmentsPerRing);

    statsEl.innerHTML = [
      `<div class="stat">Bits: <span>${totalBits}</span></div>`,
      `<div class="stat">Data: <span>${dataBits}</span></div>`,
      `<div class="stat">ECC: <span>${eccBytes * 8}</span></div>`,
      `<div class="stat">Grid: <span>${gridSlots} slots</span></div>`,
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

// Scanner
const scanBtn = document.getElementById("scan-btn") as HTMLButtonElement;
const stopScanBtn = document.getElementById("stop-scan-btn") as HTMLButtonElement;
const scanVideo = document.getElementById("scan-video") as HTMLVideoElement;
const scanStatus = document.getElementById("scan-status") as HTMLDivElement;
const scanResultEl = document.getElementById("scan-result") as HTMLDivElement;

let stream: MediaStream | null = null;
let scanning = false;
let paused = false;
let frameCount = 0;
let decodeCount = 0;
const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement;

async function startScan() {
  if (stream) return;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 640, height: 480 },
    });
    scanVideo.srcObject = stream;
    await scanVideo.play();
    scanning = true;
    paused = false;
    frameCount = 0;
    decodeCount = 0;
    scanBtn.style.display = "none";
    stopScanBtn.style.display = "inline-block";
    resumeBtn.style.display = "none";
    scanStatus.className = "scan-status active";

    const modelStatus = document.getElementById("model-status") as HTMLDivElement;
    if (!isModelLoaded()) {
      scanStatus.textContent = "Loading ML model...";
      modelStatus.textContent = "Model: loading...";
      modelStatus.style.color = "#777";
      try {
        await loadModel("/models/circular_code/model.json");
        scanStatus.textContent = "Scanning...";
        modelStatus.textContent = "Model: loaded";
        modelStatus.style.color = "#6cbf6c";
      } catch (e: any) {
        scanStatus.textContent = "Scanning (Hough fallback)...";
        modelStatus.textContent = `Model: failed (${e.message})`;
        modelStatus.style.color = "#bf6c6c";
      }
    } else {
      scanStatus.textContent = "Scanning...";
      modelStatus.textContent = "Model: loaded";
      modelStatus.style.color = "#6cbf6c";
    }
    scanResultEl.textContent = "";
    scanResultEl.className = "decode-result";
    scanLoop();
  } catch (e: any) {
    scanStatus.textContent = `Camera error: ${e.message}`;
    scanStatus.className = "scan-status error";
  }
}

function resumeScan() {
  if (!stream || !paused) return;
  paused = false;
  scanVideo.play();
  resumeBtn.style.display = "none";
  scanResultEl.textContent = "";
  scanResultEl.className = "decode-result";
  scanStatus.textContent = "Scanning...";
  scanStatus.className = "scan-status active";
  scanLoop();
}

let lastScanTime = 0;
const SCAN_INTERVAL_MS = 200;

function scanLoop() {
  if (!scanning || paused) return;

  const now = performance.now();
  if (now - lastScanTime < SCAN_INTERVAL_MS) {
    requestAnimationFrame(scanLoop);
    return;
  }
  lastScanTime = now;
  frameCount++;

  const rings = parseInt(optRings.value);
  const segmentsPerRing = parseInt(optSegments.value);
  const eccBytes = parseInt(optEcc.value);

  const result = scanFrame(scanVideo, { rings, segmentsPerRing, eccBytes });

  // --- Debug overlay ---
  const overlay = document.getElementById("scan-overlay") as HTMLCanvasElement;
  const videoW = scanVideo.videoWidth || scanVideo.clientWidth;
  const videoH = scanVideo.videoHeight || scanVideo.clientHeight;
  if (overlay.width !== videoW) overlay.width = videoW;
  if (overlay.height !== videoH) overlay.height = videoH;
  const octx = overlay.getContext("2d")!;
  octx.clearRect(0, 0, overlay.width, overlay.height);

  const side = Math.min(videoW, videoH);
  const guideX = (videoW - side) / 2;
  const guideY = (videoH - side) / 2;
  const scaleX = side / 320;

  octx.strokeStyle = "#ffffff30";
  octx.lineWidth = 2;
  octx.strokeRect(guideX, guideY, side, side);

  const det = result.detection;
  octx.strokeStyle =
    det.confidence > 0.9 ? "#00ff00" : det.confidence > 0.5 ? "#ffff00" : "#ff0000";
  octx.lineWidth = 3;
  octx.beginPath();
  octx.arc(guideX + det.cx * scaleX, guideY + det.cy * scaleX, det.r * scaleX, 0, Math.PI * 2);
  octx.stroke();

  if (det.corners && det.corners.length === 4) {
    octx.strokeStyle = "#00ffff";
    octx.lineWidth = 2;
    octx.beginPath();
    octx.moveTo(guideX + det.corners[0].x * scaleX, guideY + det.corners[0].y * scaleX);
    for (let i = 1; i < 4; i++) {
      octx.lineTo(guideX + det.corners[i].x * scaleX, guideY + det.corners[i].y * scaleX);
    }
    octx.closePath();
    octx.stroke();
    for (const c of det.corners) {
      octx.fillStyle = "#00ffff";
      octx.beginPath();
      octx.arc(guideX + c.x * scaleX, guideY + c.y * scaleX, 4, 0, Math.PI * 2);
      octx.fill();
    }
  }

  octx.fillStyle = det.confidence > 0.5 ? "#00ff00" : "#ff0000";
  octx.font = "14px monospace";
  const ang = det.angle != null ? ` ang:${((det.angle * 180) / Math.PI).toFixed(0)}` : "";
  const ori =
    det.orientation != null ? ` ori:${((det.orientation * 180) / Math.PI).toFixed(0)}` : "";
  const ref = det.reflected ? " REFLECTED" : "";
  octx.fillText(
    `conf:${(det.confidence * 100).toFixed(0)}% r:${det.r.toFixed(0)} (${det.cx.toFixed(0)},${det.cy.toFixed(0)})${ang}${ori}${ref}`,
    8,
    20,
  );

  // Debug warp canvas
  const debugCanvas = document.getElementById("debug-warp") as HTMLCanvasElement;
  const codeSize = result.rectified.width;
  if (debugCanvas.width !== codeSize) debugCanvas.width = codeSize;
  if (debugCanvas.height !== codeSize) debugCanvas.height = codeSize;
  const debugCtx = debugCanvas.getContext("2d", { willReadFrequently: true })!;
  const rectifiedCanvas = bufferToCanvas(result.rectified);
  debugCtx.drawImage(rectifiedCanvas, 0, 0);

  let bitIdx = 0;
  for (let r = 0; r < rings; r++) {
    if (!isDataRing(r)) continue;
    const segs = getSegmentsForRing(r, rings, segmentsPerRing);
    const radius = getRingRadius(r, rings, codeSize);
    for (let s = 0; s < segs; s++) {
      const bit = result.bits[bitIdx++] ?? 0;
      const angle = getSegmentAngle(s, segs);
      debugCtx.fillStyle = bit ? "#00ff00" : "#ff000080";
      debugCtx.beginPath();
      debugCtx.arc(
        codeSize / 2 + radius * Math.cos(angle),
        codeSize / 2 + radius * Math.sin(angle),
        2,
        0,
        Math.PI * 2,
      );
      debugCtx.fill();
    }
  }

  const v = result.validation;
  octx.fillStyle = v.valid ? "#00ff0080" : "#ff000040";
  octx.font = "12px monospace";
  octx.fillText(
    `valid:${v.valid ? "YES" : "no"} (${v.score.toFixed(2)}) dot:${v.centerDot ? "Y" : "n"} ring:${v.ringContrast ? "Y" : "n"} seg:${v.segmentPattern ? "Y" : "n"}`,
    8,
    videoH - 8,
  );

  // --- Result handling ---
  if (result.decoded) {
    decodeCount++;
    scanResultEl.textContent = result.decoded;
    scanResultEl.className = "decode-result success";
    scanStatus.textContent = `Decoded: "${result.decoded}"`;
    scanStatus.className = "scan-status active";
    octx.fillStyle = "#00ff00";
    octx.font = "14px monospace";
    octx.fillText(`DECODED: ${result.decoded}`, 8, 40);

    paused = true;
    scanVideo.pause();
    resumeBtn.style.display = "inline-block";
    return;
  }

  const stage = result.detected ? "detected" : "center-crop";
  const detail = result.error ? ` | ${result.error.slice(0, 50)}` : "";
  octx.fillStyle = "#ffffff";
  octx.font = "14px monospace";
  octx.fillText(`f:${frameCount} | ${stage}${detail}`, 8, 40);
  scanStatus.textContent = `f:${frameCount} | ${stage}${detail}`;

  requestAnimationFrame(scanLoop);
}

function stopScan() {
  scanning = false;
  paused = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  scanVideo.srcObject = null;
  scanBtn.style.display = "inline-block";
  stopScanBtn.style.display = "none";
  resumeBtn.style.display = "none";
  if (decodeCount === 0) {
    scanStatus.textContent = `No codes detected in ${frameCount} frames`;
    scanStatus.className = "scan-status error";
  }
}

scanBtn.addEventListener("click", startScan);
stopScanBtn.addEventListener("click", stopScan);
resumeBtn.addEventListener("click", resumeScan);
(document.getElementById("toggle-ml") as HTMLInputElement).addEventListener("change", () => {});
