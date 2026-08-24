import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePhonePoses } from "./estimate";
import { originFromPose } from "../calib/triangulate";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePhonePoses", () => {
  it("falls back to the walk-around station layout when the sidecar is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const poses = await resolvePhonePoses(
      [{ id: "center", width: 160, height: 90 }],
      62,
    );
    expect(poses[0]!.source).toBe("station-layout");
    expect(poses.map((p) => p.id)).toEqual(["center", "left", "right", "detail"]);
    const left = originFromPose(poses[1]!.pose);
    const right = originFromPose(poses[2]!.pose);
    expect(left[0]).toBeLessThan(right[0]);
  });

  it("uses DA3 poses when the sidecar returns them", async () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        source: "da3",
        views: [
          {
            id: "center",
            R: identity,
            t: [0, 0, 0],
            K: [100, 0, 80, 0, 100, 45, 0, 0, 1],
          },
        ],
      }),
    }));
    const poses = await resolvePhonePoses(
      [{ id: "center", width: 160, height: 90 }],
      62,
    );
    expect(poses).toHaveLength(1);
    expect(poses[0]!.source).toBe("da3");
    expect(poses[0]!.K[0]).toBe(100);
  });
});
