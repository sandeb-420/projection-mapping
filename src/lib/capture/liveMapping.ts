import { buildMappingAsync, type Mapping } from "../pipeline/mapping";
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
      alpha: sample?.alpha,
      beta: sample?.beta,
      gamma: sample?.gamma,
    };
  });
  const poses = await resolvePhonePoses(hints, 62);
  const views = assembleLiveViews(bundles, poses, settings.width, settings.height);
  const mapping = await buildMappingAsync(
    views,
    settings.width,
    settings.height,
    projectorK(settings),
  );
  return {
    mapping,
    poseSource: poses[0]?.source ?? "station-layout",
    projectorSource: mapping.projector.source,
  };
}
