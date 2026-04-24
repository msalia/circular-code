# Circular Code

A custom circular barcode system written in TypeScript. Encodes arbitrary text into concentric ring patterns, renders them as SVG or Canvas, and decodes them back from camera video using a combination of geometric detection and ML-assisted recognition.

Not Apple-compatible — this is an independent format with its own encoding, error correction, and scanning pipeline.

## Features

- **Encoding/Decoding** — Text to circular bit pattern and back, with configurable rings and segments
- **Adaptive ring layout** — Inner rings hold fewer segments proportional to circumference, preventing visual overlap
- **Reed-Solomon ECC** — Real GF(256) error correction that recovers data from damaged codes
- **Dual-color SVG rendering** — Primary color for data arcs, secondary color for non-data segments with configurable gap separation
- **Canvas rendering** — Generate codes for screen display
- **Rotation-aware dewarping** — Uses detected orientation angle to perspective-correct rotated codes before sampling
- **Frame scoring** — Laplacian sharpness + contrast scoring to pick the best video frames
- **Multi-frame consensus** — Weighted majority voting across frames for reliable scanning
- **ML-assisted detection** — YOLOv8-OBB model trained on synthetic data to locate codes with orientation
- **React hook** — `useCircularScanner()` for drop-in camera scanning in React apps

## Project Structure

```
src/
  core/           Encoder, decoder, bitstream, layout math
  ecc/            GF(256) arithmetic and Reed-Solomon codec
  render/         SVG and Canvas renderers
  scan/           Detection, sampling, perspective correction, frame scoring, consensus
  ml/             TensorFlow.js model loader and YOLO inference
  react/          useCircularScanner hook
  utils/          Canvas caching, image capture, grayscale conversion, math helpers
  types.ts        Shared type definitions
  index.ts        Public API exports

scripts/
  generateDataset.ts   Synthetic training data generator (Node + canvas)
  resolve-aliases.js   Post-build path alias resolver

training/
  train.py             YOLO model training and TF.js export (ultralytics)
  requirements.txt     Python dependencies
  setup_venv.sh        Virtual environment setup script

tests/                 Vitest unit and integration tests
models/yolov8n-obb.pt  Base YOLO model (downloaded once, reused across runs)
models/circular_code/  Trained TF.js model output
dataset/               Generated training images and labels (YOLO OBB format)
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

Runs 67+ tests covering bitstream, encoder/decoder roundtrips, Reed-Solomon error correction, perspective math, multi-frame consensus, SVG rendering, YOLO detection parsing, and end-to-end flows. An additional model inference test suite validates detection accuracy against the dataset.

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

The detector uses a YOLOv8-nano OBB (Oriented Bounding Box) model that locates circular codes in images and outputs bounding box + rotation angle. Training uses synthetic data generated from the real SVG renderer via the [ultralytics](https://docs.ultralytics.com/) toolkit.

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

Produces 10,000 images (8,000 positive + 2,000 negative) with an 85/15 train/val split in YOLO OBB format. Positive samples use the SVG renderer with randomly generated text (URLs, phrases, alphanumeric tokens, numbers), varied ring/segment configs, dual-color rendering, rotation, skew, scale, noise, lighting variation, and background clutter.

Output structure:
```
dataset/
  images/train/    Training images (320x320 PNG)
  images/val/      Validation images
  labels/train/    OBB labels: class_id x1 y1 x2 y2 x3 y3 x4 y4
  labels/val/      Validation labels (empty file = no object)
  data.yaml        YOLO dataset config
  manifest.json    Dataset metadata
```

### Step 2: Train the Model

```bash
python training/train.py
```

Trains a YOLOv8n-OBB model and auto-exports to TF.js format at `models/circular_code/`.

Options:

```bash
python training/train.py --epochs 40 --batch-size 32
python training/train.py --dataset ./my_dataset --output ./my_model
python training/train.py --resume runs/obb/runs/train/circular_code/weights/best.pt
python training/train.py --base-model yolov8s-obb.pt  # use a larger model
```

### Step 3: Re-export (Optional)

If you want to re-export a previously trained model to TF.js without retraining:

```python
from ultralytics import YOLO
YOLO("runs/obb/runs/train/circular_code/weights/best.pt").export(format="tfjs", imgsz=320)
```

### Step 4: Verify

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

### Scanning Pipeline

```
Video frame -> Capture 320x320
            -> Detect (YOLO OBB model if loaded, else Hough circles)
            -> Score frame (sharpness + contrast)
            -> Rotation-aware perspective correction (4-point homography using detected angle)
            -> Polar grid sampling
            -> RS decode -> Multi-frame consensus -> Result
```

### Model Architecture

```
YOLOv8n-OBB (Oriented Bounding Box)
Input: 320x320x3, normalized to [0, 1]
Output: [1, 6, N] — N detection candidates
  Per candidate: [cx, cy, w, h, angle, class_score]

Exported to TF.js GraphModel format (~9 MB)
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
| `renderSVG` | `(code: EncodedCode, opts?: SVGRenderOptions \| number) => string` | Render as SVG string with primary/secondary colors |
| `renderCanvas` | `(code: EncodedCode, size?: number) => HTMLCanvasElement` | Render to canvas element |

### Scanning

| Function | Signature | Description |
|----------|-----------|-------------|
| `scanFromVideo` | `(video: HTMLVideoElement, opts?: ScanOptions) => Promise<string>` | Scan video until decoded |
| `processFrame` | `(video: HTMLVideoElement, opts?) => ScanResult \| null` | Process a single frame |
| `loadModel` | `(path?: string) => Promise<void>` | Load TF.js detection model |
| `loadModelFromFiles` | `(json, specs, data) => Promise<void>` | Load model from buffers (Node.js) |
| `parseDetections` | `(data, shape, frameW, frameH, threshold?) => DetectionResult \| null` | Parse YOLO output tensor into a detection |

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
