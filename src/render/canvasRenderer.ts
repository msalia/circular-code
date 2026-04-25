import type { EncodedCode } from "@/types";

import { renderSVG } from "@/render/svgRenderer";

/** Renders an encoded circular code onto an HTML canvas element. */
export function renderCanvas(code: EncodedCode, size = 300): HTMLCanvasElement {
  const svg = renderSVG(code, { size, primary: "#000000", secondary: "#d0d0d0" });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas rendering context is unavailable.");
  }

  const img = new Image();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
  };
  img.src = url;

  return canvas;
}
