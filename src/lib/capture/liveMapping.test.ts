import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureOrchestrator } from "./orchestrator";
import { finishLiveMapping } from "./liveMapping";
import { createDemoRoom } from "../sim/room";
import { paintPattern, traceView } from "../sim/render";
import { DEFAULT_PROJECTOR } from "../projector/settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finishLiveMapping", () => {
  it("maps simulated phone frames with station-layout poses when DA3 is off", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("sidecar offline");
    });
    const room = createDemoRoom();
    const orch = new CaptureOrchestrator(room.projector.width, room.projector.height);
    let pending = orch.start();
    const traces = room.phones.map((cam) => traceView(room, cam));
    const phoneFor = (stationId: string) => {
      const i = room.phones.findIndex((p) => p.id === stationId);
      return traces[i === -1 ? 0 : i]!;
    };
    let guard = 0;
    while (!orch.isDone() && guard++ < 800) {
      const cap = pending.find((c) => c.type === "capture-now");
      if (!cap || cap.type !== "capture-now") break;
      const show = pending.find((c) => c.type === "show-pattern");
      const trace = phoneFor(cap.stationId);
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
    const result = await finishLiveMapping(orch.getBundles(), {
      ...DEFAULT_PROJECTOR,
      width: room.projector.width,
      height: room.projector.height,
      fovY: 24,
    });
    expect(result.poseSource).toBe("station-layout");
    expect(result.projectorSource).toBe("dlt");
    expect(result.mapping.points.length).toBeGreaterThan(20);
    expect(result.mapping.projector.rms).toBeLessThan(12);
  });
});
