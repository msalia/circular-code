# Circular Code

A custom circular barcode system written in TypeScript. Encodes arbitrary text into concentric ring patterns, renders them as SVG or Canvas, and decodes them back from camera video using a combination of geometric detection and ML-assisted recognition.

Not Apple-compatible — this is an independent format with its own encoding, error correction, and scanning pipeline.

## Features

- **Encoding/Decoding** — Text to circular bit pattern and back, with configurable rings and segments
- **Adaptive ring layout** — Inner rings hold fewer segments proportional to circumference, preventing visual overlap
- **Reed-Solomon ECC** — Real GF(256) error correction that recovers data from damaged codes
- **Dual-color SVG rendering** — Primary color for data arcs, secondary color for non-data segments with configurable gap separation
- **Canvas rendering** — Generate codes for screen display
- **Perspective correction** — Homography-based rectification for codes viewed at an angle
- **Frame scoring** — Laplacian sharpness + contrast scoring to pick the best video frames
- **Multi-frame consensus** — Weighted majority voting across frames for reliable scanning
- **ML-assisted detection** — MobileNetV2-based CNN trained on synthetic data to locate codes in images
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
models/circular_code/  Trained TF.js model output (gitignored, generate via training pipeline)
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

The detector uses a MobileNetV2 backbone (pretrained on ImageNet) with a custom detection head that locates circular codes in images and outputs bounding box + rotation angle. Training uses synthetic data generated from the real SVG renderer.

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

Produces 5,000 images (4,000 positive + 1,000 negative) in `dataset/` at 320x320. Positive samples use the SVG renderer with randomly generated text (URLs, phrases, alphanumeric tokens, numbers), varied ring/segment configs, rotation, skew, scale, noise, lighting variation, and background clutter. Labels are in YOLO-style format: `class cx cy w h sin(angle) cos(angle)`.

### Step 2: Train the Model

```bash
python3 training/train.py
```

Trains in two phases on Metal GPU:
1. **Phase 1** — Head training with frozen MobileNetV2 backbone (20 epochs)
2. **Phase 2** — Fine-tuning top backbone layers at 1/10 learning rate (20 epochs)

The trained model is exported to TF.js format at `models/circular_code/model.json`.

Options:

```bash
python3 training/train.py --epochs 40 --batch-size 32 --lr 0.001
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

Expected output: `Model loaded. Input: [ null, 224, 224, 3 ] Output: [ null, 7 ]`

## End-to-End Cheat Sheet

```bash
# Install, build, and test the TypeScript library
npm install
npm run build
npm test

# Generate synthetic training data
npm run generate-dataset

# Set up training environment and generate model
bash training/setup_venv.sh
source training/venv/bin/activate
npm run generate-dataset
python3 training/train.py --epochs 40
python3 training/export_tfjs.py
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
Video frame -> Capture -> Normalize to 224x224
            -> Detect (ML model if loaded, else Hough circles)
            -> Score frame (sharpness + contrast)
            -> Perspective correction (4-point homography warp)
            -> Polar grid sampling
            -> RS decode -> Multi-frame consensus -> Result
```

### Model Architecture

```
Input: 224x224x3
MobileNetV2 backbone (ImageNet pretrained, top 30 layers fine-tuned)
GlobalAveragePooling2D                               [1280]
Dropout(0.3) -> Dense(128, ReLU) -> Dropout(0.2) -> Dense(7, linear)

Output: [class_logit, cx, cy, w, h, sin(angle), cos(angle)]
Loss: sigmoid_cross_entropy(class) + 2*MSE(bbox) + 1*MSE(angle)
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
