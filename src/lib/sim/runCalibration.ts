import { buildGraySequence, type GrayPattern } from "../patterns/grayCode";
import { decodeGrayStack } from "../decode/structuredLight";
import { buildMapping, type Mapping, type ViewCapture } from "../pipeline/mapping";
import { createDemoRoom, type VirtualRoom } from "./room";
import { depthFromTrace, paintPattern, traceView } from "./render";
import { originFromPose } from "../calib/triangulate";
import type { Vec3 } from "../math/vec";
import { length, sub } from "../math/vec";
import type { LookId } from "../looks/types";

export interface SimResult {
  room: VirtualRoom;
  mapping: Mapping;
  projectorOriginErrorM: number;
  rms: number;
  look: LookId;
}

export function captureGrayView(
  room: VirtualRoom,
  phoneIndex: number,
): ViewCapture {
  const camera = room.phones[phoneIndex];
  if (!camera) throw new Error("missing phone");
  const trace = traceView(room, camera);
  const patterns = buildGraySequence(room.projector.width, room.projector.height);
  const frames = patterns.map((pattern: GrayPattern) => ({
    pattern,
    pixels: paintPattern(trace, pattern),
    width: camera.width,
    height: camera.height,
  }));
  const map = decodeGrayStack(frames, room.projector.width, room.projector.height);
  return {
    id: camera.id,
    K: camera.K,
    pose: camera.pose,
    map,
    scene: paintPattern(trace, "scene"),
    width: camera.width,
    height: camera.height,
    depth: depthFromTrace(trace),
  };
}

/** Walk the three virtual iPhone stations and solve projector + surfaces. */
export async function runSimulatedCalibration(room?: VirtualRoom): Promise<SimResult> {
  const demo = room ?? createDemoRoom();
  const views = demo.phones.map((_, i) => captureGrayView(demo, i));
  const mapping = await buildMapping(
    views,
    demo.projector.width,
    demo.projector.height,
    demo.projector.K,
  );
  const gt = originFromPose(demo.projector.pose);
  const est = originFromPose(mapping.projector.pose);
  return {
    room: demo,
    mapping,
    projectorOriginErrorM: length(sub(gt, est)),
    rms: mapping.projector.rms,
    look: "surface-id",
  };
}

/** New object = run the whole capture/mapping pass again, not a live watch. */
export function remapWithNewObject(extraBox: { center: Vec3; size: Vec3 }): Promise<SimResult> {
  return runSimulatedCalibration(
    createDemoRoom({
      includeBox: true,
      extraBox,
    }),
  );
}
