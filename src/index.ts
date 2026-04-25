export { encode } from "@/core/encoder";
export { decode } from "@/core/decoder";
export { bitsToBytes, bytesToBits } from "@/core/bitstream";
export { rsDecode, rsEncode } from "@/ecc/reedSolomon";
export { renderSVG } from "@/render/svgRenderer";
export type { SVGRenderOptions } from "@/render/svgRenderer";
export { renderCanvas } from "@/render/canvasRenderer";
export {
  detectCode,
  flipHorizontal,
  processFrame,
  rectifyCode,
  resolveCorners,
  sampleAndDecode,
  scanFrame,
  scanFromVideo,
} from "@/scan";
export type { RectifyResult, ScanFrameOptions, ScanFrameResult } from "@/scan";
export { MultiFrameConsensus } from "@/scan/consensus";
export { scoreFrame } from "@/scan/frameScorer";
export { validateCircularCode } from "@/scan/validator";
export type { ValidationResult } from "@/scan/validator";
export { estimateCircleCorners, solveHomography, warpPerspective } from "@/scan/perspective";
export { samplePolarGrid } from "@/scan/sampler";
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
export {
  bufferToCanvas,
  canvasToBuffer,
  captureFrameToBuffer,
  createBuffer,
  flipBufferHorizontal,
  toGrayscale,
} from "@/utils/image";
export { useCircularScanner } from "@/react/useCircularScanner";
export type {
  CircularCodeOptions,
  ConsensusResult,
  DetectionResult,
  EncodedCode,
  FrameScore,
  ImageBuffer,
  Point,
  ScanOptions,
  ScanResult,
} from "@/types";
