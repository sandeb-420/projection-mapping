# Lumen — auto projection mapping

Map a room with a handheld iPhone, recover the projector pose from structured light, then project looks onto the recovered surfaces.

You do **not** need a projector to try this. The default path is a **virtual room + virtual projector + three simulated iPhone stations**.

## Test without a projector

```bash
npm install
npm test          # Gray-code decode, projector pose, virtual-room mapping, live-path mapping, remap-after-new-object
npm run dev       # https://localhost:5173  (self-signed cert so a real iPhone camera can work later)
```

1. Open the host page and click **Run virtual room**.
2. Open **Projector window** — that tab *is* the projector. Later you drag it onto HDMI.
3. Optional stand-in for a real throw: fullscreen the projector tab on a TV or second monitor and point a phone at it.

The simulator raycasts a back wall, floor, and box, paints Gray codes as a phone would see them, decodes correspondences, triangulates dual-view projector pixels, solves projector pose, and bakes a look. **Remap after new object** runs that whole capture again with an extra box in the room.

## Live capture (phone + projector tab)

Same math as the simulator. The host drives Gray-code index over WebSocket / BroadcastChannel; the projector tab paints each stripe; the iPhone captures and uploads JPEGs.

1. On the PC, set **HDMI / projector K** (resolution, FOV, optional throw + image height).
2. **Open projector window**, drag it onto the HDMI/TV display, click **Fullscreen**.
3. On the iPhone (HTTPS, same room code) open `/phone?room=XXXX`, allow camera, **Enable motion**.
4. On the host click **Start live capture** and walk center → left → right → closer to objects.
5. Bake a library look or a one-shot prompt. New object? Walk the stations again.

A 640×360 projector resolution is enough for a first TV test; 1280×720 is the default K prior.

Phone poses: the sidecar tries **DA3-SMALL / MoGe-2** when those packages are installed and `LUMEN_RUN_DA3=1` (or `LUMEN_RUN_MOGE=1`). Otherwise the app uses the nominal walk-around layout, optionally yaw-adjusted from DeviceOrientation.

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

## Real hardware

- **PC** runs the host + projector window on the HDMI output. Fullscreen the `/projector` tab on that display.
- **iPhone** opens `/phone` (not mounted on the projector). The UI asks you to walk: front, left, right, then closer to objects.
- At each Gray-code station the projector flashes stripes; the phone holds still and captures the stack.
- Looks: pick a **library look** or type a prompt to **generate a custom look once** from the mapping, then project it. Not realtime AI. If the sidecar has an API key, the prompt can also return WGSL that is stored on the spec; the raster bake still uses hue / mode / freq.
- New object: open the phone app and **walk the stations again**. Always-on camera detection is deferred.

## Pipeline

```
iPhone walk-around (or virtual cameras)
        │
        ├─ scene frames → DA3-SMALL / MoGe-2  (pose + metric scale; station layout if sidecar is off)
        └─ Gray-code stack → camera→projector UV
                │
                ▼
     triangulate projector pixels seen from ≥2 phone poses
                │
                ▼
     DLT / PnP → projector K (from HDMI resolution + throw), R, t
                │
                ▼
     RANSAC planes + leftover object blobs
                │
                ▼
     bake look (library or one-shot prompt) → projector window
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

VGGT / FastVGGT are useful if you want a heavy multi-view reconstruct from a video orbit. Too big for the 25ms loop; fine as an offline calib option later.

Related classical work: [RoomAlive Toolkit](https://github.com/microsoft/RoomAliveToolkit) (Gray-code projector–camera), [SLStudio](https://github.com/jakobwilm/slstudio), [ofxProCamToolkit](https://github.com/kylemcdonald/ofxProCamToolkit).

## Layout

- `src/lib/patterns` Gray-code encode
- `src/lib/decode` structured-light decode
- `src/lib/calib` DLT projector pose + triangulation
- `src/lib/capture` walk-around stations + host orchestrator
- `src/lib/pose` station layout, DeviceOrientation, DA3 sidecar
- `src/lib/projector` HDMI resolution / throw as K prior
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
