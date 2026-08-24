import { describe, expect, it } from "vitest";
import { createDemoRoom } from "../sim/room";
import { runSimulatedCalibration } from "../sim/runCalibration";
import { fitSceneTopDown } from "./sceneSketch";
import { originFromPose } from "./triangulate";

describe("fitSceneTopDown", () => {
  it("places the projector and phones at distinct recovered positions", () => {
    const result = runSimulatedCalibration(createDemoRoom());
    const sketch = fitSceneTopDown(result.mapping, 320, 180);
    expect(sketch.projector).not.toBeNull();
    expect(sketch.phones.length).toBeGreaterThanOrEqual(2);

    const proj = originFromPose(result.mapping.projector.pose);
    const phone = originFromPose(result.mapping.views[0]!.pose);
    expect(Math.hypot(proj[0] - phone[0], proj[2] - phone[2])).toBeGreaterThan(0.2);

    const xs = new Set(sketch.phones.map((p) => Math.round(p.x)));
    expect(xs.size).toBeGreaterThan(1);
  });
});
