import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";

const OUT_DIR = "./dataset";
const SIZE = 320;

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function drawCircularCode(ctx: any, cx: number, cy: number, r: number) {
  ctx.strokeStyle = "black";
  ctx.lineWidth = r * 0.1;

  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * 2 * Math.PI;

    if (Math.random() > 0.5) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle, angle + 0.1);
      ctx.stroke();
    }
  }
}

function applyAugmentations(ctx: any, canvas: any) {
  // perspective-ish skew
  ctx.setTransform(1, random(-0.2, 0.2), random(-0.2, 0.2), 1, 0, 0);

  // lighting
  ctx.globalAlpha = random(0.7, 1);

  // blur simulation (cheap)
  ctx.shadowBlur = random(0, 5);
}

function generateOne(index: number) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = `rgb(${random(200, 255)},${random(200, 255)},${random(200, 255)})`;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2 + random(-20, 20);
  const cy = SIZE / 2 + random(-20, 20);
  const r = random(60, 100);

  const angle = random(0, Math.PI * 2);

  ctx.save();

  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-cx, -cy);

  applyAugmentations(ctx, canvas);
  drawCircularCode(ctx, cx, cy, r);

  ctx.restore();

  // save image
  const imgPath = path.join(OUT_DIR, "images", `${index}.png`);
  fs.writeFileSync(imgPath, canvas.toBuffer());

  // YOLO label + angle
  const x = cx / SIZE;
  const y = cy / SIZE;
  const w = (r * 2) / SIZE;
  const h = (r * 2) / SIZE;

  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  const label = `0 ${x} ${y} ${w} ${h} ${sin} ${cos}`;

  const labelPath = path.join(OUT_DIR, "labels", `${index}.txt`);
  fs.writeFileSync(labelPath, label);
}

function main() {
  fs.mkdirSync(path.join(OUT_DIR, "images"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "labels"), { recursive: true });

  for (let i = 0; i < 2000; i++) {
    generateOne(i);
  }
}

main();
