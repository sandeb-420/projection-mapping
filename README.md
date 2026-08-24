# Lumen — auto projection mapping

Map a room with a handheld iPhone, recover the projector pose from structured light, then project looks onto the recovered surfaces.

You do **not** need a projector to try this. The default path is a **virtual room + virtual projector + three simulated iPhone stations**.

## Test without a projector

```bash
npm install
npm test          # Gray-code decode, projector pose, virtual-room mapping, remap-after-new-object
npm run dev       # https://localhost:5173  (self-signed cert so a real iPhone camera can work later)
```

1. Open the host page and click **Run virtual room**.
2. Open **Projector window** — that tab *is* the projector. Later you drag it onto HDMI.
3. Optional stand-in for a real throw: fullscreen the projector tab on a TV or second monitor and point a phone at it.

The simulator raycasts a back wall, floor, and box, paints Gray codes as a phone would see them, decodes correspondences, triangulates dual-view projector pixels, solves projector pose, and bakes a look. **Remap after new object** runs that whole capture again with an extra box in the room.

## Real hardware later (same app)

- **PC (RTX 2060)** runs the host + projector window on the HDMI output.
- **iPhone** opens `/phone` (not mounted on the projector). The UI asks you to walk: front, left, right, then closer to objects.
- At each Gray-code station the projector flashes stripes; the phone holds still and captures the stack.
- Looks: pick a **library look** or type a prompt to **generate a custom look once** from the mapping, then project it. Not realtime AI.
- New object: open the phone app and **walk the stations again**. Always-on camera detection is later.

## Pipeline

```
iPhone walk-around (or virtual cameras)
        │
        ├─ scene frames → DA3-SMALL / MoGe-2  (pose + metric scale; skipped in the simulator)
        └─ Gray-code stack → camera→projector UV
                │
                ▼
     triangulate projector pixels seen from ≥2 phone poses
                │
                ▼
     DLT / PnP → projector K, R, t
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

Realtime budget is for the watch loop only.

| Model | Use | Notes |
| --- | --- | --- |
| [DepthART-S](https://xuefeng-cvr.github.io/DepthART/) | Live depth | Tiny. [TypeGPU light-injection demo](https://docs.swmansion.com/TypeGPU/examples/#example=image-processing--monocular-light-injection) (~8ms on M4 Pro, [tweet](https://x.com/reczko_konrad/status/2089670934009413751)). |
| [ZipDepth](https://zipdepth.github.io/) | Live depth | 6.1M, TensorRT ~1ms-class on 30-series. Best Python sidecar candidate. |
| [DA3-SMALL](https://github.com/ByteDance-Seed/depth-anything-3) | Calib pose | 80M Apache-2.0. Depth + pose from the walk-around. |
| [MoGe-2 ViT-S](https://github.com/microsoft/MoGe) | Metric scale | Point map + normals + FOV from one photo. |
| DA-V2 Small ONNX | Browser fallback | transformers.js WebGPU if the sidecar is off. |

VGGT / FastVGGT are useful if you want a heavy multi-view reconstruct from a video orbit. Too big for the 25ms loop; fine as an offline calib option later.

Related classical work: [RoomAlive Toolkit](https://github.com/microsoft/RoomAliveToolkit) (Gray-code projector–camera), [SLStudio](https://github.com/jakobwilm/slstudio), [ofxProCamToolkit](https://github.com/kylemcdonald/ofxProCamToolkit).

## Layout

- `src/lib/patterns` Gray-code encode
- `src/lib/decode` structured-light decode
- `src/lib/calib` DLT projector pose + triangulation
- `src/lib/pipeline` multi-view mapping + object residual
- `src/lib/sim` virtual room (no hardware)
- `src/lib/looks` bake a projector image from the mapping
- `src/pages` host / phone / projector

## Notes

- Camera is **not** attached to the projector.
- New object: recapture the walk-around. Live watch is later.
- Looks: library + one-shot prompt-to-look baked onto the mapping.
- `npm run dev` uses a self-signed cert so iOS `getUserMedia` can run on the LAN. Trust the cert once on the phone.
