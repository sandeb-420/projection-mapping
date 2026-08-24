import { useEffect, useState } from "react";
import { createDemoRoom } from "../lib/sim/room";
import { renderGrayPattern, buildGraySequence } from "../lib/patterns/grayCode";

export function ProjectorPage() {
  const [src, setSrc] = useState<string | null>(null);
  const [label, setLabel] = useState("Waiting for a baked look or pattern…");

  useEffect(() => {
    const stored = localStorage.getItem("lumen-look");
    if (stored) {
      setSrc(stored);
      setLabel("Virtual projector · last baked look");
    }
    const onStorage = () => {
      const next = localStorage.getItem("lumen-look");
      if (next) {
        setSrc(next);
        setLabel("Virtual projector · updated look");
      }
    };
    window.addEventListener("storage", onStorage);
    const tick = window.setInterval(onStorage, 500);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
    };
  }, []);

  function showTestPattern() {
    const room = createDemoRoom({ projectorWidth: 640, projectorHeight: 360 });
    const pattern = buildGraySequence(room.projector.width, room.projector.height)[3];
    if (!pattern) return;
    const canvas = document.createElement("canvas");
    canvas.width = room.projector.width;
    canvas.height = room.projector.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(canvas.width, canvas.height);
    renderGrayPattern(pattern, canvas.width, canvas.height, img.data);
    ctx.putImageData(img, 0, 0);
    setSrc(canvas.toDataURL("image/png"));
    setLabel(`Test Gray pattern · ${pattern.id}`);
  }

  return (
    <div className="projector-root" onDoubleClick={() => void document.documentElement.requestFullscreen()}>
      {src ? <img src={src} alt={label} /> : (
        <div style={{ textAlign: "center", color: "#9aa" }}>
          <p>{label}</p>
          <button className="primary" onClick={showTestPattern}>Show a Gray-code stripe</button>
          <p className="muted">Double-click for fullscreen. Later: drag this window onto the real projector.</p>
        </div>
      )}
    </div>
  );
}
