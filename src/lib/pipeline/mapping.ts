import type { Vec2, Vec3 } from "../math/vec";
import type { CorrespondenceMap } from "../decode/structuredLight";
import { invertCorrespondence } from "../decode/structuredLight";
import type { Pose } from "../calib/projectorPnp";
import { ransacProjectorDlt, type ProjectorCalibration } from "../calib/projectorPnp";
import { originFromPose, triangulateTwoViews } from "../calib/triangulate";
import { ransacPlanes, type Plane } from "../geometry/planes";
import type { Mat3 } from "../math/vec";

export interface ViewCapture {
  id: string;
  K: Mat3;
  pose: Pose;
  map: CorrespondenceMap | null;
  /** Scene photo (no pattern), RGBA. */
  scene: Uint8ClampedArray;
  width: number;
  height: number;
  /** Optional monocular metric depth, same resolution as scene. */
  depth?: Float32Array;
}

export interface MappedPoint {
  world: Vec3;
  projector: Vec2;
  camera: Vec2;
  viewId: string;
  objectId: number;
}

export interface SurfaceMesh {
  id: string;
  label: string;
  points: MappedPoint[];
  plane: Plane | null;
}

export interface Mapping {
  projector: ProjectorCalibration;
  projectorWidth: number;
  projectorHeight: number;
  points: MappedPoint[];
  surfaces: SurfaceMesh[];
  views: ViewCapture[];
}

const SAMPLE_STRIDE = 3;

/**
 * Multi-view structured-light mapping.
 *
 * Phone poses come from DA3 / MoGe (or the simulator). Gray-code maps from
 * two or more stops share projector pixels; those pixels are triangulated
 * into world points; the projector is then solved with DLT/PnP.
 */
export function buildMapping(
  views: ViewCapture[],
  projectorWidth: number,
  projectorHeight: number,
  projectorK?: Mat3,
): Mapping {
  const grayViews = views.filter((v) => v.map);
  if (grayViews.length < 2) {
    throw new Error("Need Gray-code captures from at least two iPhone positions");
  }

  const inv = grayViews.map((v) => ({
    view: v,
    inv: invertCorrespondence(v.map!, projectorWidth, projectorHeight),
  }));

  const worldByProj = new Map<number, Vec3>();
  const samples3d: Vec3[] = [];
  const samples2d: Vec2[] = [];

  for (let py = 0; py < projectorHeight; py += SAMPLE_STRIDE) {
    for (let px = 0; px < projectorWidth; px += SAMPLE_STRIDE) {
      const j = py * projectorWidth + px;
      const seen: { view: ViewCapture; uv: Vec2 }[] = [];
      for (const entry of inv) {
        if (entry.inv.count[j]! < 1) continue;
        seen.push({
          view: entry.view,
          uv: [entry.inv.camX[j]!, entry.inv.camY[j]!],
        });
      }
      if (seen.length < 2) continue;
      const a = seen[0]!;
      const b = seen[1]!;
      const p = triangulateTwoViews(a.view.K, a.view.pose, a.uv, b.view.K, b.view.pose, b.uv);
      if (!p) continue;
      worldByProj.set(j, p);
      samples3d.push(p);
      samples2d.push([px, py]);
    }
  }

  if (samples3d.length < 30) {
    throw new Error(
      `Not enough dual-view projector pixels to triangulate (${samples3d.length}). Capture another angle.`,
    );
  }

  const projector = ransacProjectorDlt(samples3d, samples2d, {
    iterations: 60,
    threshold: 3,
    sample: 12,
    K: projectorK,
  });

  const points: MappedPoint[] = [];
  for (const [j, world] of worldByProj) {
    const py = Math.floor(j / projectorWidth);
    const px = j - py * projectorWidth;
    let camera: Vec2 = [0, 0];
    let viewId = grayViews[0]!.id;
    for (const entry of inv) {
      if ((entry.inv.count[j] ?? 0) < 1) continue;
      camera = [entry.inv.camX[j]!, entry.inv.camY[j]!];
      viewId = entry.view.id;
      break;
    }
    points.push({
      world,
      projector: [px, py],
      camera,
      viewId,
      objectId: 0,
    });
  }

  const planes = ransacPlanes(
    points.map((p) => p.world),
    { maxPlanes: 4, threshold: 0.03 },
  );
  const assigned = new Set<number>();
  const surfaces: SurfaceMesh[] = planes.map((plane, idx) => {
    const surfPoints = plane.inliers.map((i) => {
      assigned.add(i);
      const pt = points[i]!;
      return { ...pt, objectId: idx };
    });
    for (const i of plane.inliers) {
      const pt = points[i];
      if (pt) pt.objectId = idx;
    }
    return {
      id: `plane-${idx}`,
      label: plane.label,
      points: surfPoints,
      plane,
    };
  });

  const leftover = points.filter((_, i) => !assigned.has(i));
  if (leftover.length > 20) {
    surfaces.push({
      id: "objects",
      label: "objects",
      points: leftover.map((p) => ({ ...p, objectId: surfaces.length })),
      plane: null,
    });
  }

  return {
    projector,
    projectorWidth,
    projectorHeight,
    points,
    surfaces,
    views,
  };
}

export function mappingStats(mapping: Mapping): {
  points: number;
  surfaces: number;
  rms: number;
  projectorOrigin: Vec3;
} {
  return {
    points: mapping.points.length,
    surfaces: mapping.surfaces.length,
    rms: mapping.projector.rms,
    projectorOrigin: originFromPose(mapping.projector.pose),
  };
}
