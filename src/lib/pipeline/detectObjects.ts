import type { Vec3 } from "../math/vec";
import { add, length, scale, sub, transformPoint } from "../math/vec";
import type { Pose } from "../calib/projectorPnp";
import type { Mapping } from "../pipeline/mapping";

export interface DepthFrame {
  width: number;
  height: number;
  /** Metric depth in meters, row-major. 0 = invalid. */
  depth: Float32Array;
  Kfx: number;
  Kfy: number;
  cx: number;
  cy: number;
  /** Live camera world-to-camera pose. Required to compare against mapped world points. */
  pose: Pose;
}

export interface DetectedObject {
  id: string;
  pixelCount: number;
  centroid: Vec3;
  bbox: { x: number; y: number; w: number; h: number };
}

/**
 * Always-on depth/object watch is deferred until the recapture walk-around
 * works on a real phone + display. Keep this module out of the host UI.
 * DepthART / ZipDepth / TypeGPU belong here later, not in look generation.
 */
export const LIVE_WATCH_ENABLED = false;

/**
 * Compare a live depth frame to the calibrated mapping. Blobs that sit
 * well in front of existing surfaces are treated as newly placed objects.
 *
 * This is the only stage that wants ~25ms passes (ZipDepth / DepthART /
 * TypeGPU). Shader generation is not realtime.
 */
export function detectNewObjects(
  live: DepthFrame,
  mapping: Mapping,
  options?: { minPixels?: number; minOffsetM?: number },
): DetectedObject[] {
  const minPixels = options?.minPixels ?? 80;
  const minOffset = options?.minOffsetM ?? 0.12;

  const expected = expectedDepthMap(live, mapping);
  const w = live.width;
  const h = live.height;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < live.depth.length; i++) {
    const d = live.depth[i]!;
    const e = expected[i]!;
    if (d <= 0) continue;
    if (e <= 0 || e - d > minOffset) mask[i] = 1;
  }

  const visited = new Uint8Array(w * h);
  const objects: DetectedObject[] = [];
  const stack: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || visited[i]) continue;
      stack.length = 0;
      stack.push(i);
      visited[i] = 1;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      const worldAcc: Vec3[] = [];
      while (stack.length) {
        const idx = stack.pop()!;
        const cy = Math.floor(idx / w);
        const cx = idx - cy * w;
        count++;
        sx += cx;
        sy += cy;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        const z = live.depth[idx]!;
        const X = ((cx - live.cx) * z) / live.Kfx;
        const Y = ((cy - live.cy) * z) / live.Kfy;
        worldAcc.push([X, Y, z]);
        for (const [nx, ny] of neighbors(cx, cy, w, h)) {
          const ni = ny * w + nx;
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }
      if (count < minPixels) continue;
      const centroid = worldAcc.reduce(
        (a, p) => add(a, scale(p, 1 / worldAcc.length)),
        [0, 0, 0] as Vec3,
      );
      objects.push({
        id: `obj-${objects.length + 1}`,
        pixelCount: count,
        centroid,
        bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      });
    }
  }
  return objects.sort((a, b) => b.pixelCount - a.pixelCount);
}

function neighbors(x: number, y: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  if (x > 0) out.push([x - 1, y]);
  if (x + 1 < w) out.push([x + 1, y]);
  if (y > 0) out.push([x, y - 1]);
  if (y + 1 < h) out.push([x, y + 1]);
  return out;
}

/**
 * Render a coarse expected depth by splatting mapped points into the live
 * camera. Good enough for residual blobs; not a full rasterizer.
 */
function expectedDepthMap(live: DepthFrame, mapping: Mapping): Float32Array {
  const out = new Float32Array(live.width * live.height);
  const fx = live.Kfx;
  const fy = live.Kfy;
  // Map points are in world coordinates. Without the live camera pose we
  // compare against a sparse z-buffer built in the first capture view.
  for (const p of mapping.points) {
    const cam = transformPoint(live.pose.R, live.pose.t, p.world);
    const z = cam[2];
    if (z <= 0.05) continue;
    const u = Math.round(fx * (cam[0] / z) + live.cx);
    const v = Math.round(fy * (cam[1] / z) + live.cy);
    if (u < 0 || v < 0 || u >= live.width || v >= live.height) continue;
    const i = v * live.width + u;
    if (out[i] === 0 || z < out[i]!) out[i] = z;
  }
  dilateDepth(out, live.width, live.height, 6);
  return out;
}

function dilateDepth(buf: Float32Array, w: number, h: number, radius: number): void {
  const copy = buf.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const z = copy[yy * w + xx]!;
          if (z > 0 && (best === 0 || z < best)) best = z;
        }
      }
      buf[y * w + x] = best;
    }
  }
}

export function objectMoved(
  prev: DetectedObject[],
  next: DetectedObject[],
  thresholdM = 0.08,
): boolean {
  if (prev.length !== next.length) return true;
  for (const a of next) {
    const match = prev.find((b) => length(sub(a.centroid, b.centroid)) < thresholdM);
    if (!match) return true;
  }
  return false;
}
