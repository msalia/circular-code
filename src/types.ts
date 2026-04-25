/** Options for encoding a circular code. */
export type CircularCodeOptions = {
  rings?: number;
  segmentsPerRing?: number;
  eccBytes?: number;
};

/** Encoded circular code containing bit data and layout dimensions. */
export type EncodedCode = {
  bits: number[];
  rings: number;
  segmentsPerRing: number;
};

/** A 2D point with x and y coordinates. */
export type Point = {
  x: number;
  y: number;
};

/** Raw RGBA image data with dimensions. */
export type ImageBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** Result of detecting a circular code in an image. */
export type DetectionResult = {
  cx: number;
  cy: number;
  r: number;
  corners?: Point[];
  confidence: number;
  angle?: number;
  orientation?: number;
  reflected?: boolean;
};

/** Quality metrics for a captured video frame. */
export type FrameScore = {
  sharpness: number;
  contrast: number;
  overall: number;
};

/** Result of scanning and decoding a single frame. */
export type ScanResult = {
  data: string;
  confidence: number;
  frameScore: FrameScore;
};

/** Result of multi-frame consensus voting across scans. */
export type ConsensusResult = {
  data: string;
  agreement: number;
  frameCount: number;
};

/** Configuration options for the video scanning pipeline. */
export type ScanOptions = {
  rings?: number;
  segmentsPerRing?: number;
  eccBytes?: number;
  minFrameScore?: number;
  consensusSize?: number;
  consensusRequired?: number;
  modelUrl?: string;
};
