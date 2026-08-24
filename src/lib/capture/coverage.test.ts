import { describe, expect, it } from "vitest";
import type { CorrespondenceMap } from "../decode/structuredLight";
import { decideNextCapture } from "./coverage";
import { isStill, pushSample } from "./stillness";

function grayMap(
  width: number,
  height: number,
  hits: Array<[number, number, number, number]>,
): CorrespondenceMap {
  const n = width * height;
  const projX = new Int16Array(n);
  const projY = new Int16Array(n);
  projX.fill(-1);
  projY.fill(-1);
  const confidence = new Float32Array(n);
  for (const [x, y, px, py] of hits) {
    projX[y * width + x] = px;
    projY[y * width + x] = py;
    confidence[y * width + x] = 1;
  }
  return { width, height, projX, projY, confidence };
}

function gridHits(
  camW: number,
  camH: number,
  projW: number,
  projH: number,
  x0: number,
  x1: number,
): Array<[number, number, number, number]> {
  const hits: Array<[number, number, number, number]> = [];
  for (let y = 2; y < camH - 2; y += 2) {
    for (let x = 2; x < camW - 2; x += 2) {
      const px = Math.floor(((x - 2) / (camW - 4)) * (x1 - x0)) + x0;
      const py = Math.floor(((y - 2) / (camH - 4)) * (projH - 4)) + 2;
      if (px >= 0 && px < projW && py >= 0 && py < projH) hits.push([x, y, px, py]);
    }
  }
  return hits;
}

describe("decideNextCapture", () => {
  const projW = 64;
  const projH = 36;
  const camW = 40;
  const camH = 24;

  it("asks for a second angle after one good Gray-code stop, not a scripted left/right", () => {
    const map = grayMap(camW, camH, gridHits(camW, camH, projW, projH, 4, 60));
    const decision = decideNextCapture({
      maps: [map],
      projectorWidth: projW,
      projectorHeight: projH,
      yaws: [10],
      grayStops: 1,
    });
    expect(decision.kind).toBe("need");
    if (decision.kind === "need") {
      expect(decision.station.patterns).toBe("full-gray");
      expect(decision.reason.toLowerCase()).toMatch(/second|one view|angle|side/);
    }
  });

  it("stops when two views overlap enough on the throw", () => {
    const a = grayMap(camW, camH, gridHits(camW, camH, projW, projH, 2, 62));
    const b = grayMap(camW, camH, gridHits(camW, camH, projW, projH, 2, 62));
    const decision = decideNextCapture({
      maps: [a, b],
      projectorWidth: projW,
      projectorHeight: projH,
      yaws: [0, 25],
      grayStops: 3,
    });
    expect(decision.kind).toBe("done");
  });

  it("asks to cover the weak side of the throw instead of a fixed walk", () => {
    const sparseLeft: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 12; i++) {
      sparseLeft.push([4 + i, 4, 4 + i, 8]);
      sparseLeft.push([4 + i, 8, 4 + i, 12]);
    }
    const left = grayMap(camW, camH, sparseLeft);
    const alsoLeft = grayMap(camW, camH, sparseLeft);
    const decision = decideNextCapture({
      maps: [left, alsoLeft],
      projectorWidth: projW,
      projectorHeight: projH,
      yaws: [0, 30],
      grayStops: 2,
    });
    expect(decision.kind).toBe("need");
    if (decision.kind === "need") {
      expect(decision.heading).toBe("right");
    }
  });
});

describe("isStill", () => {
  it("is true when orientation stays put", () => {
    const samples = [0, 100, 200, 300, 400].map((t) => ({
      t,
      alpha: 40,
      beta: 2,
      gamma: -1,
    }));
    expect(isStill(samples, 400)).toBe(true);
  });

  it("is false when the phone yaws", () => {
    const samples = [
      { t: 0, alpha: 10, beta: 0, gamma: 0 },
      { t: 120, alpha: 14, beta: 0, gamma: 0 },
      { t: 240, alpha: 20, beta: 0, gamma: 0 },
      { t: 360, alpha: 28, beta: 0, gamma: 0 },
    ];
    expect(isStill(samples, 360)).toBe(false);
  });

  it("drops old samples", () => {
    const buf = pushSample([], { t: 0, alpha: 1 });
    pushSample(buf, { t: 2000, alpha: 2 }, 500);
    expect(buf).toHaveLength(1);
  });
});
