import type { Mat3 } from "../math/vec";

/** DeviceOrientation degrees → rough world-to-camera rotation (Y-up). */
export function rotationFromDeviceOrientation(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
): Mat3 {
  const a = (alphaDeg * Math.PI) / 180;
  const b = (betaDeg * Math.PI) / 180;
  const g = (gammaDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cg = Math.cos(g);
  const sg = Math.sin(g);
  // R = Rz(alpha) Rx(beta) Ry(gamma), then map to OpenCV (y down) by flipping Y.
  const r00 = ca * cg - sa * sb * sg;
  const r01 = -sa * cb;
  const r02 = ca * sg + sa * sb * cg;
  const r10 = sa * cg + ca * sb * sg;
  const r11 = ca * cb;
  const r12 = sa * sg - ca * sb * cg;
  const r20 = -cb * sg;
  const r21 = sb;
  const r22 = cb * cg;
  return [r00, r01, r02, -r10, -r11, -r12, r20, r21, r22];
}

export function yawDelta(alpha: number, alpha0: number): number {
  let d = alpha - alpha0;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
