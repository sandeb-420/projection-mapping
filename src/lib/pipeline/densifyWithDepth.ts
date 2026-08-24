import type { MappedPoint, ViewCapture } from "./mapping";
import {
  mat3Invert,
  mat3Transpose,
  mat3Vec,
  sub,
  unproject,
  type Vec3,
} from "../math/vec";

/**
 * Fill projector pixels that two-view triangulation missed.
 *
 * Gray-code IDs still name the projector pixel. When only one phone saw that
 * stripe, DA3/MoGe (or sim) depth supplies the 3D point. Two-view Gray-code
 * points win on collisions — they do not use monocular depth.
 */
export function densifyWithDepth(
  views: ViewCapture[],
  existing: MappedPoint[],
  projectorWidth: number,
  projectorHeight: number,
  stride = 3,
): MappedPoint[] {
  const occupied = new Set<number>();
  for (const point of existing) {
    const px = Math.round(point.projector[0]);
    const py = Math.round(point.projector[1]);
    if (px < 0 || py < 0 || px >= projectorWidth || py >= projectorHeight) continue;
    occupied.add(py * projectorWidth + px);
  }

  const extra: MappedPoint[] = [];
  for (const view of views) {
    const depth = view.depth;
    const map = view.map;
    if (!depth || !map || depth.length < 4) continue;
    const w = view.width;
    const h = view.height;
    if (depth.length < w * h || map.projX.length < w * h) continue;
    const kInv = mat3Invert(view.K);
    if (!kInv) continue;
    const rt = mat3Transpose(view.pose.R);

    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const i = y * w + x;
        const px = map.projX[i] ?? -1;
        const py = map.projY[i] ?? -1;
        if (px < 0 || py < 0 || px >= projectorWidth || py >= projectorHeight) continue;
        const j = py * projectorWidth + px;
        if (occupied.has(j)) continue;
        const z = depth[i] ?? 0;
        if (!Number.isFinite(z) || z < 0.15 || z > 20) continue;
        const cam = unproject(kInv, x, y, z);
        extra.push({
          world: cameraToWorld(rt, view.pose.t, cam),
          projector: [px, py],
          camera: [x, y],
          viewId: view.id,
          objectId: 0,
        });
        occupied.add(j);
      }
    }
  }

  return extra.length ? existing.concat(extra) : existing;
}

function cameraToWorld(rt: ReturnType<typeof mat3Transpose>, t: Vec3, cam: Vec3): Vec3 {
  return mat3Vec(rt, sub(cam, t));
}
