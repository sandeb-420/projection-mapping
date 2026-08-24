import type { LookMode, LookSpec } from "./types";

export interface ShaderSidecarBody {
  ok?: boolean;
  hue?: number;
  mode?: LookMode;
  freq?: number;
  wgsl?: string;
  source?: string;
}

/**
 * One-shot look from a text prompt. Not a per-frame LLM.
 * Keywords pick a palette and motion; unknown prompts still bake a usable gel.
 */
export function lookFromPrompt(prompt: string): LookSpec {
  const p = prompt.toLowerCase();
  const mode: LookMode = pickMode(p);
  return {
    id: "custom",
    prompt: prompt.trim(),
    hue: pickHue(p),
    freq: p.includes("slow") ? 1.6 : p.includes("fast") ? 7 : 3.4,
    mode,
    source: "keywords",
  };
}

export function mergeShaderResponse(base: LookSpec, body: ShaderSidecarBody): LookSpec {
  if (!body.ok) return base;
  const mode = isLookMode(body.mode) ? body.mode : base.mode;
  return {
    ...base,
    hue: typeof body.hue === "number" && Number.isFinite(body.hue) ? wrapHue(body.hue) : base.hue,
    freq: typeof body.freq === "number" && Number.isFinite(body.freq)
      ? clamp(body.freq, 0.4, 12)
      : base.freq,
    mode,
    wgsl: typeof body.wgsl === "string" && body.wgsl.trim() ? body.wgsl : base.wgsl,
    source: body.source === "llm" ? "llm" : base.source ?? "keywords",
  };
}

/** Keyword compiler first; optional sidecar LLM fills hue/mode/freq/WGSL. */
export async function lookFromPromptAsync(prompt: string): Promise<LookSpec> {
  const base = lookFromPrompt(prompt);
  try {
    const res = await fetch("/api/shader", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return base;
    const body = (await res.json()) as ShaderSidecarBody;
    return mergeShaderResponse(base, body);
  } catch {
    return base;
  }
}

function pickMode(p: string): LookMode {
  if (/(water|ocean|ripple|caustic)/.test(p)) return "water";
  if (/(fire|lava|ember|heat)/.test(p)) return "fire";
  if (/(scan|lidar|contour|wire)/.test(p)) return "scan";
  if (/(grid|graph|metric)/.test(p)) return "grid";
  if (/(flow|wind|smoke)/.test(p)) return "flow";
  return "gel";
}

function pickHue(p: string): number {
  if (/(gold|amber|warm)/.test(p)) return 38;
  if (/(cyan|teal|ice)/.test(p)) return 172;
  if (/(magenta|pink|neon)/.test(p)) return 312;
  if (/(red|lava)/.test(p)) return 8;
  if (/(blue)/.test(p)) return 214;
  if (/(green)/.test(p)) return 132;
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 33 + p.charCodeAt(i)) % 360;
  return h;
}

function isLookMode(value: string | undefined): value is LookMode {
  return value === "gel" || value === "grid" || value === "flow"
    || value === "scan" || value === "fire" || value === "water";
}

function wrapHue(h: number): number {
  const n = h % 360;
  return n < 0 ? n + 360 : n;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
