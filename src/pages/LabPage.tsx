import { useEffect, useState } from "react";
import { LOOKS, pixelsToPngDataUrl } from "../lib/looks/bakeLook";
import type { LookId } from "../lib/looks/types";
import { createDemoRoom } from "../lib/sim/room";
import { runLabSession, type LabPixels, type LabSession } from "../lib/sim/runLab";
import { LabSketch } from "./LabSketch";

export function LabPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [look, setLook] = useState<LookId>("surface-id");
  const [session, setSession] = useState<LabSession | null>(null);

  async function run(options?: {
    extraBox?: { center: [number, number, number]; size: [number, number, number] };
    look?: LookId;
  }) {
    const nextLook = options?.look ?? look;
    if (options?.look) setLook(options.look);
    setBusy(true);
    setError(null);
    try {
      const room = options?.extraBox ? createDemoRoom({ extraBox: options.extraBox }) : createDemoRoom();
      setSession(await runLabSession(room, nextLook));
    } catch (err) {
      setSession(null);
      setError(
        err instanceof Error
          ? err.message
          : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void run();
    // First paint uses the default look; changing look is a button, not a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shell">
      <p className="kicker">Lab · virtual projector, cameras, room</p>
      <h1>Watch the mapping without hardware.</h1>
      <p className="lede">
        A fake projector throws Gray codes onto a boxy room. Fake phones photograph
        those stripes. The same decode → triangulate → OpenCV PnP → bake path as
        a real session then throws a look back onto the virtual wall. Phone poses
        are ground truth. This does not replace a real iPhone + projector.
      </p>

      <div className="row" style={{ marginTop: "1.1rem" }}>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          {busy ? "Solving…" : "Run virtual session"}
        </button>
        <button
          disabled={busy}
          onClick={() => void run({ extraBox: { center: [-0.55, 0.18, 2.35], size: [0.35, 0.36, 0.35] } })}
        >
          Add a new object and remap
        </button>
        <a className="btn" href="/">
          Real session
        </a>
      </div>

      <div className="row" style={{ marginTop: "0.7rem" }}>
        {LOOKS.map((item) => (
          <button
            key={item.id}
            disabled={busy}
            onClick={() => void run({ look: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="muted" style={{ color: "var(--danger)", marginTop: "0.8rem" }}>
          {error} Start the sidecar with opencv-python-headless for PnP
          (<code>uvicorn app:app --port 8787</code>). DA3 / MoGe are not used here.
        </p>
      ) : null}

      {session ? (
        <div className="grid lab-grid">
          <div className="card">
            <h2>Ground truth vs recovered</h2>
            <LabSketch mapping={session.mapping} room={session.room} />
            <ul className="steps">
              <li className="stat">Phone poses · {session.poseSource}</li>
              <li className="stat">Projector · {session.mapping.projector.source}</li>
              <li className="stat">Reprojection RMS · {session.rms.toFixed(2)} px</li>
              <li className="stat">
                Projector origin error · {session.projectorOriginErrorM.toFixed(3)} m
              </li>
              <li className="stat">Mapped points · {session.mapping.points.length}</li>
            </ul>
          </div>

          <LabImage frame={session.relitObserver} title="Relit room (the virtual wall)" />
          <LabImage frame={session.projectorLook} title="Projector framebuffer" />

          {session.phoneScenes.map((frame) => (
            <LabImage key={frame.label} frame={frame} title={frame.label} />
          ))}
          {session.graySamples.map((frame) => (
            <LabImage key={frame.label} frame={frame} title={frame.label} />
          ))}
          {session.relitPhones.map((frame) => (
            <LabImage key={frame.label} frame={frame} title={frame.label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LabImage(props: { frame: LabPixels; title: string }) {
  const url = pixelsToPngDataUrl(props.frame.pixels, props.frame.width, props.frame.height);
  return (
    <div className="card">
      <h2>{props.title}</h2>
      {url ? (
        <img className="preview" src={url} alt={props.title} />
      ) : (
        <p className="muted">Could not encode this frame.</p>
      )}
    </div>
  );
}
