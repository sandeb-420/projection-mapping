import { describe, expect, it } from "vitest";
import { densifyWithDepth } from "./densifyWithDepth";
import { identity3, pinholeK } from "../math/vec";
import type { CorrespondenceMap } from "../decode/structuredLight";
import type { MappedPoint, ViewCapture } from "./mapping";

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
    const i = y * width + x;
    projX[i] = px;
    projY[i] = py;
    confidence[i] = 1;
  }
  return { width, height, projX, projY, confidence };
}

describe("densifyWithDepth", () => {
  it("adds single-view Gray-code pixels using depth, and skips occupied projector pixels", () => {
    const width = 8;
    const height = 8;
    const depth = new Float32Array(width * height);
    depth.fill(2);
    const view: ViewCapture = {
      id: "center",
      K: pinholeK(8, 8, 3.5, 3.5),
      pose: { R: identity3(), t: [0, 0, 0] },
      map: grayMap(width, height, [
        [2, 2, 1, 1],
        [4, 4, 5, 5],
      ]),
      scene: new Uint8ClampedArray(width * height * 4),
      width,
      height,
      depth,
    };
    const existing: MappedPoint[] = [
      {
        world: [0, 0, 2],
        projector: [1, 1],
        camera: [2, 2],
        viewId: "center",
        objectId: 0,
      },
    ];
    const out = densifyWithDepth([view], existing, 16, 9, 1);
    expect(out).toHaveLength(2);
    const extra = out[1]!;
    expect(extra.projector).toEqual([5, 5]);
    expect(extra.world[2]).toBeCloseTo(2, 5);
  });

  it("does nothing without depth or a Gray-code map", () => {
    const existing: MappedPoint[] = [
      {
        world: [0, 0, 2],
        projector: [1, 1],
        camera: [0, 0],
        viewId: "center",
        objectId: 0,
      },
    ];
    const view: ViewCapture = {
      id: "center",
      K: pinholeK(8, 8, 3.5, 3.5),
      pose: { R: identity3(), t: [0, 0, 0] },
      map: null,
      scene: new Uint8ClampedArray(8 * 8 * 4),
      width: 8,
      height: 8,
    };
    expect(densifyWithDepth([view], existing, 16, 9)).toBe(existing);
  });
});
