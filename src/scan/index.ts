import { captureFrame } from "@/utils/image";
import { detectCircle } from "@/scan/detector";
import { normalizeFrame } from "@/scan/normalize";
import { samplePolarGrid } from "@/scan/sampler";
import { scoreFrame } from "@/scan/frameScorer";
import { warpPerspective, estimateCircleCorners } from "@/scan/perspective";
import { MultiFrameConsensus } from "@/scan/consensus";
import { loadModel, isModelLoaded, detectWithModel } from "@/ml/detector";
import { decode } from "@/core/decoder";
import type {
  DetectionResult,
  ScanOptions,
  ScanResult,
} from "@/types";

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

export function processFrame(
  video: HTMLVideoElement,
  options: {
    rings?: number;
    segmentsPerRing?: number;
    eccBytes?: number;
    minFrameScore?: number;
  } = {},
): ScanResult | null {
  const {
    rings = 5,
    segmentsPerRing = 48,
    eccBytes = 16,
    minFrameScore = 0.3,
  } = options;

  const raw = captureFrame(video);
  const normalized = normalizeFrame(raw);
  const detection = detect(normalized);

  if (detection.confidence < 0.2) return null;

  const frameScore = scoreFrame(
    normalized,
    detection.cx,
    detection.cy,
    detection.r,
  );

  if (frameScore.overall < minFrameScore) return null;

  const corners =
    detection.corners && detection.corners.length === 4
      ? detection.corners
      : estimateCircleCorners(detection.cx, detection.cy, detection.r);

  const samplingCanvas = warpPerspective(normalized, corners, 320);

  const bits = samplePolarGrid(
    samplingCanvas,
    samplingCanvas.width / 2,
    samplingCanvas.height / 2,
    samplingCanvas.width * 0.4,
    rings,
    segmentsPerRing,
  );

  const data = decode(bits, eccBytes);

  return {
    data,
    confidence: detection.confidence,
    frameScore,
  };
}
