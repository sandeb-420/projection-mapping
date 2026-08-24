import type { StationBundle } from "../capture/orchestrator";
import { decodeGrayStack } from "../decode/structuredLight";
import type { GrayPattern } from "../patterns/grayCode";
import { buildGraySequence } from "../patterns/grayCode";
import type { ViewCapture } from "../pipeline/mapping";
import type { ResolvedPose } from "./estimate";

export function assembleLiveViews(
  bundles: StationBundle[],
  poses: ResolvedPose[] | ReturnType<typeof import("./stationLayout").stationLayoutPoses>,
  projectorWidth: number,
  projectorHeight: number,
): ViewCapture[] {
  const patterns: GrayPattern[] = buildGraySequence(projectorWidth, projectorHeight);
  const views: ViewCapture[] = [];
  for (const bundle of bundles) {
    const pose = poses.find((p) => p.id === bundle.station.id) ?? poses[0];
    if (!pose) continue;
    const sample = bundle.gray[0] ?? bundle.scene;
    if (!sample) continue;
    let map = null;
    if (bundle.gray.length >= 4) {
      const frames = bundle.gray.map((f) => {
        const pattern = patterns.find((p) => p.id === f.patternId);
        if (!pattern) {
          throw new Error(`assembleLiveViews: unknown pattern ${f.patternId}`);
        }
        return {
          pattern,
          pixels: f.pixels,
          width: f.width,
          height: f.height,
        };
      });
      map = decodeGrayStack(frames, projectorWidth, projectorHeight);
    }
    views.push({
      id: bundle.station.id,
      K: pose.K,
      pose: pose.pose,
      map,
      scene: (bundle.scene ?? sample).pixels,
      width: sample.width,
      height: sample.height,
    });
  }
  return views;
}
