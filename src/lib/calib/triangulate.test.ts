import { describe, expect, it } from "vitest";
import { kFromFov, lookAt, project, type Vec3 } from "../math/vec";
import { triangulateTwoViews } from "./triangulate";
import { length, sub } from "../math/vec";

describe("triangulateTwoViews", () => {
  it("recovers a wall point seen from two phones", () => {
    const width = 160;
    const height = 90;
    const K = kFromFov(width, height, 62);
    const p: Vec3 = [0.2, 1.0, 3.4];
    const camA = lookAt([0.12, 1.32, 0.85], [0, 1.0, 3.2], [0, 1, 0]);
    const camB = lookAt([-0.75, 1.3, 1.05], [0, 1.0, 3.2], [0, 1, 0]);
    const uvA = project(K, camA.R, camA.t, p);
    const uvB = project(K, camB.R, camB.t, p);
    expect(uvA).not.toBeNull();
    expect(uvB).not.toBeNull();
    const recovered = triangulateTwoViews(K, camA, uvA!, K, camB, uvB!);
    expect(recovered).not.toBeNull();
    expect(length(sub(recovered!, p))).toBeLessThan(0.05);
  });
});
