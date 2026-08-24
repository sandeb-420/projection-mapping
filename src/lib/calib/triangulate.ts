import type { Mat3, Vec2, Vec3 } from "../math/vec";
import { add, cross, dot, length, mat3Invert, mat3Vec, scale, sub } from "../math/vec";
import type { Pose } from "./projectorPnp";

export function triangulateTwoViews(
  K1: Mat3,
  pose1: Pose,
  uv1: Vec2,
  K2: Mat3,
  pose2: Pose,
  uv2: Vec2,
): Vec3 | null {
  const K1inv = mat3Invert(K1);
  const K2inv = mat3Invert(K2);
  if (!K1inv || !K2inv) return null;

  const d1 = mat3Vec(K1inv, [uv1[0], uv1[1], 1]);
  const d2 = mat3Vec(K2inv, [uv2[0], uv2[1], 1]);
  const r1t = transposeR(pose1.R);
  const r2t = transposeR(pose2.R);
  const dir1 = mat3Vec(r1t, d1);
  const dir2 = mat3Vec(r2t, d2);
  const o1 = originFromPose(pose1);
  const o2 = originFromPose(pose2);
  return midpointTriangulate(o1, dir1, o2, dir2);
}

export function originFromPose(pose: Pose): Vec3 {
  const Rt = transposeR(pose.R);
  return scale(mat3Vec(Rt, pose.t), -1);
}

function transposeR(R: Mat3): Mat3 {
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}

/** Closest-point triangulation of two skew rays. */
export function midpointTriangulate(
  o1: Vec3,
  d1raw: Vec3,
  o2: Vec3,
  d2raw: Vec3,
): Vec3 | null {
  const d1 = scale(d1raw, 1 / Math.max(length(d1raw), 1e-12));
  const d2 = scale(d2raw, 1 / Math.max(length(d2raw), 1e-12));
  const w0 = sub(o1, o2);
  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const d = dot(d1, w0);
  const e = dot(d2, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-12) return null;
  const t = (b * e - c * d) / denom;
  const s = (a * e - b * d) / denom;
  if (t < 0 && s < 0) return null;
  const p1 = add(o1, scale(d1, t));
  const p2 = add(o2, scale(d2, s));
  return scale(add(p1, p2), 0.5);
}

export function rayFromPixel(
  K: Mat3,
  pose: Pose,
  uv: Vec2,
): { origin: Vec3; dir: Vec3 } | null {
  const Kinv = mat3Invert(K);
  if (!Kinv) return null;
  const camDir = mat3Vec(Kinv, [uv[0], uv[1], 1]);
  const Rt = transposeR(pose.R);
  return {
    origin: originFromPose(pose),
    dir: mat3Vec(Rt, camDir),
  };
}

export function triangulateCameraProjector(
  cameraK: Mat3,
  cameraPose: Pose,
  cameraUv: Vec2,
  projectorK: Mat3,
  projectorPose: Pose,
  projectorUv: Vec2,
): Vec3 | null {
  return triangulateTwoViews(
    cameraK,
    cameraPose,
    cameraUv,
    projectorK,
    projectorPose,
    projectorUv,
  );
}

export function planeNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return cross(sub(b, a), sub(c, a));
}
