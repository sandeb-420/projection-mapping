import { kFromFov, type Mat3 } from "../math/vec";

export interface ProjectorSettings {
  width: number;
  height: number;
  fovY: number;
  /** Throw distance in meters (lens to the wall). Optional; with screenHeightM it overrides fovY. */
  throwM: number | null;
  /** Height of the projected image on the wall, in meters. */
  screenHeightM: number | null;
}

const KEY = "lumen-projector-settings";

export const DEFAULT_PROJECTOR: ProjectorSettings = {
  width: 1280,
  height: 720,
  fovY: 24,
  throwM: null,
  screenHeightM: null,
};

export function loadProjectorSettings(): ProjectorSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PROJECTOR };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROJECTOR };
    const parsed = JSON.parse(raw) as Partial<ProjectorSettings>;
    return {
      width: clampInt(parsed.width, 320, 3840, DEFAULT_PROJECTOR.width),
      height: clampInt(parsed.height, 180, 2160, DEFAULT_PROJECTOR.height),
      fovY: clampNum(parsed.fovY, 8, 80, DEFAULT_PROJECTOR.fovY),
      throwM: optionalPositive(parsed.throwM),
      screenHeightM: optionalPositive(parsed.screenHeightM),
    };
  } catch {
    return { ...DEFAULT_PROJECTOR };
  }
}

export function saveProjectorSettings(settings: ProjectorSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(settings));
}

/** Vertical FOV from throw distance and image height: 2 atan(h / (2d)). */
export function fovFromThrow(throwM: number, screenHeightM: number): number {
  return (2 * Math.atan(screenHeightM / (2 * throwM)) * 180) / Math.PI;
}

export function effectiveFovY(settings: ProjectorSettings): number {
  if (
    settings.throwM !== null &&
    settings.screenHeightM !== null &&
    settings.throwM > 0 &&
    settings.screenHeightM > 0
  ) {
    return fovFromThrow(settings.throwM, settings.screenHeightM);
  }
  return settings.fovY;
}

/** Known-K prior for projector PnP. Native resolution + throw (or FOV) of the projector. */
export function projectorK(settings: ProjectorSettings): Mat3 {
  return kFromFov(settings.width, settings.height, effectiveFovY(settings));
}

function optionalPositive(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

function clampInt(v: number | undefined, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(v!)));
}

function clampNum(v: number | undefined, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v!));
}
