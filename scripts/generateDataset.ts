import { createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D } from "canvas";
import fs from "fs";
import path from "path";
import { encode } from "@/core/encoder";
import { renderSVG } from "@/render/svgRenderer";
import type { EncodedCode } from "@/types";

const OUT_DIR = "./dataset";
const SIZE = 320;
const POSITIVE_COUNT = 2000;
const NEGATIVE_COUNT = 500;

const SAMPLE_STRINGS = [
  "hello world",
  "https://example.com",
  "test123",
  "circular",
  "ABCDEF",
  "scan me",
  "code 42",
  "data",
  "link",
  "open",
  "go",
  "ok",
  "hi",
  "12345678",
  "qr alt",
  "NC27",
];

function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max + 1));
}

function randomColor(minBright: number, maxBright: number): string {
  const r = randomInt(minBright, maxBright);
  const g = randomInt(minBright, maxBright);
  const b = randomInt(minBright, maxBright);
  return `rgb(${r},${g},${b})`;
}

async function drawCircularCode(
  ctx: CanvasRenderingContext2D,
  code: EncodedCode,
  cx: number,
  cy: number,
  codeSize: number,
  fgColor: string,
): Promise<void> {
  const svg = renderSVG(code, {
    size: Math.round(codeSize),
    primary: fgColor,
    secondary: "none",
  });
  const img = await loadImage(Buffer.from(svg));
  ctx.drawImage(img, cx - codeSize / 2, cy - codeSize / 2);
}

function addBackgroundNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const numShapes = randomInt(0, 8);
  for (let i = 0; i < numShapes; i++) {
    ctx.fillStyle = randomColor(100, 240);
    ctx.globalAlpha = random(0.1, 0.4);
    const shapeType = randomInt(0, 2);
    if (shapeType === 0) {
      ctx.fillRect(
        random(0, w),
        random(0, h),
        random(10, 80),
        random(10, 80),
      );
    } else if (shapeType === 1) {
      ctx.beginPath();
      ctx.arc(random(0, w), random(0, h), random(5, 40), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(random(0, w), random(0, h));
      ctx.lineTo(random(0, w), random(0, h));
      ctx.lineTo(random(0, w), random(0, h));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function addNoisePixels(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const noiseLevel = random(0, 25);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = Math.max(
      0,
      Math.min(255, imageData.data[i] + random(-noiseLevel, noiseLevel)),
    );
    imageData.data[i + 1] = Math.max(
      0,
      Math.min(
        255,
        imageData.data[i + 1] + random(-noiseLevel, noiseLevel),
      ),
    );
    imageData.data[i + 2] = Math.max(
      0,
      Math.min(
        255,
        imageData.data[i + 2] + random(-noiseLevel, noiseLevel),
      ),
    );
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyBrightnessVariation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const gradient = ctx.createLinearGradient(
    random(0, w),
    random(0, h),
    random(0, w),
    random(0, h),
  );
  gradient.addColorStop(0, `rgba(255,255,255,${random(0, 0.15)})`);
  gradient.addColorStop(1, `rgba(0,0,0,${random(0, 0.15)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

async function generatePositive(index: number): Promise<void> {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  const bgColor = randomColor(180, 255);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  addBackgroundNoise(ctx, SIZE, SIZE);

  const text = SAMPLE_STRINGS[randomInt(0, SAMPLE_STRINGS.length - 1)];
  const code = encode(text, {
    rings: randomInt(3, 6),
    segmentsPerRing: [32, 48, 64][randomInt(0, 2)],
    eccBytes: 16,
  });

  const codeSize = random(100, 220);
  const cx = SIZE / 2 + random(-40, 40);
  const cy = SIZE / 2 + random(-40, 40);
  const rotation = random(0, Math.PI * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  const skewX = random(-0.15, 0.15);
  const skewY = random(-0.15, 0.15);
  const scaleX = random(0.85, 1.15);
  const scaleY = random(0.85, 1.15);
  ctx.transform(scaleX, skewY, skewX, scaleY, 0, 0);

  const fgBright = randomInt(0, 60);
  const fgColor = `rgb(${fgBright},${fgBright},${fgBright})`;
  await drawCircularCode(ctx, code, 0, 0, codeSize, fgColor);
  ctx.restore();

  applyBrightnessVariation(ctx, SIZE, SIZE);
  addNoisePixels(ctx, SIZE, SIZE);

  if (random(0, 1) > 0.7) {
    const tmpCanvas = createCanvas(SIZE, SIZE);
    const tmpCtx = tmpCanvas.getContext("2d");
    (tmpCtx as any).filter = `blur(${random(0.5, 2)}px)`;
    tmpCtx.drawImage(canvas, 0, 0);
    ctx.drawImage(tmpCanvas, 0, 0);
  }

  const imgPath = path.join(OUT_DIR, "images", `${index}.png`);
  fs.writeFileSync(imgPath, canvas.toBuffer());

  const x = cx / SIZE;
  const y = cy / SIZE;
  const w = (codeSize * scaleX) / SIZE;
  const h = (codeSize * scaleY) / SIZE;
  const sinA = Math.sin(rotation);
  const cosA = Math.cos(rotation);

  const label = `1 ${x.toFixed(6)} ${y.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)} ${sinA.toFixed(6)} ${cosA.toFixed(6)}`;
  const labelPath = path.join(OUT_DIR, "labels", `${index}.txt`);
  fs.writeFileSync(labelPath, label);
}

function generateNegative(index: number): void {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  const bgColor = randomColor(150, 255);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  addBackgroundNoise(ctx, SIZE, SIZE);

  const numDistractors = randomInt(2, 10);
  for (let i = 0; i < numDistractors; i++) {
    ctx.strokeStyle = randomColor(0, 100);
    ctx.lineWidth = random(1, 4);
    ctx.beginPath();
    ctx.arc(
      random(0, SIZE),
      random(0, SIZE),
      random(10, 60),
      random(0, Math.PI * 2),
      random(0, Math.PI * 2),
    );
    ctx.stroke();
  }

  for (let i = 0; i < randomInt(0, 5); i++) {
    ctx.strokeStyle = randomColor(0, 150);
    ctx.lineWidth = random(1, 3);
    ctx.beginPath();
    ctx.moveTo(random(0, SIZE), random(0, SIZE));
    ctx.lineTo(random(0, SIZE), random(0, SIZE));
    ctx.stroke();
  }

  addNoisePixels(ctx, SIZE, SIZE);

  const imgPath = path.join(OUT_DIR, "images", `${index}.png`);
  fs.writeFileSync(imgPath, canvas.toBuffer());

  const label = `0 0 0 0 0 0 0`;
  const labelPath = path.join(OUT_DIR, "labels", `${index}.txt`);
  fs.writeFileSync(labelPath, label);
}

async function main(): Promise<void> {
  fs.mkdirSync(path.join(OUT_DIR, "images"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "labels"), { recursive: true });

  console.log(`Generating ${POSITIVE_COUNT} positive samples...`);
  for (let i = 0; i < POSITIVE_COUNT; i++) {
    await generatePositive(i);
    if ((i + 1) % 200 === 0) {
      console.log(`  ${i + 1}/${POSITIVE_COUNT}`);
    }
  }

  console.log(`Generating ${NEGATIVE_COUNT} negative samples...`);
  for (let i = 0; i < NEGATIVE_COUNT; i++) {
    generateNegative(POSITIVE_COUNT + i);
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${NEGATIVE_COUNT}`);
    }
  }

  const manifest = {
    total: POSITIVE_COUNT + NEGATIVE_COUNT,
    positive: POSITIVE_COUNT,
    negative: NEGATIVE_COUNT,
    imageSize: SIZE,
    labelFormat: "class cx cy w h sin(angle) cos(angle)",
    classMap: { 0: "no_code", 1: "circular_code" },
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(
    `Done. ${POSITIVE_COUNT + NEGATIVE_COUNT} samples written to ${OUT_DIR}/`,
  );
}

main();
