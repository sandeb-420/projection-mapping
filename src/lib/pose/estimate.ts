import type { Pose } from "../calib/projectorPnp";
import { cameraFromRt, mat3Mul, type Mat3, type Vec3 } from "../math/vec";
import { rotationFromDeviceOrientation, yawDelta } from "./deviceOrientation";
import { stationLayoutPoses, type LabeledPose } from "./stationLayout";

export type PoseSource = "da3" | "moge" | "da3+moge" | "station-layout";

export interface PoseHint {
  id: string;
  width: number;
  height: number;
  jpeg?: string;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export interface ResolvedPose extends LabeledPose {
  source: PoseSource;
}

interface SidecarView {
  id?: string;
  R: number[] | number[][];
  t: number[];
  K: number[] | number[][];
}

interface SidecarBody {
  ok?: boolean;
  source?: string;
  views?: SidecarView[];
}

/**
 * Prefer the DA3 / MoGe sidecar when it is running. Otherwise use the
 * walk-around station layout, optionally yaw-adjusted from DeviceOrientation.
 */
export async function resolvePhonePoses(
  hints: PoseHint[],
  fovY: number,
): Promise<ResolvedPose[]> {
  const estimated = await tryPoseSidecar(hints);
  if (estimated) return estimated;
  const w = hints[0]?.width ?? 160;
  const h = hints[0]?.height ?? 90;
  const layout = stationLayoutPoses(w, h, fovY);
  const base = hints.find((hint) => hint.alpha !== undefined);
  return layout.map((pose) => {
    const hint = hints.find((h) => h.id === pose.id);
    if (!hint || hint.alpha === undefined || base?.alpha === undefined) {
      return { ...pose, source: "station-layout" as const };
    }
    const yaw = yawDelta(hint.alpha, base.alpha);
    if (Math.abs(yaw) < 1) return { ...pose, source: "station-layout" as const };
    const extra = rotationFromDeviceOrientation(yaw, 0, 0);
    return {
      ...pose,
      pose: composeYaw(pose.pose, extra),
      source: "station-layout",
    };
  });
}

function composeYaw(pose: Pose, extra: Mat3): Pose {
  return { R: mat3Mul(extra, pose.R), t: pose.t };
}

async function tryPoseSidecar(hints: PoseHint[]): Promise<ResolvedPose[] | null> {
  try {
    const res = await fetch("/api/pose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        views: hints.map((h) => ({
          id: h.id,
          width: h.width,
          height: h.height,
          jpeg: h.jpeg,
        })),
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as SidecarBody;
    if (!body.ok || !body.views?.length) return null;
    const source: PoseSource =
      body.source === "moge" ? "moge" :
      body.source === "da3+moge" ? "da3+moge" :
      "da3";
    return body.views.map((view, i) => {
      const R = asMat3(view.R);
      const t = asVec3(view.t);
      const K = asMat3(view.K);
      return {
        id: view.id ?? hints[i]?.id ?? `view-${i}`,
        K,
        pose: { R, t },
        eye: cameraFromRt(R, t),
        source,
      };
    });
  } catch {
    return null;
  }
}

function asMat3(value: number[] | number[][]): Mat3 {
  const flat = flatten(value);
  if (flat.length !== 9) throw new Error("expected 9-vector or 3x3 matrix");
  return [
    flat[0]!, flat[1]!, flat[2]!,
    flat[3]!, flat[4]!, flat[5]!,
    flat[6]!, flat[7]!, flat[8]!,
  ];
}

function asVec3(value: number[]): Vec3 {
  if (value.length < 3) throw new Error("expected 3-vector");
  return [value[0]!, value[1]!, value[2]!];
}

function flatten(value: number[] | number[][]): number[] {
  if (value.length === 0) return [];
  if (Array.isArray(value[0])) return (value as number[][]).flat();
  return value as number[];
}
