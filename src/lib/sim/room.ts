import type { Mat3, Vec3 } from "../math/vec";
import { add, kFromFov, lookAt, scale } from "../math/vec";
import type { Pose } from "../calib/projectorPnp";

export interface Quad {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  albedo: Vec3;
  id: number;
  label: string;
}

export interface VirtualCamera {
  id: string;
  width: number;
  height: number;
  K: Mat3;
  pose: Pose;
  eye: Vec3;
}

export interface VirtualProjector {
  width: number;
  height: number;
  K: Mat3;
  pose: Pose;
  eye: Vec3;
}

export interface VirtualRoom {
  quads: Quad[];
  projector: VirtualProjector;
  phones: VirtualCamera[];
}

const UP: Vec3 = [0, 1, 0];

function quad(
  origin: Vec3,
  u: Vec3,
  v: Vec3,
  albedo: Vec3,
  id: number,
  label: string,
): Quad {
  return { origin, u, v, albedo, id, label };
}

function boxQuads(center: Vec3, size: Vec3, id: number, albedo: Vec3): Quad[] {
  const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const c = center;
  return [
    quad([c[0] - sx, c[1] - sy, c[2] + sz], [sx * 2, 0, 0], [0, sy * 2, 0], albedo, id, "box-front"),
    quad([c[0] + sx, c[1] - sy, c[2] - sz], [-sx * 2, 0, 0], [0, sy * 2, 0], albedo, id, "box-back"),
    quad([c[0] - sx, c[1] - sy, c[2] - sz], [0, 0, sz * 2], [0, sy * 2, 0], albedo, id, "box-left"),
    quad([c[0] + sx, c[1] - sy, c[2] + sz], [0, 0, -sz * 2], [0, sy * 2, 0], albedo, id, "box-right"),
    quad([c[0] - sx, c[1] + sy, c[2] - sz], [sx * 2, 0, 0], [0, 0, sz * 2], albedo, id, "box-top"),
    quad([c[0] - sx, c[1] - sy, c[2] + sz], [sx * 2, 0, 0], [0, 0, -sz * 2], albedo, id, "box-bottom"),
  ];
}

function makeCamera(
  id: string,
  eye: Vec3,
  target: Vec3,
  width: number,
  height: number,
  fovY: number,
): VirtualCamera {
  return {
    id,
    width,
    height,
    K: kFromFov(width, height, fovY),
    pose: lookAt(eye, target, UP),
    eye,
  };
}

export interface RoomOptions {
  projectorWidth?: number;
  projectorHeight?: number;
  phoneWidth?: number;
  phoneHeight?: number;
  includeBox?: boolean;
  extraBox?: { center: Vec3; size: Vec3 };
}

/**
 * A living-room stand-in: back wall, floor, optional sculpture box.
 * The "projector" is virtual — same math as a real unit on HDMI later.
 */
export function createDemoRoom(options: RoomOptions = {}): VirtualRoom {
  const projectorWidth = options.projectorWidth ?? 320;
  const projectorHeight = options.projectorHeight ?? 180;
  const phoneWidth = options.phoneWidth ?? 160;
  const phoneHeight = options.phoneHeight ?? 90;
  const includeBox = options.includeBox ?? true;

  const projectorEye: Vec3 = [0, 1.15, 0.15];
  const projectorTarget: Vec3 = [0, 0.95, 3.4];
  const projector: VirtualProjector = {
    width: projectorWidth,
    height: projectorHeight,
    K: kFromFov(projectorWidth, projectorHeight, 24),
    pose: lookAt(projectorEye, projectorTarget, UP),
    eye: projectorEye,
  };

  const quads: Quad[] = [
    quad([-2, 0, 0.4], [4, 0, 0], [0, 0, 3.2], [0.55, 0.52, 0.48], 0, "floor"),
    quad([-1.8, 0, 3.45], [3.6, 0, 0], [0, 2.4, 0], [0.82, 0.8, 0.76], 1, "wall"),
    quad([-1.8, 0, 0.4], [0, 0, 3.05], [0, 2.4, 0], [0.7, 0.68, 0.64], 2, "side-left"),
  ];
  if (includeBox) {
    quads.push(...boxQuads([0.35, 0.22, 2.55], [0.4, 0.44, 0.4], 10, [0.25, 0.45, 0.7]));
  }
  if (options.extraBox) {
    quads.push(
      ...boxQuads(options.extraBox.center, options.extraBox.size, 20, [0.75, 0.25, 0.2]),
    );
  }

  const look = [0, 1.0, 3.2] as Vec3;
  const phones = [
    makeCamera("center", [0.12, 1.32, 0.85], look, phoneWidth, phoneHeight, 62),
    makeCamera("left", [-0.75, 1.3, 1.05], add(look, scale([-0.2, 0, 0], 1)), phoneWidth, phoneHeight, 62),
    makeCamera("right", [0.85, 1.28, 1.1], add(look, [0.15, -0.05, 0]), phoneWidth, phoneHeight, 62),
  ];

  return { quads, projector, phones };
}
