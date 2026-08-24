# Lumen — auto projection mapping

A real projector throws patterns and looks onto **real walls and objects**. This app
replaces the usual manual grid warp: the projector flashes Gray-code stripes, a
handheld iPhone photographs those stripes **on the surfaces**, then the software
builds the map and projects a look onto the same surfaces.

HDMI / DisplayPort is only the **cable from the PC to the projector**. The mapping
target is never a TV.

You can still **try the math with no projector** (virtual room). That is a simulator,
not the product.

## Real session (projector + room)

```bash
npm install
npm test
npm run dev       # https://localhost:5173  (self-signed cert so the iPhone camera works)
```

1. Plug the projector into the PC. Point it at the wall / objects. Set native
   resolution, throw-to-wall, and projected image height on the host.
2. Open **Projector window** and fullscreen it on the **projector output**. That tab
   is the image the unit throws into the room.
3. On the iPhone (same Wi‑Fi, HTTPS) open `/phone?room=XXXX`, allow camera,
   **Enable motion**. Photograph the **projected light on the surfaces**, not a
   screen.
4. On the host click **Start live capture** and walk center → left → right →
   closer to objects. Hold still while stripes flash on the wall.
5. Bake a library look or a one-shot prompt. The projector throws that look onto
   the mapped surfaces. New object? Walk the stations again.

Default projector resolution prior is 1280×720. Match whatever the unit actually is.

Phone poses: the sidecar tries **DA3-SMALL / MoGe-2** when those packages are
installed and `LUMEN_RUN_DA3=1` (or `LUMEN_RUN_MOGE=1`). Otherwise the app uses
the walk-around layout, optionally yaw-adjusted from DeviceOrientation.

## Test without a projector (simulator only)

```bash
npm install
npm test
npm run dev
```

1. Open the host page and click **Run virtual room**.
2. **Open projector window** if you want to see the baked look. In a real setup
   that same window is what the projector throws onto the wall.
3. Pick a library look or type a prompt (**Generate look**).
4. **Remap after new object** reruns capture with an extra box in the virtual room.

The simulator raycasts a back wall, floor, and box, paints Gray codes as a phone
would see them on those surfaces, triangulates, solves projector pose, and bakes
a look.

## Sidecar (optional)

```bash
cd server
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8787
```

Vite proxies `/api` to that process.

| POST | Purpose |
| --- | --- |
| `/pose` | DA3-SMALL / MoGe-2 from scene frames. Returns `{ok:false}` so the browser can fall back. |
| `/shader` | Optional one-shot LLM look (`OPENAI_API_KEY`). Merges onto the keyword compiler. Still baked once. |
| `/depth` | Stub for a later ZipDepth / DepthART watch loop. |

## Hardware

- **Projector** is the light source. PC drives it as a video output (usually HDMI).
  Fullscreen `/projector` on that output so stripes and looks land on the room.
- **iPhone** opens `/phone` (not mounted on the projector). It photographs the
  projected light on walls and objects. The UI asks you to walk: front, left,
  right, then closer to objects.
- Looks: pick a **library look** or type a prompt to **generate a custom look once**
  from the mapping, then project it. Not realtime AI.
- New object: **walk the stations again**. Always-on camera detection is deferred.

## Pipeline

```
iPhone walk-around (or virtual cameras)
        │
        ├─ scene frames → DA3-SMALL / MoGe-2  (pose + metric scale; station layout if sidecar is off)
        └─ Gray-code stack → camera→projector UV  (stripes as seen on the real surfaces)
                │
                ▼
     triangulate projector pixels seen from ≥2 phone poses
                │
                ▼
     DLT / PnP → projector K (native resolution + throw to wall), R, t
                │
                ▼
     RANSAC planes + leftover object blobs
                │
                ▼
     bake look → projector throws it onto the mapped surfaces
                │
                ▼
     new object → walk the iPhone stations again (live watch later)
```

## Models (from recent public posts, not locked in)

Realtime budget is for the watch loop only, and that loop is still off.

| Model | Use | Notes |
| --- | --- | --- |
| [DepthART-S](https://xuefeng-cvr.github.io/DepthART/) | Live depth (later) | Tiny. [TypeGPU light-injection demo](https://docs.swmansion.com/TypeGPU/examples/#example=image-processing--monocular-light-injection) (~8ms on M4 Pro, [tweet](https://x.com/reczko_konrad/status/2089670934009413751)). |
| [ZipDepth](https://zipdepth.github.io/) | Live depth (later) | 6.1M, TensorRT ~1ms-class on 30-series. Best Python sidecar candidate. |
| [DA3-SMALL](https://github.com/ByteDance-Seed/depth-anything-3) | Calib pose | 80M Apache-2.0. Depth + pose from the walk-around. |
| [MoGe-2 ViT-S](https://github.com/microsoft/MoGe) | Metric scale | Point map + normals + FOV from one photo. |
| DA-V2 Small ONNX | Browser fallback | transformers.js WebGPU if the sidecar is off. |

Related classical work: [RoomAlive Toolkit](https://github.com/microsoft/RoomAliveToolkit)
(Gray-code projector–camera), [SLStudio](https://github.com/jakobwilm/slstudio),
[ofxProCamToolkit](https://github.com/kylemcdonald/ofxProCamToolkit).

## Layout

- `src/lib/patterns` Gray-code encode
- `src/lib/decode` structured-light decode
- `src/lib/calib` DLT projector pose + triangulation
- `src/lib/capture` walk-around stations + host orchestrator
- `src/lib/pose` station layout, DeviceOrientation, DA3 sidecar
- `src/lib/projector` native resolution / throw-to-wall as K prior
- `src/lib/pipeline` multi-view mapping + object residual (watch unused)
- `src/lib/sim` virtual room (no hardware)
- `src/lib/looks` bake a projector image (keywords + optional LLM)
- `src/pages` host / phone / projector
- `server` optional FastAPI sidecar

## Notes

- Camera is **not** attached to the projector.
- New object: recapture the walk-around. Live watch is later.
- Looks: library + one-shot prompt-to-look baked onto the mapping.
- `npm run dev` uses a self-signed cert so iOS `getUserMedia` can run on the LAN. Trust the cert once on the phone.
