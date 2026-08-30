import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoRoom } from "./room";
import { paintLookOnTrace, paintPattern, traceView } from "./render";
import { runLabSession } from "./runLab";
import { stubDa3MogeAndOpenCv } from "../test/stubSidecar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("virtual lab session", () => {
  it("paints a projector look onto surfaces the virtual camera can see", () => {
    const room = createDemoRoom();
    const trace = traceView(room, room.phones[0]!);
    const baked = new Uint8ClampedArray(room.projector.width * room.projector.height * 4);
    for (let i = 0; i < baked.length; i += 4) {
      baked[i] = 240;
      baked[i + 1] = 40;
      baked[i + 2] = 80;
      baked[i + 3] = 255;
    }
    const relit = paintLookOnTrace(trace, baked, room.projector.width, room.projector.height);
    const scene = paintPattern(trace, "scene");
    let painted = 0;
    for (let i = 0; i < relit.length; i += 4) {
      if (relit[i] === 240 && relit[i + 1] === 40 && relit[i + 2] === 80) painted++;
    }
    expect(painted).toBeGreaterThan(80);
    expect(relit.length).toBe(scene.length);
  });

  it("runs the real mapping pipeline and relights the virtual room", async () => {
    stubDa3MogeAndOpenCv([]);
    const session = await runLabSession(createDemoRoom(), "surface-id");
    expect(session.poseSource).toBe("sim-gt");
    expect(session.mapping.projector.source).toBe("opencv-pnp");
    expect(session.mapping.points.length).toBeGreaterThan(40);
    expect(session.rms).toBeLessThan(8);
    expect(session.projectorOriginErrorM).toBeLessThan(3.5);
    expect(session.phoneScenes.length).toBe(3);
    expect(session.graySamples.length).toBe(3);
    expect(session.relitPhones.length).toBe(3);
    expect(session.relitObserver.pixels.length).toBeGreaterThan(100);
    expect(session.projectorLook.width).toBe(session.room.projector.width);
  });
});
