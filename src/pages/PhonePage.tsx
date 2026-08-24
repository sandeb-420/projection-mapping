import { useEffect, useRef, useState } from "react";
import { CAPTURE_STATIONS } from "../lib/capture/stations";

export function PhonePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [station, setStation] = useState(0);
  const [status, setStatus] = useState("Camera starts when you allow access.");
  const current = CAPTURE_STATIONS[station] ?? CAPTURE_STATIONS[0]!;

  useEffect(() => {
    let stream: MediaStream | undefined;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("Hold landscape. Follow the station prompt.");
      } catch {
        setStatus("Camera blocked — use HTTPS (the dev server uses a self-signed cert) and allow access.");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div className="phone-app">
      <p className="kicker">Station {station + 1} / {CAPTURE_STATIONS.length}</p>
      <h1 style={{ fontSize: "1.4rem" }}>{current.title}</h1>
      <div className="viewfinder">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="overlay">
          <strong>{current.instruction}</strong>
          <p className="muted" style={{ margin: "0.35rem 0 0.7rem" }}>{current.hint}</p>
          <p className="muted">{status}</p>
          <p className="muted">New object in the room? Restart and walk the stations again. Live watch comes later.</p>
          <div className="row">
            <button
              className="primary"
              onClick={() => setStation((s) => Math.min(CAPTURE_STATIONS.length - 1, s + 1))}
            >
              {station + 1 < CAPTURE_STATIONS.length ? "Next station" : "Done"}
            </button>
            <button onClick={() => setStation(0)}>Restart</button>
          </div>
        </div>
      </div>
    </div>
  );
}
