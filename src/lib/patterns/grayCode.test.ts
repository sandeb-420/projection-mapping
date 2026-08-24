import { describe, expect, it } from "vitest";
import { fromGray, toGray, buildGraySequence, sampleGrayBit } from "../patterns/grayCode";
import { decodeGrayStack } from "../decode/structuredLight";

describe("Gray code", () => {
  it("roundtrips integers", () => {
    for (let n = 0; n < 2048; n++) {
      expect(fromGray(toGray(n))).toBe(n);
    }
  });

  it("decodes a painted camera image of the projector", () => {
    const pw = 64;
    const ph = 48;
    const cw = 80;
    const ch = 60;
    const patterns = buildGraySequence(pw, ph);
    const frames = patterns.map((pattern) => {
      const pixels = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const px = Math.floor((x / cw) * pw);
          const py = Math.floor((y / ch) * ph);
          const on = sampleGrayBit(pattern, px, py);
          const i = (y * cw + x) * 4;
          const v = on ? 255 : 0;
          pixels[i] = v;
          pixels[i + 1] = v;
          pixels[i + 2] = v;
          pixels[i + 3] = 255;
        }
      }
      return { pattern, pixels, width: cw, height: ch };
    });
    const map = decodeGrayStack(frames, pw, ph);
    let ok = 0;
    let n = 0;
    for (let y = 2; y < ch - 2; y++) {
      for (let x = 2; x < cw - 2; x++) {
        const expectX = Math.floor((x / cw) * pw);
        const expectY = Math.floor((y / ch) * ph);
        const i = y * cw + x;
        n++;
        if (map.projX[i] === expectX && map.projY[i] === expectY) ok++;
      }
    }
    expect(ok / n).toBeGreaterThan(0.98);
  });
});
