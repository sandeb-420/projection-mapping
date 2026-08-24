import type { Mapping } from "../pipeline/mapping";

export interface SceneOverlay {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/**
 * Test view: paint the baked look onto a phone photo.
 * This is camera-space debug, not a reconstruction from the projector's eye,
 * and it is never sent to the projector.
 */
export function overlayLookOnScene(
  mapping: Mapping,
  baked: Uint8ClampedArray,
  viewId?: string,
): SceneOverlay | null {
  const view = pickView(mapping, viewId);
  if (!view || view.scene.length < 4 || view.width < 2 || view.height < 2) return null;

  const pixels = new Uint8ClampedArray(view.scene);
  const { width: w, height: h } = view;
  const pw = mapping.projectorWidth;
  const ph = mapping.projectorHeight;
  const radius = 2;
  let painted = 0;

  for (const point of mapping.points) {
    if (point.viewId !== view.id) continue;
    const cx = Math.round(point.camera[0]);
    const cy = Math.round(point.camera[1]);
    const px = Math.round(point.projector[0]);
    const py = Math.round(point.projector[1]);
    if (px < 0 || py < 0 || px >= pw || py >= ph) continue;
    const ji = (py * pw + px) * 4;
    const lr = baked[ji] ?? 0;
    const lg = baked[ji + 1] ?? 0;
    const lb = baked[ji + 2] ?? 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const oi = (y * w + x) * 4;
        pixels[oi] = Math.round((pixels[oi] ?? 0) * 0.35 + lr * 0.65);
        pixels[oi + 1] = Math.round((pixels[oi + 1] ?? 0) * 0.35 + lg * 0.65);
        pixels[oi + 2] = Math.round((pixels[oi + 2] ?? 0) * 0.35 + lb * 0.65);
        pixels[oi + 3] = 255;
        painted++;
      }
    }
  }

  if (painted === 0) return null;
  return { width: w, height: h, pixels };
}

function pickView(mapping: Mapping, viewId?: string) {
  if (viewId) {
    const named = mapping.views.find((view) => view.id === viewId);
    if (named) return named;
  }
  const counts = new Map<string, number>();
  for (const point of mapping.points) {
    counts.set(point.viewId, (counts.get(point.viewId) ?? 0) + 1);
  }
  let best = mapping.views[0] ?? null;
  let bestCount = -1;
  for (const view of mapping.views) {
    const count = counts.get(view.id) ?? 0;
    if (count > bestCount) {
      best = view;
      bestCount = count;
    }
  }
  return best;
}
