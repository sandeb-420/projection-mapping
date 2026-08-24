import type { FrameMessage } from "../../session/protocol";
import type { RawFrame } from "./orchestrator";
import { b64ToPixels, pixelsFromJpeg } from "./pixels";

export function frameKey(msg: { stationId: string; patternId: string; kind: string }): string {
  return `${msg.stationId}:${msg.patternId}:${msg.kind}`;
}

export async function rawFromFrame(msg: FrameMessage): Promise<RawFrame> {
  if (msg.pixelsB64) {
    const pixels = b64ToPixels(msg.pixelsB64);
    return {
      stationId: msg.stationId,
      patternId: msg.patternId,
      kind: msg.kind,
      width: msg.width,
      height: msg.height,
      pixels,
      jpeg: msg.jpeg,
      alpha: msg.alpha,
      beta: msg.beta,
      gamma: msg.gamma,
    };
  }
  if (msg.jpeg) {
    const decoded = await pixelsFromJpeg(msg.jpeg);
    return {
      stationId: msg.stationId,
      patternId: msg.patternId,
      kind: msg.kind,
      width: decoded.width,
      height: decoded.height,
      pixels: decoded.pixels,
      jpeg: msg.jpeg,
      alpha: msg.alpha,
      beta: msg.beta,
      gamma: msg.gamma,
    };
  }
  throw new Error("frame has neither jpeg nor pixelsB64");
}
