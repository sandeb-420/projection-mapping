import { fromGray, luminance, type GrayPattern } from "../patterns/grayCode";

export interface CorrespondenceMap {
  width: number;
  height: number;
  /** Projector X for each camera pixel, or -1 if invalid. */
  projX: Int16Array;
  projY: Int16Array;
  confidence: Float32Array;
}

export interface DecodedView {
  cameraWidth: number;
  cameraHeight: number;
  projectorWidth: number;
  projectorHeight: number;
  map: CorrespondenceMap;
}

interface BitPlane {
  pattern: GrayPattern;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

const MIN_CONTRAST = 12;

function pixelLum(pixels: Uint8ClampedArray, i: number): number {
  return luminance(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
}

/**
 * Decode a Gray-code capture stack into camera→projector correspondences.
 * Expects black, white, and each bit plus its inverse.
 */
export function decodeGrayStack(
  frames: BitPlane[],
  projectorWidth: number,
  projectorHeight: number,
): CorrespondenceMap {
  const first = frames[0];
  if (!first) {
    throw new Error("decodeGrayStack: no frames");
  }
  const { width, height } = first;
  const n = width * height;
  const projX = new Int16Array(n);
  const projY = new Int16Array(n);
  projX.fill(-1);
  projY.fill(-1);
  const confidence = new Float32Array(n);

  const black = frames.find((f) => f.pattern.kind === "black");
  const white = frames.find((f) => f.pattern.kind === "white");
  if (!black || !white) {
    throw new Error("decodeGrayStack: missing black/white frames");
  }

  const xBits = frames
    .filter((f) => f.pattern.kind === "gray-x" && !f.pattern.inverted)
    .sort((a, b) => b.pattern.bit - a.pattern.bit);
  const yBits = frames
    .filter((f) => f.pattern.kind === "gray-y" && !f.pattern.inverted)
    .sort((a, b) => b.pattern.bit - a.pattern.bit);
  const xInv = new Map(
    frames
      .filter((f) => f.pattern.kind === "gray-x" && f.pattern.inverted)
      .map((f) => [f.pattern.bit, f]),
  );
  const yInv = new Map(
    frames
      .filter((f) => f.pattern.kind === "gray-y" && f.pattern.inverted)
      .map((f) => [f.pattern.bit, f]),
  );

  for (let i = 0; i < n; i++) {
    const pi = i * 4;
    const lo = pixelLum(black.pixels, pi);
    const hi = pixelLum(white.pixels, pi);
    const contrast = hi - lo;
    if (contrast < MIN_CONTRAST) continue;

    const thresh = (lo + hi) * 0.5;
    let grayX = 0;
    let grayY = 0;
    let conf = contrast / 255;
    let ok = true;

    for (const plane of xBits) {
      const inv = xInv.get(plane.pattern.bit);
      const v = pixelLum(plane.pixels, pi);
      const bitOn = v > thresh;
      if (inv) {
        const vi = pixelLum(inv.pixels, pi);
        const invOn = vi > thresh;
        if (bitOn === invOn) {
          ok = false;
          break;
        }
        conf *= Math.min(1, Math.abs(v - vi) / Math.max(contrast, 1));
      }
      if (bitOn) grayX |= 1 << plane.pattern.bit;
    }
    if (!ok) continue;
    for (const plane of yBits) {
      const inv = yInv.get(plane.pattern.bit);
      const v = pixelLum(plane.pixels, pi);
      const bitOn = v > thresh;
      if (inv) {
        const vi = pixelLum(inv.pixels, pi);
        const invOn = vi > thresh;
        if (bitOn === invOn) {
          ok = false;
          break;
        }
        conf *= Math.min(1, Math.abs(v - vi) / Math.max(contrast, 1));
      }
      if (bitOn) grayY |= 1 << plane.pattern.bit;
    }
    if (!ok) continue;

    const px = fromGray(grayX);
    const py = fromGray(grayY);
    if (px < 0 || px >= projectorWidth || py < 0 || py >= projectorHeight) {
      continue;
    }
    projX[i] = px;
    projY[i] = py;
    confidence[i] = conf;
  }

  return { width, height, projX, projY, confidence };
}

export function validCorrespondenceCount(map: CorrespondenceMap): number {
  let n = 0;
  for (let i = 0; i < map.projX.length; i++) {
    if (map.projX[i]! >= 0) n++;
  }
  return n;
}

/** Invert: for each projector pixel, average camera pixel that decoded to it. */
export function invertCorrespondence(
  map: CorrespondenceMap,
  projectorWidth: number,
  projectorHeight: number,
): { camX: Float32Array; camY: Float32Array; count: Uint16Array } {
  const n = projectorWidth * projectorHeight;
  const camX = new Float32Array(n);
  const camY = new Float32Array(n);
  const count = new Uint16Array(n);
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const i = cy * map.width + cx;
      const px = map.projX[i]!;
      const py = map.projY[i]!;
      if (px < 0) continue;
      const j = py * projectorWidth + px;
      camX[j] = (camX[j] ?? 0) + cx;
      camY[j] = (camY[j] ?? 0) + cy;
      count[j] = (count[j] ?? 0) + 1;
    }
  }
  for (let j = 0; j < n; j++) {
    const c = count[j]!;
    if (c > 0) {
      camX[j] = (camX[j] ?? 0) / c;
      camY[j] = (camY[j] ?? 0) / c;
    } else {
      camX[j] = -1;
      camY[j] = -1;
    }
  }
  return { camX, camY, count };
}
