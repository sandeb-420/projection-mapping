import { buildMapping, type Mapping } from "../pipeline/mapping";
import { projectorK, type ProjectorSettings } from "../projector/settings";
import { assembleLiveViews } from "../pose/assemble";
import { resolvePhonePoses, type PoseHint, type PoseSource } from "../pose/estimate";
import type { ProjectorPoseSource } from "../calib/projectorPnp";
import type { StationBundle } from "./orchestrator";

export async function finishLiveMapping(
  bundles: StationBundle[],
  settings: ProjectorSettings,
): Promise<{
  mapping: Mapping;
  poseSource: PoseSource;
  projectorSource: ProjectorPoseSource;
}> {
  const hints: PoseHint[] = bundles.map((bundle) => {
    const sample = bundle.scene ?? bundle.gray[0];
    return {
      id: bundle.station.id,
      width: sample?.width ?? 160,
      height: sample?.height ?? 90,
      jpeg: sample?.jpeg,
    };
  });
  const poses = await resolvePhonePoses(hints);
  const views = assembleLiveViews(bundles, poses, settings.width, settings.height);
  const mapping = await buildMapping(
    views,
    settings.width,
    settings.height,
    projectorK(settings),
  );
  return {
    mapping,
    poseSource: poses[0]!.source,
    projectorSource: mapping.projector.source,
  };
}
