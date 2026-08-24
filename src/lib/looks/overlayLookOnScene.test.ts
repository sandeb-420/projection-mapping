import { describe, expect, it } from "vitest";
import { bakeLook } from "./bakeLook";
import { overlayLookOnScene } from "./overlayLookOnScene";
import { createDemoRoom } from "../sim/room";
import { runSimulatedCalibration } from "../sim/runCalibration";

describe("overlayLookOnScene", () => {
  it("paints the look onto a phone photo, not a projector-eye reconstruction", () => {
    const result = runSimulatedCalibration(createDemoRoom());
    const view = result.mapping.views[0];
    expect(view).toBeDefined();
    expect(result.mapping.points.some((p) => p.camera[0] !== 0 || p.camera[1] !== 0)).toBe(true);

    const baked = bakeLook(result.mapping, "surface-id");
    const overlay = overlayLookOnScene(result.mapping, baked);
    expect(overlay).not.toBeNull();
    expect(overlay!.width).toBe(view!.width);
    expect(overlay!.height).toBe(view!.height);

    let changed = 0;
    for (let i = 0; i < overlay!.pixels.length; i += 4) {
      if (
        overlay!.pixels[i] !== view!.scene[i] ||
        overlay!.pixels[i + 1] !== view!.scene[i + 1] ||
        overlay!.pixels[i + 2] !== view!.scene[i + 2]
      ) {
        changed++;
      }
    }
    expect(changed).toBeGreaterThan(20);
  });
});
