import type { Mat3, Vec2, Vec3 } from "../math/vec";
import {
  cameraFromRt,
  mat3Det,
  mat3Invert,
  mat3Mul,
  mat3Vec,
  orthonormalize,
  scale,
  transformPoint,
} from "../math/vec";
import { smallestRightNullspace, jacobiEigenSymmetric } from "../math/eigen";
import { denormalizeP, normalizePoints2, normalizePoints3 } from "../math/normalize";

export interface Pose {
  R: Mat3;
  t: Vec3;
}

export type ProjectorPoseSource = "opencv-pnp" | "dlt";

export interface ProjectorCalibration {
  K: Mat3;
  pose: Pose;
  rms: number;
  inliers: number;
  source: ProjectorPoseSource;
}

function givens(a: number, b: number): { c: number; s: number } {
  const r = Math.hypot(a, b);
  if (r < 1e-15) return { c: 1, s: 0 };
  return { c: a / r, s: -b / r };
}

function rotX(c: number, s: number): Mat3 {
  return [1, 0, 0, 0, c, s, 0, -s, c];
}
function rotY(c: number, s: number): Mat3 {
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
function rotZ(c: number, s: number): Mat3 {
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/** RQ decomposition: M = K R with K upper-triangular, R rotation. */
export function rqDecompose(M: Mat3): { K: Mat3; R: Mat3 } {
  let m: Mat3 = [...M] as unknown as Mat3;
  const qx = givens(m[8], m[7]);
  m = mat3Mul(m, rotX(qx.c, qx.s));
  const qy = givens(m[8], m[6]);
  m = mat3Mul(m, rotY(qy.c, -qy.s));
  const qz = givens(m[4], m[3]);
  m = mat3Mul(m, rotZ(qz.c, qz.s));

  let K: Mat3 = m;
  let R = mat3Mul(
    rotZ(qz.c, -qz.s),
    mat3Mul(rotY(qy.c, qy.s), rotX(qx.c, -qx.s)),
  );

  if (K[0] < 0) {
    K = [ -K[0], -K[1], -K[2], K[3], K[4], K[5], K[6], K[7], K[8] ];
    R = [
      -R[0], -R[1], -R[2],
      R[3], R[4], R[5],
      R[6], R[7], R[8],
    ];
  }
  if (K[4] < 0) {
    K = [ K[0], K[1], K[2], -K[3], -K[4], -K[5], K[6], K[7], K[8] ];
    R = [
      R[0], R[1], R[2],
      -R[3], -R[4], -R[5],
      R[6], R[7], R[8],
    ];
  }
  if (K[8] < 0) {
    K = [ K[0], K[1], K[2], K[3], K[4], K[5], -K[6], -K[7], -K[8] ];
    R = [
      R[0], R[1], R[2],
      R[3], R[4], R[5],
      -R[6], -R[7], -R[8],
    ];
  }
  if (mat3Det(R) < 0) {
    R = [
      -R[0], -R[1], -R[2],
      -R[3], -R[4], -R[5],
      -R[6], -R[7], -R[8],
    ];
    K = [
      -K[0], -K[1], -K[2],
      -K[3], -K[4], -K[5],
      -K[6], -K[7], -K[8],
    ];
  }
  const scaleK = 1 / K[8];
  K = [
    K[0] * scaleK, K[1] * scaleK, K[2] * scaleK,
    K[3] * scaleK, K[4] * scaleK, K[5] * scaleK,
    0, 0, 1,
  ];
  R = orthonormalize(R);
  return { K, R };
}

function dlt(points3d: readonly Vec3[], points2d: readonly Vec2[]): Float64Array {
  const n = points3d.length;
  const A = new Float64Array(n * 2 * 12);
  for (let i = 0; i < n; i++) {
    const [X, Y, Z] = points3d[i]!;
    const [u, v] = points2d[i]!;
    const r0 = i * 2 * 12;
    const r1 = r0 + 12;
    A[r0 + 0] = X;
    A[r0 + 1] = Y;
    A[r0 + 2] = Z;
    A[r0 + 3] = 1;
    A[r0 + 8] = -u * X;
    A[r0 + 9] = -u * Y;
    A[r0 + 10] = -u * Z;
    A[r0 + 11] = -u;
    A[r1 + 4] = X;
    A[r1 + 5] = Y;
    A[r1 + 6] = Z;
    A[r1 + 7] = 1;
    A[r1 + 8] = -v * X;
    A[r1 + 9] = -v * Y;
    A[r1 + 10] = -v * Z;
    A[r1 + 11] = -v;
  }
  return smallestRightNullspace(n * 2, 12, A);
}

function projectP(P: Float64Array, X: Vec3): Vec2 {
  const u =
    P[0]! * X[0] + P[1]! * X[1] + P[2]! * X[2] + P[3]!;
  const v =
    P[4]! * X[0] + P[5]! * X[1] + P[6]! * X[2] + P[7]!;
  const w =
    P[8]! * X[0] + P[9]! * X[1] + P[10]! * X[2] + P[11]!;
  return [u / w, v / w];
}

function rmsError(
  P: Float64Array,
  points3d: readonly Vec3[],
  points2d: readonly Vec2[],
): number {
  let s = 0;
  for (let i = 0; i < points3d.length; i++) {
    const [u, v] = projectP(P, points3d[i]!);
    const d0 = u - points2d[i]![0];
    const d1 = v - points2d[i]![1];
    s += d0 * d0 + d1 * d1;
  }
  return Math.sqrt(s / points3d.length);
}

function decomposeP(P: Float64Array): { K: Mat3; pose: Pose } {
  const M: Mat3 = [
    P[0]!, P[1]!, P[2]!,
    P[4]!, P[5]!, P[6]!,
    P[8]!, P[9]!, P[10]!,
  ];
  const { K, R } = rqDecompose(M);
  const KinvApprox = invertUpperK(K);
  const tTrue = mat3Vec(KinvApprox, [P[3]!, P[7]!, P[11]!]);
  return { K, pose: { R, t: tTrue } };
}

function polarRotation(M: Mat3): Mat3 {
  const ata = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      ata[i * 3 + j] = M[i]! * M[j]! + M[3 + i]! * M[3 + j]! + M[6 + i]! * M[6 + j]!;
    }
  }
  const { values, vectors: V } = jacobiEigenSymmetric(ata, 3);
  const U = new Float64Array(9);
  for (let k = 0; k < 3; k++) {
    const sk = Math.sqrt(Math.max(values[k]!, 1e-12));
    const vx = V[k]!;
    const vy = V[3 + k]!;
    const vz = V[6 + k]!;
    U[k] = (M[0] * vx + M[1] * vy + M[2] * vz) / sk;
    U[3 + k] = (M[3] * vx + M[4] * vy + M[5] * vz) / sk;
    U[6 + k] = (M[6] * vx + M[7] * vy + M[8] * vz) / sk;
  }
  const R: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      R[r * 3 + c] =
        U[r * 3]! * V[c * 3]! +
        U[r * 3 + 1]! * V[c * 3 + 1]! +
        U[r * 3 + 2]! * V[c * 3 + 2]!;
    }
  }
  const rot = R as unknown as Mat3;
  if (mat3Det(rot) < 0) {
    return [-rot[0], -rot[1], -rot[2], -rot[3], -rot[4], -rot[5], -rot[6], -rot[7], -rot[8]];
  }
  return rot;
}

function cameraCenterFromP(P: Float64Array): Vec3 {
  const C = smallestRightNullspace(3, 4, P);
  const w = Math.abs(C[3]!) < 1e-12 ? 1e-12 : C[3]!;
  return [C[0]! / w, C[1]! / w, C[2]! / w];
}

function pixelP(K: Mat3, Pnorm: Float64Array): Float64Array {
  const out = new Float64Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] =
        K[i * 3]! * Pnorm[j]! +
        K[i * 3 + 1]! * Pnorm[4 + j]! +
        K[i * 3 + 2]! * Pnorm[8 + j]!;
    }
  }
  return out;
}

function invertUpperK(K: Mat3): Mat3 {
  const fx = K[0] || 1;
  const s = K[1] ?? 0;
  const cx = K[2] ?? 0;
  const fy = K[4] || 1;
  const cy = K[5] ?? 0;
  return [
    1 / fx, -s / (fx * fy), (s * cy - cx * fy) / (fx * fy),
    0, 1 / fy, -cy / fy,
    0, 0, 1,
  ];
}

function enforceCheirality(P: Float64Array, points: readonly Vec3[]): Float64Array {
  let pos = 0;
  let neg = 0;
  for (const X of points) {
    const w = P[8]! * X[0] + P[9]! * X[1] + P[10]! * X[2] + P[11]!;
    if (w > 0) pos++;
    else neg++;
  }
  if (neg > pos) {
    for (let i = 0; i < 12; i++) P[i] = -(P[i] ?? 0);
  }
  return P;
}

export function calibrateProjectorDlt(
  points3d: readonly Vec3[],
  points2d: readonly Vec2[],
): ProjectorCalibration {
  if (points3d.length < 6) {
    throw new Error("Need at least 6 3D–2D correspondences");
  }
  const n2 = normalizePoints2(points2d);
  const n3 = normalizePoints3(points3d);
  const Pnorm = dlt(n3.normalized, n2.normalized);
  const P = enforceCheirality(denormalizeP(Pnorm, n2.T, n3.T), points3d);
  const { K, pose } = decomposeP(P);
  const rms = rmsError(P, points3d, points2d);
  return { K, pose, rms, inliers: points3d.length, source: "dlt" };
}

/**
 * Projector resolution is known; FOV/throw is a prior (user setting or typical
 * short-throw). Solving R,t with known K is more stable than free DLT.
 */
export function calibrateProjectorKnownK(
  K: Mat3,
  points3d: readonly Vec3[],
  points2d: readonly Vec2[],
): ProjectorCalibration {
  const Kinv = mat3Invert(K);
  if (!Kinv) throw new Error("singular projector K");
  const n = points3d.length;
  const A = new Float64Array(n * 2 * 12);
  for (let i = 0; i < n; i++) {
    const [X, Y, Z] = points3d[i]!;
    const h = mat3Vec(Kinv, [points2d[i]![0], points2d[i]![1], 1]);
    const u = h[0] / h[2];
    const v = h[1] / h[2];
    const r0 = i * 2 * 12;
    const r1 = r0 + 12;
    A[r0 + 0] = X;
    A[r0 + 1] = Y;
    A[r0 + 2] = Z;
    A[r0 + 3] = 1;
    A[r0 + 8] = -u * X;
    A[r0 + 9] = -u * Y;
    A[r0 + 10] = -u * Z;
    A[r0 + 11] = -u;
    A[r1 + 4] = X;
    A[r1 + 5] = Y;
    A[r1 + 6] = Z;
    A[r1 + 7] = 1;
    A[r1 + 8] = -v * X;
    A[r1 + 9] = -v * Y;
    A[r1 + 10] = -v * Z;
    A[r1 + 11] = -v;
  }
  const P = enforceCheirality(smallestRightNullspace(n * 2, 12, A), points3d);
  const M: Mat3 = [
    P[0]!, P[1]!, P[2]!,
    P[4]!, P[5]!, P[6]!,
    P[8]!, P[9]!, P[10]!,
  ];
  let R = polarRotation(M);
  const C = cameraCenterFromP(P);
  let t = scale(mat3Vec(R, C), -1);
  if (transformPoint(R, t, points3d[0]!)[2] < 0) {
    R = [-R[0], -R[1], -R[2], -R[3], -R[4], -R[5], -R[6], -R[7], -R[8]];
    t = scale(mat3Vec(R, C), -1);
  }
  const pose = { R, t };
  const pix = pixelP(K, P);
  return {
    K,
    pose,
    rms: rmsError(pix, points3d, points2d),
    inliers: points3d.length,
    source: "dlt",
  };
}

export function ransacProjectorDlt(
  points3d: readonly Vec3[],
  points2d: readonly Vec2[],
  options?: { iterations?: number; threshold?: number; sample?: number; K?: Mat3 },
): ProjectorCalibration {
  const fit = (pts: readonly Vec3[], uvs: readonly Vec2[]) =>
    options?.K
      ? calibrateProjectorKnownK(options.K, pts, uvs)
      : calibrateProjectorDlt(pts, uvs);
  const iterations = options?.iterations ?? 80;
  const threshold = options?.threshold ?? 2.5;
  const sampleN = options?.sample ?? 12;
  const n = points3d.length;
  if (n < sampleN) return fit(points3d, points2d);

  let bestInliers: number[] = [];
  let best: ProjectorCalibration | null = null;

  for (let k = 0; k < iterations; k++) {
    const idx = pick(n, sampleN);
    try {
      const cal = fit(
        idx.map((i) => points3d[i]!),
        idx.map((i) => points2d[i]!),
      );
      const P = packP(cal);
      const inliers: number[] = [];
      for (let i = 0; i < n; i++) {
        const [u, v] = projectP(P, points3d[i]!);
        const du = u - points2d[i]![0];
        const dv = v - points2d[i]![1];
        if (du * du + dv * dv < threshold * threshold) inliers.push(i);
      }
      if (inliers.length > bestInliers.length) {
        bestInliers = inliers;
        best = cal;
      }
    } catch {
      // singular sample
    }
  }

  if (!best || bestInliers.length < 6) {
    return fit(points3d, points2d);
  }
  const refined = fit(
    bestInliers.map((i) => points3d[i]!),
    bestInliers.map((i) => points2d[i]!),
  );
  return { ...refined, inliers: bestInliers.length, source: "dlt" };
}

function packP(cal: ProjectorCalibration): Float64Array {
  const { K, pose } = cal;
  const Rt = [
    pose.R[0], pose.R[1], pose.R[2], pose.t[0],
    pose.R[3], pose.R[4], pose.R[5], pose.t[1],
    pose.R[6], pose.R[7], pose.R[8], pose.t[2],
  ];
  const P = new Float64Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      P[i * 4 + j] =
        K[i * 3]! * Rt[j]! +
        K[i * 3 + 1]! * Rt[4 + j]! +
        K[i * 3 + 2]! * Rt[8 + j]!;
    }
  }
  return P;
}

function pick(n: number, k: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx.slice(0, k);
}

export function projectorCenter(cal: ProjectorCalibration): Vec3 {
  return cameraFromRt(cal.pose.R, cal.pose.t);
}
