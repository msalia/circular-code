# Circular Code

A custom circular barcode system written in TypeScript. Encodes arbitrary text into concentric ring patterns, renders them as SVG or Canvas, and decodes them back from camera video using ML detection, perspective correction, and algorithmic orientation analysis.

Not Apple-compatible — this is an independent format with its own encoding, error correction, and scanning pipeline.

## Features

- **Encoding/Decoding** — Text to circular bit pattern and back, with configurable rings and segments
- **Adaptive ring layout** — Inner rings hold fewer segments proportional to circumference, preventing visual overlap
- **Reed-Solomon ECC** — Real GF(256) error correction that recovers data from damaged codes
- **Orientation ring** — Outer ring with an asymmetric arc pattern (180°/90°/45°) for unambiguous rotation and reflection detection
- **Dual-color SVG rendering** — Primary color for data arcs, secondary color for non-data segments with configurable gap separation
- **Canvas rendering** — Delegates to SVG renderer for consistent output across both render paths
- **YOLO-Pose detection** — YOLOv8-Pose model predicts bounding box + 4 corner keypoints for direct perspective correction
- **Algorithmic orientation analysis** — Samples the orientation ring pattern to determine rotation angle and detect mirror reflections without ML
- **Canvas-free processing** — Internal pipeline uses raw `ImageBuffer` arrays, no DOM dependency for scan logic
- **Frame scoring** — Laplacian sharpness + contrast scoring to pick the best video frames
- **Multi-frame consensus** — Weighted majority voting across frames for reliable scanning
- **React hook** — `useCircularScanner()` for drop-in camera scanning in React apps

## Project Structure

```
src/
  core/           Encoder, decoder, bitstream, layout math (including orientation ring geometry)
  ecc/            GF(256) arithmetic and Reed-Solomon codec
  render/         SVG renderer (primary) and Canvas renderer (delegates to SVG)
  scan/           Detection, orientation analysis, sampling, perspective correction, consensus
  ml/             TensorFlow.js model loader, YOLO detection/pose inference
  react/          useCircularScanner hook
  utils/          ImageBuffer operations, canvas conversion, grayscale, math helpers
  types.ts        Shared type definitions (ImageBuffer, DetectionResult, etc.)
  index.ts        Public API exports

scripts/
  generateDataset.ts   Synthetic training data generator (Node + canvas)
  resolve-aliases.js   Post-build path alias resolver

training/
  train.py             YOLOv8-Pose training and TF.js export (ultralytics)
  requirements.txt     Python dependencies
  setup_venv.sh        Virtual environment setup script

tests/                 Vitest unit and integration tests (211 tests)
models/circular_code/  Trained TF.js model output
dataset/               Generated training images and labels (YOLO-Pose format)
example/               Browser demo app with pipeline debug view
```

## Quick Start

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

Compiles TypeScript to `dist/` and resolves `@/` path aliases for Node.js.

### Test

```bash
npm test
```

Runs 211 tests across 19 test files covering: GF(256) arithmetic, bitstream, encoder/decoder roundtrips, Reed-Solomon error correction, layout geometry, orientation ring, SVG rendering, perspective math, polar grid sampling, validation, frame scoring, Hough detection, YOLO parsing (standard/OBB/Pose), orientation analysis, scan pipeline (corner resolution, flip, rectification), multi-frame consensus, image buffer operations, and end-to-end flows.

### Type Check

```bash
npm run typecheck
```

## Usage

### Encode and Render

```typescript
import { encode, renderSVG } from "circular-code";

const code = encode("https://example.com", {
  rings: 5,
  segmentsPerRing: 48,
  eccBytes: 16,
});

const svg = renderSVG(code, {
  size: 400,
  primary: "#1a1a2e",
  secondary: "#e0ddd5",
});

document.getElementById("container").innerHTML = svg;
```

The rendered code includes an outer orientation ring with three asymmetric arcs (180°, 90°, 45°) that allow the scanner to determine the code's rotation and detect mirror reflections.

### Decode

```typescript
import { decode } from "circular-code";

const text = decode(bits, 16); // bits: number[], eccBytes: number
```

### Scan a Single Frame

```typescript
import { scanFrame } from "circular-code";

const result = scanFrame(videoElement); // or pass a canvas or ImageBuffer

if (result.decoded) {
  console.log(result.decoded);          // the text
  console.log(result.orientation);      // { angle, reflected, confidence }
  console.log(result.detection);        // { cx, cy, r, corners, confidence }
  console.log(result.validation);       // { valid, centerDot, ringContrast, segmentPattern, score }
}
```

### Scan from Video (Browser)

```typescript
import { scanFromVideo } from "circular-code";

const video = document.querySelector("video");
const result = await scanFromVideo(video, {
  modelUrl: "/models/circular_code/model.json",
  minFrameScore: 0.3,
  consensusRequired: 3,
});
console.log(result); // decoded text
```

### React Hook

```tsx
import { useCircularScanner } from "circular-code";

function Scanner() {
  const { videoRef, result, scanning } = useCircularScanner({
    modelUrl: "/models/circular_code/model.json",
  });

  return (
    <div>
      <video ref={videoRef} />
      {scanning && <p>Scanning...</p>}
      {result && <p>Found: {result.data}</p>}
    </div>
  );
}
```

## Training the ML Detector

The detector uses a YOLOv8-Pose model that predicts a bounding box plus 4 corner keypoints for each detected code. The corner keypoints give the scanner the perspective-warped quadrilateral needed for accurate homography dewarping. Rotation and reflection are handled algorithmically by the orientation ring analyzer after rectification.

### Prerequisites

Python 3.9+ with ultralytics:

```bash
cd training
bash setup_venv.sh
source venv/bin/activate
```

### Step 1: Generate Training Data

```bash
npm run build
npm run generate-dataset
```

Produces 12,000 images (8,000 positive + 4,000 negative) with an 85/15 train/val split. Positive samples use the SVG renderer with:

- Randomly generated text (URLs, phrases, alphanumeric tokens, numbers)
- Varied ring/segment configs (3-6 rings, 32/48/64 segments)
- Full 3D perspective transforms (pitch, yaw, roll with focal-length projection)
- Dual-color rendering, noise, lighting gradients, blur, and background clutter

Hard negative samples include concentric circles, bullseyes, spirals, clock faces, dashed rings, QR-like grids, and center-dot patterns.

Output structure:
```
dataset/
  images/train/    Training images (320x320 PNG)
  images/val/      Validation images
  labels/train/    YOLO-Pose labels
  labels/val/      Validation labels (empty file = no object)
  data.yaml        YOLO dataset config with kpt_shape: [4, 3]
  manifest.json    Dataset metadata
```

Label format (YOLO-Pose, normalized 0-1):
```
class cx cy w h kp1x kp1y kp1v kp2x kp2y kp2v kp3x kp3y kp3v kp4x kp4y kp4v
```

The 4 keypoints are the perspective-warped corners of the code (top-left, top-right, bottom-right, bottom-left).

### Step 2: Train the Model

```bash
python training/train.py
```

Trains a YOLOv8n-pose model on the synthetic dataset and auto-exports to TF.js format.

Options:

```bash
python training/train.py --epochs 40 --batch-size 32
python training/train.py --dataset ./my_dataset --output ./my_model
python training/train.py --resume runs/pose/circular_code/weights/best.pt
python training/train.py --base-model yolov8s-pose.pt  # larger model
```

### Step 3: Verify

Run the model accuracy test against the dataset:

```bash
npx vitest run tests/model.test.ts
```

This loads the TF.js model, runs inference on sampled positive/negative images, and checks classification accuracy (>=80%) and bounding box quality.

## End-to-End Cheat Sheet

```bash
# Install, build, and test the TypeScript library
npm install
npm run build
npm test

# Set up training environment
cd training && bash setup_venv.sh && source venv/bin/activate && cd ..

# Generate dataset and train
npm run build
npm run generate-dataset
python training/train.py --epochs 40

# Verify model quality
npx vitest run tests/model.test.ts

# Run the example app
npm run example
```

## Architecture

### Encoding Pipeline

```
Text -> UTF-8 bytes -> [version, length, ...data] header
     -> Reed-Solomon ECC (GF(256), configurable redundancy)
     -> Bit stream -> Mapped to ring/segment grid
        (inner rings get fewer segments proportional to circumference,
         innermost ring is reserved as a visual spacer)
```

### Visual Structure

```
┌─────────────────────────┐
│    Orientation Ring      │  Outer: 3 asymmetric arcs (180°, 90°, 45°)
│  ┌───────────────────┐  │
│  │   Data Rings 1-N   │  │  Concentric arcs encoding data bits
│  │  ┌─────────────┐  │  │
│  │  │  Spacer (r0) │  │  │  Visual separator (no data)
│  │  │  ┌───────┐   │  │  │
│  │  │  │ Center │   │  │  │  Filled dot for detection anchor
│  │  │  └───────┘   │  │  │
│  │  └─────────────┘  │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

### Scanning Pipeline

```
Video frame -> Capture to ImageBuffer (320x320)
            -> YOLO-Pose detection:
               - Bounding box: cx, cy, w, h
               - 4 corner keypoints (perspective-warped quadrilateral)
               - Confidence score
            -> Homography from corner keypoints -> Rectified ImageBuffer
            -> Orientation ring analysis (algorithmic):
               - Samples grayscale values around orientation ring radius
               - Correlates against known long/medium/short arc pattern
               - Determines rotation angle and reflection state
            -> Flip if reflected
            -> Score frame (sharpness + contrast)
            -> Polar grid sampling -> Bit extraction
            -> RS decode -> Multi-frame consensus -> Result

Fallback: Hough circle detection + estimated corners (when model unavailable)
```

### Model Architecture

```
YOLOv8n-Pose (Keypoint Detection)
Input: 320x320x3, normalized to [0, 1]
Output: [1, 17, N] — N detection candidates
  Per candidate:
    [cx, cy, w, h]     — bounding box
    [class_score]       — detection confidence
    [kp1x, kp1y, kp1c] — top-left corner
    [kp2x, kp2y, kp2c] — top-right corner
    [kp3x, kp3y, kp3c] — bottom-right corner
    [kp4x, kp4y, kp4c] — bottom-left corner

Exported to TF.js GraphModel format via ultralytics
```

The parser auto-detects output format and handles all three YOLO variants:
- **Standard** (5 channels): cx, cy, w, h, class
- **OBB** (6 channels): cx, cy, w, h, angle, class
- **Pose** (5 + N×3 channels): cx, cy, w, h, class, keypoints

## API Reference

### Encoding

| Function | Signature | Description |
|----------|-----------|-------------|
| `encode` | `(input: string, opts?: CircularCodeOptions) => EncodedCode` | Encode text to bit pattern |
| `decode` | `(bits: number[], eccBytes?: number) => string` | Decode bit pattern to text |
| `rsEncode` | `(data: Uint8Array, eccBytes?: number) => Uint8Array` | Raw Reed-Solomon encode |
| `rsDecode` | `(data: Uint8Array, eccBytes?: number) => Uint8Array` | Raw Reed-Solomon decode with error correction |

### Rendering

| Function | Signature | Description |
|----------|-----------|-------------|
| `renderSVG` | `(code: EncodedCode, opts?: SVGRenderOptions \| number) => string` | Render as SVG string with primary/secondary colors and orientation ring |
| `renderCanvas` | `(code: EncodedCode, size?: number) => HTMLCanvasElement` | Render to canvas element (delegates to SVG renderer) |

### Scanning

| Function | Signature | Description |
|----------|-----------|-------------|
| `scanFrame` | `(source: Video \| Canvas \| ImageBuffer, opts?) => ScanFrameResult` | One-call scan: detect, rectify, orient, sample, decode |
| `scanFromVideo` | `(video: HTMLVideoElement, opts?: ScanOptions) => Promise<string>` | Scan video until decoded via multi-frame consensus |
| `processFrame` | `(video: HTMLVideoElement, opts?) => ScanResult \| null` | Process a single frame, returns result if decoded |
| `analyzeOrientation` | `(buf: ImageBuffer, rings, size) => OrientationAnalysis` | Determine rotation angle and reflection from orientation ring |
| `rectifyCode` | `(frame, detection, rings, size?) => RectifyResult` | Warp, analyze orientation, flip if reflected, validate |
| `detectCode` | `(buf: ImageBuffer) => DetectionResult` | Detect code via ML model or Hough fallback |
| `resolveCorners` | `(detection, padding?) => Point[]` | Get corners from model keypoints or estimate from geometry |
| `loadModel` | `(path?: string) => Promise<void>` | Load TF.js detection model |

### Types

```typescript
type ImageBuffer = {
  data: Uint8ClampedArray;  // RGBA pixel data
  width: number;
  height: number;
};

type DetectionResult = {
  cx: number;               // center x
  cy: number;               // center y
  r: number;                // radius
  corners?: Point[];        // 4 keypoints from YOLO-Pose for homography
  confidence: number;
  angle?: number;           // OBB rotation angle (radians)
};

type OrientationAnalysis = {
  angle: number;            // orientation ring rotation (radians)
  reflected: boolean;       // true if code is mirror-reflected
  confidence: number;       // match quality 0-1
};

type ScanFrameResult = {
  detected: boolean;        // was a code found?
  decoded: string | null;   // decoded text or null
  error: string | null;     // error message if decode failed
  detection: DetectionResult;
  orientation: OrientationAnalysis;
  corners: Point[];         // corners used for homography
  rectified: ImageBuffer;   // dewarped image
  bits: number[];           // sampled bit values
  validation: ValidationResult;
  frameScore: FrameScore;
};
```

### React

| Hook | Returns | Description |
|------|---------|-------------|
| `useCircularScanner` | `{ videoRef, result, scanning }` | Camera scanning hook with model loading, frame scoring, and consensus |

### Utilities

| Export | Description |
|--------|-------------|
| `createBuffer` | Create an empty ImageBuffer |
| `canvasToBuffer` / `bufferToCanvas` | Convert between Canvas and ImageBuffer |
| `captureFrameToBuffer` | Capture video frame as ImageBuffer |
| `flipBufferHorizontal` | Mirror an ImageBuffer left-to-right |
| `toGrayscale` | Fast integer-arithmetic luminance conversion |
| `MultiFrameConsensus` | Rolling buffer with weighted majority voting |
| `scoreFrame` | Frame quality scoring (sharpness + contrast) |
| `solveHomography` / `warpPerspective` | 4-point perspective transform |
| `samplePolarGrid` | Sample bits from rectified image using polar coordinates |
| `validateCircularCode` | Check center dot, ring contrast, segment patterns |
