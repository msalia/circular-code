export type CircularCodeOptions = {
  rings?: number;
  segmentsPerRing?: number;
  eccBytes?: number;
};

export type EncodedCode = {
  bits: number[];
  rings: number;
  segmentsPerRing: number;
};

export type Point = {
  x: number;
  y: number;
};

export type DetectionResult = {
  cx: number;
  cy: number;
  r: number;
  corners?: Point[];
  confidence: number;
};

export type FrameScore = {
  sharpness: number;
  contrast: number;
  overall: number;
};

export type ScanResult = {
  data: string;
  confidence: number;
  frameScore: FrameScore;
};

export type ConsensusResult = {
  data: string;
  agreement: number;
  frameCount: number;
};

export type ScanOptions = {
  rings?: number;
  segmentsPerRing?: number;
  eccBytes?: number;
  minFrameScore?: number;
  consensusSize?: number;
  consensusRequired?: number;
};
