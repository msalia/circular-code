import { encode } from "@/core/encoder";
import { decode } from "@/core/decoder";
import { getTotalSegments } from "@/core/layout";
import { renderSVG } from "@/render/svgRenderer";
import { renderCanvas } from "@/render/canvasRenderer";
import { loadModel, isModelLoaded, detectWithModel } from "@/ml/detector";
import { detectCircle } from "@/scan/detector";
import { warpPerspective } from "@/scan/perspective";
import { captureFrame } from "@/utils/image";
import { processFrame } from "@/scan/index";
import type { EncodedCode, Point } from "@/types";

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
    decodeResult.className =
      "decode-result " + (decoded === text ? "success" : "error");

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
const scanResult = document.getElementById("scan-result") as HTMLDivElement;

let stream: MediaStream | null = null;
let scanning = false;
let useMLModel = true;
let frameCount = 0;
let detectCount = 0;
let decodeCount = 0;

async function startScan() {
  if (stream) return;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 640, height: 480 },
    });
    scanVideo.srcObject = stream;
    await scanVideo.play();
    scanning = true;
    frameCount = 0;
    detectCount = 0;
    decodeCount = 0;
    scanBtn.style.display = "none";
    stopScanBtn.style.display = "inline-block";
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
    scanResult.textContent = "";
    scanResult.className = "decode-result";
    scanLoop();
  } catch (e: any) {
    scanStatus.textContent = `Camera error: ${e.message}`;
    scanStatus.className = "scan-status error";
  }
}

let lastScanTime = 0;
const SCAN_INTERVAL_MS = 200;

function scanLoop() {
  if (!scanning) return;

  const now = performance.now();
  if (now - lastScanTime < SCAN_INTERVAL_MS) {
    requestAnimationFrame(scanLoop);
    return;
  }
  lastScanTime = now;

  frameCount++;
  const overlay = document.getElementById("scan-overlay") as HTMLCanvasElement;
  const videoW = scanVideo.videoWidth || scanVideo.clientWidth;
  const videoH = scanVideo.videoHeight || scanVideo.clientHeight;
  if (overlay.width !== videoW) overlay.width = videoW;
  if (overlay.height !== videoH) overlay.height = videoH;
  const octx = overlay.getContext("2d")!;
  octx.clearRect(0, 0, overlay.width, overlay.height);

  const captureSize = 320;
  const captured = captureFrame(scanVideo, captureSize);
  const scaleX = videoW / captureSize;
  const scaleY = videoH / captureSize;

  const detection = (useMLModel && isModelLoaded())
    ? detectWithModel(captured) ?? detectCircle(captured)
    : detectCircle(captured);

  octx.strokeStyle = detection.confidence > 0.5 ? "#00ff00" : detection.confidence > 0.2 ? "#ffff00" : "#ff0000";
  octx.lineWidth = 3;
  octx.beginPath();
  octx.arc(detection.cx * scaleX, detection.cy * scaleY, detection.r * scaleX, 0, Math.PI * 2);
  octx.stroke();

  octx.fillStyle = octx.strokeStyle;
  octx.font = "14px monospace";
  octx.fillText(
    `conf: ${(detection.confidence * 100).toFixed(0)}% r: ${detection.r.toFixed(0)} (${detection.cx.toFixed(0)},${detection.cy.toFixed(0)})`,
    8, 20
  );

  // Show warp debug — use detection if confident, otherwise center-crop
  const debugCanvas = document.getElementById("debug-warp") as HTMLCanvasElement;
  const debugCtx = debugCanvas.getContext("2d", { willReadFrequently: true })!;
  const codeSize = 300;
  if (debugCanvas.width !== codeSize) debugCanvas.width = codeSize;
  if (debugCanvas.height !== codeSize) debugCanvas.height = codeSize;

  const useDet = detection.confidence >= 0.2;
  const warpCx = useDet ? detection.cx : captureSize / 2;
  const warpCy = useDet ? detection.cy : captureSize / 2;
  const warpR = useDet ? detection.r : captureSize * 0.35;
  const pad = warpR * 1.15;
  const srcCorners: Point[] = [
    { x: warpCx - pad, y: warpCy - pad },
    { x: warpCx + pad, y: warpCy - pad },
    { x: warpCx + pad, y: warpCy + pad },
    { x: warpCx - pad, y: warpCy + pad },
  ];
  const warped = warpPerspective(captured, srcCorners, codeSize);
  debugCtx.drawImage(warped, 0, 0);

  // Also draw center-crop circle on overlay
  if (!useDet) {
    octx.strokeStyle = "#0088ff";
    octx.lineWidth = 2;
    octx.setLineDash([6, 4]);
    octx.beginPath();
    octx.arc(videoW / 2, videoH / 2, warpR * scaleX, 0, Math.PI * 2);
    octx.stroke();
    octx.setLineDash([]);
  }

  const opts = {
    rings: parseInt(optRings.value),
    segmentsPerRing: parseInt(optSegments.value),
    eccBytes: parseInt(optEcc.value),
    minFrameScore: 0.01,
  };

  let stage = useDet ? "detected" : "center-crop";
  try {
    const result = processFrame(scanVideo, opts);
    if (result) {
      decodeCount++;
      stage = result.confidence > 0 ? "decoded (detected)" : "decoded (center)";
      scanResult.textContent = result.data;
      scanResult.className = "decode-result success";
      scanStatus.textContent = `Decoded on frame ${frameCount}`;
      scanStatus.className = "scan-status active";
      octx.fillStyle = "#00ff00";
      octx.fillText(`DECODED: ${result.data}`, 8, 40);
      stopScan();
      return;
    }
  } catch (e: any) {
    stage += ` | ${e.message.slice(0, 50)}`;
  }

  octx.fillStyle = "#ffffff";
  octx.fillText(`mode: ${useDet ? "detected" : "center-crop"}`, 8, 40);
  scanStatus.textContent = `f:${frameCount} | ${stage}`;

  requestAnimationFrame(scanLoop);
}

function stopScan() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  scanVideo.srcObject = null;
  scanBtn.style.display = "inline-block";
  stopScanBtn.style.display = "none";
  if (decodeCount === 0) {
    scanStatus.textContent = `No codes detected in ${frameCount} frames`;
    scanStatus.className = "scan-status error";
  }
}

scanBtn.addEventListener("click", startScan);
stopScanBtn.addEventListener("click", stopScan);
(document.getElementById("toggle-ml") as HTMLInputElement).addEventListener("change", (e) => {
  useMLModel = (e.target as HTMLInputElement).checked;
});
