import { describe, expect, it } from "vitest";
import { CaptureOrchestrator } from "./orchestrator";
import { createDemoRoom } from "../sim/room";
import { paintPattern, traceView } from "../sim/render";
import { assembleLiveViews } from "../pose/assemble";
import { stationLayoutPoses } from "../pose/stationLayout";
import { buildMapping } from "../pipeline/mapping";

function emptyPixels(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe("CaptureOrchestrator", () => {
  it("runs Gray frames then a scene photo, and stops early when coverage is enough", () => {
    const orch = new CaptureOrchestrator(32, 16);
    const cmds = orch.start();
    expect(cmds.some((c) => c.type === "station")).toBe(true);
    expect(cmds.some((c) => c.type === "show-pattern")).toBe(true);

    let guard = 0;
    while (!orch.isDone() && guard++ < 400) {
      const last = cmds.at(-1);
      if (!last || last.type !== "capture-now") break;
      const more = orch.ingest({
        stationId: last.stationId,
        patternId: last.patternId,
        kind: last.kind,
        width: 16,
        height: 8,
        pixels: emptyPixels(16, 8),
      });
      cmds.length = 0;
      cmds.push(...more);
    }
    expect(orch.isDone()).toBe(true);
    const bundles = orch.getBundles();
    expect(bundles.length).toBeGreaterThanOrEqual(2);
    expect(bundles[0]!.gray.length).toBeGreaterThan(4);
  });

  it("feeds simulated phone frames through the live path into mapping", () => {
    const room = createDemoRoom();
    const orch = new CaptureOrchestrator(room.projector.width, room.projector.height);
    let pending = orch.start();
    const traces = room.phones.map((cam) => traceView(room, cam));

    let guard = 0;
    while (!orch.isDone() && guard++ < 800) {
      const cap = pending.find((c) => c.type === "capture-now");
      if (!cap || cap.type !== "capture-now") break;
      const show = pending.find((c) => c.type === "show-pattern");
      const trace = traces[Math.min(orch.currentStationIndex(), traces.length - 1)]!;
      const pixels =
        cap.kind === "scene"
          ? paintPattern(trace, "scene")
          : paintPattern(trace, show && show.type === "show-pattern" ? show.pattern : "white-field");
      pending = orch.ingest({
        stationId: cap.stationId,
        patternId: cap.patternId,
        kind: cap.kind,
        width: trace.camera.width,
        height: trace.camera.height,
        pixels,
      });
    }
    expect(orch.isDone()).toBe(true);
    expect(orch.getBundles().length).toBeGreaterThanOrEqual(2);
    const phone = room.phones[0]!;
    const poses = stationLayoutPoses(phone.width, phone.height, 62);
    const views = assembleLiveViews(orch.getBundles(), poses, room.projector.width, room.projector.height);
    const mapping = buildMapping(views, room.projector.width, room.projector.height, room.projector.K);
    expect(mapping.points.length).toBeGreaterThan(20);
    expect(mapping.projector.rms).toBeLessThan(12);
  });
});
