/** Encode raw RGBA for session messages in tests (no DOM). */
export function pixelsToB64(pixels: Uint8ClampedArray): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(pixels).toString("base64");
  }
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < pixels.length; i += CHUNK) {
    binary += String.fromCharCode(...pixels.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function b64ToPixels(b64: string): Uint8ClampedArray {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function jpegFromVideo(
  video: HTMLVideoElement,
  maxWidth = 640,
): { jpeg: string; width: number; height: number } {
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 360;
  const scale = Math.min(1, maxWidth / srcW);
  const width = Math.max(2, Math.round(srcW * scale));
  const height = Math.max(2, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(video, 0, 0, width, height);
  return { jpeg: canvas.toDataURL("image/jpeg", 0.72), width, height };
}

export async function pixelsFromJpeg(
  jpeg: string,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const img = new Image();
  img.src = jpeg;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  return { pixels: data.data, width: img.width, height: img.height };
}
