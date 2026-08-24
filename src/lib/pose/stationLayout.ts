import type { Mat3, Vec3 } from "../math/vec";
import { add, kFromFov, lookAt } from "../math/vec";
import type { Pose } from "../calib/projectorPnp";

export interface LabeledPose {
  id: string;
  K: Mat3;
  pose: Pose;
  eye: Vec3;
}

const UP: Vec3 = [0, 1, 0];
const LOOK: Vec3 = [0, 1.0, 3.2];

/** Nominal walk-around if DA3 is unavailable. Matches the virtual-room stations. */
export function stationLayoutPoses(
  width: number,
  height: number,
  fovY = 62,
): LabeledPose[] {
  const K = kFromFov(width, height, fovY);
  const eyes: Array<{ id: string; eye: Vec3; target: Vec3 }> = [
    { id: "center", eye: [0.12, 1.32, 0.85], target: LOOK },
    { id: "left", eye: [-0.75, 1.3, 1.05], target: add(LOOK, [-0.2, 0, 0]) },
    { id: "right", eye: [0.85, 1.28, 1.1], target: add(LOOK, [0.15, -0.05, 0]) },
    { id: "detail", eye: [0.35, 1.15, 1.85], target: [0.3, 0.9, 2.6] },
  ];
  return eyes.map((e) => ({
    id: e.id,
    K,
    pose: lookAt(e.eye, e.target, UP),
    eye: e.eye,
  }));
}
