import { CAPTURE_STATIONS, type CaptureStation } from "./stations";
import { buildGraySequence, type GrayPattern } from "../patterns/grayCode";
import type { CalibCommand } from "../../session/protocol";

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
 * Host-side state machine: announce station, show a Gray pattern, wait for
 * the iPhone frame, repeat, then a scene photo, then the next station.
 */
export class CaptureOrchestrator {
  readonly stations: CaptureStation[];
  readonly patterns: GrayPattern[];
  readonly projectorWidth: number;
  readonly projectorHeight: number;

  private station = 0;
  private pattern = 0;
  private waiting = false;
  private finished = false;
  private readonly bundles = new Map<string, StationBundle>();

  constructor(projectorWidth: number, projectorHeight: number) {
    this.projectorWidth = projectorWidth;
    this.projectorHeight = projectorHeight;
    this.stations = CAPTURE_STATIONS;
    this.patterns = buildGraySequence(projectorWidth, projectorHeight);
    for (const s of this.stations) {
      this.bundles.set(s.id, { station: s, gray: [], scene: null });
    }
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
      this.station += 1;
      this.pattern = 0;
      if (this.station >= this.stations.length) {
        this.finished = true;
        return [{ type: "calib-done" }];
      }
      return this.commandsForCurrent();
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
    return this.stations.map((s) => this.bundles.get(s.id)!);
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
