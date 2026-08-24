import type { Mat3, Vec3 } from "../math/vec";
import { cameraFromRt } from "../math/vec";

export interface Pose {
  R: Mat3;
  t: Vec3;
}

export type ProjectorPoseSource = "opencv-pnp";

export interface ProjectorCalibration {
  K: Mat3;
  pose: Pose;
  rms: number;
  inliers: number;
  source: ProjectorPoseSource;
}

export function projectorCenter(cal: ProjectorCalibration): Vec3 {
  return cameraFromRt(cal.pose.R, cal.pose.t);
}
