import type { Pose } from "../calib/projectorPnp";
import { cameraFromRt, type Mat3, type Vec3 } from "../math/vec";

export type PoseSource = "da3+moge";

export interface LabeledPose {
  id: string;
  K: Mat3;
  pose: Pose;
  eye: Vec3;
}

export interface PoseHint {
  id: string;
  width: number;
  height: number;
  jpeg?: string;
}

export interface ResolvedPose extends LabeledPose {
  source: PoseSource;
  depth?: Float32Array;
}

interface SidecarView {
  id?: string;
  R: number[] | number[][];
  t: number[];
  K: number[] | number[][];
  depthB64?: string;
  depthWidth?: number;
  depthHeight?: number;
}

interface SidecarBody {
  ok?: boolean;
  source?: string;
  reason?: string;
  hint?: string;
  error?: string;
  views?: SidecarView[];
}

/**
 * Phone K, R, t and metric scale from DA3-SMALL + MoGe-2.
 * There is no station-layout fallback — those were guessed walk positions.
 */
export async function resolvePhonePoses(hints: PoseHint[]): Promise<ResolvedPose[]> {
  if (hints.length < 1) {
    throw new Error("Need at least one scene photo for DA3 / MoGe pose.");
  }
  const estimated = await fetchPoseSidecar(hints);
  const byId = new Map(estimated.map((pose) => [pose.id, pose]));
  const ordered: ResolvedPose[] = [];
  for (const hint of hints) {
    const pose = byId.get(hint.id);
    if (!pose) {
      throw new Error(`DA3 / MoGe did not return a pose for capture ${hint.id}.`);
    }
    ordered.push(pose);
  }
  return ordered;
}

async function fetchPoseSidecar(hints: PoseHint[]): Promise<ResolvedPose[]> {
  let body: SidecarBody;
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
    body = (await res.json()) as SidecarBody;
    if (!res.ok) {
      throw new Error(poseFailure(body, `HTTP ${res.status}`));
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("DA3")) throw err;
    throw new Error(
      `DA3 + MoGe sidecar is not running. Install the packages, set LUMEN_RUN_DA3=1 LUMEN_RUN_MOGE=1, and start uvicorn. ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!body.ok || !body.views?.length) {
    throw new Error(poseFailure(body, "sidecar returned no views"));
  }
  if (body.source !== "da3+moge") {
    throw new Error(
      poseFailure(
        body,
        `sidecar source was ${body.source ?? "unknown"}; MoGe metric scale is required`,
      ),
    );
  }
  return body.views.map((view, i) => {
    const R = asMat3(view.R);
    const t = asVec3(view.t);
    const K = asMat3(view.K);
    const dw = view.depthWidth ?? hints[i]?.width ?? 0;
    const dh = view.depthHeight ?? hints[i]?.height ?? 0;
    return {
      id: view.id ?? hints[i]?.id ?? `view-${i}`,
      K,
      pose: { R, t },
      eye: cameraFromRt(R, t),
      source: "da3+moge" as const,
      depth: decodeFloat32B64(view.depthB64, dw * dh),
    };
  });
}

function poseFailure(body: SidecarBody, fallback: string): string {
  const detail = [body.error, body.hint, body.reason, fallback].filter(Boolean).join(" — ");
  return `DA3 + MoGe pose failed (${detail}).`;
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

export function decodeFloat32B64(b64: string | undefined, count: number): Float32Array | undefined {
  if (!b64 || count < 1) return undefined;
  try {
    const binary = atob(b64);
    if (binary.length !== count * 4) return undefined;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer, bytes.byteOffset, count);
  } catch {
    return undefined;
  }
}
