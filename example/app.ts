import { encode } from "@/core/encoder";
import { decode } from "@/core/decoder";
import { getTotalSegments } from "@/core/layout";
import { renderSVG } from "@/render/svgRenderer";
import { renderCanvas } from "@/render/canvasRenderer";
import { getRingRadius, getSegmentsForRing, getSegmentAngle, isDataRing } from "@/core/layout";
import { loadModel, isModelLoaded } from "@/ml/detector";
import { scanFrame } from "@/scan";
import { bufferToCanvas, captureFrameToBuffer } from "@/utils/image";
import type { EncodedCode, ImageBuffer } from "@/types";

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

function drawPipelineStep(
  canvasId: string,
  buf: ImageBuffer,
  overlay?: (ctx: CanvasRenderingContext2D, size: number) => void,
) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const sz = 120;
  canvas.width = sz;
  canvas.height = sz;
  const ctx = canvas.getContext("2d")!;
  const srcCanvas = bufferToCanvas(buf);
  ctx.drawImage(srcCanvas, 0, 0, buf.width, buf.height, 0, 0, sz, sz);
  if (overlay) overlay(ctx, sz);
}

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

  const captured = captureFrameToBuffer(scanVideo, 320);
  const result = scanFrame(captured, { rings, segmentsPerRing, eccBytes });

  // --- Video overlay ---
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
  const det = result.detection;

  octx.strokeStyle = "#ffffff30";
  octx.lineWidth = 2;
  octx.strokeRect(guideX, guideY, side, side);

  octx.strokeStyle = det.confidence > 0.9 ? "#00ff00" : det.confidence > 0.5 ? "#ffff00" : "#ff0000";
  octx.lineWidth = 3;
  octx.beginPath();
  octx.arc(guideX + det.cx * scaleX, guideY + det.cy * scaleX, det.r * scaleX, 0, Math.PI * 2);
  octx.stroke();

  const v = result.validation;
  octx.fillStyle = det.confidence > 0.5 ? "#00ff00" : "#ff0000";
  octx.font = "12px monospace";
  const ang = det.angle != null ? ` ang:${((det.angle * 180) / Math.PI).toFixed(0)}` : "";
  const ori = result.orientation;
  const ref = ori.reflected ? " REFL" : "";
  octx.fillText(`${(det.confidence * 100).toFixed(0)}% r:${det.r.toFixed(0)}${ang} ori:${((ori.angle * 180) / Math.PI).toFixed(0)}${ref}`, 8, 20);
  octx.fillStyle = v.valid ? "#00ff0080" : "#ff000040";
  octx.fillText(`${v.valid ? "VALID" : "invalid"} (${v.score.toFixed(2)})`, 8, videoH - 8);

  // --- Pipeline debug canvases ---
  drawPipelineStep("dbg-capture", captured);

  drawPipelineStep("dbg-detect", captured, (ctx, sz) => {
    const s = sz / captured.width;
    ctx.strokeStyle = det.confidence > 0.5 ? "#00ff00" : "#ff0000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(det.cx * s, det.cy * s, det.r * s, 0, Math.PI * 2);
    ctx.stroke();
    if (result.corners.length === 4) {
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(result.corners[0].x * s, result.corners[0].y * s);
      for (let i = 1; i < 4; i++) ctx.lineTo(result.corners[i].x * s, result.corners[i].y * s);
      ctx.closePath();
      ctx.stroke();
    }
  });

  drawPipelineStep("dbg-warp", result.warped);

  const codeSize = result.rectified.width;
  drawPipelineStep("dbg-sample", result.rectified, (ctx, sz) => {
    const s = sz / codeSize;
    let bitIdx = 0;
    for (let r = 0; r < rings; r++) {
      if (!isDataRing(r)) continue;
      const segs = getSegmentsForRing(r, rings, segmentsPerRing);
      const radius = getRingRadius(r, rings, codeSize);
      for (let seg = 0; seg < segs; seg++) {
        const bit = result.bits[bitIdx++] ?? 0;
        const a = getSegmentAngle(seg, segs);
        ctx.fillStyle = bit ? "#00ff00" : "#ff000080";
        ctx.beginPath();
        ctx.arc((codeSize / 2 + radius * Math.cos(a)) * s, (codeSize / 2 + radius * Math.sin(a)) * s, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  const resultCanvas = document.getElementById("dbg-result") as HTMLCanvasElement;
  const rCtx = resultCanvas.getContext("2d")!;
  resultCanvas.width = 120;
  resultCanvas.height = 120;
  rCtx.fillStyle = "#111";
  rCtx.fillRect(0, 0, 120, 120);
  rCtx.font = "bold 12px monospace";
  rCtx.textAlign = "center";
  if (result.decoded) {
    rCtx.fillStyle = "#00ff00";
    rCtx.fillText("DECODED", 60, 40);
    rCtx.font = "10px monospace";
    rCtx.fillStyle = "#ccc";
    const text = result.decoded.length > 14 ? result.decoded.slice(0, 14) + "..." : result.decoded;
    rCtx.fillText(text, 60, 60);
  } else {
    rCtx.fillStyle = "#ff4444";
    rCtx.fillText("FAILED", 60, 40);
    rCtx.font = "9px monospace";
    rCtx.fillStyle = "#888";
    const err = (result.error || "").slice(0, 18);
    rCtx.fillText(err, 60, 60);
  }
  rCtx.font = "9px monospace";
  rCtx.fillStyle = "#666";
  rCtx.fillText(`dot:${v.centerDot ? "Y" : "n"} ring:${v.ringContrast ? "Y" : "n"} seg:${v.segmentPattern ? "Y" : "n"}`, 60, 80);
  rCtx.fillText(`orient: ${((ori.angle * 180) / Math.PI).toFixed(0)} ${ori.reflected ? "REFL" : ""}`, 60, 95);
  rCtx.fillText(`conf: ${(ori.confidence * 100).toFixed(0)}%`, 60, 110);

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
