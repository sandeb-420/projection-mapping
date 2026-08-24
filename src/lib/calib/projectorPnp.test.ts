import { describe, expect, it } from "vitest";
import { kFromFov, lookAt, project, type Vec3 } from "../math/vec";
import { calibrateProjectorKnownK } from "../calib/projectorPnp";
import { originFromPose } from "../calib/triangulate";
import { length, sub } from "../math/vec";

describe("projector DLT", () => {
  it("recovers projector origin from known 3D–2D pairs", () => {
    const width = 320;
    const height = 180;
    const K = kFromFov(width, height, 24);
    const eye: Vec3 = [0.1, 1.2, 0.2];
    const pose = lookAt(eye, [0, 1.0, 3.2], [0, 1, 0]);
    const points3d: Vec3[] = [];
    const points2d: Array<readonly [number, number]> = [];
    for (let z = 2.6; z <= 3.4; z += 0.2) {
      for (let y = 0.2; y <= 1.8; y += 0.25) {
        for (let x = -1.2; x <= 1.2; x += 0.3) {
          const p: Vec3 = [x, y, z];
          const uv = project(K, pose.R, pose.t, p);
          if (!uv) continue;
          if (uv[0] < 4 || uv[1] < 4 || uv[0] > width - 5 || uv[1] > height - 5) continue;
          points3d.push(p);
          points2d.push(uv);
        }
      }
    }
    expect(points3d.length).toBeGreaterThan(30);
    const cal = calibrateProjectorKnownK(K, points3d, points2d);
    const origin = originFromPose(cal.pose);
    expect(length(sub(origin, eye))).toBeLessThan(0.3);
    expect(cal.rms).toBeLessThan(2);
  });
});
