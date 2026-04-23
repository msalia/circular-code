import * as tf from "@tensorflow/tfjs";
import type { DetectionResult } from "../types";

let model: tf.GraphModel | null = null;

export async function loadModel(modelUrl = "/models/circular_code/model.json") {
  model = await tf.loadGraphModel(modelUrl);
}

export async function detectCode(
  video: HTMLVideoElement,
): Promise<DetectionResult | null> {
  if (!model) return null;

  const tensor = tf.browser
    .fromPixels(video)
    .resizeNearestNeighbor([320, 320])
    .expandDims(0)
    .toFloat()
    .div(255);

  try {
    const pred = (await model.executeAsync(tensor)) as tf.Tensor;
    const output = (await pred.array()) as number[][];
    const [x, y, w, h, conf] = output[0];

    pred.dispose();
    tensor.dispose();

    if (conf < 0.6) return null;

    const frameW = video.videoWidth || video.clientWidth;
    const frameH = video.videoHeight || video.clientHeight;

    return {
      cx: x * frameW,
      cy: y * frameH,
      r: Math.min(w * frameW, h * frameH) / 2,
      confidence: conf,
    };
  } catch {
    tensor.dispose();
    return null;
  }
}

export function isModelLoaded(): boolean {
  return model !== null;
}
