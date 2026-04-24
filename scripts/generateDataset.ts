import type { EncodedCode } from "@/types";

import fs from "fs";
import path from "path";

import { type Canvas, type CanvasRenderingContext2D, createCanvas, loadImage } from "canvas";

import { encode } from "@/core/encoder";
import { renderSVG } from "@/render/svgRenderer";

const OUT_DIR = "./dataset";
const SIZE = 320;
const POSITIVE_COUNT = 8000;
const NEGATIVE_COUNT = 2000;
const VAL_RATIO = 0.15;

const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALNUM = ALPHA + "0123456789";
const URL_TLDS = ["com", "org", "net", "io", "dev", "co", "app"];
const URL_WORDS = [
  "app",
  "link",
  "go",
  "my",
  "get",
  "try",
  "use",
  "open",
  "run",
  "dev",
  "api",
  "hub",
  "lab",
  "bit",
  "one",
];

function randomChars(charset: string, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += charset[Math.floor(Math.random() * charset.length)];
  return s;
}

function randomString(): string {
  const type = Math.random();

  if (type < 0.25) {
    const tld = URL_TLDS[Math.floor(Math.random() * URL_TLDS.length)];
    const word = URL_WORDS[Math.floor(Math.random() * URL_WORDS.length)];
    const path = Math.random() > 0.5 ? `/${randomChars(ALNUM, randomInt(2, 6))}` : "";
    return `https://${word}.${tld}${path}`;
  }

  if (type < 0.5) {
    const wordCount = randomInt(2, 4);
    const words: string[] = [];
    for (let i = 0; i < wordCount; i++)
      words.push(randomChars(ALPHA.slice(0, 26), randomInt(2, 7)));
    return words.join(" ");
  }

  if (type < 0.75) {
    return randomChars(ALNUM, randomInt(4, 12));
  }

  return randomChars("0123456789", randomInt(4, 10));
}

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
  secColor: string,
): Promise<void> {
  const svg = renderSVG(code, {
    size: Math.round(codeSize),
    primary: fgColor,
    secondary: secColor,
  });
  const img = await loadImage(Buffer.from(svg));
  ctx.drawImage(img, cx - codeSize / 2, cy - codeSize / 2);
}

function addBackgroundNoise(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const numShapes = randomInt(0, 8);
  for (let i = 0; i < numShapes; i++) {
    ctx.fillStyle = randomColor(100, 240);
    ctx.globalAlpha = random(0.1, 0.4);
    const shapeType = randomInt(0, 2);
    if (shapeType === 0) {
      ctx.fillRect(random(0, w), random(0, h), random(10, 80), random(10, 80));
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

function addNoisePixels(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const noiseLevel = random(0, 25);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = Math.max(
      0,
      Math.min(255, imageData.data[i] + random(-noiseLevel, noiseLevel)),
    );
    imageData.data[i + 1] = Math.max(
      0,
      Math.min(255, imageData.data[i + 1] + random(-noiseLevel, noiseLevel)),
    );
    imageData.data[i + 2] = Math.max(
      0,
      Math.min(255, imageData.data[i + 2] + random(-noiseLevel, noiseLevel)),
    );
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyBrightnessVariation(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(random(0, w), random(0, h), random(0, w), random(0, h));
  gradient.addColorStop(0, `rgba(255,255,255,${random(0, 0.15)})`);
  gradient.addColorStop(1, `rgba(0,0,0,${random(0, 0.15)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rotatedCorners(
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number,
): [number, number, number, number, number, number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = w / 2;
  const hh = h / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  const result: number[] = [];
  for (const [dx, dy] of corners) {
    result.push(clamp01(cx + dx * cos - dy * sin));
    result.push(clamp01(cy + dx * sin + dy * cos));
  }
  return result as [number, number, number, number, number, number, number, number];
}

async function generatePositive(index: number, split: "train" | "val"): Promise<void> {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  const bgColor = randomColor(180, 255);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  addBackgroundNoise(ctx, SIZE, SIZE);

  const text = randomString();
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
  const secBright = randomInt(Math.min(fgBright + 40, 200), 230);
  const secColor = `rgb(${secBright},${secBright},${secBright})`;
  await drawCircularCode(ctx, code, 0, 0, codeSize, fgColor, secColor);
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

  const imgPath = path.join(OUT_DIR, "images", split, `${index}.png`);
  fs.writeFileSync(imgPath, canvas.toBuffer());

  const w = codeSize * scaleX;
  const h = codeSize * scaleY;

  // YOLO OBB format: class_id x1 y1 x2 y2 x3 y3 x4 y4 (pixel coords, normalized 0-1)
  const corners = rotatedCorners(cx / SIZE, cy / SIZE, w / SIZE, h / SIZE, rotation);
  const label = `0 ${corners.map((v) => v.toFixed(6)).join(" ")}`;
  const labelPath = path.join(OUT_DIR, "labels", split, `${index}.txt`);
  fs.writeFileSync(labelPath, label);
}

function generateNegative(index: number, split: "train" | "val"): void {
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

  const imgPath = path.join(OUT_DIR, "images", split, `${index}.png`);
  fs.writeFileSync(imgPath, canvas.toBuffer());

  // YOLO: empty label file = no objects
  const labelPath = path.join(OUT_DIR, "labels", split, `${index}.txt`);
  fs.writeFileSync(labelPath, "");
}

async function main(): Promise<void> {
  for (const split of ["train", "val"] as const) {
    fs.mkdirSync(path.join(OUT_DIR, "images", split), { recursive: true });
    fs.mkdirSync(path.join(OUT_DIR, "labels", split), { recursive: true });
  }

  const posValStart = Math.floor(POSITIVE_COUNT * (1 - VAL_RATIO));
  const negValStart = Math.floor(NEGATIVE_COUNT * (1 - VAL_RATIO));

  console.log(`Generating ${POSITIVE_COUNT} positive samples...`);
  for (let i = 0; i < POSITIVE_COUNT; i++) {
    const split = i < posValStart ? "train" : "val";
    await generatePositive(i, split);
    if ((i + 1) % 200 === 0) {
      console.log(`  ${i + 1}/${POSITIVE_COUNT}`);
    }
  }

  console.log(`Generating ${NEGATIVE_COUNT} negative samples...`);
  for (let i = 0; i < NEGATIVE_COUNT; i++) {
    const split = i < negValStart ? "train" : "val";
    generateNegative(POSITIVE_COUNT + i, split);
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${NEGATIVE_COUNT}`);
    }
  }

  // YOLO OBB data.yaml
  const dataYaml = `path: ${path.resolve(OUT_DIR)}
train: images/train
val: images/val

nc: 1
names:
  0: circular_code
`;
  fs.writeFileSync(path.join(OUT_DIR, "data.yaml"), dataYaml);

  const manifest = {
    total: POSITIVE_COUNT + NEGATIVE_COUNT,
    positive: POSITIVE_COUNT,
    negative: NEGATIVE_COUNT,
    imageSize: SIZE,
    labelFormat: "yolo-obb: class_id x1 y1 x2 y2 x3 y3 x4 y4",
    classMap: { 0: "circular_code" },
    trainCount: posValStart + negValStart,
    valCount: POSITIVE_COUNT - posValStart + (NEGATIVE_COUNT - negValStart),
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Done. ${POSITIVE_COUNT + NEGATIVE_COUNT} samples written to ${OUT_DIR}/`);
  console.log(`  Train: ${manifest.trainCount}, Val: ${manifest.valCount}`);
}

main();
