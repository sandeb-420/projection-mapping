import { useEffect, useRef, useState } from "react";
import { renderGrayPattern, type GrayPattern } from "../lib/patterns/grayCode";
import {
  loadProjectorSettings,
  saveProjectorSettings,
  type ProjectorSettings,
} from "../lib/projector/settings";
import { createSession, roomFromLocation } from "../session/client";
import {
  isCalibCommand,
  isProjectorSettingsMessage,
} from "../session/protocol";
import { ProjectorSettingsForm } from "./ProjectorSettingsForm";

export function ProjectorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<ProjectorSettings>(loadProjectorSettings());
  const [src, setSrc] = useState<string | null>(null);
  const [label, setLabel] = useState("Waiting for Gray codes or a baked look…");
  const [hud, setHud] = useState(true);
  const [settings, setSettings] = useState<ProjectorSettings>(() => settingsRef.current);
  const [room] = useState(() => roomFromLocation());

  useEffect(() => {
    const stored = localStorage.getItem("lumen-look");
    if (stored) {
      setSrc(stored);
      setLabel("Last baked look");
      setHud(false);
    }
    const session = createSession("projector", room);
    const off = session.on((msg) => {
      if (isProjectorSettingsMessage(msg)) {
        const next: ProjectorSettings = {
          width: msg.width,
          height: msg.height,
          fovY: msg.fovY,
          throwM: msg.throwM,
          screenHeightM: msg.screenHeightM,
        };
        settingsRef.current = next;
        setSettings(next);
        saveProjectorSettings(next);
        return;
      }
      if (!isCalibCommand(msg)) return;
      if (msg.type === "show-pattern") {
        const s = settingsRef.current;
        paintPattern(canvasRef.current, msg.pattern, s.width, s.height);
        setSrc(null);
        setHud(false);
        setLabel(`Gray ${msg.pattern.id} · ${msg.index + 1}/${msg.total}`);
        return;
      }
      if (msg.type === "look-frame") {
        setSrc(msg.dataUrl);
        setHud(false);
        setLabel("Baked look");
        return;
      }
      if (msg.type === "calib-done") {
        setLabel("Calibration frames done — waiting for look");
      }
      if (msg.type === "status") setLabel(msg.text);
    });
    return () => {
      off();
      session.close();
    };
  }, [room]);

  function applySettings(next: ProjectorSettings) {
    settingsRef.current = next;
    setSettings(next);
    saveProjectorSettings(next);
  }

  async function goFullscreen() {
    const root = document.documentElement;
    try {
      if (!document.fullscreenElement) await root.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setLabel("Fullscreen blocked — use the browser menu on this display.");
    }
  }

  return (
    <div className="projector-root" onDoubleClick={() => void goFullscreen()}>
      <canvas ref={canvasRef} className={src ? "is-hidden" : undefined} />
      {src ? <img src={src} alt={label} /> : null}
      {hud ? (
        <div className="projector-hud">
          <p className="kicker">Projector · room {room}</p>
          <p className="muted">{label}</p>
          <p className="muted">
            Drag this window onto the HDMI display, then fullscreen. Gray codes fill the
            framebuffer at the resolution below.
          </p>
          <div style={{ margin: "0.6rem 0" }}>
            <ProjectorSettingsForm value={settings} onChange={applySettings} />
          </div>
          <div className="row">
            <button className="primary" onClick={() => void goFullscreen()}>
              Fullscreen
            </button>
            <button onClick={() => setHud(false)}>Hide controls</button>
          </div>
        </div>
      ) : (
        <button className="ghost-hud" type="button" onClick={() => setHud(true)}>
          {label}
        </button>
      )}
    </div>
  );
}

function paintPattern(
  canvas: HTMLCanvasElement | null,
  pattern: GrayPattern,
  width: number,
  height: number,
): void {
  if (!canvas) return;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(width, height);
  renderGrayPattern(pattern, width, height, img.data);
  ctx.putImageData(img, 0, 0);
}
