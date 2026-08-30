import { bakeLook } from "../looks/bakeLook";
import type { LookId } from "../looks/types";
import { originFromPose } from "../calib/triangulate";
import { length, sub } from "../math/vec";
import { buildGraySequence } from "../patterns/grayCode";
import { buildMapping, type Mapping } from "../pipeline/mapping";
import { createDemoRoom, labObserverCamera, type VirtualRoom } from "./room";
import { paintLookOnTrace, paintPattern, traceView } from "./render";
import { captureGrayView } from "./runCalibration";

export type LabPoseSource = "sim-gt";

export interface LabPixels {
  label: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface LabSession {
  room: VirtualRoom;
  mapping: Mapping;
  poseSource: LabPoseSource;
  projectorOriginErrorM: number;
  rms: number;
  look: LookId;
  phoneScenes: LabPixels[];
  graySamples: LabPixels[];
  projectorLook: LabPixels;
  relitPhones: LabPixels[];
  relitObserver: LabPixels;
}

/**
 * Closed-loop lab: virtual projector throws Gray codes, virtual phones
 * photograph them, the real mapping pipeline solves, then the look is
 * thrown back onto the virtual room. Phone poses are ground truth (sim-gt).
 * Projector pose still goes through OpenCV PnP.
 */
export async function runLabSession(
  room?: VirtualRoom,
  look: LookId = "surface-id",
): Promise<LabSession> {
  const demo = room ?? createDemoRoom();
  const views = demo.phones.map((_, i) => captureGrayView(demo, i));
  const mapping = await buildMapping(
    views,
    demo.projector.width,
    demo.projector.height,
    demo.projector.K,
  );
  const baked = bakeLook(mapping, look);
  const patterns = buildGraySequence(demo.projector.width, demo.projector.height);
  const grayPattern = patterns.find((p) => p.id === "gx-4") ?? patterns[4] ?? patterns[0]!;

  const phoneScenes: LabPixels[] = [];
  const graySamples: LabPixels[] = [];
  const relitPhones: LabPixels[] = [];
  for (const camera of demo.phones) {
    const trace = traceView(demo, camera);
    phoneScenes.push({
      label: `${camera.id} scene`,
      width: camera.width,
      height: camera.height,
      pixels: paintPattern(trace, "scene"),
    });
    graySamples.push({
      label: `${camera.id} stripes`,
      width: camera.width,
      height: camera.height,
      pixels: paintPattern(trace, grayPattern),
    });
    relitPhones.push({
      label: `${camera.id} relit`,
      width: camera.width,
      height: camera.height,
      pixels: paintLookOnTrace(trace, baked, demo.projector.width, demo.projector.height),
    });
  }

  const observer = labObserverCamera();
  const observerTrace = traceView(demo, observer);

  return {
    room: demo,
    mapping,
    poseSource: "sim-gt",
    projectorOriginErrorM: length(
      sub(originFromPose(demo.projector.pose), originFromPose(mapping.projector.pose)),
    ),
    rms: mapping.projector.rms,
    look,
    phoneScenes,
    graySamples,
    projectorLook: {
      label: "projector look",
      width: demo.projector.width,
      height: demo.projector.height,
      pixels: baked,
    },
    relitPhones,
    relitObserver: {
      label: "observer relit",
      width: observer.width,
      height: observer.height,
      pixels: paintLookOnTrace(observerTrace, baked, demo.projector.width, demo.projector.height),
    },
  };
}
