import { describe, it, expect } from "vitest";
import { parseDetections, MODEL_INPUT_SIZE } from "@/ml/detector";
import type { MultiHeadOutput } from "@/ml/detector";

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

function makeMultiHeadOutput(overrides: Partial<MultiHeadOutput> = {}): MultiHeadOutput {
  return {
    presence: new Float32Array([0.9]),
    geometry: new Float32Array([0.5, 0.5, 0.3]),
    corners: new Float32Array([0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8]),
    orientation: new Float32Array([Math.sin(0.5), Math.cos(0.5)]),
    reflection: new Float32Array([0.0]),
    ...overrides,
  };
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

describe("MultiHeadOutput", () => {
  it("has correct structure", () => {
    const output = makeMultiHeadOutput();
    expect(output.presence).toHaveLength(1);
    expect(output.geometry).toHaveLength(3);
    expect(output.corners).toHaveLength(8);
    expect(output.orientation).toHaveLength(2);
    expect(output.reflection).toHaveLength(1);
  });

  it("reflection flag defaults to not reflected", () => {
    const output = makeMultiHeadOutput();
    expect(output.reflection[0]).toBe(0);
  });

  it("reflection flag can be set to reflected", () => {
    const output = makeMultiHeadOutput({ reflection: new Float32Array([1.0]) });
    expect(output.reflection[0]).toBe(1.0);
  });

  it("orientation encodes sin/cos pair", () => {
    const angle = 1.23;
    const output = makeMultiHeadOutput({
      orientation: new Float32Array([Math.sin(angle), Math.cos(angle)]),
    });
    const recoveredAngle = Math.atan2(output.orientation[0], output.orientation[1]);
    expect(recoveredAngle).toBeCloseTo(angle, 5);
  });

  it("corners represent 4 keypoints as 8 values", () => {
    const output = makeMultiHeadOutput({
      corners: new Float32Array([0.1, 0.2, 0.9, 0.2, 0.9, 0.8, 0.1, 0.8]),
    });
    expect(output.corners[0]).toBe(0.1);
    expect(output.corners[1]).toBe(0.2);
    expect(output.corners[6]).toBe(0.1);
    expect(output.corners[7]).toBe(0.8);
  });

  it("geometry contains cx, cy, radius", () => {
    const output = makeMultiHeadOutput({
      geometry: new Float32Array([0.4, 0.6, 0.25]),
    });
    expect(output.geometry[0]).toBeCloseTo(0.4);
    expect(output.geometry[1]).toBeCloseTo(0.6);
    expect(output.geometry[2]).toBeCloseTo(0.25);
  });

  it("low presence indicates no code detected", () => {
    const output = makeMultiHeadOutput({ presence: new Float32Array([0.1]) });
    expect(output.presence[0]).toBeLessThan(0.5);
  });

  it("high presence indicates code detected", () => {
    const output = makeMultiHeadOutput({ presence: new Float32Array([0.95]) });
    expect(output.presence[0]).toBeGreaterThan(0.5);
  });
});
