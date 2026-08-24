# Lumen — auto projection mapping

A real projector throws patterns and looks onto **real walls and objects**. This app
replaces the usual manual grid warp: the projector flashes Gray-code stripes, a
handheld iPhone photographs those stripes **on the surfaces**, then the software
builds the map and projects a look onto the same surfaces.

HDMI / DisplayPort is only the **cable from the PC to the projector**. The mapping
target is never a TV.

## How this replaces dragging a grid

Manual mapping: you drag mesh vertices until the projected image sticks to the wall.
Auto mapping: the software recovers the same 3D facts those drags were encoding.

```
phone pose A + phone pose B + Gray-code IDs
        │
        ▼
  triangulate 3D points in the room
        │
        ▼
  PnP → projector pose in that same 3D frame
        │
        ▼
  bake look in projector pixels (the automatic warp)
```

A photo from an angle is fine. The angle is known because we know where the phone
was. The look is not painted in the photo's pixels; it is painted in **projector**
pixels, then the projector throws it onto the same 3D points.

We still do **not** stitch a photograph from the projector's camera. We do recover
**poses + surfaces**. Those are different things.

### Who already solved the pieces

| Piece | Repos / tools |
| --- | --- |
| Gray-code projector↔camera + triangulation | [RoomAlive Toolkit](https://github.com/microsoft/RoomAliveToolkit), [SLStudio](https://github.com/jakobwilm/slstudio), [ofxProCamToolkit](https://github.com/kylemcdonald/ofxProCamToolkit), OpenCV `structured_light` + `solvePnP` |
| Phone pose + depth from the walk-around | [Depth Anything 3](https://github.com/ByteDance-Seed/depth-anything-3) |
| Metric scale / point map from one photo | [MoGe-2](https://github.com/microsoft/MoGe) |
| Later live depth (new object) | [ZipDepth](https://zipdepth.github.io/), [DepthART-S](https://xuefeng-cvr.github.io/DepthART/) |

Gray codes answer *which projector pixel hit this camera pixel*. Depth/pose models
answer *where was the phone, and how big is a meter*. Together they put the
projector, the phone, and the surfaces in one 3D frame.

## What you actually see

We do **not** reconstruct a photograph from the projector's point of view. We **do**
recover projector pose, phone poses, and surfaces. Phone photos stay at the phone's
angles. The look is warped in projector pixels so it lands on those surfaces.

| Place | What is on it |
| --- | --- |
| **Host tab (test)** | One of your phone photos with the look painted on top. This is how you check mapping without staring at the wall. |
| **Projector tab / real projector** | **Only** Gray-code stripes (during capture), then the look. Never the photo. |
| **A TV showing the projector tab** | The same 2D framebuffer: stripes, then a flat warped painting. It will not look like the room, because a TV is a rectangle — the 3D wall is what makes the look line up. |

## Run it

```bash
npm install
npm test          # synthetic room is only here, to check the math
npm run dev       # https://localhost:5173  (self-signed cert so the iPhone camera works)
```

1. Plug the projector into the PC. Point it at the wall / objects. Set native
   resolution, throw-to-wall, and projected image height on the host.
2. Open **Projector window** and fullscreen it on the **projector output**. That tab
   is only what the unit throws into the room (stripes, then the look).
3. On the iPhone (same Wi‑Fi, HTTPS) open `/phone?room=XXXX`, allow camera,
   **Enable motion**. Photograph the **projected light on the surfaces**.
4. On the host click **Start live capture** and walk center → left → right →
   closer to objects. Hold still while stripes flash on the wall.
5. On the host you should see the **photo + look overlay**. The projector keeps
   throwing **only the look**. New object? Walk the stations again.

Default projector resolution prior is 1280×720. Match whatever the unit actually is.

Phone poses come from the **scene photos** via the sidecar:

1. Install [DA3-SMALL](https://github.com/ByteDance-Seed/depth-anything-3) and set `LUMEN_RUN_DA3=1`.
2. Optional: [MoGe-2 ViT-S](https://github.com/microsoft/MoGe) with `LUMEN_RUN_MOGE=1` to metric-scale those poses.
3. If the sidecar is off or the packages are missing, the app **guesses** the walk (station layout). That is not a measured pose.

Gray-code encode/decode is our implementation of the same algorithm as OpenCV `structured_light` / RoomAlive. We do **not** vendor those C#/Qt apps.

## Sidecar (DA3 / MoGe)

```bash
cd server
pip install -r requirements.txt
# opencv-python-headless is required for projector PnP. Optional, large:
#   pip install torch
#   pip install git+https://github.com/ByteDance-Seed/Depth-Anything-3.git
#   pip install git+https://github.com/microsoft/MoGe.git
LUMEN_RUN_DA3=1 LUMEN_RUN_MOGE=1 uvicorn app:app --host 127.0.0.1 --port 8787
```

Vite proxies `/api` to that process.

| POST | Purpose |
| --- | --- |
| `/pose` | **Calls DA3-SMALL** on scene JPEGs (`K,R,t` + depth). Optional MoGe-2 scales translations and depth. `{ok:false}` → browser station-layout fallback. |
| `/pnp` | **OpenCV `solvePnPRansac` + LM** for projector pose from triangulated 3D ↔ projector pixels. Browser DLT is the fallback. |
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
iPhone walk-around
        │
        ├─ scene frames → DA3-SMALL / MoGe-2  (pose + metric scale; station layout if sidecar is off)
        └─ Gray-code stack → camera→projector UV  (stripes as seen on the real surfaces)
                │
                ▼
     triangulate projector pixels seen from ≥2 phone poses
                │
                ▼
     OpenCV PnP (sidecar) or DLT → projector K, R, t
                │
                ▼
     densify: one-view Gray-code pixels + DA3/MoGe depth
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
- `src/lib/calib` DLT projector pose, OpenCV PnP client, triangulation
- `src/lib/capture` walk-around stations + host orchestrator
- `src/lib/pose` station layout, DeviceOrientation, DA3 sidecar
- `src/lib/projector` native resolution / throw-to-wall as K prior
- `src/lib/pipeline` multi-view mapping + object residual (watch unused)
- `src/lib/sim` synthetic room used by `npm test` only
- `src/lib/looks` bake a projector image (keywords + optional LLM)
- `src/pages` host / phone / projector
- `server` optional FastAPI sidecar

## Notes

- Camera is **not** attached to the projector.
- New object: recapture the walk-around. Live watch is later.
- Looks: library + one-shot prompt-to-look baked onto the mapping.
- `npm run dev` uses a self-signed cert so iOS `getUserMedia` can run on the LAN. Trust the cert once on the phone.
