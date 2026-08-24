import type { CorrespondenceMap } from "../decode/structuredLight";
import { invertCorrespondence, validCorrespondenceCount } from "../decode/structuredLight";
import { angAbsDelta } from "./stillness";
import type { CaptureStation } from "./stations";

export type CoverageHeading = "left" | "right" | "up" | "down" | "closer" | "sideways";

export type CoverageDecision =
  | { kind: "done"; reason: string }
  | {
      kind: "need";
      heading: CoverageHeading;
      reason: string;
      station: Omit<CaptureStation, "id"> & { preferredIds: string[] };
    };

const SAMPLE_STRIDE = 3;
const MIN_DECODED = 80;
const MIN_DUAL = 100;
const MIN_YAW_DEG = 12;
export const MIN_GRAY_STOPS = 2;
export const MAX_GRAY_STOPS = 3;

/**
 * After a completed Gray-code stop, decide whether mapping already has what it
 * needs or the phone must move. Not a fixed left→right script.
 */
export function decideNextCapture(input: {
  maps: CorrespondenceMap[];
  projectorWidth: number;
  projectorHeight: number;
  yaws: Array<number | undefined>;
  grayStops: number;
}): CoverageDecision {
  const { maps, projectorWidth, projectorHeight, yaws, grayStops } = input;
  if (grayStops >= MAX_GRAY_STOPS) {
    return { kind: "done", reason: "Have as many Gray-code stops as we will use." };
  }

  const latest = maps[maps.length - 1];
  if (grayStops < MIN_GRAY_STOPS && latest && validCorrespondenceCount(latest) < MIN_DECODED) {
    return need("sideways", "fill", [
      "The throw is barely in frame. Step back so the whole projected area fills the camera, then hold.",
      "Stripes only decode on surfaces that are bright in the photo.",
    ]);
  }

  if (grayStops < MIN_GRAY_STOPS) {
    const heading = missingThrowSide(maps, projectorWidth, projectorHeight) ?? "sideways";
    return need(heading, "baseline", [
      heading === "sideways"
        ? "Take a few steps sideways so this is a clearly different angle. Keep the projection in frame, then hold."
        : `Move so you can see the ${heading} side of the projection, then hold.`,
      "A second pose is required to triangulate projector pixels. Only asked because this stop is still one view.",
    ]);
  }

  const dual = dualViewCount(maps, projectorWidth, projectorHeight);
  const yawOk = baselineYawOk(yaws);
  if (dual >= MIN_DUAL && yawOk) {
    if (grayStops >= MAX_GRAY_STOPS || dual >= MIN_DUAL * 2) {
      return { kind: "done", reason: `Enough dual-view projector pixels (${dual}) from distinct angles.` };
    }
    return need("sideways", "baseline", [
      "Overlap is still thin. One more distinct angle, then hold.",
      `Dual-view pixels ${dual} — another pose will make triangulation safer.`,
    ]);
  }

  if (!yawOk) {
    return need("sideways", "baseline", [
      "This angle is too close to the last one. Move farther along the wall, keep the throw in frame, then hold.",
      `Need more baseline (yaw Δ < ${MIN_YAW_DEG}°).`,
    ]);
  }

  const hole = missingThrowSide(maps, projectorWidth, projectorHeight);
  if (hole) {
    return need(hole, "cover", [
      `The ${hole} part of the throw has little overlap from two angles. Move to see that side, then hold.`,
      `Dual-view pixels ${dual} < ${MIN_DUAL}.`,
    ]);
  }

  return need("closer", "detail", [
    "Overlap is still thin. Step closer to the surfaces in the throw, then hold for a scene frame.",
    `Dual-view pixels ${dual} < ${MIN_DUAL}.`,
  ]);
}

export function stationFromDecision(
  decision: Extract<CoverageDecision, { kind: "need" }>,
  usedIds: ReadonlySet<string>,
): CaptureStation {
  const id =
    decision.station.preferredIds.find((candidate) => !usedIds.has(candidate)) ??
    `${decision.heading}-${usedIds.size}`;
  return {
    id,
    title: decision.station.title,
    instruction: decision.station.instruction,
    hint: decision.station.hint,
    patterns: decision.station.patterns,
    minHoldMs: decision.station.minHoldMs,
  };
}

function need(
  heading: CoverageHeading,
  mode: "fill" | "baseline" | "cover" | "detail",
  [instruction, hint]: [string, string],
): CoverageDecision {
  const preferredIds =
    heading === "left" ? ["left", "right", "detail"] :
    heading === "right" ? ["right", "left", "detail"] :
    heading === "closer" ? ["detail", "right", "left"] :
    ["left", "right", "detail"];
  const title =
    mode === "fill" ? "Fill the projection" :
    mode === "cover" ? `See the ${heading} of the throw` :
    mode === "detail" ? "Closer to surfaces" :
    "New angle";
  return {
    kind: "need",
    heading,
    reason: hint,
    station: {
      preferredIds,
      title,
      instruction,
      hint,
      patterns: mode === "detail" ? "scene-only" : "full-gray",
      minHoldMs: mode === "detail" ? 200 : 400,
    },
  };
}

function dualViewCount(
  maps: CorrespondenceMap[],
  projectorWidth: number,
  projectorHeight: number,
): number {
  if (maps.length < 2) return 0;
  const inv = maps.map((map) => invertCorrespondence(map, projectorWidth, projectorHeight));
  let n = 0;
  for (let py = 0; py < projectorHeight; py += SAMPLE_STRIDE) {
    for (let px = 0; px < projectorWidth; px += SAMPLE_STRIDE) {
      const j = py * projectorWidth + px;
      let seen = 0;
      for (const entry of inv) {
        if ((entry.count[j] ?? 0) >= 1) seen++;
      }
      if (seen >= 2) n++;
    }
  }
  return n;
}

function missingThrowSide(
  maps: CorrespondenceMap[],
  projectorWidth: number,
  projectorHeight: number,
): "left" | "right" | "up" | "down" | null {
  if (maps.length === 0) return null;
  const inv = maps.map((map) => invertCorrespondence(map, projectorWidth, projectorHeight));
  const seen = { left: 0, right: 0, up: 0, down: 0 };
  const need = maps.length >= 2 ? 2 : 1;
  const midX = projectorWidth / 2;
  const midY = projectorHeight / 2;
  for (let py = 0; py < projectorHeight; py += SAMPLE_STRIDE) {
    for (let px = 0; px < projectorWidth; px += SAMPLE_STRIDE) {
      const j = py * projectorWidth + px;
      let hits = 0;
      for (const entry of inv) {
        if ((entry.count[j] ?? 0) >= 1) hits++;
      }
      if (hits < need) continue;
      if (px < midX) seen.left++;
      else seen.right++;
      if (py < midY) seen.up++;
      else seen.down++;
    }
  }
  const horiz = seen.left > seen.right * 1.35 ? "right" : seen.right > seen.left * 1.35 ? "left" : null;
  const vert = seen.up > seen.down * 1.35 ? "down" : seen.down > seen.up * 1.35 ? "up" : null;
  return horiz ?? vert;
}

function baselineYawOk(yaws: Array<number | undefined>): boolean {
  const known = yaws.filter((y): y is number => y !== undefined && Number.isFinite(y));
  if (known.length < 2) return true;
  const first = known[0]!;
  return known.slice(1).some((y) => angAbsDelta(first, y) >= MIN_YAW_DEG);
}
