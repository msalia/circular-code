import type { DetectionResult, ImageBuffer } from "@/types";

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
): tf.Tensor | tf.Tensor[] | { [key: string]: tf.Tensor } {
  return mdl instanceof tf.GraphModel
    ? (mdl.predict(input) as tf.Tensor)
    : ((mdl as tf.LayersModel).predict(input) as tf.Tensor | tf.Tensor[]);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function parseDetections(
  outputData: Float32Array | Int32Array | Uint8Array,
  outputShape: number[],
  frameW: number,
  frameH: number,
  confThreshold?: number,
): DetectionResult | null {
  const channels = outputShape[1];
  const numCandidates = outputShape[2];
  const hasAngle = channels >= 6;
  const confChannel = hasAngle ? 5 : 4;
  const threshold = confThreshold ?? 0.5;

  let bestConf = threshold;
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

export type MultiHeadOutput = {
  presence: Float32Array;
  geometry: Float32Array;
  corners: Float32Array;
  orientation: Float32Array;
  reflection: Float32Array;
};

function parseMultiHeadOutput(
  prediction: tf.Tensor | tf.Tensor[] | { [key: string]: tf.Tensor },
): MultiHeadOutput | null {
  if (prediction && typeof prediction === "object" && !Array.isArray(prediction) && !(prediction instanceof tf.Tensor)) {
    const dict = prediction as { [key: string]: tf.Tensor };
    if (dict["presence"] && dict["geometry"] && dict["corners"] && dict["orientation"] && dict["reflection"]) {
      return {
        presence: dict["presence"].dataSync() as Float32Array,
        geometry: dict["geometry"].dataSync() as Float32Array,
        corners: dict["corners"].dataSync() as Float32Array,
        orientation: dict["orientation"].dataSync() as Float32Array,
        reflection: dict["reflection"].dataSync() as Float32Array,
      };
    }
  }

  if (Array.isArray(prediction) && prediction.length === 5) {
    return {
      presence: prediction[0].dataSync() as Float32Array,
      geometry: prediction[1].dataSync() as Float32Array,
      corners: prediction[2].dataSync() as Float32Array,
      orientation: prediction[3].dataSync() as Float32Array,
      reflection: prediction[4].dataSync() as Float32Array,
    };
  }

  return null;
}

function multiHeadToDetection(
  output: MultiHeadOutput,
  frameW: number,
  frameH: number,
  confThreshold = 0.5,
): DetectionResult | null {
  const confidence = output.presence[0];
  if (confidence < confThreshold) return null;

  const cx = output.geometry[0] * frameW;
  const cy = output.geometry[1] * frameH;
  const r = output.geometry[2] * Math.max(frameW, frameH);

  const corners = [];
  for (let i = 0; i < 8; i += 2) {
    corners.push({
      x: output.corners[i] * frameW,
      y: output.corners[i + 1] * frameH,
    });
  }

  const sinO = output.orientation[0];
  const cosO = output.orientation[1];
  const orientation = Math.atan2(sinO, cosO);

  const reflected = output.reflection[0] > 0.5;

  return {
    cx, cy, r,
    corners,
    confidence,
    angle: orientation,
    orientation,
    reflected,
  };
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

export function detectWithModel(buf: ImageBuffer): DetectionResult | null {
  if (!model) return null;

  let result: DetectionResult | null = null;

  tf.tidy(() => {
    const resized = buf.width === MODEL_INPUT_SIZE && buf.height === MODEL_INPUT_SIZE
      ? bufferToTensor(buf)
      : bufferToTensor(buf).resizeBilinear([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

    const pred = runModelPrediction(model!, resized);

    const multiHead = parseMultiHeadOutput(pred);
    if (multiHead) {
      result = multiHeadToDetection(multiHead, buf.width, buf.height);
      return;
    }

    const singleTensor = pred as tf.Tensor;
    const data = singleTensor.dataSync();
    const shape = singleTensor.shape;
    result = parseDetections(data, shape as number[], buf.width, buf.height);
  });

  return result;
}
