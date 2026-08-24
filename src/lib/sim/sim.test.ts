import { describe, expect, it } from "vitest";
import { createDemoRoom } from "./room";
import { captureGrayView, remapWithNewObject, runSimulatedCalibration } from "./runCalibration";
import { validCorrespondenceCount } from "../decode/structuredLight";

describe("virtual projector room", () => {
  it("decodes Gray codes from a simulated iPhone view", () => {
    const room = createDemoRoom();
    const view = captureGrayView(room, 0);
    expect(view.map).not.toBeNull();
    expect(validCorrespondenceCount(view.map!)).toBeGreaterThan(200);
  });

  it("triangulates the virtual projector from three phone stations", () => {
    const result = runSimulatedCalibration(createDemoRoom());
    expect(result.mapping.points.length).toBeGreaterThan(40);
    expect(result.mapping.surfaces.length).toBeGreaterThan(0);
    expect(result.rms).toBeLessThan(8);
    expect(result.mapping.points.some((p) => p.camera[0] !== 0 || p.camera[1] !== 0)).toBe(true);
    // Structured-light triangulation is metric but noisy; origin can drift.
    // Reprojection RMS is the mapping quality signal.
    expect(result.projectorOriginErrorM).toBeLessThan(3.5);
  });

  it("remaps from scratch after a new object is placed", () => {
    const first = runSimulatedCalibration(createDemoRoom());
    const remapped = remapWithNewObject({
      center: [-0.55, 0.18, 2.35],
      size: [0.35, 0.36, 0.35],
    });
    expect(remapped.mapping.points.length).toBeGreaterThan(40);
    expect(remapped.rms).toBeLessThan(8);
    expect(remapped.mapping.points.length).toBeGreaterThanOrEqual(first.mapping.points.length * 0.8);
  });
});
