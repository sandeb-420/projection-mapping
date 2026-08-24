import type { Vec3 } from "../math/vec";
import { add, dot, length, normalize, scale, sub } from "../math/vec";

export interface Plane {
  normal: Vec3;
  offset: number;
  inliers: number[];
  label: string;
}

function planeFromPoints(a: Vec3, b: Vec3, c: Vec3): { n: Vec3; d: number } | null {
  const n = normalize(crossSafe(sub(b, a), sub(c, a)));
  if (length(n) < 1e-8) return null;
  return { n, d: -dot(n, a) };
}

function crossSafe(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function distToPlane(p: Vec3, n: Vec3, d: number): number {
  return Math.abs(dot(n, p) + d);
}

export function ransacPlanes(
  points: readonly Vec3[],
  options?: {
    maxPlanes?: number;
    iterations?: number;
    threshold?: number;
    minInliers?: number;
  },
): Plane[] {
  const maxPlanes = options?.maxPlanes ?? 4;
  const iterations = options?.iterations ?? 120;
  const threshold = options?.threshold ?? 0.025;
  const minInliers = options?.minInliers ?? Math.max(40, Math.floor(points.length * 0.04));

  const remaining = points.map((_, i) => i);
  const planes: Plane[] = [];
  const used = new Set<number>();

  for (let p = 0; p < maxPlanes; p++) {
    const pool = remaining.filter((i) => !used.has(i));
    if (pool.length < minInliers) break;
    let best: { n: Vec3; d: number; inliers: number[] } | null = null;

    for (let k = 0; k < iterations; k++) {
      const i0 = pool[Math.floor(Math.random() * pool.length)]!;
      const i1 = pool[Math.floor(Math.random() * pool.length)]!;
      const i2 = pool[Math.floor(Math.random() * pool.length)]!;
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      const fitted = planeFromPoints(points[i0]!, points[i1]!, points[i2]!);
      if (!fitted) continue;
      const inliers: number[] = [];
      for (const idx of pool) {
        if (distToPlane(points[idx]!, fitted.n, fitted.d) < threshold) {
          inliers.push(idx);
        }
      }
      if (!best || inliers.length > best.inliers.length) {
        best = { ...fitted, inliers };
      }
    }

    if (!best || best.inliers.length < minInliers) break;
    const refined = refinePlane(points, best.inliers);
    const label = labelPlane(refined.n);
    planes.push({
      normal: refined.n,
      offset: refined.d,
      inliers: best.inliers,
      label,
    });
    for (const i of best.inliers) used.add(i);
  }

  return planes;
}

function refinePlane(
  points: readonly Vec3[],
  inliers: readonly number[],
): { n: Vec3; d: number } {
  const subset = inliers.map((i) => points[i]!);
  const c = subset.reduce(
    (acc, p) => add(acc, scale(p, 1 / subset.length)),
    [0, 0, 0] as Vec3,
  );
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of subset) {
    const d = sub(p, c);
    xx += d[0] * d[0];
    xy += d[0] * d[1];
    xz += d[0] * d[2];
    yy += d[1] * d[1];
    yz += d[1] * d[2];
    zz += d[2] * d[2];
  }
  // Smallest-eigenvalue of covariance via a few power-iteration-on-adjugate-style trials.
  const candidates: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
  ];
  let bestN: Vec3 = [0, 1, 0];
  let bestVar = Infinity;
  for (const seed of candidates) {
    let n = normalize(seed);
    for (let i = 0; i < 8; i++) {
      const Cx: Vec3 = [
        xx * n[0] + xy * n[1] + xz * n[2],
        xy * n[0] + yy * n[1] + yz * n[2],
        xz * n[0] + yz * n[1] + zz * n[2],
      ];
      // Inverse-iteration approximation: n <- n / ||C n|| mixed with residual.
      const r = sub(n, scale(Cx, 1 / Math.max(length(Cx), 1e-9)));
      n = normalize(length(r) < 1e-9 ? n : r);
    }
    const varN = xx * n[0] * n[0] + yy * n[1] * n[1] + zz * n[2] * n[2]
      + 2 * xy * n[0] * n[1] + 2 * xz * n[0] * n[2] + 2 * yz * n[1] * n[2];
    if (varN < bestVar) {
      bestVar = varN;
      bestN = n;
    }
  }
  return { n: bestN, d: -dot(bestN, c) };
}

function labelPlane(n: Vec3): string {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return n[1] < 0 ? "ceiling" : "floor";
  if (az >= ax) return "wall";
  return "side-wall";
}
