import { captureFrame } from "../utils/image";
import { detectCircle } from "./detector";
import { normalizeFrame } from "./normalize";
import { samplePolarGrid } from "./sampler";
import { scoreFrame } from "./frameScorer";
import { warpPerspective, estimateCircleCorners } from "./perspective";
import { MultiFrameConsensus } from "./consensus";
import { decode } from "../core/decoder";
import type { ScanOptions, ScanResult, ConsensusResult } from "../types";

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
  } = options;

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
  const detection = detectCircle(normalized);

  if (detection.confidence < 0.2) return null;

  const frameScore = scoreFrame(
    normalized,
    detection.cx,
    detection.cy,
    detection.r,
  );

  if (frameScore.overall < minFrameScore) return null;

  let samplingCanvas = normalized;
  if (detection.corners && detection.corners.length === 4) {
    samplingCanvas = warpPerspective(normalized, detection.corners, 320);
  } else {
    const corners = estimateCircleCorners(
      detection.cx,
      detection.cy,
      detection.r,
    );
    samplingCanvas = warpPerspective(normalized, corners, 320);
  }

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
