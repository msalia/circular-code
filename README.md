# Circular Code

A custom circular barcode system written in TypeScript. Encodes arbitrary text into concentric ring patterns, renders them as SVG or Canvas, and decodes them back from camera video using a combination of geometric detection and ML-assisted recognition.

Not Apple-compatible — this is an independent format with its own encoding, error correction, and scanning pipeline.

## Features

- **Encoding/Decoding** — Text to circular bit pattern and back, with configurable rings and segments
- **Adaptive ring layout** — Inner rings hold fewer segments proportional to circumference, preventing visual overlap
- **Reed-Solomon ECC** — Real GF(256) error correction that recovers data from damaged codes
- **Orientation ring** — Outer ring with an asymmetric arc pattern (180/90/45) for unambiguous rotation and 3D tilt detection
- **Dual-color SVG rendering** — Primary color for data arcs, secondary color for non-data segments with configurable gap separation
- **Canvas rendering** — Delegates to SVG renderer for consistent output across both render paths
- **Multi-head ML detection** — Custom MobileNetV2-based model predicts presence, geometry, corner keypoints, orientation, and reflection in a single forward pass
- **Reflection detection** — Model identifies mirror-reflected codes and the scanner auto-flips before decoding
- **Perspective correction** — Model-predicted corner keypoints feed directly into homography for accurate dewarping
- **Frame scoring** — Laplacian sharpness + contrast scoring to pick the best video frames
- **Multi-frame consensus** — Weighted majority voting across frames for reliable scanning
- **React hook** — `useCircularScanner()` for drop-in camera scanning in React apps

## Project Structure

```
src/
  core/           Encoder, decoder, bitstream, layout math (including orientation ring geometry)
  ecc/            GF(256) arithmetic and Reed-Solomon codec
  render/         SVG renderer (primary) and Canvas renderer (delegates to SVG)
  scan/           Detection, sampling, perspective correction, frame scoring, consensus
  ml/             TensorFlow.js model loader, multi-head and legacy YOLO inference
  react/          useCircularScanner hook
  utils/          Canvas caching, image capture, grayscale conversion
  types.ts        Shared type definitions
  index.ts        Public API exports

scripts/
  generateDataset.ts   Synthetic training data generator (Node + canvas)
  resolve-aliases.js   Post-build path alias resolver

training/
  train.py             Multi-head model training and TF.js export (TensorFlow/Keras)
  requirements.txt     Python dependencies
  setup_venv.sh        Virtual environment setup script

tests/                 Vitest unit and integration tests (90+ tests)
models/circular_code/  Trained TF.js model output
dataset/               Generated training images and labels
example/               Browser demo app (esbuild + local server)
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

Runs 90+ tests covering bitstream, encoder/decoder roundtrips, Reed-Solomon error correction, layout geometry (including orientation ring), perspective math, multi-frame consensus, SVG rendering, multi-head detection parsing, reflection detection, and end-to-end flows. An additional model inference test suite validates detection accuracy against the dataset.

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

// Basic rendering
const svg = renderSVG(code, 300);

// With color options
const styledSvg = renderSVG(code, {
  size: 400,
  primary: "#1a1a2e",
  secondary: "#e0ddd5",
});

document.getElementById("container").innerHTML = styledSvg;
```

The rendered code includes an outer orientation ring with three asymmetric arcs (180, 90, 45) that allow the scanner to determine the code's rotation and detect mirror reflections.

### Decode

```typescript
import { decode } from "circular-code";

const text = decode(bits, 16); // bits: number[], eccBytes: number
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

The detector uses a custom multi-head CNN built on MobileNetV2 that predicts everything the scanner needs in a single forward pass:

| Head | Output | Activation | Description |
|------|--------|------------|-------------|
| **presence** | 1 value | sigmoid | Is there a circular code in the image? |
| **geometry** | 3 values | sigmoid | Center (cx, cy) and radius, normalized 0-1 |
| **corners** | 8 values | sigmoid | 4 keypoint coordinates for direct homography |
| **orientation** | 2 values | tanh | sin/cos of the orientation ring angle |
| **reflection** | 1 value | sigmoid | Is the code mirror-reflected? |

Training uses synthetic data generated from the real SVG renderer with full 3D perspective transforms, random reflections, noise, and lighting variation.

### Prerequisites

Python 3.9+ with TensorFlow and tensorflowjs:

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
- ~40% horizontal reflection (simulating transparent/mirror viewing)
- Dual-color rendering, noise, lighting gradients, blur, and background clutter

Output structure:
```
dataset/
  images/train/    Training images (320x320 PNG)
  images/val/      Validation images
  labels/train/    15-value labels per image
  labels/val/      Validation labels
  manifest.json    Dataset metadata
```

Label format (space-separated, normalized 0-1):
```
present cx cy radius c1x c1y c2x c2y c3x c3y c4x c4y sin_orient cos_orient reflected
```

### Step 2: Train the Model

```bash
python training/train.py
```

Trains in two phases:
1. **Frozen backbone** — MobileNetV2 weights locked, heads train for ~1/3 of epochs
2. **Fine-tuning** — Upper backbone layers unfrozen, full model trains at reduced learning rate

The model auto-exports to TF.js format at `models/circular_code/`.

Options:

```bash
python training/train.py --epochs 80 --batch-size 32
python training/train.py --dataset ./my_dataset --output ./my_model
python training/train.py --lr 0.0005 --fine-tune-at 120
```

### Step 3: Verify

Run the model accuracy test against the dataset:

```bash
npx vitest run tests/model.test.ts
```

This loads the TF.js model, runs inference on sampled positive/negative images, and checks classification accuracy (>=80%), geometry quality, and reflection prediction accuracy.

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
python training/train.py --epochs 80

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
Video frame -> Capture 320x320
            -> ML detection (multi-head CNN):
               - Presence: code detected?
               - Geometry: cx, cy, radius
               - Corners: 4 keypoints for homography
               - Orientation: sin/cos of rotation angle
               - Reflection: is the code mirrored?
            -> Score frame (sharpness + contrast)
            -> Perspective correction (homography from predicted corners)
            -> Flip if reflected
            -> Polar grid sampling
            -> RS decode -> Multi-frame consensus -> Result

Fallback: Hough circle detection + estimated corners (when model unavailable)
```

### Model Architecture

```
MobileNetV2 backbone (pretrained ImageNet, fine-tuned)
  -> GlobalAveragePooling2D
  -> Dense(256, relu) + Dropout(0.3)    [shared features]
  -> Dense(64, relu)  -> Dense(1, sigmoid)    [presence]
  -> Dense(128, relu) -> Dense(3, sigmoid)    [geometry: cx, cy, r]
  -> Dense(128, relu) -> Dense(64, relu) -> Dense(8, sigmoid)  [corners]
  -> Dense(64, relu)  -> Dense(2, tanh)       [orientation: sin, cos]
  -> Dense(64, relu)  -> Dense(1, sigmoid)    [reflection]

Input: 320x320x3, normalized to [0, 1]
Total outputs: 15 values
Exported to TF.js LayersModel format
```

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
| `scanFromVideo` | `(video: HTMLVideoElement, opts?: ScanOptions) => Promise<string>` | Scan video until decoded |
| `processFrame` | `(video: HTMLVideoElement, opts?) => ScanResult \| null` | Process a single frame |
| `loadModel` | `(path?: string) => Promise<void>` | Load TF.js detection model |
| `loadModelFromFiles` | `(json, specs, data) => Promise<void>` | Load model from buffers (Node.js) |
| `parseDetections` | `(data, shape, frameW, frameH, threshold?) => DetectionResult \| null` | Parse legacy YOLO output tensor into a detection |

### Types

```typescript
type DetectionResult = {
  cx: number;
  cy: number;
  r: number;
  corners?: Point[];      // 4 keypoints from model for direct homography
  confidence: number;
  angle?: number;         // rotation angle (radians)
  orientation?: number;   // orientation ring angle (radians)
  reflected?: boolean;    // true if code is mirror-reflected
};
```

### React

| Hook | Returns | Description |
|------|---------|-------------|
| `useCircularScanner` | `{ videoRef, result, scanning }` | Camera scanning hook with auto model loading, frame scoring, and consensus |

### Utilities

| Export | Description |
|--------|-------------|
| `MultiFrameConsensus` | Rolling buffer with weighted majority voting |
| `scoreFrame` | Frame quality scoring (sharpness + contrast) |
| `solveHomography` | 4-point perspective transform solver |
| `warpPerspective` | Apply perspective correction to canvas |
| `estimateCircleCorners` | Compute rotated bounding corners from detection (cx, cy, r, padding, angle) |
| `getOrCreateCanvas` | Cached canvas factory to avoid DOM thrashing |
| `toGrayscale` | Fast integer-arithmetic luminance conversion |
