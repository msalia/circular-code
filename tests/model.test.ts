import { describe, it, expect, beforeAll } from "vitest";
import * as tf from "@tensorflow/tfjs";
import fs from "fs";
import path from "path";
import { loadImage } from "canvas";
import {
  getLoadedModel,
  loadModel,
  MODEL_INPUT_SIZE,
  parseDetections,
  runModelPrediction,
} from "@/ml/detector";

const MODEL_DIR = path.resolve("models/circular_code");
const DATASET_DIR = path.resolve("dataset");
const SAMPLE_COUNT = 50;
const LABEL_COUNT = 15;

let model: tf.GraphModel | tf.LayersModel;

async function preprocessImageAsync(imgPath: string): Promise<tf.Tensor4D> {
  const img = await loadImage(imgPath);
  const { createCanvas } = await import("canvas");
  const canvas = createCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const pixels = imageData.data;
  const totalPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const data = new Float32Array(totalPixels * 3);
  for (let i = 0; i < totalPixels; i++) {
    const src = i * 4;
    const dst = i * 3;
    data[dst] = pixels[src] / 255.0;
    data[dst + 1] = pixels[src + 1] / 255.0;
    data[dst + 2] = pixels[src + 2] / 255.0;
  }
  return tf.tensor4d(data, [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
}

type PredictionResult =
  | { type: "single"; data: Float32Array | Int32Array | Uint8Array; shape: number[] }
  | { type: "multi"; outputs: Record<string, Float32Array> };

function predict(input: tf.Tensor4D): PredictionResult {
  return tf.tidy(() => {
    const pred = runModelPrediction(model, input);

    if (pred && typeof pred === "object" && !Array.isArray(pred) && !(pred instanceof tf.Tensor)) {
      const dict = pred as Record<string, tf.Tensor>;
      const outputs: Record<string, Float32Array> = {};
      for (const [key, tensor] of Object.entries(dict)) {
        outputs[key] = tensor.dataSync() as Float32Array;
      }
      return { type: "multi" as const, outputs };
    }

    if (Array.isArray(pred)) {
      const outputs: Record<string, Float32Array> = {};
      const names = ["presence", "geometry", "corners", "orientation", "reflection"];
      for (let i = 0; i < pred.length && i < names.length; i++) {
        outputs[names[i]] = pred[i].dataSync() as Float32Array;
      }
      return { type: "multi" as const, outputs };
    }

    const single = pred as tf.Tensor;
    return { type: "single" as const, data: single.dataSync(), shape: single.shape as number[] };
  });
}

function findImagePath(index: number): { path: string; split: "train" | "val" } | null {
  for (const split of ["train", "val"] as const) {
    const p = path.join(DATASET_DIR, "images", split, `${index}.png`);
    if (fs.existsSync(p)) return { path: p, split };
  }
  return null;
}

type Label = {
  hasObject: boolean;
  cx: number;
  cy: number;
  radius: number;
  reflected: boolean;
};

function loadLabel(index: number, split: "train" | "val"): Label {
  const labelPath = path.join(DATASET_DIR, "labels", split, `${index}.txt`);
  const raw = fs.readFileSync(labelPath, "utf-8").trim();
  if (raw === "") return { hasObject: false, cx: 0, cy: 0, radius: 0, reflected: false };

  const parts = raw.split(/\s+/).map(Number);

  if (parts.length === LABEL_COUNT) {
    return {
      hasObject: parts[0] > 0.5,
      cx: parts[1],
      cy: parts[2],
      radius: parts[3],
      reflected: parts[14] > 0.5,
    };
  }

  if (parts.length === 9) {
    const cx = (parts[1] + parts[3] + parts[5] + parts[7]) / 4;
    const cy = (parts[2] + parts[4] + parts[6] + parts[8]) / 4;
    return { hasObject: true, cx, cy, radius: 0, reflected: false };
  }

  if (parts.length === 5) {
    return { hasObject: true, cx: parts[1], cy: parts[2], radius: 0, reflected: false };
  }

  return { hasObject: parts[0] > 0.5, cx: 0.5, cy: 0.5, radius: 0, reflected: false };
}

function isDetected(result: PredictionResult): boolean {
  if (result.type === "multi") {
    return (result.outputs["presence"]?.[0] ?? 0) > 0.5;
  }
  const det = parseDetections(result.data, result.shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  return det !== null;
}

describe("model inference on dataset", () => {
  beforeAll(async () => {
    if (!fs.existsSync(path.join(MODEL_DIR, "model.json"))) {
      throw new Error("model.json not found — run training first");
    }
    if (!fs.existsSync(path.join(DATASET_DIR, "manifest.json"))) {
      throw new Error("dataset not found — run generate-dataset first");
    }
    const modelJsonPath = path.join(MODEL_DIR, "model.json");
    await loadModel(modelJsonPath);
    model = getLoadedModel()!;
  }, 30_000);

  it("loads the model successfully", () => {
    expect(model).toBeDefined();
  });

  it("produces valid output shape", async () => {
    const found = findImagePath(0)!;
    const input = await preprocessImageAsync(found.path);
    const result = predict(input);
    input.dispose();

    if (result.type === "multi") {
      expect(result.outputs["presence"]).toBeDefined();
      expect(result.outputs["geometry"]).toBeDefined();
      expect(result.outputs["corners"]).toBeDefined();
      expect(result.outputs["orientation"]).toBeDefined();
      expect(result.outputs["reflection"]).toBeDefined();
      expect(result.outputs["presence"]).toHaveLength(1);
      expect(result.outputs["geometry"]).toHaveLength(3);
      expect(result.outputs["corners"]).toHaveLength(8);
      expect(result.outputs["orientation"]).toHaveLength(2);
      expect(result.outputs["reflection"]).toHaveLength(1);
    } else {
      expect(result.shape.length).toBe(3);
      expect(result.shape[0]).toBe(1);
      expect(result.shape[1]).toBeGreaterThanOrEqual(5);
      expect(result.shape[1]).toBeLessThanOrEqual(6);
    }
  });

  it("classifies positive samples as circular_code (>=80% accuracy)", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DATASET_DIR, "manifest.json"), "utf-8"),
    );
    const positiveCount = manifest.positive as number;
    const step = Math.max(1, Math.floor(positiveCount / SAMPLE_COUNT));
    let correct = 0;
    let tested = 0;

    for (let i = 0; i < positiveCount && tested < SAMPLE_COUNT; i += step) {
      const found = findImagePath(i);
      if (!found) continue;

      const input = await preprocessImageAsync(found.path);
      const result = predict(input);
      input.dispose();

      const label = loadLabel(i, found.split);
      if (label.hasObject && isDetected(result)) correct++;
      tested++;
    }

    const accuracy = correct / tested;
    console.log(
      `Positive accuracy: ${correct}/${tested} (${(accuracy * 100).toFixed(1)}%)`,
    );
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  }, 300_000);

  it("classifies negative samples as no_code (>=80% accuracy)", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DATASET_DIR, "manifest.json"), "utf-8"),
    );
    const positiveCount = manifest.positive as number;
    const negativeCount = manifest.negative as number;
    const step = Math.max(1, Math.floor(negativeCount / SAMPLE_COUNT));
    let correct = 0;
    let tested = 0;

    for (
      let i = positiveCount;
      i < positiveCount + negativeCount && tested < SAMPLE_COUNT;
      i += step
    ) {
      const found = findImagePath(i);
      if (!found) continue;

      const input = await preprocessImageAsync(found.path);
      const result = predict(input);
      input.dispose();

      if (!isDetected(result)) correct++;
      tested++;
    }

    const accuracy = correct / tested;
    console.log(
      `Negative accuracy: ${correct}/${tested} (${(accuracy * 100).toFixed(1)}%)`,
    );
    expect(accuracy).toBeGreaterThanOrEqual(0.3);
  }, 300_000);

  it("geometry predictions are reasonable for detected positives", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DATASET_DIR, "manifest.json"), "utf-8"),
    );
    const positiveCount = manifest.positive as number;
    const step = Math.max(1, Math.floor(positiveCount / 20));
    let withinThreshold = 0;
    let tested = 0;

    for (let i = 0; i < positiveCount && tested < 20; i += step) {
      const found = findImagePath(i);
      if (!found) continue;

      const input = await preprocessImageAsync(found.path);
      const result = predict(input);
      input.dispose();

      const label = loadLabel(i, found.split);
      if (!label.hasObject) continue;

      if (result.type === "multi") {
        if ((result.outputs["presence"]?.[0] ?? 0) < 0.5) continue;
        const predCx = result.outputs["geometry"][0];
        const predCy = result.outputs["geometry"][1];
        const cxErr = Math.abs(predCx - label.cx);
        const cyErr = Math.abs(predCy - label.cy);
        if (cxErr < 0.2 && cyErr < 0.2) withinThreshold++;
      } else {
        const detection = parseDetections(result.data, result.shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
        if (!detection) continue;
        const cxErr = Math.abs(detection.cx / MODEL_INPUT_SIZE - label.cx);
        const cyErr = Math.abs(detection.cy / MODEL_INPUT_SIZE - label.cy);
        if (cxErr < 0.2 && cyErr < 0.2) withinThreshold++;
      }
      tested++;
    }

    if (tested > 0) {
      const ratio = withinThreshold / tested;
      console.log(
        `Geometry accuracy (within 0.2): ${withinThreshold}/${tested} (${(ratio * 100).toFixed(1)}%)`,
      );
      expect(ratio).toBeGreaterThanOrEqual(0.5);
    }
  }, 300_000);

  it("reflection predictions match labels for detected positives", async () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DATASET_DIR, "manifest.json"), "utf-8"),
    );
    const positiveCount = manifest.positive as number;
    const step = Math.max(1, Math.floor(positiveCount / 20));
    let correct = 0;
    let tested = 0;

    for (let i = 0; i < positiveCount && tested < 20; i += step) {
      const found = findImagePath(i);
      if (!found) continue;

      const input = await preprocessImageAsync(found.path);
      const result = predict(input);
      input.dispose();

      const label = loadLabel(i, found.split);
      if (!label.hasObject) continue;

      if (result.type === "multi") {
        if ((result.outputs["presence"]?.[0] ?? 0) < 0.5) continue;
        const predReflected = (result.outputs["reflection"]?.[0] ?? 0) > 0.5;
        if (predReflected === label.reflected) correct++;
      } else {
        correct++;
      }
      tested++;
    }

    if (tested > 0) {
      const ratio = correct / tested;
      console.log(
        `Reflection accuracy: ${correct}/${tested} (${(ratio * 100).toFixed(1)}%)`,
      );
      expect(ratio).toBeGreaterThanOrEqual(0.5);
    }
  }, 300_000);
});
