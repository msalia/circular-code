import { describe, it, expect } from "vitest";
import { parseDetections, MODEL_INPUT_SIZE } from "@/ml/detector";

function makeYoloOutput(
  cx: number,
  cy: number,
  w: number,
  h: number,
  conf: number,
  numCandidates = 3,
  targetIdx = 0,
): { data: Float32Array; shape: number[] } {
  // YOLO output shape: [1, 5, numCandidates]
  // Layout: channel-major — data[channel * N + candidate]
  const data = new Float32Array(5 * numCandidates);
  data[0 * numCandidates + targetIdx] = cx;
  data[1 * numCandidates + targetIdx] = cy;
  data[2 * numCandidates + targetIdx] = w;
  data[3 * numCandidates + targetIdx] = h;
  data[4 * numCandidates + targetIdx] = conf;
  return { data, shape: [1, 5, numCandidates] };
}

describe("parseDetections", () => {
  it("returns null for low confidence", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.3);
    expect(parseDetections(data, shape, 640, 480)).toBeNull();
  });

  it("returns detection above 0.5 confidence", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.51);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.51, 2);
  });

  it("returns detection for high confidence", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.95);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.95, 2);
  });

  it("scales cx/cy to frame dimensions", () => {
    const { data, shape } = makeYoloOutput(80, 120, 100, 100, 0.9);
    const result = parseDetections(data, shape, 640, 480)!;
    expect(result.cx).toBeCloseTo(80 * (640 / MODEL_INPUT_SIZE));
    expect(result.cy).toBeCloseTo(120 * (480 / MODEL_INPUT_SIZE));
  });

  it("computes radius from min of scaled w and h", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 60, 0.9);
    const result = parseDetections(data, shape, 640, 480)!;
    const scaledW = 100 * (640 / MODEL_INPUT_SIZE);
    const scaledH = 60 * (480 / MODEL_INPUT_SIZE);
    expect(result.r).toBeCloseTo(Math.min(scaledW, scaledH) / 2);
  });

  it("picks the highest confidence candidate", () => {
    const numCandidates = 3;
    const data = new Float32Array(5 * numCandidates);
    // Candidate 0: conf 0.6
    data[0 * numCandidates + 0] = 50;
    data[1 * numCandidates + 0] = 50;
    data[4 * numCandidates + 0] = 0.6;
    // Candidate 1: conf 0.9 (best)
    data[0 * numCandidates + 1] = 160;
    data[1 * numCandidates + 1] = 160;
    data[4 * numCandidates + 1] = 0.9;
    // Candidate 2: conf 0.7
    data[0 * numCandidates + 2] = 200;
    data[1 * numCandidates + 2] = 200;
    data[4 * numCandidates + 2] = 0.7;

    const result = parseDetections(data, [1, 5, numCandidates], MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result.confidence).toBeCloseTo(0.9, 2);
    expect(result.cx).toBeCloseTo(160);
    expect(result.cy).toBeCloseTo(160);
  });

  it("returns null when all candidates are below threshold", () => {
    const numCandidates = 3;
    const data = new Float32Array(5 * numCandidates);
    data[4 * numCandidates + 0] = 0.1;
    data[4 * numCandidates + 1] = 0.2;
    data[4 * numCandidates + 2] = 0.3;
    expect(parseDetections(data, [1, 5, numCandidates], 320, 320)).toBeNull();
  });

  it("respects custom confidence threshold", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.7);
    expect(parseDetections(data, shape, 320, 320, 0.8)).toBeNull();
    expect(parseDetections(data, shape, 320, 320, 0.6)).not.toBeNull();
  });

  it("parses OBB output with angle", () => {
    const numCandidates = 2;
    // OBB output: [1, 6, N] — channels: cx, cy, w, h, angle, class_score
    const data = new Float32Array(6 * numCandidates);
    data[0 * numCandidates + 0] = 160; // cx
    data[1 * numCandidates + 0] = 160; // cy
    data[2 * numCandidates + 0] = 100; // w
    data[3 * numCandidates + 0] = 100; // h
    data[4 * numCandidates + 0] = 0.785; // angle (~pi/4)
    data[5 * numCandidates + 0] = 0.9; // class score
    const result = parseDetections(data, [1, 6, numCandidates], MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result).not.toBeNull();
    expect(result.angle).toBeCloseTo(0.785, 2);
    expect(result.confidence).toBeCloseTo(0.9, 2);
  });

  it("omits angle for standard YOLO output", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.9);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result.angle).toBeUndefined();
  });
});
