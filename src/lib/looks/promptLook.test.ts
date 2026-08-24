import { describe, expect, it } from "vitest";
import { lookFromPrompt } from "./promptLook";

describe("lookFromPrompt", () => {
  it("maps water/gold language onto a custom spec", () => {
    const spec = lookFromPrompt("slow gold water on the wall");
    expect(spec.id).toBe("custom");
    expect(spec.mode).toBe("water");
    expect(spec.hue).toBe(38);
    expect(spec.freq).toBe(1.6);
  });

  it("still produces a look for an arbitrary sentence", () => {
    const spec = lookFromPrompt("make the sculpture feel like a nightclub");
    expect(spec.mode).toBeDefined();
    expect(spec.hue).toBeGreaterThanOrEqual(0);
  });
});
