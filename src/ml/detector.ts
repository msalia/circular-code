import type { DetectionResult } from "@/types";

import * as tf from "@tensorflow/tfjs";

export const MODEL_INPUT_SIZE = 320;

let model: tf.GraphModel | tf.LayersModel | null = null;

export async function loadModel(modelPath = "/models/circular_code/model.json"): Promise<void> {
  if (typeof window === "undefined" && !modelPath.startsWith("http")) {
    const { loadModelFromDisk } = await import("@/ml/nodeLoader");
    model = await loadModelFromDisk(modelPath);
  } else {
    model = await loadModelFromSource(modelPath);
  }
}

export async function loadModelFromFiles(
  modelJSON: object,
  weightSpecs: tf.io.WeightsManifestEntry[],
  weightData: ArrayBuffer,
): Promise<void> {
  model = await loadModelFromSource(
    tf.io.fromMemory({ modelTopology: modelJSON, weightSpecs, weightData }),
  );
}

async function loadModelFromSource(
  source: string | tf.io.IOHandler,
): Promise<tf.GraphModel | tf.LayersModel> {
  try {
    return await tf.loadGraphModel(source as any);
  } catch {
    return await tf.loadLayersModel(source as any);
  }
}

export function isModelLoaded(): boolean {
  return model !== null;
}

export function getLoadedModel(): tf.GraphModel | tf.LayersModel | null {
  return model;
}

export function runModelPrediction(
  mdl: tf.GraphModel | tf.LayersModel,
  input: tf.Tensor,
): tf.Tensor {
  return mdl instanceof tf.GraphModel
    ? (mdl.predict(input) as tf.Tensor)
    : ((mdl as tf.LayersModel).predict(input) as tf.Tensor);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function parseDetections(
  outputData: Float32Array | Int32Array | Uint8Array,
  outputShape: number[],
  frameW: number,
  frameH: number,
  confThreshold = 0.5,
): DetectionResult | null {
  // YOLOv8-OBB output: [1, 6, N] where channels are [cx, cy, w, h, angle, class_logit]
  // Standard YOLOv8 output: [1, 5, N] where channels are [cx, cy, w, h, class_logit]
  // Class scores are raw logits — apply sigmoid to get probabilities.
  const channels = outputShape[1];
  const numCandidates = outputShape[2];
  const hasAngle = channels >= 6;
  const confChannel = hasAngle ? 5 : 4;

  let bestConf = confThreshold;
  let bestIdx = -1;

  for (let i = 0; i < numCandidates; i++) {
    const conf = sigmoid(outputData[confChannel * numCandidates + i]);
    if (conf > bestConf) {
      bestConf = conf;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;

  const cx = outputData[0 * numCandidates + bestIdx];
  const cy = outputData[1 * numCandidates + bestIdx];
  const w = outputData[2 * numCandidates + bestIdx];
  const h = outputData[3 * numCandidates + bestIdx];

  const scaleX = frameW / MODEL_INPUT_SIZE;
  const scaleY = frameH / MODEL_INPUT_SIZE;

  const result: DetectionResult = {
    cx: cx * scaleX,
    cy: cy * scaleY,
    r: Math.min(w * scaleX, h * scaleY) / 2,
    confidence: bestConf,
  };

  if (hasAngle) {
    result.angle = outputData[4 * numCandidates + bestIdx];
  }

  return result;
}

export function detectWithModel(canvas: HTMLCanvasElement): DetectionResult | null {
  if (!model) return null;

  let result: DetectionResult | null = null;

  tf.tidy(() => {
    const input = tf.browser
      .fromPixels(canvas)
      .resizeBilinear([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
      .toFloat()
      .div(255.0)
      .expandDims(0);

    const pred = runModelPrediction(model!, input);
    const data = pred.dataSync();
    const shape = pred.shape;
    result = parseDetections(data, shape as number[], canvas.width, canvas.height);
  });

  return result;
}
