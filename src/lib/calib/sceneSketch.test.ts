import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoRoom } from "../sim/room";
import { runSimulatedCalibration } from "../sim/runCalibration";
import { fitSceneTopDown } from "./sceneSketch";
import { originFromPose } from "./triangulate";
import { stubDa3MogeAndOpenCv } from "../test/stubSidecar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fitSceneTopDown", () => {
  it("places the projector and phones at distinct recovered positions", async () => {
    stubDa3MogeAndOpenCv([]);
    const result = await runSimulatedCalibration(createDemoRoom());
    const sketch = fitSceneTopDown(result.mapping, 320, 180, 18, {
      projector: result.room.projector.eye,
      phones: result.room.phones.map((phone) => ({
        id: phone.id,
        world: originFromPose(phone.pose),
      })),
    });
    expect(sketch.projector).not.toBeNull();
    expect(sketch.gtProjector).not.toBeNull();
    expect(sketch.phones.length).toBeGreaterThanOrEqual(2);
    expect(sketch.gtPhones.length).toBe(result.room.phones.length);

    const proj = originFromPose(result.mapping.projector.pose);
    const phone = originFromPose(result.mapping.views[0]!.pose);
    expect(Math.hypot(proj[0] - phone[0], proj[2] - phone[2])).toBeGreaterThan(0.2);

    const xs = new Set(sketch.phones.map((p) => Math.round(p.x)));
    expect(xs.size).toBeGreaterThan(1);
  });
});
