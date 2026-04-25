import { describe, it, expect } from "vitest";
import { parseDetections, MODEL_INPUT_SIZE } from "@/ml/detector";

function toLogit(p: number): number {
  return Math.log(p / (1 - p));
}

function makeYoloOutput(
  cx: number,
  cy: number,
  w: number,
  h: number,
  confProb: number,
  numCandidates = 3,
  targetIdx = 0,
): { data: Float32Array; shape: number[] } {
  const data = new Float32Array(5 * numCandidates);
  data[0 * numCandidates + targetIdx] = cx;
  data[1 * numCandidates + targetIdx] = cy;
  data[2 * numCandidates + targetIdx] = w;
  data[3 * numCandidates + targetIdx] = h;
  data[4 * numCandidates + targetIdx] = toLogit(confProb);
  return { data, shape: [1, 5, numCandidates] };
}

describe("parseDetections (YOLO legacy)", () => {
  it("returns null for low confidence", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.3);
    expect(parseDetections(data, shape, 640, 480)).toBeNull();
  });

  it("returns detection above default threshold", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.6);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.6, 2);
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
    data[0 * numCandidates + 0] = 50;
    data[1 * numCandidates + 0] = 50;
    data[4 * numCandidates + 0] = toLogit(0.6);
    data[0 * numCandidates + 1] = 160;
    data[1 * numCandidates + 1] = 160;
    data[4 * numCandidates + 1] = toLogit(0.9);
    data[0 * numCandidates + 2] = 200;
    data[1 * numCandidates + 2] = 200;
    data[4 * numCandidates + 2] = toLogit(0.7);

    const result = parseDetections(data, [1, 5, numCandidates], MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result.confidence).toBeCloseTo(0.9, 2);
    expect(result.cx).toBeCloseTo(160);
    expect(result.cy).toBeCloseTo(160);
  });

  it("returns null when all candidates are below threshold", () => {
    const numCandidates = 3;
    const data = new Float32Array(5 * numCandidates);
    data[4 * numCandidates + 0] = toLogit(0.1);
    data[4 * numCandidates + 1] = toLogit(0.2);
    data[4 * numCandidates + 2] = toLogit(0.3);
    expect(parseDetections(data, [1, 5, numCandidates], 320, 320)).toBeNull();
  });

  it("respects custom confidence threshold", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.7);
    expect(parseDetections(data, shape, 320, 320, 0.8)).toBeNull();
    expect(parseDetections(data, shape, 320, 320, 0.6)).not.toBeNull();
  });

  it("parses OBB output with angle", () => {
    const numCandidates = 2;
    const data = new Float32Array(6 * numCandidates);
    data[0 * numCandidates + 0] = 160;
    data[1 * numCandidates + 0] = 160;
    data[2 * numCandidates + 0] = 100;
    data[3 * numCandidates + 0] = 100;
    data[4 * numCandidates + 0] = 0.785;
    data[5 * numCandidates + 0] = toLogit(0.9);
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

describe("parseDetections (YOLO-Pose)", () => {
  function makePoseOutput(
    cx: number,
    cy: number,
    w: number,
    h: number,
    confProb: number,
    kps: [number, number][], // 4 corner keypoints
    numCandidates = 2,
    targetIdx = 0,
  ): { data: Float32Array; shape: number[] } {
    const channels = 5 + 4 * 3; // cx,cy,w,h,class + 4 keypoints * (x,y,conf)
    const data = new Float32Array(channels * numCandidates);
    data[0 * numCandidates + targetIdx] = cx;
    data[1 * numCandidates + targetIdx] = cy;
    data[2 * numCandidates + targetIdx] = w;
    data[3 * numCandidates + targetIdx] = h;
    data[4 * numCandidates + targetIdx] = toLogit(confProb);
    for (let kp = 0; kp < 4; kp++) {
      const base = 5 + kp * 3;
      data[base * numCandidates + targetIdx] = kps[kp][0];
      data[(base + 1) * numCandidates + targetIdx] = kps[kp][1];
      data[(base + 2) * numCandidates + targetIdx] = 1.0; // confidence
    }
    return { data, shape: [1, channels, numCandidates] };
  }

  it("detects pose output format (17 channels)", () => {
    const kps: [number, number][] = [[50, 50], [270, 50], [270, 270], [50, 270]];
    const { data, shape } = makePoseOutput(160, 160, 220, 220, 0.9, kps);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    expect(result).not.toBeNull();
    expect(result!.corners).toBeDefined();
    expect(result!.corners).toHaveLength(4);
  });

  it("extracts keypoint positions scaled to frame size", () => {
    const kps: [number, number][] = [[80, 80], [240, 80], [240, 240], [80, 240]];
    const { data, shape } = makePoseOutput(160, 160, 160, 160, 0.9, kps);
    const result = parseDetections(data, shape, 640, 480)!;
    expect(result.corners![0].x).toBeCloseTo(80 * (640 / MODEL_INPUT_SIZE));
    expect(result.corners![0].y).toBeCloseTo(80 * (480 / MODEL_INPUT_SIZE));
    expect(result.corners![2].x).toBeCloseTo(240 * (640 / MODEL_INPUT_SIZE));
    expect(result.corners![2].y).toBeCloseTo(240 * (480 / MODEL_INPUT_SIZE));
  });

  it("returns 4 corners in order", () => {
    const kps: [number, number][] = [[10, 20], [300, 30], [290, 280], [20, 290]];
    const { data, shape } = makePoseOutput(160, 160, 280, 260, 0.85, kps);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result.corners![0].x).toBeCloseTo(10);
    expect(result.corners![0].y).toBeCloseTo(20);
    expect(result.corners![3].x).toBeCloseTo(20);
    expect(result.corners![3].y).toBeCloseTo(290);
  });

  it("does not set angle for pose output", () => {
    const kps: [number, number][] = [[50, 50], [270, 50], [270, 270], [50, 270]];
    const { data, shape } = makePoseOutput(160, 160, 220, 220, 0.9, kps);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result.angle).toBeUndefined();
  });

  it("returns null for low confidence pose output", () => {
    const kps: [number, number][] = [[50, 50], [270, 50], [270, 270], [50, 270]];
    const { data, shape } = makePoseOutput(160, 160, 220, 220, 0.3, kps);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    expect(result).toBeNull();
  });

  it("does not return corners for non-pose output", () => {
    const { data, shape } = makeYoloOutput(160, 160, 100, 100, 0.9);
    const result = parseDetections(data, shape, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)!;
    expect(result.corners).toBeUndefined();
  });
});
