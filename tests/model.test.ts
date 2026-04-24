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

function predict(input: tf.Tensor4D): { data: Float32Array | Int32Array | Uint8Array; shape: number[] } {
  return tf.tidy(() => {
    const pred = runModelPrediction(model, input);
    return { data: pred.dataSync(), shape: pred.shape as number[] };
  });
}

function findImagePath(index: number): { path: string; split: "train" | "val" } | null {
  for (const split of ["train", "val"] as const) {
    const p = path.join(DATASET_DIR, "images", split, `${index}.png`);
    if (fs.existsSync(p)) return { path: p, split };
  }
  return null;
}

function loadLabel(index: number, split: "train" | "val"): { hasObject: boolean; cx: number; cy: number } {
  const labelPath = path.join(DATASET_DIR, "labels", split, `${index}.txt`);
  const raw = fs.readFileSync(labelPath, "utf-8").trim();
  if (raw === "") return { hasObject: false, cx: 0, cy: 0 };

  const parts = raw.split(/\s+/).map(Number);

  if (parts.length === 9) {
    // OBB format: class_id x1 y1 x2 y2 x3 y3 x4 y4
    const cx = (parts[1] + parts[3] + parts[5] + parts[7]) / 4;
    const cy = (parts[2] + parts[4] + parts[6] + parts[8]) / 4;
    return { hasObject: true, cx, cy };
  }

  if (parts.length === 5) {
    // Standard YOLO: class_id cx cy w h
    return { hasObject: true, cx: parts[1], cy: parts[2] };
  }

  return { hasObject: true, cx: 0.5, cy: 0.5 };
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

  it("produces YOLO-shaped output", async () => {
    const found = findImagePath(0)!;
    const input = await preprocessImageAsync(found.path);
    const { data, shape } = predict(input);
    input.dispose();
    // YOLO output: [1, channels, N] where channels is 5 (detect) or 6 (OBB)
    expect(shape.length).toBe(3);
    expect(shape[0]).toBe(1);
    expect(shape[1]).toBeGreaterThanOrEqual(5);
    expect(shape[1]).toBeLessThanOrEqual(6);
    console.log(`Output shape: [${shape.join(", ")}]`);
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
      const { data, shape } = predict(input);
      input.dispose();

      const label = loadLabel(i, found.split);
      const detection = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      if (label.hasObject && detection !== null) correct++;
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
      const { data, shape } = predict(input);
      input.dispose();

      const detection = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      if (detection === null) correct++;
      tested++;
    }

    const accuracy = correct / tested;
    console.log(
      `Negative accuracy: ${correct}/${tested} (${(accuracy * 100).toFixed(1)}%)`,
    );
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  }, 300_000);

  it("bounding box predictions are reasonable for detected positives", async () => {
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
      const { data, shape } = predict(input);
      input.dispose();

      const label = loadLabel(i, found.split);
      const detection = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      if (!detection || !label.hasObject) continue;

      const cxErr = Math.abs(detection.cx / MODEL_INPUT_SIZE - label.cx);
      const cyErr = Math.abs(detection.cy / MODEL_INPUT_SIZE - label.cy);

      if (cxErr < 0.2 && cyErr < 0.2) withinThreshold++;
      tested++;
    }

    if (tested > 0) {
      const ratio = withinThreshold / tested;
      console.log(
        `Bbox accuracy (within 0.2): ${withinThreshold}/${tested} (${(ratio * 100).toFixed(1)}%)`,
      );
      expect(ratio).toBeGreaterThanOrEqual(0.5);
    }
  }, 300_000);
});
