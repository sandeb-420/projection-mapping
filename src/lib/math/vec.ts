/** Row-major linear algebra for OpenCV-style coordinates (x right, y down, z forward). */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export const EPS = 1e-12;

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const n = length(a);
  if (n < EPS) return [0, 0, 0];
  return scale(a, 1 / n);
}

export function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(scale(a, 1 - t), scale(b, t));
}

export function identity3(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function identity4(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] =
        a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
    }
  }
  return r as unknown as Mat3;
}

export function mat3Vec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mat3Transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function mat3Det(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function mat3Invert(m: Mat3): Mat3 | null {
  const det = mat3Det(m);
  if (Math.abs(det) < EPS) return null;
  const invDet = 1 / det;
  return [
    (m[4] * m[8] - m[5] * m[7]) * invDet,
    (m[2] * m[7] - m[1] * m[8]) * invDet,
    (m[1] * m[5] - m[2] * m[4]) * invDet,
    (m[5] * m[6] - m[3] * m[8]) * invDet,
    (m[0] * m[8] - m[2] * m[6]) * invDet,
    (m[2] * m[3] - m[0] * m[5]) * invDet,
    (m[3] * m[7] - m[4] * m[6]) * invDet,
    (m[1] * m[6] - m[0] * m[7]) * invDet,
    (m[0] * m[4] - m[1] * m[3]) * invDet,
  ];
}

/** OpenCV camera: +Z forward, +X right, +Y down. `up` is world up (usually +Y). */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): { R: Mat3; t: Vec3 } {
  const z = normalize(sub(target, eye));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const R: Mat3 = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  const t = scale(mat3Vec(R, eye), -1);
  return { R, t };
}

export function transformPoint(R: Mat3, t: Vec3, p: Vec3): Vec3 {
  return add(mat3Vec(R, p), t);
}

export function transformDir(R: Mat3, d: Vec3): Vec3 {
  return mat3Vec(R, d);
}

export function cameraFromRt(R: Mat3, t: Vec3): Vec3 {
  // C = -R^T t
  return scale(mat3Vec(mat3Transpose(R), t), -1);
}

export function pinholeK(fx: number, fy: number, cx: number, cy: number): Mat3 {
  return [fx, 0, cx, 0, fy, cy, 0, 0, 1];
}

export function kFromFov(
  width: number,
  height: number,
  fovYDeg: number,
): Mat3 {
  const fy = (height * 0.5) / Math.tan((fovYDeg * Math.PI) / 360);
  const fx = fy;
  return pinholeK(fx, fy, (width - 1) / 2, (height - 1) / 2);
}

export function project(K: Mat3, R: Mat3, t: Vec3, p: Vec3): Vec2 | null {
  const cam = transformPoint(R, t, p);
  if (cam[2] <= EPS) return null;
  const n = mat3Vec(K, cam);
  return [n[0] / n[2], n[1] / n[2]];
}

export function unproject(Kinv: Mat3, x: number, y: number, depth: number): Vec3 {
  const ray = mat3Vec(Kinv, [x, y, 1]);
  return scale(ray, depth / ray[2]);
}

export function meanVec3(points: readonly Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return [x / n, y / n, z / n];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function mat3FromRows(r0: Vec3, r1: Vec3, r2: Vec3): Mat3 {
  return [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
}

export function orthonormalize(R: Mat3): Mat3 {
  const r0 = normalize([R[0], R[1], R[2]]);
  const r1raw = [R[3], R[4], R[5]] as Vec3;
  const r1 = normalize(sub(r1raw, scale(r0, dot(r0, r1raw))));
  const r2 = cross(r0, r1);
  return mat3FromRows(r0, r1, r2);
}
