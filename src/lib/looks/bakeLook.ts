import type { Mapping } from "../pipeline/mapping";
import type { LookId, LookSpec } from "./types";
import { clamp } from "../math/vec";

export const LOOKS: { id: Exclude<LookId, "custom">; label: string; blurb: string }[] = [
  { id: "surface-id", label: "Surface IDs", blurb: "Each mapped plane/object gets a solid gel color." },
  { id: "grid", label: "World grid", blurb: "Metric grid on the recovered surfaces." },
  { id: "normals", label: "Normals", blurb: "RGB = world normal. Good sanity check." },
  { id: "caustic", label: "Caustic flow", blurb: "Baked from the mapping. Not a live model." },
  { id: "depth", label: "Depth gel", blurb: "Near/far color from mapped Z." },
];

const SURFACE_COLORS: Array<[number, number, number]> = [
  [40, 210, 190],
  [240, 170, 60],
  [120, 140, 255],
  [230, 80, 120],
  [90, 220, 110],
];

export function specFromLookId(id: LookId): LookSpec {
  const mode =
    id === "grid" ? "grid" :
    id === "caustic" ? "water" :
    id === "depth" ? "scan" :
    "gel";
  return { id, prompt: id, hue: 172, freq: 3.4, mode };
}

/**
 * Bake a projector-resolution image from the mapping.
 * Generation happens after mapping — not a realtime model.
 */
export function bakeLook(
  mapping: Mapping,
  look: LookId | LookSpec,
  timeSec = 0,
): Uint8ClampedArray {
  const spec: LookSpec = typeof look === "string" ? specFromLookId(look) : look;
  const w = mapping.projectorWidth;
  const h = mapping.projectorHeight;
  const pixels = new Uint8ClampedArray(w * h * 4);
  const byProj = new Map<number, (typeof mapping.points)[number]>();
  for (const p of mapping.points) {
    const j = Math.round(p.projector[1]) * w + Math.round(p.projector[0]);
    byProj.set(j, p);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = byProj.get(y * w + x);
      pixels[i + 3] = 255;
      if (!p) {
        pixels[i] = 6;
        pixels[i + 1] = 7;
        pixels[i + 2] = 9;
        continue;
      }
      const [wx, wy, wz] = p.world;
      const color = shade(spec, p.objectId, wx, wy, wz, timeSec);
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  }
  fillHoles(pixels, w, h);
  return pixels;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [clamp(f(0) * 255, 0, 255), clamp(f(8) * 255, 0, 255), clamp(f(4) * 255, 0, 255)];
}

function shade(
  spec: LookSpec,
  objectId: number,
  x: number,
  y: number,
  z: number,
  t: number,
): [number, number, number] {
  const base = SURFACE_COLORS[objectId % SURFACE_COLORS.length] ?? [200, 200, 200];
  if (spec.id === "surface-id") return base;
  if (spec.id === "normals") {
    return [
      clamp((x + 1) * 80, 0, 255),
      clamp((y + 1) * 90, 0, 255),
      clamp(z * 40, 0, 255),
    ];
  }
  if (spec.id === "depth" || spec.mode === "scan") {
    const d = clamp((z - 1.5) / 2.5, 0, 1);
    const scan = Math.abs(Math.sin(y * spec.freq + t));
    const [r, g, b] = hsl(spec.hue, 0.55, 0.35 + 0.35 * d);
    const k = spec.mode === "scan" ? 0.45 + 0.55 * scan : 1;
    return [r * k, g * k, b * k];
  }
  if (spec.id === "grid" || spec.mode === "grid") {
    const gx = Math.abs(x * spec.freq) % 1;
    const gy = Math.abs(y * spec.freq) % 1;
    const line = gx < 0.07 || gy < 0.07;
    return line ? hsl(spec.hue, 0.4, 0.85) : [16, 18, 24];
  }
  const wave = Math.sin(x * spec.freq + t) * Math.cos(z * spec.freq * 0.8 - t * 0.7);
  const c = clamp(0.35 + 0.65 * (0.5 + 0.5 * wave), 0, 1);
  if (spec.mode === "fire") {
    return [
      clamp(180 + 75 * c, 0, 255),
      clamp(40 + 90 * c, 0, 255),
      clamp(20 + 30 * (1 - c), 0, 255),
    ];
  }
  if (spec.mode === "water" || spec.id === "caustic") {
    const [r, g, b] = hsl(spec.hue, 0.55, 0.28 + 0.42 * c);
    return [r, g, b];
  }
  const [r, g, b] = hsl(spec.hue, 0.5, 0.32 + 0.28 * c);
  return [r, g, b];
}

function fillHoles(pixels: Uint8ClampedArray, w: number, h: number): void {
  const copy = pixels.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (copy[i]! + copy[i + 1]! + copy[i + 2]! > 24) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = ((y + dy) * w + (x + dx)) * 4;
          const s = copy[j]! + copy[j + 1]! + copy[j + 2]!;
          if (s < 24) continue;
          r += copy[j]!;
          g += copy[j + 1]!;
          b += copy[j + 2]!;
          n++;
        }
      }
      if (n >= 3) {
        pixels[i] = r / n;
        pixels[i + 1] = g / n;
        pixels[i + 2] = b / n;
      }
    }
  }
}

export function pixelsToPngDataUrl(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  img.data.set(pixels);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
