import { useEffect, useRef, useState } from "react";
import { CAPTURE_STATIONS, type CaptureStation } from "../lib/capture/stations";
import { jpegFromVideo } from "../lib/capture/pixels";
import { createSession, roomFromLocation } from "../session/client";
import { isCalibCommand, type CalibCommand } from "../session/protocol";

export function PhonePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<ReturnType<typeof createSession> | null>(null);
  const lastCapture = useRef("");
  const orient = useRef<{ alpha?: number; beta?: number; gamma?: number }>({});
  const [station, setStation] = useState<CaptureStation>(CAPTURE_STATIONS[0]!);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(CAPTURE_STATIONS.length);
  const [status, setStatus] = useState("Camera starts when you allow access.");
  const [armed, setArmed] = useState(false);
  const [room] = useState(() => roomFromLocation());

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
        setStatus("Hold landscape. Wait for the host to start live capture.");
      } catch {
        setStatus("Camera blocked — use HTTPS (the dev server uses a self-signed cert) and allow access.");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    const onOrient = (ev: DeviceOrientationEvent) => {
      orient.current = {
        alpha: ev.alpha ?? undefined,
        beta: ev.beta ?? undefined,
        gamma: ev.gamma ?? undefined,
      };
    };
    window.addEventListener("deviceorientation", onOrient);
    const session = createSession("phone", room);
    sessionRef.current = session;
    const off = session.on((msg) => {
      if (!isCalibCommand(msg)) return;
      void handleCommand(msg);
    });
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      off();
      session.close();
      sessionRef.current = null;
    };
  }, [room]);

  async function enableMotion() {
    const ctor = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (typeof ctor.requestPermission === "function") {
        await ctor.requestPermission();
      }
      setArmed(true);
      setStatus("Motion on. Stay still when stripes flash.");
    } catch {
      setArmed(true);
      setStatus("Motion permission skipped. Station layout will be used for pose.");
    }
  }

  async function handleCommand(cmd: CalibCommand) {
    if (cmd.type === "station") {
      setStation(cmd.station);
      setIndex(cmd.index);
      setTotal(cmd.total);
      setStatus(cmd.station.instruction);
      return;
    }
    if (cmd.type === "status") {
      setStatus(cmd.text);
      return;
    }
    if (cmd.type === "calib-done") {
      setStatus("Capture done. Keep this tab open while the host maps, or restart for a new object.");
      return;
    }
    if (cmd.type !== "capture-now") return;
    const key = `${cmd.stationId}:${cmd.patternId}:${cmd.kind}`;
    if (lastCapture.current === key) return;
    lastCapture.current = key;
    const hold = CAPTURE_STATIONS.find((s) => s.id === cmd.stationId)?.minHoldMs ?? 400;
    setStatus(cmd.kind === "scene" ? "Scene photo…" : `Holding for stripe ${cmd.patternId}…`);
    await sleep(hold);
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) {
      setStatus("Camera is not ready — cannot capture this frame.");
      return;
    }
    try {
      const snap = jpegFromVideo(video);
      sessionRef.current?.send({
        type: "frame",
        stationId: cmd.stationId,
        patternId: cmd.patternId,
        kind: cmd.kind,
        width: snap.width,
        height: snap.height,
        jpeg: snap.jpeg,
        alpha: orient.current.alpha,
        beta: orient.current.beta,
        gamma: orient.current.gamma,
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="phone-app">
      <p className="kicker">Station {index + 1} / {total} · room {room}</p>
      <h1 style={{ fontSize: "1.4rem" }}>{station.title}</h1>
      <div className="viewfinder">
        <video ref={videoRef} playsInline muted autoPlay />
        <div className="overlay">
          <strong>{station.instruction}</strong>
          <p className="muted" style={{ margin: "0.35rem 0 0.7rem" }}>{station.hint}</p>
          <p className="muted">{status}</p>
          <p className="muted">
            New object in the room? Restart and walk the stations again. Live watch comes later.
          </p>
          <div className="row">
            <button className="primary" onClick={() => void enableMotion()}>
              {armed ? "Motion enabled" : "Enable motion"}
            </button>
            <button onClick={() => {
              lastCapture.current = "";
              setStation(CAPTURE_STATIONS[0]!);
              setIndex(0);
              setStatus("Restarted. Wait for the host.");
            }}
            >
              Restart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
