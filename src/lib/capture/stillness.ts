/**
 * Hold-still detector from DeviceOrientation samples.
 * Gray-code bit planes are invalid if the phone moves between flashes.
 */

export interface OrientationSample {
  t: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

export function angAbsDelta(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

export function isStill(
  samples: readonly OrientationSample[],
  now = Date.now(),
  windowMs = 450,
  maxDeg = 1.6,
): boolean {
  const recent = samples.filter((s) => now - s.t <= windowMs);
  if (recent.length < 3) return false;
  const first = recent[0]!;
  for (const sample of recent) {
    if (angAbsDelta(sample.alpha, first.alpha) > maxDeg) return false;
    if (angAbsDelta(sample.beta, first.beta) > maxDeg) return false;
    if (angAbsDelta(sample.gamma, first.gamma) > maxDeg) return false;
  }
  return true;
}

export function pushSample(
  samples: OrientationSample[],
  sample: OrientationSample,
  keepMs = 1200,
): OrientationSample[] {
  samples.push(sample);
  const cutoff = sample.t - keepMs;
  while (samples.length && samples[0]!.t < cutoff) samples.shift();
  return samples;
}

/** Wait until the phone is steady, then let the host snap. Times out so capture can continue. */
export async function waitUntilStill(
  read: () => { alpha?: number; beta?: number; gamma?: number },
  options?: { minMs?: number; timeoutMs?: number; pollMs?: number; now?: () => number },
): Promise<{ still: boolean }> {
  const minMs = options?.minMs ?? 400;
  const timeoutMs = options?.timeoutMs ?? 8000;
  const pollMs = options?.pollMs ?? 50;
  const nowFn = options?.now ?? Date.now;
  const samples: OrientationSample[] = [];
  const start = nowFn();
  while (nowFn() - start < timeoutMs) {
    pushSample(samples, { t: nowFn(), ...read() });
    if (nowFn() - start >= minMs && isStill(samples, nowFn(), minMs, 1.6)) {
      return { still: true };
    }
    await sleep(pollMs);
  }
  return { still: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
