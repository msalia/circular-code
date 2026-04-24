import type { DetectionResult } from "@/types";

import * as tf from "@tensorflow/tfjs";

const MODEL_INPUT_SIZE = 224;

let model: tf.GraphModel | tf.LayersModel | null = null;

export async function loadModel(modelUrl = "/models/circular_code/model.json"): Promise<void> {
  try {
    model = await tf.loadGraphModel(modelUrl);
  } catch {
    model = await tf.loadLayersModel(modelUrl);
  }
}

export async function loadModelFromFiles(
  modelJSON: object,
  weightSpecs: tf.io.WeightsManifestEntry[],
  weightData: ArrayBuffer,
): Promise<void> {
  try {
    model = await tf.loadGraphModel(
      tf.io.fromMemory(modelJSON, weightSpecs, weightData),
    );
  } catch {
    model = await tf.loadLayersModel(
      tf.io.fromMemory({ modelTopology: modelJSON, weightSpecs, weightData }),
    );
  }
}

export function isModelLoaded(): boolean {
  return model !== null;
}

export function interpretPrediction(
  values: ArrayLike<number>,
  frameW: number,
  frameH: number,
): DetectionResult | null {
  const classLogit = values[0];
  const confidence = 1 / (1 + Math.exp(-classLogit));

  if (confidence < 0.5) return null;

  const cx = values[1];
  const cy = values[2];
  const w = values[3];
  const h = values[4];
  const sinA = values[5];
  const cosA = values[6];

  return {
    cx: cx * frameW,
    cy: cy * frameH,
    r: Math.min(w * frameW, h * frameH) / 2,
    confidence,
    angle: Math.atan2(sinA, cosA),
  };
}

export function detectWithModel(canvas: HTMLCanvasElement): DetectionResult | null {
  if (!model) return null;

  let result: DetectionResult | null = null;

  tf.tidy(() => {
    const input = tf.browser
      .fromPixels(canvas)
      .resizeBilinear([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
      .toFloat()
      .div(127.5)
      .sub(1)
      .expandDims(0);

    const pred = model instanceof tf.GraphModel
      ? model.predict(input) as tf.Tensor
      : (model as tf.LayersModel).predict(input) as tf.Tensor;
    const values = pred.dataSync();
    result = interpretPrediction(values, canvas.width, canvas.height);
  });

  return result;
}
