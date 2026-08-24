import { describe, expect, it } from "vitest";
import { effectiveFovY, fovFromThrow, projectorK, type ProjectorSettings } from "./settings";

describe("projector throw as K prior", () => {
  it("converts throw and screen height into vertical FOV", () => {
    expect(fovFromThrow(2, 1)).toBeCloseTo(28.07, 1);
  });

  it("prefers throw over the typed FOV when both screen size and throw are set", () => {
    const settings: ProjectorSettings = {
      width: 1280,
      height: 720,
      fovY: 24,
      throwM: 2,
      screenHeightM: 1,
    };
    expect(effectiveFovY(settings)).toBeCloseTo(28.07, 1);
    const K = projectorK(settings);
    expect(K[0]).toBeGreaterThan(0);
    expect(K[4]).toBeGreaterThan(0);
    expect(K[2]).toBeCloseTo(639.5);
    expect(K[5]).toBeCloseTo(359.5);
  });
});
