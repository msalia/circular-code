# Circular Code

A custom circular barcode system written in TypeScript. Encodes arbitrary text into concentric ring patterns, renders them as SVG or Canvas, and decodes them back from camera video using a combination of geometric detection and ML-assisted recognition.

Not Apple-compatible — this is an independent format with its own encoding, error correction, and scanning pipeline.

## Features

- **Encoding/Decoding** — Text to circular bit pattern and back, with configurable rings and segments
- **Reed-Solomon ECC** — Real GF(256) error correction that recovers data from damaged codes
- **SVG & Canvas rendering** — Generate codes for print or screen
- **Perspective correction** — Homography-based rectification for codes viewed at an angle
- **Frame scoring** — Laplacian sharpness + contrast scoring to pick the best video frames
- **Multi-frame consensus** — Weighted majority voting across frames for reliable scanning
- **ML-assisted detection** — CNN trained on synthetic data to locate codes in images
- **React hook** — `useCircularScanner()` for drop-in camera scanning in React apps

## Project Structure

```
src/
  core/           Encoder, decoder, bitstream, layout math
  ecc/            GF(256) arithmetic and Reed-Solomon codec
  render/         SVG and Canvas renderers
  scan/           Detection, sampling, perspective correction, frame scoring, consensus
  ml/             TensorFlow.js model loader and inference
  react/          useCircularScanner hook
  utils/          Image capture, math helpers
  types.ts        Shared type definitions
  index.ts        Public API exports

scripts/
  generateDataset.ts   Synthetic training data generator (Node + canvas)
  resolve-aliases.js   Post-build path alias resolver

training/
  train.py             GPU-accelerated model training (Python/TensorFlow + Metal)
  export_tfjs.py       Keras to TF.js model conversion with compatibility patches
  requirements.txt     Python dependencies
  setup_venv.sh        Virtual environment setup script

tests/                 Vitest unit and integration tests
models/circular_code/  Trained TF.js model (model.json + weights)
dataset/               Generated training images and labels (gitignored)
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

Runs all 30 tests (bitstream, encoder/decoder roundtrips, Reed-Solomon error correction, perspective math, multi-frame consensus, end-to-end).

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

const svg = renderSVG(code, 300);
document.getElementById("container").innerHTML = svg;
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

The detector is a CNN (107K params, 320x320 input) that locates circular codes in images and outputs bounding box + rotation angle. Training uses synthetic data generated from the real encoder.

### Prerequisites

Python 3.9+ with TensorFlow and Metal GPU support (macOS):

```bash
pip3 install tensorflow tensorflow-metal tensorflowjs Pillow numpy
```

Or use the provided setup script:

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

Produces 2,500 images (2,000 positive + 500 negative) in `dataset/` at 320x320. Positive samples use the real encoder with random text, rotation, skew, scale, noise, lighting variation, and background clutter. Labels are in YOLO-style format: `class cx cy w h sin(angle) cos(angle)`.

### Step 2: Train the Model

```bash
python3 training/train.py
```

Trains for 20 epochs on Metal GPU (~2s/epoch). The trained model is automatically exported to TF.js format at `models/circular_code/model.json`.

Options:

```bash
python3 training/train.py --epochs 50 --batch-size 64 --lr 0.001
python3 training/train.py --dataset ./my_dataset --output ./my_model
```

Training includes early stopping (patience=10) and learning rate reduction on plateau.

### Step 3: Re-export (Optional)

If you modify the model after training or want to re-run the Keras-to-TF.js conversion:

```bash
python3 training/export_tfjs.py \
  --keras-model ./models/circular_code/keras_model.keras \
  --output ./models/circular_code
```

### Step 4: Verify

Confirm the model loads in TF.js:

```bash
node -e "
const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');

async function test() {
  const dir = path.resolve('./models/circular_code');
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf-8'));
  const buf = fs.readFileSync(path.join(dir, j.weightsManifest[0].paths[0]));
  const wd = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const model = await tf.loadLayersModel(tf.io.fromMemory({
    modelTopology: j.modelTopology,
    weightSpecs: j.weightsManifest[0].weights,
    weightData: wd,
  }));
  console.log('Model loaded. Input:', model.inputs[0].shape, 'Output:', model.outputs[0].shape);
}
test();
"
```

Expected output: `Model loaded. Input: [ null, 320, 320, 3 ] Output: [ null, 7 ]`

## End-to-End Cheat Sheet

```bash
# Install, build, and test the TypeScript library
npm install
npm run build
npm test

# Generate synthetic training data
npm run generate-dataset

# Train the ML detector on GPU and export to TF.js
pip3 install tensorflow tensorflow-metal tensorflowjs Pillow numpy
python3 training/train.py --epochs 20

# Verify the trained model loads
npm run build
npm test
```

## Architecture

### Encoding Pipeline

```
Text -> UTF-8 bytes -> [version, length, ...data] header
     -> Reed-Solomon ECC (GF(256), configurable redundancy)
     -> Bit stream -> Mapped to ring/segment grid
```

### Scanning Pipeline

```
Video frame -> Capture -> Normalize to 320x320
            -> Detect (ML model if loaded, else Hough circles)
            -> Score frame (sharpness + contrast)
            -> Perspective correction (4-point homography warp)
            -> Polar grid sampling
            -> RS decode -> Multi-frame consensus -> Result
```

### Model Architecture

```
Input: 320x320x3
Conv2D(16, 3x3, stride=2) -> BatchNorm -> ReLU     [160x160x16]
Conv2D(32, 3x3, stride=2) -> BatchNorm -> ReLU     [80x80x32]
Conv2D(64, 3x3, stride=2) -> BatchNorm -> ReLU     [40x40x64]
Conv2D(128, 3x3, stride=2) -> BatchNorm -> ReLU    [20x20x128]
GlobalAveragePooling2D                               [128]
Dropout(0.3) -> Dense(64, ReLU) -> Dense(7, linear)

Output: [class_logit, cx, cy, w, h, sin(angle), cos(angle)]
Loss: sigmoid_cross_entropy(class) + 5*MSE(bbox) + 2*MSE(angle)
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
| `renderSVG` | `(code: EncodedCode, size?: number) => string` | Render as SVG string |
| `renderCanvas` | `(code: EncodedCode, size?: number) => HTMLCanvasElement` | Render to canvas element |

### Scanning

| Function | Signature | Description |
|----------|-----------|-------------|
| `scanFromVideo` | `(video: HTMLVideoElement, opts?: ScanOptions) => Promise<string>` | Scan video until decoded |
| `processFrame` | `(video: HTMLVideoElement, opts?) => ScanResult \| null` | Process a single frame |
| `loadModel` | `(url?: string) => Promise<void>` | Load TF.js detection model (browser) |
| `loadModelFromFiles` | `(json, specs, data) => Promise<void>` | Load model from buffers (Node.js) |

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
