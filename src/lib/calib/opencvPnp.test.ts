import { afterEach, describe, expect, it, vi } from "vitest";
import { solveProjectorPnpOpenCv } from "./opencvPnp";
import { identity3 } from "../math/vec";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sample = {
  K: [400, 0, 160, 0, 400, 90, 0, 0, 1] as const,
  points3d: [
    [-1, 0.2, 2.4],
    [0, 0.2, 2.4],
    [1, 0.2, 2.4],
    [-1, 0.8, 2.8],
    [0, 0.8, 2.8],
    [1, 0.8, 2.8],
    [-1, 1.4, 3.2],
    [0, 1.4, 3.2],
  ] as const,
  points2d: [
    [10, 20],
    [80, 20],
    [150, 20],
    [12, 60],
    [82, 60],
    [152, 60],
    [14, 110],
    [84, 110],
  ] as const,
};

describe("solveProjectorPnpOpenCv", () => {
  it("returns an OpenCV calibration when the sidecar succeeds", async () => {
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      expect(url).toBe("/api/pnp");
      const body = JSON.parse(String(init?.body)) as { points3d: number[][] };
      expect(body.points3d).toHaveLength(8);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          source: "opencv-pnp",
          R: [...identity3()],
          t: [0.05, -0.1, 0.2],
          K: [...sample.K],
          rms: 0.4,
          inliers: 8,
        }),
      };
    });
    const cal = await solveProjectorPnpOpenCv(sample);
    expect(cal).not.toBeNull();
    expect(cal!.source).toBe("opencv-pnp");
    expect(cal!.rms).toBe(0.4);
    expect(cal!.pose.t[2]).toBe(0.2);
  });

  it("returns null when the sidecar is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await solveProjectorPnpOpenCv(sample)).toBeNull();
  });
});
