import type { Vec2, Vec3 } from "../math/vec";
import { add, cross, dot, length, mat3Invert, mat3Vec, scale, sub } from "../math/vec";
import { originFromPose } from "../calib/triangulate";
import { project } from "../math/vec";
import type { GrayPattern } from "../patterns/grayCode";
import { sampleGrayBit } from "../patterns/grayCode";
import type { Quad, VirtualCamera, VirtualProjector, VirtualRoom } from "./room";

export interface Hit {
  point: Vec3;
  albedo: Vec3;
  depth: number;
  quadId: number;
  projectorUv: Vec2 | null;
}

export interface ViewTrace {
  camera: VirtualCamera;
  hits: (Hit | null)[];
}

const EPS = 1e-6;

function rayQuad(origin: Vec3, dir: Vec3, q: Quad): number | null {
  const n = cross(q.u, q.v);
  const denom = dot(n, dir);
  if (Math.abs(denom) < EPS) return null;
  const t = dot(n, sub(q.origin, origin)) / denom;
  if (t < 0.02) return null;
  const p = add(origin, scale(dir, t));
  const w = sub(p, q.origin);
  const uu = dot(q.u, q.u);
  const vv = dot(q.v, q.v);
  const uv = dot(q.u, q.v);
  const wu = dot(w, q.u);
  const wv = dot(w, q.v);
  const det = uu * vv - uv * uv;
  if (Math.abs(det) < EPS) return null;
  const s = (vv * wu - uv * wv) / det;
  const r = (uu * wv - uv * wu) / det;
  if (s < 0 || r < 0 || s > 1 || r > 1) return null;
  return t;
}

function closestHit(origin: Vec3, dir: Vec3, quads: readonly Quad[]): { t: number; q: Quad } | null {
  let best: { t: number; q: Quad } | null = null;
  for (const q of quads) {
    const t = rayQuad(origin, dir, q);
    if (t === null) continue;
    if (!best || t < best.t) best = { t, q };
  }
  return best;
}

function cameraRay(camera: VirtualCamera, x: number, y: number): Vec3 | null {
  const Kinv = mat3Invert(camera.K);
  if (!Kinv) return null;
  const camDir = mat3Vec(Kinv, [x, y, 1]);
  const Rt = [
    camera.pose.R[0], camera.pose.R[3], camera.pose.R[6],
    camera.pose.R[1], camera.pose.R[4], camera.pose.R[7],
    camera.pose.R[2], camera.pose.R[5], camera.pose.R[8],
  ] as const;
  return mat3Vec(Rt, camDir);
}

function projectorUvFor(
  projector: VirtualProjector,
  point: Vec3,
): Vec2 | null {
  const uv = project(projector.K, projector.pose.R, projector.pose.t, point);
  if (!uv) return null;
  if (uv[0] < 0 || uv[1] < 0 || uv[0] >= projector.width || uv[1] >= projector.height) {
    return null;
  }
  return uv;
}

/** One raycast per phone pixel. Pattern painting reuses this. */
export function traceView(room: VirtualRoom, camera: VirtualCamera): ViewTrace {
  const origin = originFromPose(camera.pose);
  const hits: (Hit | null)[] = new Array(camera.width * camera.height);
  for (let y = 0; y < camera.height; y++) {
    for (let x = 0; x < camera.width; x++) {
      const dir = cameraRay(camera, x + 0.5, y + 0.5);
      if (!dir || length(dir) < EPS) {
        hits[y * camera.width + x] = null;
        continue;
      }
      const hit = closestHit(origin, dir, room.quads);
      if (!hit) {
        hits[y * camera.width + x] = null;
        continue;
      }
      const point = add(origin, scale(dir, hit.t));
      hits[y * camera.width + x] = {
        point,
        albedo: hit.q.albedo,
        depth: hit.t,
        quadId: hit.q.id,
        projectorUv: projectorUvFor(room.projector, point),
      };
    }
  }
  return { camera, hits };
}

export function paintPattern(
  trace: ViewTrace,
  pattern: GrayPattern | "scene" | "white-field",
): Uint8ClampedArray {
  const { width, height } = trace.camera;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < trace.hits.length; i++) {
    const hit = trace.hits[i];
    const o = i * 4;
    if (!hit) {
      pixels[o + 3] = 255;
      continue;
    }
    if (pattern === "scene") {
      const lit = hit.projectorUv ? 1.15 : 0.35;
      pixels[o] = Math.min(255, hit.albedo[0] * 255 * lit);
      pixels[o + 1] = Math.min(255, hit.albedo[1] * 255 * lit);
      pixels[o + 2] = Math.min(255, hit.albedo[2] * 255 * lit);
      pixels[o + 3] = 255;
      continue;
    }
    if (!hit.projectorUv) {
      pixels[o] = 8;
      pixels[o + 1] = 8;
      pixels[o + 2] = 8;
      pixels[o + 3] = 255;
      continue;
    }
    const on =
      pattern === "white-field"
        ? true
        : sampleGrayBit(pattern, hit.projectorUv[0], hit.projectorUv[1]);
    const v = on ? 245 : 12;
    const shade = 0.55 + 0.45 * (hit.albedo[0] + hit.albedo[1] + hit.albedo[2]) / 3;
    const g = Math.min(255, v * shade);
    pixels[o] = g;
    pixels[o + 1] = g;
    pixels[o + 2] = g;
    pixels[o + 3] = 255;
  }
  return pixels;
}

/** Paint a baked projector look back onto a virtual camera view. */
export function paintLookOnTrace(
  trace: ViewTrace,
  baked: Uint8ClampedArray,
  projectorWidth: number,
  projectorHeight: number,
): Uint8ClampedArray {
  const { width, height } = trace.camera;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < trace.hits.length; i++) {
    const hit = trace.hits[i];
    const o = i * 4;
    pixels[o + 3] = 255;
    if (!hit) continue;
    if (!hit.projectorUv) {
      const dim = 0.22;
      pixels[o] = Math.min(255, hit.albedo[0] * 255 * dim);
      pixels[o + 1] = Math.min(255, hit.albedo[1] * 255 * dim);
      pixels[o + 2] = Math.min(255, hit.albedo[2] * 255 * dim);
      continue;
    }
    const px = Math.min(projectorWidth - 1, Math.max(0, Math.round(hit.projectorUv[0])));
    const py = Math.min(projectorHeight - 1, Math.max(0, Math.round(hit.projectorUv[1])));
    const ji = (py * projectorWidth + px) * 4;
    pixels[o] = baked[ji] ?? 0;
    pixels[o + 1] = baked[ji + 1] ?? 0;
    pixels[o + 2] = baked[ji + 2] ?? 0;
  }
  return pixels;
}

export function depthFromTrace(trace: ViewTrace): Float32Array {
  const depth = new Float32Array(trace.hits.length);
  for (let i = 0; i < trace.hits.length; i++) {
    depth[i] = trace.hits[i]?.depth ?? 0;
  }
  return depth;
}
