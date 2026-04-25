import type { DetectionResult, FrameScore, ImageBuffer, Point, ScanOptions, ScanResult } from "@/types";

import { decode } from "@/core/decoder";
import { detectWithModel, isModelLoaded, loadModel } from "@/ml/detector";
import { MultiFrameConsensus } from "@/scan/consensus";
import { detectCircle } from "@/scan/detector";
import { scoreFrame } from "@/scan/frameScorer";
import { estimateCircleCorners, warpPerspective } from "@/scan/perspective";
import { samplePolarGrid } from "@/scan/sampler";
import { validateCircularCode } from "@/scan/validator";
import type { ValidationResult } from "@/scan/validator";
import { canvasToBuffer, captureFrameToBuffer, flipBufferHorizontal } from "@/utils/image";

const CAPTURE_SIZE = 320;
const CODE_SIZE = 300;

export type ScanFrameOptions = {
  rings?: number;
  segmentsPerRing?: number;
  eccBytes?: number;
  captureSize?: number;
  codeSize?: number;
};

export type ScanFrameResult = {
  detected: boolean;
  decoded: string | null;
  error: string | null;
  detection: DetectionResult;
  corners: Point[];
  rectified: ImageBuffer;
  bits: number[];
  validation: ValidationResult;
  frameScore: FrameScore;
};

export function detectCode(buf: ImageBuffer): DetectionResult {
  if (isModelLoaded()) {
    const mlResult = detectWithModel(buf);
    if (mlResult) return mlResult;
  }
  return detectCircle(buf);
}

export function resolveCorners(detection: DetectionResult, padding = 1.15): Point[] {
  if (detection.corners && detection.corners.length === 4) {
    return detection.corners;
  }
  return estimateCircleCorners(
    detection.cx,
    detection.cy,
    detection.r,
    padding,
    detection.angle ?? 0,
  );
}

export function flipHorizontal(buf: ImageBuffer): ImageBuffer {
  return flipBufferHorizontal(buf);
}

export type RectifyResult = {
  image: ImageBuffer;
  corners: Point[];
  validation: ValidationResult;
};

export function rectifyCode(
  frame: ImageBuffer,
  detection: DetectionResult,
  rings: number,
  outputSize = CODE_SIZE,
): RectifyResult {
  const corners = resolveCorners(detection);
  let rectified = warpPerspective(frame, corners, outputSize);

  if (detection.reflected) {
    rectified = flipBufferHorizontal(rectified);
  }

  const validation = validateCircularCode(rectified, rings, outputSize);

  return { image: rectified, corners, validation };
}

export function scanFrame(
  source: HTMLVideoElement | HTMLCanvasElement | ImageBuffer,
  options: ScanFrameOptions = {},
): ScanFrameResult {
  const {
    rings = 5,
    segmentsPerRing = 48,
    eccBytes = 16,
    captureSize = CAPTURE_SIZE,
    codeSize = CODE_SIZE,
  } = options;

  let captured: ImageBuffer;
  if (source instanceof HTMLVideoElement) {
    captured = captureFrameToBuffer(source, captureSize);
  } else if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    captured = canvasToBuffer(source);
  } else {
    captured = source as ImageBuffer;
  }

  const detection = detectCode(captured);
  const detected = detection.confidence >= 0.5;

  const activeDetection: DetectionResult = detected
    ? detection
    : { cx: captured.width / 2, cy: captured.height / 2, r: captured.width * 0.35, confidence: 0 };

  const corners = resolveCorners(activeDetection);
  let rectified = warpPerspective(captured, corners, codeSize);

  if (activeDetection.reflected) {
    rectified = flipBufferHorizontal(rectified);
  }

  const validation = validateCircularCode(rectified, rings, codeSize);
  const frameScoreResult = scoreFrame(captured, activeDetection.cx, activeDetection.cy, activeDetection.r);

  const bits = samplePolarGrid(
    rectified,
    codeSize / 2,
    codeSize / 2,
    codeSize,
    rings,
    segmentsPerRing,
  );

  let decoded: string | null = null;
  let error: string | null = null;

  if (validation.valid) {
    try {
      decoded = decode(bits, eccBytes);
    } catch (e: any) {
      error = e.message;
    }
  } else {
    error = `Not a circular code (score=${validation.score.toFixed(2)})`;
  }

  return {
    detected,
    decoded,
    error,
    detection,
    corners,
    rectified,
    bits,
    validation,
    frameScore: frameScoreResult,
  };
}

export function sampleAndDecode(
  frame: ImageBuffer,
  detection: DetectionResult,
  rings: number,
  segmentsPerRing: number,
  eccBytes: number,
  outputSize = CODE_SIZE,
): string {
  const { image: rectified, validation } = rectifyCode(frame, detection, rings, outputSize);

  if (!validation.valid) {
    throw new Error(`Not a circular code (score=${validation.score.toFixed(2)})`);
  }

  const bits = samplePolarGrid(
    rectified,
    outputSize / 2,
    outputSize / 2,
    outputSize,
    rings,
    segmentsPerRing,
  );

  return decode(bits, eccBytes);
}

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
        const result = scanFrame(video, { rings, segmentsPerRing, eccBytes });

        if (result.decoded && result.frameScore.overall >= minFrameScore) {
          const scanResult: ScanResult = {
            data: result.decoded,
            confidence: result.detection.confidence,
            frameScore: result.frameScore,
          };
          const consensusResult = consensus.push(scanResult);
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

  const result = scanFrame(video, { rings, segmentsPerRing, eccBytes });

  if (result.decoded && result.frameScore.overall >= minFrameScore) {
    return {
      data: result.decoded,
      confidence: result.detection.confidence,
      frameScore: result.frameScore,
    };
  }

  return null;
}
