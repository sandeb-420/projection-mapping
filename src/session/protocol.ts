import type { GrayPattern } from "../lib/patterns/grayCode";
import type { CaptureStation } from "../lib/capture/stations";
import type { Role } from "./client";

export type CalibCommand =
  | {
      type: "station";
      station: CaptureStation;
      index: number;
      total: number;
    }
  | {
      type: "show-pattern";
      stationId: string;
      pattern: GrayPattern;
      index: number;
      total: number;
    }
  | {
      type: "capture-now";
      stationId: string;
      patternId: string;
      kind: "gray" | "scene";
    }
  | { type: "calib-done" }
  | { type: "look-frame"; dataUrl: string }
  | { type: "status"; text: string };

export interface FrameMessage {
  type: "frame";
  stationId: string;
  patternId: string;
  kind: "gray" | "scene";
  width: number;
  height: number;
  pixelsB64?: string;
  jpeg?: string;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export interface ProjectorSettingsMessage {
  type: "projector-settings";
  width: number;
  height: number;
  fovY: number;
  throwM: number | null;
  screenHeightM: number | null;
}

export interface PeerListMessage {
  type: "peer-list";
  roles: Role[];
}

export function isFrameMessage(msg: { type: string }): msg is FrameMessage {
  return msg.type === "frame";
}

export function isCalibCommand(msg: { type: string }): msg is CalibCommand {
  return (
    msg.type === "station" ||
    msg.type === "show-pattern" ||
    msg.type === "capture-now" ||
    msg.type === "calib-done" ||
    msg.type === "look-frame" ||
    msg.type === "status"
  );
}

export function isProjectorSettingsMessage(
  msg: { type: string },
): msg is ProjectorSettingsMessage {
  return msg.type === "projector-settings";
}

export function peersFromRoles(roles: Iterable<Role>): Record<Role, boolean> {
  const set = new Set(roles);
  return {
    host: set.has("host"),
    phone: set.has("phone"),
    projector: set.has("projector"),
  };
}
