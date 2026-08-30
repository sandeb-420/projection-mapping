import type { Vec3 } from "../math/vec";
import type { Mapping } from "../pipeline/mapping";
import { originFromPose } from "./triangulate";

export type SketchKind = "projector" | "phone" | "point" | "gt-projector" | "gt-phone";

export interface SketchMark {
  kind: SketchKind;
  id: string;
  world: Vec3;
  x: number;
  y: number;
}

export interface FittedSketch {
  width: number;
  height: number;
  marks: SketchMark[];
  projector: SketchMark | null;
  phones: SketchMark[];
  gtProjector: SketchMark | null;
  gtPhones: SketchMark[];
}

export interface GroundTruthSketch {
  projector: Vec3;
  phones: Array<{ id: string; world: Vec3 }>;
}

/**
 * Top-down (X right, Z forward) so you can see recovered projector + phone poses
 * in the same 3D frame as the mapped surfaces. This is the auto stand-in for
 * dragging a mesh: we know where everything sits, then warp in projector pixels.
 */
export function fitSceneTopDown(
  mapping: Mapping,
  width: number,
  height: number,
  pad = 18,
  groundTruth?: GroundTruthSketch,
): FittedSketch {
  const raw: Array<{ kind: SketchKind; id: string; world: Vec3 }> = [
    { kind: "projector", id: "projector", world: originFromPose(mapping.projector.pose) },
  ];
  for (const view of mapping.views) {
    raw.push({ kind: "phone", id: view.id, world: originFromPose(view.pose) });
  }
  if (groundTruth) {
    raw.push({ kind: "gt-projector", id: "gt-projector", world: groundTruth.projector });
    for (const phone of groundTruth.phones) {
      raw.push({ kind: "gt-phone", id: `gt-${phone.id}`, world: phone.world });
    }
  }
  const stride = Math.max(1, Math.floor(mapping.points.length / 90));
  mapping.points.forEach((point, i) => {
    if (i % stride !== 0) return;
    raw.push({ kind: "point", id: `p${i}`, world: point.world });
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mark of raw) {
    minX = Math.min(minX, mark.world[0]);
    maxX = Math.max(maxX, mark.world[0]);
    minZ = Math.min(minZ, mark.world[2]);
    maxZ = Math.max(maxZ, mark.world[2]);
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    maxX = 1;
    minZ = 0;
    maxZ = 2;
  }
  const spanX = Math.max(0.4, maxX - minX);
  const spanZ = Math.max(0.4, maxZ - minZ);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / spanX, innerH / spanZ);

  const marks: SketchMark[] = raw.map((mark) => ({
    ...mark,
    x: pad + (mark.world[0] - minX) * scale,
    y: pad + (mark.world[2] - minZ) * scale,
  }));

  return {
    width,
    height,
    marks,
    projector: marks.find((m) => m.kind === "projector") ?? null,
    phones: marks.filter((m) => m.kind === "phone"),
    gtProjector: marks.find((m) => m.kind === "gt-projector") ?? null,
    gtPhones: marks.filter((m) => m.kind === "gt-phone"),
  };
}
