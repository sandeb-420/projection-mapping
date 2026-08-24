export type LookId = "surface-id" | "grid" | "normals" | "caustic" | "depth" | "custom";

export type LookMode = "gel" | "grid" | "flow" | "scan" | "fire" | "water";

export interface LookSpec {
  id: LookId;
  prompt: string;
  hue: number;
  freq: number;
  mode: LookMode;
}
