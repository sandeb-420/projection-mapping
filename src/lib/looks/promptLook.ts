import type { LookMode, LookSpec } from "./types";

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
  };
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
