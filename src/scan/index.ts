import type { DetectionResult, ScanOptions, ScanResult } from "@/types";

import { decode } from "@/core/decoder";
import { detectWithModel, isModelLoaded, loadModel } from "@/ml/detector";
import { MultiFrameConsensus } from "@/scan/consensus";
import { detectCircle } from "@/scan/detector";
import { scoreFrame } from "@/scan/frameScorer";
import { estimateCircleCorners, warpPerspective } from "@/scan/perspective";
import { getOrCreateCanvas } from "@/utils/canvas";
import { samplePolarGrid } from "@/scan/sampler";
import { validateCircularCode } from "@/scan/validator";
import { captureFrame } from "@/utils/image";

const CAPTURE_SIZE = 320;
const CODE_SIZE = 300;

export async function scanFromVideo(
  video: HTMLVideoElement,
  options: ScanOptions = {},
): Promise<string> {
  const {
    rings = 5,
    segmentsPerRing = 48,
    eccBytes = 16,
    minFrameScore = 0.3,
    consensusSize = 7,
    consensusRequired = 3,
    modelUrl,
  } = options;

  if (modelUrl && !isModelLoaded()) {
    await loadModel(modelUrl);
  }

  const consensus = new MultiFrameConsensus(consensusSize, consensusRequired);

  return new Promise((resolve, reject) => {
    let running = true;

    function loop() {
      if (!running) return;

      try {
        const result = processFrame(video, {
          rings,
          segmentsPerRing,
          eccBytes,
          minFrameScore,
        });

        if (result) {
          const consensusResult = consensus.push(result);
          if (consensusResult) {
            running = false;
            resolve(consensusResult.data);
            return;
          }
        }
      } catch {
        // frame processing failed, continue
      }

      requestAnimationFrame(loop);
    }

    loop();

    setTimeout(() => {
      if (running) {
        running = false;
        reject(new Error("Scan timed out"));
      }
    }, 30000);
  });
}

function detect(canvas: HTMLCanvasElement): DetectionResult {
  if (isModelLoaded()) {
    const mlResult = detectWithModel(canvas);
    if (mlResult) return mlResult;
  }
  return detectCircle(canvas);
}

function getCornersForWarp(detection: DetectionResult): { x: number; y: number }[] {
  if (detection.corners && detection.corners.length === 4) {
    return detection.corners;
  }
  return estimateCircleCorners(
    detection.cx,
    detection.cy,
    detection.r,
    1.15,
    detection.angle ?? 0,
  );
}

function flipHorizontal(src: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = getOrCreateCanvas(src.width, "flipH");
  canvas.height = src.height;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
}

function sampleAndDecode(
  canvas: HTMLCanvasElement,
  detection: DetectionResult,
  rings: number,
  segmentsPerRing: number,
  eccBytes: number,
): string {
  const srcCorners = getCornersForWarp(detection);
  let rectified = warpPerspective(canvas, srcCorners, CODE_SIZE);

  if (detection.reflected) {
    rectified = flipHorizontal(rectified);
  }

  const validation = validateCircularCode(rectified, rings, CODE_SIZE);
  if (!validation.valid) {
    throw new Error(`Not a circular code (score=${validation.score.toFixed(2)})`);
  }

  const bits = samplePolarGrid(
    rectified,
    CODE_SIZE / 2,
    CODE_SIZE / 2,
    CODE_SIZE,
    rings,
    segmentsPerRing,
  );

  return decode(bits, eccBytes);
}

export function processFrame(
  video: HTMLVideoElement,
  options: {
    rings?: number;
    segmentsPerRing?: number;
    eccBytes?: number;
    minFrameScore?: number;
  } = {},
): ScanResult | null {
  const { rings = 5, segmentsPerRing = 48, eccBytes = 16, minFrameScore = 0.3 } = options;

  const captured = captureFrame(video, CAPTURE_SIZE);

  const detection = detect(captured);

  if (detection.confidence >= 0.5) {
    const frameScore = scoreFrame(captured, detection.cx, detection.cy, detection.r);

    if (frameScore.overall >= minFrameScore) {
      try {
        const data = sampleAndDecode(captured, detection, rings, segmentsPerRing, eccBytes);
        return { data, confidence: detection.confidence, frameScore };
      } catch {
        // detection-based decode failed, fall through to center crop
      }
    }
  }

  // Fallback: assume code is centered in frame
  const cx = CAPTURE_SIZE / 2;
  const cy = CAPTURE_SIZE / 2;
  const r = CAPTURE_SIZE * 0.35;
  const fallback: DetectionResult = { cx, cy, r, confidence: 0 };

  const data = sampleAndDecode(captured, fallback, rings, segmentsPerRing, eccBytes);
  const frameScore = scoreFrame(captured, cx, cy, r);

  return {
    data,
    confidence: 0,
    frameScore,
  };
}
