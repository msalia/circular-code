type CachedCanvas = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

const cache = new Map<string, CachedCanvas>();

/** Returns a cached canvas and context of the given size, creating one if needed. */
export function getOrCreateCanvas(
  size: number,
  key = "default",
  ctxOptions?: CanvasRenderingContext2DSettings,
): CachedCanvas {
  let entry = cache.get(key);

  if (!entry || entry.canvas.width !== size || entry.canvas.height !== size) {
    const canvas = entry?.canvas ?? document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", ctxOptions);
    if (!ctx) {
      throw new Error(`Unable to get canvas context for "${key}"`);
    }
    entry = { canvas, ctx };
    cache.set(key, entry);
  }

  return entry;
}
