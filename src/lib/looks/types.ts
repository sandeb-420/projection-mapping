export type LookId = "surface-id" | "grid" | "normals" | "caustic" | "depth" | "custom";

export type LookMode = "gel" | "grid" | "flow" | "scan" | "fire" | "water";

export type LookSource = "keywords" | "llm";

export interface LookSpec {
  id: LookId;
  prompt: string;
  hue: number;
  freq: number;
  mode: LookMode;
  /** Optional one-shot WGSL from an LLM. Baked into the look once, never per frame. */
  wgsl?: string;
  source?: LookSource;
}
