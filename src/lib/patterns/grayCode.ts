export type PatternKind = "black" | "white" | "gray-x" | "gray-y";

export interface GrayPattern {
  id: string;
  kind: PatternKind;
  axis: "x" | "y" | "none";
  bit: number;
  inverted: boolean;
}

export function toGray(n: number): number {
  return n ^ (n >> 1);
}

export function fromGray(gray: number): number {
  let binary = gray;
  let shift = gray >> 1;
  while (shift) {
    binary ^= shift;
    shift >>= 1;
  }
  return binary;
}

export function bitCount(maxValue: number): number {
  return Math.ceil(Math.log2(Math.max(2, maxValue)));
}

/** Full Gray-code sequence plus black/white threshold frames. */
export function buildGraySequence(
  projectorWidth: number,
  projectorHeight: number,
): GrayPattern[] {
  const xBits = bitCount(projectorWidth);
  const yBits = bitCount(projectorHeight);
  const patterns: GrayPattern[] = [
    { id: "black", kind: "black", axis: "none", bit: -1, inverted: false },
    { id: "white", kind: "white", axis: "none", bit: -1, inverted: false },
  ];
  for (let bit = xBits - 1; bit >= 0; bit--) {
    patterns.push({
      id: `gx-${bit}`,
      kind: "gray-x",
      axis: "x",
      bit,
      inverted: false,
    });
    patterns.push({
      id: `gx-${bit}-inv`,
      kind: "gray-x",
      axis: "x",
      bit,
      inverted: true,
    });
  }
  for (let bit = yBits - 1; bit >= 0; bit--) {
    patterns.push({
      id: `gy-${bit}`,
      kind: "gray-y",
      axis: "y",
      bit,
      inverted: false,
    });
    patterns.push({
      id: `gy-${bit}-inv`,
      kind: "gray-y",
      axis: "y",
      bit,
      inverted: true,
    });
  }
  return patterns;
}

export function sampleGrayBit(
  pattern: GrayPattern,
  x: number,
  y: number,
): boolean {
  if (pattern.kind === "black") return false;
  if (pattern.kind === "white") return true;
  const coord = pattern.axis === "x" ? Math.floor(x) : Math.floor(y);
  const gray = toGray(coord);
  const on = ((gray >> pattern.bit) & 1) === 1;
  return pattern.inverted ? !on : on;
}

export function renderGrayPattern(
  pattern: GrayPattern,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = sampleGrayBit(pattern, x, y);
      const v = on ? 255 : 0;
      const i = (y * width + x) * 4;
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  }
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
