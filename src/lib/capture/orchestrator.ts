import { CAPTURE_STATIONS, type CaptureStation } from "./stations";
import { buildGraySequence, type GrayPattern } from "../patterns/grayCode";
import { decodeGrayStack, type CorrespondenceMap } from "../decode/structuredLight";
import type { CalibCommand } from "../../session/protocol";
import { decideNextCapture, MAX_GRAY_STOPS, stationFromDecision } from "./coverage";

export interface RawFrame {
  stationId: string;
  patternId: string;
  kind: "gray" | "scene";
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  jpeg?: string;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export interface StationBundle {
  station: CaptureStation;
  gray: RawFrame[];
  scene: RawFrame | null;
}

/**
 * Host-side state machine: project a Gray pattern, auto-capture when the
 * phone is still, then ask for another pose only if coverage needs it.
 */
export class CaptureOrchestrator {
  readonly patterns: GrayPattern[];
  readonly projectorWidth: number;
  readonly projectorHeight: number;
  readonly stations: CaptureStation[];

  private station = 0;
  private pattern = 0;
  private waiting = false;
  private finished = false;
  private readonly bundles = new Map<string, StationBundle>();
  lastNeed = "Fill the projection, then hold. The phone snaps when it is still.";

  constructor(projectorWidth: number, projectorHeight: number) {
    this.projectorWidth = projectorWidth;
    this.projectorHeight = projectorHeight;
    this.patterns = buildGraySequence(projectorWidth, projectorHeight);
    const first = CAPTURE_STATIONS[0]!;
    this.stations = [first];
    this.bundles.set(first.id, { station: first, gray: [], scene: null });
  }

  start(): CalibCommand[] {
    this.station = 0;
    this.pattern = 0;
    this.waiting = false;
    this.finished = false;
    return this.commandsForCurrent();
  }

  ingest(frame: RawFrame): CalibCommand[] {
    if (this.finished) return [{ type: "calib-done" }];
    const station = this.stations[this.station];
    if (!station || frame.stationId !== station.id) return [];
    const bundle = this.bundles.get(station.id);
    if (!bundle) return [];

    if (frame.kind === "scene") {
      bundle.scene = frame;
      this.waiting = false;
      return this.afterStop();
    }

    if (station.patterns === "full-gray") {
      const expected = this.patterns[this.pattern];
      if (!expected || frame.patternId !== expected.id) return [];
      bundle.gray.push(frame);
      this.waiting = false;
      this.pattern += 1;
      return this.commandsForCurrent();
    }
    return [];
  }

  isDone(): boolean {
    return this.finished;
  }

  currentStationIndex(): number {
    return this.station;
  }

  currentPatternIndex(): number {
    return this.pattern;
  }

  patternCount(): number {
    return this.patterns.length;
  }

  getBundles(): StationBundle[] {
    return this.stations
      .map((s) => this.bundles.get(s.id)!)
      .filter((b) => b && (b.gray.length > 0 || b.scene));
  }

  private afterStop(): CalibCommand[] {
    const grayStops = this.stations.filter((s) => s.patterns === "full-gray" && this.bundleComplete(s.id)).length;
    const decision = decideNextCapture({
      maps: this.decodedMaps(),
      projectorWidth: this.projectorWidth,
      projectorHeight: this.projectorHeight,
      yaws: this.yaws(),
      grayStops,
    });
    if (decision.kind === "done" || this.stations.length >= MAX_GRAY_STOPS + 1) {
      this.finished = true;
      this.lastNeed = decision.kind === "done" ? decision.reason : "Reached the capture budget.";
      return [{ type: "calib-done" }];
    }
    const used = new Set(this.stations.map((s) => s.id));
    const next = stationFromDecision(decision, used);
    this.stations.push(next);
    this.bundles.set(next.id, { station: next, gray: [], scene: null });
    this.station = this.stations.length - 1;
    this.pattern = 0;
    this.lastNeed = decision.reason;
    return this.commandsForCurrent();
  }

  private bundleComplete(id: string): boolean {
    const bundle = this.bundles.get(id);
    if (!bundle) return false;
    if (bundle.station.patterns === "scene-only") return Boolean(bundle.scene);
    return bundle.gray.length >= this.patterns.length && Boolean(bundle.scene);
  }

  private decodedMaps(): CorrespondenceMap[] {
    const maps: CorrespondenceMap[] = [];
    for (const station of this.stations) {
      if (station.patterns !== "full-gray") continue;
      const bundle = this.bundles.get(station.id);
      if (!bundle || bundle.gray.length < 4) continue;
      const frames = [];
      for (const frame of bundle.gray) {
        const pattern = this.patterns.find((p) => p.id === frame.patternId);
        if (!pattern) continue;
        frames.push({
          pattern,
          pixels: frame.pixels,
          width: frame.width,
          height: frame.height,
        });
      }
      if (frames.length < 4) continue;
      try {
        maps.push(decodeGrayStack(frames, this.projectorWidth, this.projectorHeight));
      } catch {
        // incomplete or contrast-less stack
      }
    }
    return maps;
  }

  private yaws(): Array<number | undefined> {
    return this.getBundles().map((bundle) => {
      const sample = bundle.scene ?? bundle.gray[0];
      return sample?.alpha;
    });
  }

  private commandsForCurrent(): CalibCommand[] {
    const station = this.stations[this.station];
    if (!station) {
      this.finished = true;
      return [{ type: "calib-done" }];
    }
    if (station.patterns === "scene-only") {
      this.waiting = true;
      return [
        {
          type: "station",
          station,
          index: this.station,
          total: this.stations.length,
        },
        {
          type: "capture-now",
          stationId: station.id,
          patternId: "scene",
          kind: "scene",
        },
      ];
    }
    if (this.pattern >= this.patterns.length) {
      this.waiting = true;
      return [
        {
          type: "capture-now",
          stationId: station.id,
          patternId: "scene",
          kind: "scene",
        },
      ];
    }
    const pattern = this.patterns[this.pattern]!;
    this.waiting = true;
    const cmds: CalibCommand[] = [];
    if (this.pattern === 0) {
      cmds.push({
        type: "station",
        station,
        index: this.station,
        total: this.stations.length,
      });
    }
    cmds.push({
      type: "show-pattern",
      stationId: station.id,
      pattern,
      index: this.pattern,
      total: this.patterns.length,
    });
    cmds.push({
      type: "capture-now",
      stationId: station.id,
      patternId: pattern.id,
      kind: "gray",
    });
    return cmds;
  }

  isWaiting(): boolean {
    return this.waiting;
  }
}
