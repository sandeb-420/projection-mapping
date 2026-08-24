export const MODEL_CATALOG = [
  {
    id: "depthart-s",
    name: "DepthART-S",
    role: "live-depth",
    why: "Viral TypeGPU path: Konrad Reczko ran a 448² DepthART pass in ~8ms on M4 Pro, zero-copy into lighting. Tiny (~6–8M). Target for RTX 2060 ~25ms.",
    links: [
      "https://x.com/reczko_konrad/status/2089670934009413751",
      "https://xuefeng-cvr.github.io/DepthART/",
      "https://docs.swmansion.com/TypeGPU/examples/#example=image-processing--monocular-light-injection",
    ],
  },
  {
    id: "zipdepth",
    name: "ZipDepth",
    role: "live-depth",
    why: "ECCV 2026, 6.1M, TensorRT ~1.3ms on RTX 3070 laptop. Best tiny CNN if we skip TypeGPU inference and use the Python sidecar.",
    links: ["https://zipdepth.github.io/", "https://github.com/fabiotosi92/ZipDepth"],
  },
  {
    id: "da3-small",
    name: "Depth Anything 3 Small",
    role: "calib-pose",
    why: "80M, Apache-2.0. Depth + camera pose + intrinsics from one or more iPhone frames. Used when you walk around; not the 25ms loop.",
    links: ["https://github.com/ByteDance-Seed/depth-anything-3"],
  },
  {
    id: "moge2-s",
    name: "MoGe-2 ViT-S",
    role: "calib-metric",
    why: "35M. Metric point map, normals, camera FOV from a single photo. Scales Gray-code triangulation.",
    links: ["https://github.com/microsoft/MoGe"],
  },
  {
    id: "da-v2-small",
    name: "Depth Anything V2 Small",
    role: "fallback-webgpu",
    why: "Browser ONNX via transformers.js / WebGPU when the sidecar is off.",
    links: ["https://huggingface.co/onnx-community/depth-anything-v2-small"],
  },
] as const;

export type ModelRole = (typeof MODEL_CATALOG)[number]["role"];
