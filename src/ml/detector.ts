import type { DetectionResult, ImageBuffer } from "@/types";

import * as tf from "@tensorflow/tfjs";

/** Input image size expected by the YOLO model. */
export const MODEL_INPUT_SIZE = 320;

let model: tf.GraphModel | tf.LayersModel | null = null;

/** Loads a TF.js model from a URL or file path. */
export async function loadModel(modelPath = "/models/circular_code/model.json"): Promise<void> {
  if (typeof window === "undefined" && !modelPath.startsWith("http")) {
    const { loadModelFromDisk } = await import("@/ml/nodeLoader");
    model = await loadModelFromDisk(modelPath);
  } else {
    model = await loadModelFromSource(modelPath);
  }
}

/** Loads a model from in-memory buffers. */
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

/** Returns true if a detection model has been loaded. */
export function isModelLoaded(): boolean {
  return model !== null;
}

/** Returns the loaded model instance, or null. */
export function getLoadedModel(): tf.GraphModel | tf.LayersModel | null {
  return model;
}

/** Runs a model prediction on a tensor input and returns the primary output tensor. */
export function runModelPrediction(
  mdl: tf.GraphModel | tf.LayersModel,
  input: tf.Tensor,
): tf.Tensor {
  const pred = mdl.predict(input);
  if (Array.isArray(pred)) return pred[0];
  if (pred instanceof tf.Tensor) return pred;
  const values = Object.values(pred as Record<string, tf.Tensor>);
  return values[0];
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Parses YOLO output tensor into the best detection above a confidence threshold. */
export function parseDetections(
  outputData: Float32Array | Int32Array | Uint8Array,
  outputShape: number[],
  frameW: number,
  frameH: number,
  confThreshold?: number,
): DetectionResult | null {
  const channels = outputShape[1];
  const numCandidates = outputShape[2];
  const threshold = confThreshold ?? 0.5;

  // Determine format by channel count:
  // Standard YOLO:     [1, 5, N] = cx, cy, w, h, class
  // YOLO-OBB:          [1, 6, N] = cx, cy, w, h, angle, class
  // YOLO-Pose (4 kps): [1, 17, N] = cx, cy, w, h, class, 4*(x,y,conf)
  // Pose channels = 5 + numKeypoints*3, where numKeypoints*3 is divisible by 3
  const extraChannels = channels - 5;
  const hasPose = extraChannels >= 3 && extraChannels % 3 === 0;
  const hasAngle = !hasPose && channels === 6;
  const confChannel = hasAngle ? 5 : 4;
  const numKeypoints = hasPose ? extraChannels / 3 : 0;

  let bestConf = threshold;
  let bestIdx = -1;

  for (let i = 0; i < numCandidates; i++) {
    const raw = outputData[confChannel * numCandidates + i];
    const conf = sigmoid(raw);
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

  if (hasPose && numKeypoints >= 4) {
    const corners = [];
    for (let kp = 0; kp < 4; kp++) {
      const xCh = 5 + kp * 3;
      const yCh = 6 + kp * 3;
      corners.push({
        x: outputData[xCh * numCandidates + bestIdx] * scaleX,
        y: outputData[yCh * numCandidates + bestIdx] * scaleY,
      });
    }
    result.corners = corners;
  }

  return result;
}

function bufferToTensor(buf: ImageBuffer): tf.Tensor4D {
  const { data, width, height } = buf;
  const floats = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const src = i * 4;
    const dst = i * 3;
    floats[dst] = data[src] / 255.0;
    floats[dst + 1] = data[src + 1] / 255.0;
    floats[dst + 2] = data[src + 2] / 255.0;
  }
  return tf.tensor4d(floats, [1, height, width, 3]);
}

/** Runs the loaded ML model on an ImageBuffer and returns a detection result. */
export function detectWithModel(buf: ImageBuffer): DetectionResult | null {
  if (!model) return null;

  let result: DetectionResult | null = null;

  tf.tidy(() => {
    const input =
      buf.width === MODEL_INPUT_SIZE && buf.height === MODEL_INPUT_SIZE
        ? bufferToTensor(buf)
        : bufferToTensor(buf).resizeBilinear([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

    const pred = runModelPrediction(model!, input);
    const data = pred.dataSync();
    const shape = pred.shape;
    result = parseDetections(data, shape as number[], buf.width, buf.height);
  });

  return result;
}
