import { afterEach, describe, expect, it, vi } from "vitest";
import { lookFromPrompt, lookFromPromptAsync, mergeShaderResponse } from "./promptLook";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookFromPrompt", () => {
  it("maps water/gold language onto a custom spec", () => {
    const spec = lookFromPrompt("slow gold water on the wall");
    expect(spec.id).toBe("custom");
    expect(spec.mode).toBe("water");
    expect(spec.hue).toBe(38);
    expect(spec.freq).toBe(1.6);
    expect(spec.source).toBe("keywords");
  });

  it("still produces a look for an arbitrary sentence", () => {
    const spec = lookFromPrompt("make the sculpture feel like a nightclub");
    expect(spec.mode).toBeDefined();
    expect(spec.hue).toBeGreaterThanOrEqual(0);
  });
});

describe("mergeShaderResponse", () => {
  it("keeps the keyword look when the sidecar declines", () => {
    const base = lookFromPrompt("slow gold water");
    expect(mergeShaderResponse(base, { ok: false })).toEqual(base);
  });

  it("overlays LLM hue/mode/WGSL on the keyword compiler", () => {
    const base = lookFromPrompt("slow gold water");
    const merged = mergeShaderResponse(base, {
      ok: true,
      source: "llm",
      hue: 210,
      mode: "scan",
      freq: 5,
      wgsl: "fn look() -> vec3f { return vec3f(0.2, 0.4, 1.0); }",
    });
    expect(merged.source).toBe("llm");
    expect(merged.hue).toBe(210);
    expect(merged.mode).toBe("scan");
    expect(merged.wgsl).toContain("vec3f");
  });
});

describe("lookFromPromptAsync", () => {
  it("falls back to keywords when /api/shader is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const spec = await lookFromPromptAsync("slow gold water on the wall");
    expect(spec.source).toBe("keywords");
    expect(spec.mode).toBe("water");
  });
});
