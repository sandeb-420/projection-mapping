/**
 * Guided iPhone walk-around. The phone is NOT mounted on the projector.
 * The app asks the user to stop at a few stations; Gray codes replay at
 * each stop so we get projector correspondences from multiple angles.
 */
export type StationPatternSet = "full-gray" | "scene-only";

export interface CaptureStation {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  patterns: StationPatternSet;
  minHoldMs: number;
}

export const CAPTURE_STATIONS: CaptureStation[] = [
  {
    id: "center",
    title: "Front center",
    instruction:
      "Stand where you can see the whole projected wall. Hold the iPhone landscape and fill the frame with the projection.",
    hint: "This is the main calibration shot. Stay still while stripes flash.",
    patterns: "full-gray",
    minHoldMs: 400,
  },
  {
    id: "left",
    title: "Three steps left",
    instruction:
      "Walk left so you see the wall from a different angle. Keep the projected area in frame.",
    hint: "A second angle lets us triangulate the projector without a depth camera on it.",
    patterns: "full-gray",
    minHoldMs: 400,
  },
  {
    id: "right",
    title: "Right / objects",
    instruction:
      "Walk to the right. Include objects (table, sculpture, box) that should receive projection.",
    hint: "We need at least one view that sees both the wall and the objects.",
    patterns: "full-gray",
    minHoldMs: 400,
  },
  {
    id: "detail",
    title: "Closer to objects",
    instruction:
      "Step closer to anything you want mapped tightly. A normal photo is enough here — no stripe sequence.",
    hint: "Used for surface detail and later object detection, not for projector pose.",
    patterns: "scene-only",
    minHoldMs: 200,
  },
];

export function stationIndex(id: string): number {
  return CAPTURE_STATIONS.findIndex((s) => s.id === id);
}

export function nextStation(id: string): CaptureStation | null {
  const i = stationIndex(id);
  if (i < 0 || i + 1 >= CAPTURE_STATIONS.length) return null;
  return CAPTURE_STATIONS[i + 1] ?? null;
}
