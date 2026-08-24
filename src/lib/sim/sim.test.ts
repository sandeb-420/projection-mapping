import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoRoom } from "./room";
import { captureGrayView, remapWithNewObject, runSimulatedCalibration } from "./runCalibration";
import { validCorrespondenceCount } from "../decode/structuredLight";
import { buildMapping } from "../pipeline/mapping";
import { stubDa3MogeAndOpenCv } from "../test/stubSidecar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("virtual projector room", () => {
  it("decodes Gray codes from a simulated iPhone view", () => {
    const room = createDemoRoom();
    const view = captureGrayView(room, 0);
    expect(view.map).not.toBeNull();
    expect(validCorrespondenceCount(view.map!)).toBeGreaterThan(200);
  });

  it("triangulates the virtual projector from three phone stations", async () => {
    stubDa3MogeAndOpenCv([]);
    const result = await runSimulatedCalibration(createDemoRoom());
    expect(result.mapping.points.length).toBeGreaterThan(40);
    expect(result.mapping.surfaces.length).toBeGreaterThan(0);
    expect(result.rms).toBeLessThan(8);
    expect(result.mapping.points.some((p) => p.camera[0] !== 0 || p.camera[1] !== 0)).toBe(true);
    expect(result.mapping.projector.source).toBe("opencv-pnp");
    expect(result.projectorOriginErrorM).toBeLessThan(3.5);
  });

  it("fills one-view Gray-code pixels from sim depth after triangulation", async () => {
    stubDa3MogeAndOpenCv([]);
    const room = createDemoRoom();
    const views = room.phones.map((_, i) => captureGrayView(room, i));
    const withDepth = await buildMapping(
      views,
      room.projector.width,
      room.projector.height,
      room.projector.K,
    );
    const without = await buildMapping(
      views.map((v) => ({ ...v, depth: undefined })),
      room.projector.width,
      room.projector.height,
      room.projector.K,
    );
    expect(withDepth.points.length).toBeGreaterThan(without.points.length);
    expect(withDepth.projector.source).toBe("opencv-pnp");
  });

  it("remaps from scratch after a new object is placed", async () => {
    stubDa3MogeAndOpenCv([]);
    const first = await runSimulatedCalibration(createDemoRoom());
    const remapped = await remapWithNewObject({
      center: [-0.55, 0.18, 2.35],
      size: [0.35, 0.36, 0.35],
    });
    expect(remapped.mapping.points.length).toBeGreaterThan(40);
    expect(remapped.rms).toBeLessThan(8);
    expect(remapped.mapping.points.length).toBeGreaterThanOrEqual(first.mapping.points.length * 0.8);
  });
});
