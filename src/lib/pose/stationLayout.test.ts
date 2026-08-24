import { describe, expect, it } from "vitest";
import { stationLayoutPoses } from "./stationLayout";
import { yawDelta } from "./deviceOrientation";
import { originFromPose } from "../calib/triangulate";

describe("station layout poses", () => {
  it("places left and right on opposite sides of center", () => {
    const poses = stationLayoutPoses(160, 90);
    const center = originFromPose(poses[0]!.pose);
    const left = originFromPose(poses[1]!.pose);
    const right = originFromPose(poses[2]!.pose);
    expect(left[0]).toBeLessThan(center[0]);
    expect(right[0]).toBeGreaterThan(center[0]);
  });
});

describe("yawDelta", () => {
  it("wraps across 0/360", () => {
    expect(yawDelta(10, 350)).toBeCloseTo(20);
    expect(yawDelta(350, 10)).toBeCloseTo(-20);
  });
});
