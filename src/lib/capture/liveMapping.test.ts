import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureOrchestrator } from "./orchestrator";
import { finishLiveMapping } from "./liveMapping";
import { createDemoRoom } from "../sim/room";
import { paintPattern, traceView } from "../sim/render";
import { DEFAULT_PROJECTOR } from "../projector/settings";
import { stubDa3MogeAndOpenCv } from "../test/stubSidecar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finishLiveMapping", () => {
  it("throws when DA3 + MoGe is unavailable", async () => {
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
    vi.stubGlobal("fetch", async () => {
      throw new Error("sidecar offline");
    });
    await expect(
      finishLiveMapping(orch.getBundles(), {
        ...DEFAULT_PROJECTOR,
        width: room.projector.width,
        height: room.projector.height,
        fovY: 24,
      }),
    ).rejects.toThrow(/DA3 \+ MoGe sidecar is not running/);
  });

  it("maps simulated phone frames with DA3+MoGe poses and OpenCV PnP", async () => {
    const room = createDemoRoom();
    stubDa3MogeAndOpenCv(room.phones);
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
    const result = await finishLiveMapping(orch.getBundles(), {
      ...DEFAULT_PROJECTOR,
      width: room.projector.width,
      height: room.projector.height,
      fovY: 24,
    });
    expect(result.poseSource).toBe("da3+moge");
    expect(result.projectorSource).toBe("opencv-pnp");
    expect(result.mapping.points.length).toBeGreaterThan(20);
    expect(result.mapping.projector.rms).toBeLessThan(12);
  });
});
