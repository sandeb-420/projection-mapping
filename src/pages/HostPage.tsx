import { useEffect, useMemo, useRef, useState } from "react";
import { LOOKS, bakeLook, pixelsToPngDataUrl } from "../lib/looks/bakeLook";
import { overlayLookOnScene } from "../lib/looks/overlayLookOnScene";
import { lookFromPromptAsync } from "../lib/looks/promptLook";
import type { LookId, LookSpec } from "../lib/looks/types";
import { MODEL_CATALOG } from "../lib/models/catalog";
import { mappingStats, type Mapping } from "../lib/pipeline/mapping";
import { CaptureOrchestrator } from "../lib/capture/orchestrator";
import { finishLiveMapping } from "../lib/capture/liveMapping";
import { frameKey, rawFromFrame } from "../lib/capture/decodeFrame";
import {
  loadProjectorSettings,
  saveProjectorSettings,
  effectiveFovY,
  type ProjectorSettings,
} from "../lib/projector/settings";
import {
  createSession,
  getOrCreateRoomCode,
  type Role,
  type SessionMessage,
} from "../session/client";
import {
  isFrameMessage,
  peersFromRoles,
  type CalibCommand,
  type FrameMessage,
} from "../session/protocol";
import { ProjectorSettingsForm } from "./ProjectorSettingsForm";

export function HostPage() {
  const room = useMemo(() => getOrCreateRoomCode(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [look, setLook] = useState<LookId>("surface-id");
  const [prompt, setPrompt] = useState("slow gold water on the wall");
  const [spec, setSpec] = useState<LookSpec | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [testPreview, setTestPreview] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(
    "Idle — plug in the projector, fullscreen its tab, then open the phone on the room.",
  );
  const [poseSource, setPoseSource] = useState<string | null>(null);
  const [proj, setProj] = useState<ProjectorSettings>(() => loadProjectorSettings());
  const [peers, setPeers] = useState<Record<Role, boolean>>({
    host: true,
    phone: false,
    projector: false,
  });
  const [stats, setStats] = useState<{
    points: number;
    surfaces: number;
    rms: number;
    originError: number;
  } | null>(null);

  const sessionRef = useRef<ReturnType<typeof createSession> | null>(null);
  const frameQueue = useRef<FrameMessage[]>([]);
  const frameWaiter = useRef<((frame: FrameMessage) => void) | null>(null);
  const liveAbort = useRef<AbortController | null>(null);
  const specRef = useRef<LookSpec | null>(null);
  const lookRef = useRef<LookId>(look);
  specRef.current = spec;
  lookRef.current = look;

  useEffect(() => {
    const session = createSession("host", room);
    sessionRef.current = session;
    const off = session.on((msg: SessionMessage) => {
      if (msg.type === "peer-list" && Array.isArray(msg.roles)) {
        setPeers(peersFromRoles(msg.roles as Role[]));
      }
      if ((msg.type === "peer-joined" || msg.type === "join") && msg.role) {
        setPeers((p) => ({ ...p, [msg.role as Role]: true, host: true }));
      }
      if (msg.type === "peer-left" && msg.role) {
        setPeers((p) => ({ ...p, [msg.role as Role]: false, host: true }));
      }
      if (isFrameMessage(msg)) {
        const wait = frameWaiter.current;
        if (wait) {
          frameWaiter.current = null;
          wait(msg);
        } else {
          frameQueue.current.push(msg);
        }
      }
    });
    return () => {
      off();
      session.close();
      sessionRef.current = null;
    };
  }, [room]);

  function updateProjector(next: ProjectorSettings) {
    setProj(next);
    saveProjectorSettings(next);
    sessionRef.current?.send({ type: "projector-settings", ...next });
  }

  function publish(next: Mapping, baked: Uint8ClampedArray, originError: number) {
    const s = mappingStats(next);
    setMapping(next);
    sendLook(next, baked);
    setStats({
      points: s.points,
      surfaces: s.surfaces,
      rms: next.projector.rms,
      originError,
    });
  }

  function sendLook(next: Mapping, baked: Uint8ClampedArray) {
    const throwUrl = pixelsToPngDataUrl(baked, next.projectorWidth, next.projectorHeight);
    const overlay = overlayLookOnScene(next, baked);
    const testUrl = overlay
      ? pixelsToPngDataUrl(overlay.pixels, overlay.width, overlay.height)
      : null;
    setPreview(throwUrl);
    setTestPreview(testUrl);
    localStorage.setItem("lumen-look", throwUrl ?? "");
    if (throwUrl) sessionRef.current?.send({ type: "look-frame", dataUrl: throwUrl });
  }

  function waitFrame(signal: AbortSignal): Promise<FrameMessage> {
    if (frameQueue.current.length) {
      return Promise.resolve(frameQueue.current.shift()!);
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        frameWaiter.current = null;
        reject(new DOMException("Capture cancelled", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      frameWaiter.current = (frame) => {
        signal.removeEventListener("abort", onAbort);
        resolve(frame);
      };
    });
  }

  async function runLive() {
    if (!peers.phone || !peers.projector) {
      setError("Open the projector window and the phone page in this room first.");
      return;
    }
    liveAbort.current?.abort();
    const abort = new AbortController();
    liveAbort.current = abort;
    setBusy(true);
    setError(null);
    setPoseSource(null);
    frameQueue.current = [];
    frameWaiter.current = null;
    const session = sessionRef.current;
    if (!session) {
      setError("Session is not connected.");
      setBusy(false);
      return;
    }

    const orch = new CaptureOrchestrator(proj.width, proj.height);
    const seen = new Set<string>();
    const dispatch = (cmds: CalibCommand[]) => {
      for (const cmd of cmds) {
        session.send(cmd);
        if (cmd.type === "station") {
          setLiveStatus(`Station ${cmd.index + 1}/${cmd.total} · ${cmd.station.title}`);
        } else if (cmd.type === "show-pattern") {
          setLiveStatus(
            `Station ${orch.currentStationIndex() + 1}/${orch.stations.length} · pattern ${cmd.index + 1}/${cmd.total}`,
          );
        } else if (cmd.type === "calib-done") {
          setLiveStatus("Solving poses and mapping…");
        }
      }
    };

    try {
      session.send({ type: "projector-settings", ...proj });
      session.send({ type: "status", text: "Live capture starting" });
      dispatch(orch.start());
      while (!orch.isDone()) {
        const frame = await waitFrame(abort.signal);
        const key = frameKey(frame);
        if (seen.has(key)) continue;
        seen.add(key);
        const raw = await rawFromFrame(frame);
        dispatch(orch.ingest(raw));
      }
      const result = await finishLiveMapping(orch.getBundles(), proj);
      const baked = bakeLook(result.mapping, specRef.current ?? lookRef.current);
      setPoseSource(result.poseSource);
      publish(result.mapping, baked, Number.NaN);
      setLiveStatus(`Mapped with ${result.poseSource} poses.`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setLiveStatus("Capture cancelled.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setLiveStatus("Live capture failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  function applyLook(next: LookId) {
    setLook(next);
    setSpec(null);
    specRef.current = null;
    lookRef.current = next;
    if (!mapping) {
      setError("Capture the room first. Looks are painted onto a phone photo here; only the pattern goes to the projector.");
      return;
    }
    setError(null);
    sendLook(mapping, bakeLook(mapping, next));
  }

  async function generateFromPrompt() {
    setBusy(true);
    setError(null);
    try {
      const next = await lookFromPromptAsync(prompt);
      setSpec(next);
      setLook("custom");
      if (!mapping) {
        setError("Capture the room first. The projector never gets the phone photo.");
        return;
      }
      sendLook(mapping, bakeLook(mapping, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const phoneUrl = `${typeof location !== "undefined" ? location.origin : ""}/phone?room=${room}`;
  const projectorUrl = `/projector?room=${room}`;
  const fov = effectiveFovY(proj);

  return (
    <div className="shell">
      <p className="kicker">Lumen · auto projection mapping</p>
      <h1>Project onto real walls and objects. No manual grid warp.</h1>
      <p className="lede">
        Take photos of the projected stripes on the room. This tab shows your photo with the
        look painted on it — that is the test view. The other tab is the projector: it only
        throws stripes, then the look. Never the photo. We do not rebuild a picture from the
        projector&apos;s eye; we only learn which projector pixel hits which surface.
      </p>

      <div className="row" style={{ marginTop: "1.2rem" }}>
        <a className="btn" href={projectorUrl} target="_blank" rel="noreferrer">
          Open projector window
        </a>
        <a className="btn" href={`/phone?room=${room}`}>
          Phone capture
        </a>
      </div>

      {error ? <p className="muted" style={{ color: "var(--danger)" }}>{error}</p> : null}

      <div className="grid">
        <div className="card">
          <h2>Live capture</h2>
          <p className="muted">
            Room <code>{room}</code>
            <span className="peer">
              <i className={`dot ${peers.host ? "" : "off"}`} /> host
            </span>
            <span className="peer">
              <i className={`dot ${peers.projector ? "" : "off"}`} /> projector
            </span>
            <span className="peer">
              <i className={`dot ${peers.phone ? "" : "off"}`} /> phone
            </span>
          </p>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Phone URL: <code>{phoneUrl}</code>
          </p>
          <div className="row" style={{ marginTop: "0.7rem" }}>
            <button
              className="primary"
              disabled={busy || !peers.phone || !peers.projector}
              onClick={() => void runLive()}
            >
              Start live capture
            </button>
            <button
              disabled={!busy}
              onClick={() => liveAbort.current?.abort()}
            >
              Cancel
            </button>
          </div>
          <p className="muted" style={{ marginTop: "0.6rem" }}>{liveStatus}</p>
          {poseSource ? <p className="muted">Phone poses · {poseSource}</p> : null}
        </div>

        <div className="card">
          <h2>Projector lens / resolution</h2>
          <p className="muted">
            Match the real projector: native resolution, throw distance to the wall, height of
            the projected image on that wall. Those numbers are the known-K prior. Effective FOV{" "}
            {fov.toFixed(1)}°.
          </p>
          <div style={{ marginTop: "0.6rem" }}>
            <ProjectorSettingsForm value={proj} onChange={updateProjector} />
          </div>
        </div>

        <div className="card">
          <h2>What you see</h2>
          <p className="muted">
            Host = phone photo + look overlay. Projector tab = patterns only. A TV showing
            that tab is just a flat version of the same framebuffer — not a reconstructed room.
          </p>
          {testPreview ? (
            <>
              <p className="muted" style={{ marginTop: "0.7rem" }}>Test · photo + look</p>
              <img className="preview" src={testPreview} alt="Phone photo with look overlaid" />
            </>
          ) : (
            <p className="muted" style={{ marginTop: "0.7rem" }}>
              Capture from the phone first. Then this shows one of those photos with the look on it.
            </p>
          )}
          {preview ? (
            <>
              <p className="muted" style={{ marginTop: "0.7rem" }}>Projector throw · patterns only</p>
              <img className="preview" src={preview} alt="Image the projector throws, not a photo of the room" />
            </>
          ) : null}
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
            <button className="primary" disabled={busy} onClick={() => void generateFromPrompt()}>
              Generate look
            </button>
          </div>
          {spec ? (
            <p className="muted">
              Custom · {spec.mode} · hue {Math.round(spec.hue)} · {spec.source ?? "keywords"}
            </p>
          ) : null}
          {spec?.wgsl ? (
            <details>
              <summary className="muted">LLM WGSL (baked once)</summary>
              <pre className="wgsl">{spec.wgsl}</pre>
            </details>
          ) : null}
        </div>
        <div className="card">
          <h2>Calibration</h2>
          {stats ? (
            <ul className="steps">
              <li className="stat">Mapped points · {stats.points}</li>
              <li className="stat">Surfaces · {stats.surfaces}</li>
              <li className="stat">Reprojection RMS · {stats.rms.toFixed(2)} px</li>
              <li className="stat">
                Projector origin error ·{" "}
                {Number.isFinite(stats.originError)
                  ? `${stats.originError.toFixed(3)} m`
                  : "n/a (live capture)"}
              </li>
            </ul>
          ) : (
            <p className="muted">
              Walk the iPhone stations while stripes hit the wall. Gray codes tell us which
              projector pixel landed where. We never rebuild a photo from the projector&apos;s
              viewpoint.
            </p>
          )}
        </div>
        <div className="card">
          <h2>How a real session works</h2>
          <ol className="steps">
            <li>
              Plug the projector into the PC (HDMI/DisplayPort). Point it at the wall or objects.
              Fullscreen the projector tab on that output so the light hits the room.
            </li>
            <li>iPhone opens <code>/phone?room={room}</code> and photographs the projected light on those surfaces — center → left → right → detail.</li>
            <li>Bake a library look or generate one from a prompt. The projector throws that look onto the mapped surfaces.</li>
            <li>Put a new object in the room? Walk the stations again so it gets mapped too.</li>
          </ol>
        </div>
        <div className="card">
          <h2>Live watch (later)</h2>
          <p className="muted">
            Always-on depth/object detect stays off until recapture is solid on hardware.
            DepthART, ZipDepth, and TypeGPU are parked here — not used for looks.
          </p>
          <div className="row" style={{ marginTop: "0.6rem" }}>
            <button disabled>Start watch loop</button>
          </div>
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
