import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFloat32B64, resolvePhonePoses } from "./estimate";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePhonePoses", () => {
  it("throws when the sidecar is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await expect(
      resolvePhonePoses([{ id: "center", width: 160, height: 90 }]),
    ).rejects.toThrow(/DA3 \+ MoGe sidecar is not running/);
  });

  it("throws when the sidecar returns unscaled DA3 poses", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        source: "da3",
        views: [
          {
            id: "center",
            R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            t: [0, 0, 0],
            K: [100, 0, 80, 0, 100, 45, 0, 0, 1],
          },
        ],
      }),
    }));
    await expect(
      resolvePhonePoses([{ id: "center", width: 160, height: 90 }]),
    ).rejects.toThrow(/MoGe metric scale is required/);
  });

  it("uses DA3+MoGe poses when the sidecar returns them", async () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        source: "da3+moge",
        views: [
          {
            id: "center",
            R: identity,
            t: [0, 0, 1.2],
            K: [100, 0, 80, 0, 100, 45, 0, 0, 1],
          },
        ],
      }),
    }));
    const poses = await resolvePhonePoses(
      [{ id: "center", width: 160, height: 90 }],
    );
    expect(poses[0]!.source).toBe("da3+moge");
    expect(poses[0]!.pose.t[2]).toBe(1.2);
    expect(poses[0]!.K[0]).toBe(100);
  });

  it("attaches DA3 depth when the sidecar sends a float32 buffer", async () => {
    const depth = new Float32Array([1.25, 2.5, 3.75, 4]);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(depth.buffer)));
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        source: "da3+moge",
        views: [
          {
            id: "center",
            R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            t: [0, 0, 0],
            K: [100, 0, 80, 0, 100, 45, 0, 0, 1],
            depthB64: b64,
            depthWidth: 2,
            depthHeight: 2,
          },
        ],
      }),
    }));
    const poses = await resolvePhonePoses(
      [{ id: "center", width: 160, height: 90 }],
    );
    expect(Array.from(poses[0]!.depth ?? [])).toEqual([1.25, 2.5, 3.75, 4]);
  });
});

describe("decodeFloat32B64", () => {
  it("round-trips a float32 buffer", () => {
    const src = new Float32Array([1.5, 2.25, 3]);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(src.buffer)));
    expect(Array.from(decodeFloat32B64(b64, 3) ?? [])).toEqual([1.5, 2.25, 3]);
  });
});
