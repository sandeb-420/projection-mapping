import type { Mat3, Vec2, Vec3 } from "./vec";
import { add, length, scale, sub } from "./vec";

export interface Similarity2 {
  tx: number;
  ty: number;
  scale: number;
}

export interface Similarity3 {
  t: Vec3;
  scale: number;
}

/** Hartley isotropic normalization for 2D points (mean 0, mean dist √2). */
export function normalizePoints2(points: readonly Vec2[]): {
  normalized: Vec2[];
  T: Similarity2;
} {
  const n = points.length;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p[0];
    my += p[1];
  }
  mx /= n;
  my /= n;
  let meanDist = 0;
  for (const p of points) {
    meanDist += Math.hypot(p[0] - mx, p[1] - my);
  }
  meanDist /= n;
  const s = meanDist > 1e-9 ? Math.SQRT2 / meanDist : 1;
  const normalized: Vec2[] = points.map((p) => [
    (p[0] - mx) * s,
    (p[1] - my) * s,
  ]);
  return { normalized, T: { tx: mx, ty: my, scale: s } };
}

/** Hartley isotropic normalization for 3D points (mean 0, mean dist √3). */
export function normalizePoints3(points: readonly Vec3[]): {
  normalized: Vec3[];
  T: Similarity3;
} {
  const n = points.length;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of points) {
    mx += p[0];
    my += p[1];
    mz += p[2];
  }
  mx /= n;
  my /= n;
  mz /= n;
  const c: Vec3 = [mx, my, mz];
  let meanDist = 0;
  for (const p of points) meanDist += length(sub(p, c));
  meanDist /= n;
  const s = meanDist > 1e-9 ? Math.sqrt(3) / meanDist : 1;
  const normalized: Vec3[] = points.map((p) => scale(sub(p, c), s));
  return { normalized, T: { t: c, scale: s } };
}

export function denormalizeP(
  P: Float64Array,
  T2: Similarity2,
  T3: Similarity3,
): Float64Array {
  // P_orig = T2^{-1} P_norm T3
  // T2 maps original 2D -> normalized: x' = s (x - t)
  // T2^{-1}: x = x'/s + t
  const s2 = T2.scale;
  const s3 = T3.scale;
  const out = new Float64Array(12);
  // P_norm is 3x4. Apply T3 on the right: X_n = s3 (X - t3)
  // P_n * [s3 0 0 -s3 tx; ...] then left-multiply T2inv.
  const Pn = [
    [P[0]!, P[1]!, P[2]!, P[3]!],
    [P[4]!, P[5]!, P[6]!, P[7]!],
    [P[8]!, P[9]!, P[10]!, P[11]!],
  ];
  const T3m = [
    [s3, 0, 0, -s3 * T3.t[0]],
    [0, s3, 0, -s3 * T3.t[1]],
    [0, 0, s3, -s3 * T3.t[2]],
    [0, 0, 0, 1],
  ];
  const PT: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      PT[i]![j] =
        Pn[i]![0]! * T3m[0]![j]! +
        Pn[i]![1]! * T3m[1]![j]! +
        Pn[i]![2]! * T3m[2]![j]! +
        (j === 3 ? Pn[i]![3]! : 0);
    }
  }
  // T2inv = [1/s, 0, tx; 0, 1/s, ty; 0, 0, 1]
  const invS = 1 / s2;
  for (let j = 0; j < 4; j++) {
    out[j] = invS * PT[0]![j]! + T2.tx * PT[2]![j]!;
    out[4 + j] = invS * PT[1]![j]! + T2.ty * PT[2]![j]!;
    out[8 + j] = PT[2]![j]!;
  }
  return out;
}

export function similarity2ApplyInverse(T: Similarity2, p: Vec2): Vec2 {
  return [p[0] / T.scale + T.tx, p[1] / T.scale + T.ty];
}

export function centroid(points: readonly Vec3[]): Vec3 {
  return points.reduce(
    (acc, p) => add(acc, scale(p, 1 / points.length)),
    [0, 0, 0] as Vec3,
  );
}

export type Intrinsics = {
  K: Mat3;
  width: number;
  height: number;
};
