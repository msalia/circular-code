export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to capture video frame: canvas context unavailable.");
  }

  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}
