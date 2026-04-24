export { encode } from "@/core/encoder";
export { decode } from "@/core/decoder";
export { bitsToBytes, bytesToBits } from "@/core/bitstream";
export { rsDecode, rsEncode } from "@/ecc/reedSolomon";
export { renderSVG } from "@/render/svgRenderer";
export type { SVGRenderOptions } from "@/render/svgRenderer";
export { renderCanvas } from "@/render/canvasRenderer";
export { processFrame, scanFromVideo } from "@/scan";
export { MultiFrameConsensus } from "@/scan/consensus";
export { scoreFrame } from "@/scan/frameScorer";
export { validateCircularCode } from "@/scan/validator";
export type { ValidationResult } from "@/scan/validator";
export { estimateCircleCorners, solveHomography, warpPerspective } from "@/scan/perspective";
export {
  detectWithModel,
  getLoadedModel,
  isModelLoaded,
  loadModel,
  loadModelFromFiles,
  MODEL_INPUT_SIZE,
  parseDetections,
  runModelPrediction,
} from "@/ml/detector";
export { getOrCreateCanvas } from "@/utils/canvas";
export { toGrayscale } from "@/utils/image";
export { useCircularScanner } from "@/react/useCircularScanner";
export type {
  CircularCodeOptions,
  ConsensusResult,
  DetectionResult,
  EncodedCode,
  FrameScore,
  Point,
  ScanOptions,
  ScanResult,
} from "@/types";
