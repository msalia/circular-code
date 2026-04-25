import type { EncodedCode } from "@/types";

import fs from "fs";
import path from "path";

import { type Canvas, type CanvasRenderingContext2D, createCanvas, loadImage } from "canvas";

import { encode } from "@/core/encoder";
import { renderSVG } from "@/render/svgRenderer";

const OUT_DIR = "./dataset";
const SIZE = 320;
const POSITIVE_COUNT = 8000;
const NEGATIVE_COUNT = 4000;
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

type PerspectiveTransform = {
  matrix: [number, number, number, number, number, number];
  corners: [number, number][];
};

function buildPerspectiveTransform(
  cx: number,
  cy: number,
  codeSize: number,
  rotation: number,
  pitchDeg: number,
  yawDeg: number,
): PerspectiveTransform {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const half = codeSize / 2;
  const localCorners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];

  const focalLength = SIZE * 2.5;

  const projected: [number, number][] = localCorners.map(([lx, ly]) => {
    let x = lx * cosR - ly * sinR;
    let y = lx * sinR + ly * cosR;
    let z = 0;

    const x2 = x;
    const y2 = y * cosP - z * sinP;
    const z2 = y * sinP + z * cosP;

    const x3 = x2 * cosY + z2 * sinY;
    const y3 = y2;
    const z3 = -x2 * sinY + z2 * cosY;

    const depth = focalLength + z3;
    const scale = focalLength / Math.max(depth, 1);
    return [cx + x3 * scale, cy + y3 * scale];
  });

  const scaleX = cosY * cosR;
  const skewX = -cosY * sinR;
  const skewY = cosP * sinR + sinP * sinY * cosR;
  const scaleY = cosP * cosR - sinP * sinY * sinR;

  return {
    matrix: [scaleX, skewY, skewX, scaleY, 0, 0],
    corners: projected,
  };
}

export type PositiveLabel = {
  corners: [number, number, number, number, number, number, number, number];
};

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
  const pitchDeg = random(-30, 30);
  const yawDeg = random(-30, 30);

  const { matrix, corners } = buildPerspectiveTransform(
    cx,
    cy,
    codeSize,
    rotation,
    pitchDeg,
    yawDeg,
  );

  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);

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

  // Compute bounding box from corners
  const xs = corners.map(([x]) => x / SIZE);
  const ys = corners.map(([, y]) => y / SIZE);
  const bboxCx = clamp01((Math.min(...xs) + Math.max(...xs)) / 2);
  const bboxCy = clamp01((Math.min(...ys) + Math.max(...ys)) / 2);
  const bboxW = clamp01(Math.max(...xs) - Math.min(...xs));
  const bboxH = clamp01(Math.max(...ys) - Math.min(...ys));

  // YOLO-Pose: class cx cy w h kp1x kp1y kp1v kp2x kp2y kp2v kp3x kp3y kp3v kp4x kp4y kp4v
  const kps = corners
    .map(([x, y]) => `${clamp01(x / SIZE).toFixed(6)} ${clamp01(y / SIZE).toFixed(6)} 2`)
    .join(" ");
  const labelLine = `0 ${bboxCx.toFixed(6)} ${bboxCy.toFixed(6)} ${bboxW.toFixed(6)} ${bboxH.toFixed(6)} ${kps}`;
  const labelPath = path.join(OUT_DIR, "labels", split, `${index}.txt`);
  fs.writeFileSync(labelPath, labelLine);
}

function drawConcentricCircles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxR: number,
): void {
  const numRings = randomInt(3, 7);
  const ringWidth = maxR / numRings;
  ctx.strokeStyle = randomColor(0, 80);
  ctx.lineWidth = random(2, 5);
  for (let i = 1; i <= numRings; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, i * ringWidth, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBullseye(ctx: CanvasRenderingContext2D, cx: number, cy: number, maxR: number): void {
  const numRings = randomInt(3, 6);
  const ringWidth = maxR / numRings;
  for (let i = numRings; i >= 1; i--) {
    ctx.fillStyle = i % 2 === 0 ? randomColor(180, 255) : randomColor(0, 80);
    ctx.beginPath();
    ctx.arc(cx, cy, i * ringWidth, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpiral(ctx: CanvasRenderingContext2D, cx: number, cy: number, maxR: number): void {
  ctx.strokeStyle = randomColor(0, 80);
  ctx.lineWidth = random(2, 4);
  ctx.beginPath();
  const turns = random(3, 6);
  for (let t = 0; t < turns * Math.PI * 2; t += 0.1) {
    const r = (t / (turns * Math.PI * 2)) * maxR;
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawClockFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, maxR: number): void {
  ctx.strokeStyle = randomColor(0, 80);
  ctx.lineWidth = random(2, 4);
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const innerR = maxR * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
    ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
    ctx.stroke();
  }

  ctx.fillStyle = randomColor(0, 80);
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.05, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 2; i++) {
    const angle = random(0, Math.PI * 2);
    const len = random(0.4, 0.8) * maxR;
    ctx.lineWidth = random(2, 5);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + len * Math.cos(angle), cy + len * Math.sin(angle));
    ctx.stroke();
  }
}

function drawDashedRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxR: number,
): void {
  const numRings = randomInt(3, 6);
  const ringWidth = maxR / numRings;
  ctx.strokeStyle = randomColor(0, 80);
  ctx.lineWidth = random(2, 5);
  for (let i = 1; i <= numRings; i++) {
    const r = i * ringWidth;
    const numDashes = randomInt(4, 12);
    const dashAngle = (Math.PI * 2) / numDashes;
    for (let d = 0; d < numDashes; d++) {
      const start = d * dashAngle + random(0, 0.1);
      const end = start + dashAngle * random(0.3, 0.7);
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.stroke();
    }
  }
}

function drawCenterDotWithRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxR: number,
): void {
  ctx.fillStyle = randomColor(0, 60);
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = randomColor(0, 80);
  ctx.lineWidth = random(2, 4);
  const numRings = randomInt(2, 5);
  for (let i = 1; i <= numRings; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (i / numRings) * maxR, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawQRLikeGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, maxR: number): void {
  const gridSize = randomInt(5, 10);
  const cellSize = (maxR * 2) / gridSize;
  const startX = cx - maxR;
  const startY = cy - maxR;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (Math.random() > 0.5) {
        ctx.fillStyle = randomColor(0, 60);
        ctx.fillRect(startX + col * cellSize, startY + row * cellSize, cellSize, cellSize);
      }
    }
  }
  ctx.strokeStyle = randomColor(0, 60);
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, maxR * 2, maxR * 2);
}

const HARD_NEGATIVE_TYPES = [
  drawConcentricCircles,
  drawBullseye,
  drawSpiral,
  drawClockFace,
  drawDashedRings,
  drawCenterDotWithRings,
  drawQRLikeGrid,
];

function generateNegative(index: number, split: "train" | "val"): void {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  const bgColor = randomColor(150, 255);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  addBackgroundNoise(ctx, SIZE, SIZE);

  const cx = SIZE / 2 + random(-40, 40);
  const cy = SIZE / 2 + random(-40, 40);
  const maxR = random(40, 110);

  const drawFn = HARD_NEGATIVE_TYPES[randomInt(0, HARD_NEGATIVE_TYPES.length - 1)];
  drawFn(ctx, cx, cy, maxR);

  if (random(0, 1) > 0.5) {
    for (let i = 0; i < randomInt(1, 4); i++) {
      ctx.strokeStyle = randomColor(0, 150);
      ctx.lineWidth = random(1, 3);
      ctx.beginPath();
      ctx.moveTo(random(0, SIZE), random(0, SIZE));
      ctx.lineTo(random(0, SIZE), random(0, SIZE));
      ctx.stroke();
    }
  }

  addNoisePixels(ctx, SIZE, SIZE);

  const imgPath = path.join(OUT_DIR, "images", split, `${index}.png`);
  fs.writeFileSync(imgPath, canvas.toBuffer());

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

  const dataYaml = `path: ${path.resolve(OUT_DIR)}
train: images/train
val: images/val

kpt_shape: [4, 3]

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
    labelFormat:
      "yolo-pose: class cx cy w h kp1x kp1y kp1v kp2x kp2y kp2v kp3x kp3y kp3v kp4x kp4y kp4v",
    classMap: { 0: "circular_code" },
    keypointNames: ["top_left", "top_right", "bottom_right", "bottom_left"],
    trainCount: posValStart + negValStart,
    valCount: POSITIVE_COUNT - posValStart + (NEGATIVE_COUNT - negValStart),
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Done. ${POSITIVE_COUNT + NEGATIVE_COUNT} samples written to ${OUT_DIR}/`);
  console.log(`  Train: ${manifest.trainCount}, Val: ${manifest.valCount}`);
}

main();
