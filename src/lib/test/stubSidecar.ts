import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { Mat3 } from "../math/vec";
import type { Pose } from "../calib/projectorPnp";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../server");

export interface SidecarPose {
  id: string;
  K: Mat3;
  pose: Pose;
  depth?: Float32Array;
}

/** Call the same OpenCV PnP the sidecar uses, without spinning up uvicorn. */
export function solveProjectorPnpViaPython(body: {
  K: number[];
  points3d: number[][];
  points2d: number[][];
  dist?: number[];
}): Record<string, unknown> {
  const script = [
    "import json, sys",
    "from pnp import solve_projector_pnp",
    "body = json.load(sys.stdin)",
    "print(json.dumps(solve_projector_pnp(",
    '    body["K"], body["points3d"], body["points2d"], body.get("dist"),',
    ")))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script], {
    input: JSON.stringify(body),
    encoding: "utf-8",
    cwd: serverDir,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "python OpenCV PnP failed");
  }
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

/**
 * Vitest fetch stub: DA3+MoGe returns the given phone poses; /pnp runs OpenCV.
 */
export function stubDa3MogeAndOpenCv(poses: readonly SidecarPose[]): void {
  vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
    const pathName = String(url);
    if (pathName.includes("/pose")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          source: "da3+moge",
          views: poses.map((pose) => {
            const item: Record<string, unknown> = {
              id: pose.id,
              R: [...pose.pose.R],
              t: [...pose.pose.t],
              K: [...pose.K],
            };
            if (pose.depth) {
              const bytes = new Uint8Array(pose.depth.buffer, pose.depth.byteOffset, pose.depth.byteLength);
              item.depthB64 = btoa(String.fromCharCode(...bytes));
              item.depthWidth = pose.depth.length;
              item.depthHeight = 1;
            }
            return item;
          }),
        }),
      };
    }
    if (pathName.includes("/pnp")) {
      const body = JSON.parse(String(init?.body)) as {
        K: number[];
        points3d: number[][];
        points2d: number[][];
        dist?: number[];
      };
      const result = solveProjectorPnpViaPython(body);
      return { ok: true, json: async () => result };
    }
    throw new Error(`unexpected fetch ${pathName}`);
  });
}
