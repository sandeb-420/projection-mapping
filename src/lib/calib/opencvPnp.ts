import type { Mat3, Vec2, Vec3 } from "../math/vec";
import type { ProjectorCalibration } from "./projectorPnp";

interface PnpBody {
  ok?: boolean;
  reason?: string;
  error?: string;
  source?: string;
  R?: number[];
  t?: number[];
  K?: number[];
  rms?: number;
  inliers?: number;
}

/**
 * OpenCV solvePnPRansac + LM refine via the sidecar.
 * Projector K comes from the user settings prior, not from a homemade DLT.
 */
export async function solveProjectorPnpOpenCv(input: {
  K: Mat3;
  points3d: readonly Vec3[];
  points2d: readonly Vec2[];
  dist?: number[];
}): Promise<ProjectorCalibration> {
  if (input.points3d.length < 6 || input.points3d.length !== input.points2d.length) {
    throw new Error("OpenCV PnP needs at least 6 3D–projector correspondences.");
  }
  let body: PnpBody;
  try {
    const res = await fetch("/api/pnp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        K: [...input.K],
        points3d: input.points3d.map((p) => [p[0], p[1], p[2]]),
        points2d: input.points2d.map((p) => [p[0], p[1]]),
        dist: input.dist ?? [0, 0, 0, 0, 0],
      }),
    });
    body = (await res.json()) as PnpBody;
    if (!res.ok) {
      throw new Error(pnpFailure(body, `HTTP ${res.status}`));
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("OpenCV PnP")) throw err;
    throw new Error(
      `OpenCV PnP sidecar is not running. Start it with opencv-python-headless. ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!body.ok || !body.R || !body.t || body.R.length !== 9 || body.t.length < 3) {
    throw new Error(pnpFailure(body, "sidecar returned no pose"));
  }
  const rms = body.rms;
  const inliers = body.inliers;
  if (typeof rms !== "number" || !Number.isFinite(rms) || typeof inliers !== "number" || inliers < 6) {
    throw new Error(pnpFailure(body, "too few inliers"));
  }
  const K = body.K && body.K.length === 9
    ? [
        body.K[0]!, body.K[1]!, body.K[2]!,
        body.K[3]!, body.K[4]!, body.K[5]!,
        body.K[6]!, body.K[7]!, body.K[8]!,
      ] as const
    : input.K;
  return {
    K,
    pose: {
      R: [
        body.R[0]!, body.R[1]!, body.R[2]!,
        body.R[3]!, body.R[4]!, body.R[5]!,
        body.R[6]!, body.R[7]!, body.R[8]!,
      ],
      t: [body.t[0]!, body.t[1]!, body.t[2]!],
    },
    rms,
    inliers,
    source: "opencv-pnp",
  };
}

function pnpFailure(body: PnpBody, fallback: string): string {
  const detail = body.error ?? body.reason ?? fallback;
  return `OpenCV PnP failed (${detail}). Install opencv-python-headless and keep the sidecar running.`;
}
