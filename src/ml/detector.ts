import type { DetectionResult } from "@/types";

import * as tf from "@tensorflow/tfjs";

const MODEL_INPUT_SIZE = 224;

let model: tf.LayersModel | null = null;

export async function loadModel(modelUrl = "/models/circular_code/model.json"): Promise<void> {
  model = await tf.loadLayersModel(modelUrl);
}

export async function loadModelFromFiles(
  modelJSON: object,
  weightSpecs: tf.io.WeightsManifestEntry[],
  weightData: ArrayBuffer,
): Promise<void> {
  model = await tf.loadLayersModel(
    tf.io.fromMemory({ modelTopology: modelJSON, weightSpecs, weightData }),
  );
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

  const tensor = tf.tidy(() => {
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = new Float32Array(canvas.width * canvas.height * 3);
    for (let i = 0; i < canvas.width * canvas.height; i++) {
      rgb[i * 3] = imageData.data[i * 4] / 255;
      rgb[i * 3 + 1] = imageData.data[i * 4 + 1] / 255;
      rgb[i * 3 + 2] = imageData.data[i * 4 + 2] / 255;
    }
    return tf
      .tensor3d(rgb, [canvas.height, canvas.width, 3])
      .resizeNearestNeighbor([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
      .expandDims(0);
  });

  try {
    const pred = model.predict(tensor) as tf.Tensor;
    const values = pred.dataSync();
    pred.dispose();
    tensor.dispose();

    return interpretPrediction(values, canvas.width, canvas.height);
  } catch {
    tensor.dispose();
    return null;
  }
}
