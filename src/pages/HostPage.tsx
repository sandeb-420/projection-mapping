import { useMemo, useState } from "react";
import { LOOKS, bakeLook, pixelsToPngDataUrl } from "../lib/looks/bakeLook";
import { lookFromPrompt } from "../lib/looks/promptLook";
import type { LookId, LookSpec } from "../lib/looks/types";
import { MODEL_CATALOG } from "../lib/models/catalog";
import { remapWithNewObject, runSimulatedCalibration } from "../lib/sim/runCalibration";
import { mappingStats, type Mapping } from "../lib/pipeline/mapping";
import { randomRoomCode } from "../session/client";

export function HostPage() {
  const room = useMemo(() => randomRoomCode(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [look, setLook] = useState<LookId>("surface-id");
  const [prompt, setPrompt] = useState("slow gold water on the wall");
  const [spec, setSpec] = useState<LookSpec | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    points: number;
    surfaces: number;
    rms: number;
    originError: number;
    remapped: boolean;
  } | null>(null);

  function publish(next: Mapping, baked: Uint8ClampedArray, originError: number, remapped: boolean) {
    const url = pixelsToPngDataUrl(baked, next.projectorWidth, next.projectorHeight);
    const s = mappingStats(next);
    setMapping(next);
    setPreview(url);
    setStats({
      points: s.points,
      surfaces: s.surfaces,
      rms: next.projector.rms,
      originError,
      remapped,
    });
    localStorage.setItem("lumen-look", url ?? "");
  }

  async function runSim(remapped = false, lookOverride?: LookId | LookSpec) {
    setBusy(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 20));
      const result = remapped
        ? remapWithNewObject({ center: [-0.55, 0.18, 2.35], size: [0.35, 0.36, 0.35] })
        : runSimulatedCalibration();
      const baked = bakeLook(result.mapping, lookOverride ?? spec ?? look);
      publish(result.mapping, baked, result.projectorOriginErrorM, remapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function applyLook(next: LookId) {
    setLook(next);
    setSpec(null);
    if (!mapping) {
      void runSim(false);
      return;
    }
    const baked = bakeLook(mapping, next);
    const url = pixelsToPngDataUrl(baked, mapping.projectorWidth, mapping.projectorHeight);
    setPreview(url);
    localStorage.setItem("lumen-look", url ?? "");
  }

  function generateFromPrompt() {
    const next = lookFromPrompt(prompt);
    setSpec(next);
    setLook("custom");
    if (!mapping) {
      void runSim(false, next);
      return;
    }
    const baked = bakeLook(mapping, next);
    const url = pixelsToPngDataUrl(baked, mapping.projectorWidth, mapping.projectorHeight);
    setPreview(url);
    localStorage.setItem("lumen-look", url ?? "");
  }

  return (
    <div className="shell">
      <p className="kicker">Lumen · auto projection mapping</p>
      <h1>Map a room with an iPhone. No projector required to test.</h1>
      <p className="lede">
        Default path: a virtual projector and three simulated phone stations. Same Gray-code
        capture, triangulation, surface fit, and look bake you will run on hardware. The iPhone is
        handheld — walk the stations the app asks for. A new object means run that capture again,
        not a live camera watch.
      </p>

      <div className="row" style={{ marginTop: "1.2rem" }}>
        <button className="primary" disabled={busy} onClick={() => void runSim(false)}>
          {busy ? "Tracing virtual room…" : "Run virtual room"}
        </button>
        <button disabled={busy} onClick={() => void runSim(true)}>
          Remap after new object
        </button>
        <a className="btn" href="/projector" target="_blank" rel="noreferrer">
          Open projector window
        </a>
        <a className="btn" href={`/phone?room=${room}`}>
          Phone capture
        </a>
      </div>

      {error ? <p className="muted" style={{ color: "var(--danger)" }}>{error}</p> : null}

      <div className="grid">
        <div className="card">
          <h2>Projector look</h2>
          {preview ? (
            <img className="preview" src={preview} alt="Baked look on the virtual projector" />
          ) : (
            <p className="muted">Run the room, then pick a library look or type a prompt.</p>
          )}
          <div className="row" style={{ marginTop: "0.7rem" }}>
            {LOOKS.map((item) => (
              <button
                key={item.id}
                className={item.id === look && !spec ? "primary" : undefined}
                onClick={() => applyLook(item.id)}
                disabled={busy}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: "0.8rem" }}>One-shot prompt (baked once, not realtime AI)</p>
          <div className="row">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{
                flex: 1,
                minWidth: "12rem",
                background: "#0e1210",
                color: "inherit",
                border: "1px solid var(--line)",
                borderRadius: 999,
                padding: "0.6rem 0.9rem",
              }}
              placeholder="slow gold water on the wall"
            />
            <button className="primary" disabled={busy} onClick={generateFromPrompt}>
              Generate look
            </button>
          </div>
          {spec ? <p className="muted">Custom · {spec.mode} · hue {spec.hue}</p> : null}
        </div>
        <div className="card">
          <h2>Calibration</h2>
          {stats ? (
            <ul className="steps">
              <li className="stat">Mapped points · {stats.points}</li>
              <li className="stat">Surfaces · {stats.surfaces}</li>
              <li className="stat">Reprojection RMS · {stats.rms.toFixed(2)} px</li>
              <li className="stat">Projector origin error · {stats.originError.toFixed(3)} m</li>
              <li>{stats.remapped ? "This pass included a newly placed object (full recapture)." : "First mapping of the empty-ish room."}</li>
            </ul>
          ) : (
            <p className="muted">
              Three virtual iPhone stops. Gray codes decode to projector pixels; dual-view rays
              triangulate the projector. Depth models are for later live watch, not this pass.
            </p>
          )}
        </div>
        <div className="card">
          <h2>How a real session works</h2>
          <ol className="steps">
            <li>PC hosts this app. Fullscreen the projector tab on HDMI (or a TV while testing).</li>
            <li>iPhone opens <code>/phone</code> and walks center → left → right → detail.</li>
            <li>Bake a library look or generate one from a prompt, then project it.</li>
            <li>Put a new object in the room? Open the phone app and capture the stations again.</li>
          </ol>
        </div>
        <div className="card">
          <h2>Models (later, for depth)</h2>
          <p className="muted">Realtime budget is only if we add always-on watch later.</p>
          <ul className="steps">
            {MODEL_CATALOG.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong>
                <div className="muted">{m.why}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
