"""Phone pose from captured scene photos.

DA3-SMALL (ByteDance) estimates multi-view K, R, t from the JPEGs.
MoGe-2 (Microsoft) optionally rescales those poses to metric units.

These are the same families of models used in visual geometry papers; we call
the libraries rather than reimplementing them. Gray-code decode stays in the
browser (same algorithm as OpenCV structured_light / RoomAlive).
"""

from __future__ import annotations

import base64
import io
import os
from typing import Any

import numpy as np

_da3_model: Any = None
_moge_model: Any = None
_last_error: str | None = None


def last_error() -> str | None:
    return _last_error


def jpeg_to_rgb(jpeg: str) -> np.ndarray:
    raw = jpeg.split(",", 1)[-1]
    buf = base64.b64decode(raw)
    try:
        import cv2

        arr = np.frombuffer(buf, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("cv2.imdecode failed")
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    except Exception:
        from PIL import Image

        img = Image.open(io.BytesIO(buf)).convert("RGB")
        return np.asarray(img)


def scale_intrinsics(
    k: np.ndarray,
    src_w: float,
    src_h: float,
    dst_w: float,
    dst_h: float,
) -> np.ndarray:
    out = np.array(k, dtype=np.float64).reshape(3, 3).copy()
    out[0, :] *= dst_w / max(src_w, 1e-6)
    out[1, :] *= dst_h / max(src_h, 1e-6)
    return out


def rt_from_extrinsic(ext: np.ndarray) -> tuple[list[float], list[float]]:
    mat = np.asarray(ext, dtype=np.float64)
    if mat.shape == (4, 4):
        rot = mat[:3, :3]
        trans = mat[:3, 3]
    elif mat.shape == (3, 4):
        rot = mat[:, :3]
        trans = mat[:, 3]
    elif mat.shape == (3, 3):
        rot = mat
        trans = np.zeros(3)
    else:
        raise ValueError(f"unexpected extrinsic shape {mat.shape}")
    return rot.reshape(9).tolist(), trans.reshape(3).tolist()


def resize_depth(depth: np.ndarray, out_w: int, out_h: int) -> np.ndarray:
    src = np.asarray(depth, dtype=np.float32)
    if src.ndim != 2:
        raise ValueError("depth must be HxW")
    ys = np.linspace(0, src.shape[0] - 1, out_h).astype(np.int32)
    xs = np.linspace(0, src.shape[1] - 1, out_w).astype(np.int32)
    return np.ascontiguousarray(src[ys][:, xs])


def depth_to_b64(depth: np.ndarray) -> str:
    f32 = np.ascontiguousarray(depth.astype(np.float32))
    return base64.b64encode(f32.tobytes()).decode("ascii")


def views_from_da3_prediction(
    prediction: Any,
    ids: list[str],
    orig_sizes: list[tuple[int, int]],
) -> list[dict[str, Any]]:
    exts = np.asarray(prediction.extrinsics)
    ixts = np.asarray(prediction.intrinsics)
    processed = getattr(prediction, "processed_images", None)
    if processed is not None and len(processed) > 0:
        proc_h, proc_w = int(processed.shape[1]), int(processed.shape[2])
    else:
        proc_h, proc_w = orig_sizes[0][1], orig_sizes[0][0]

    out: list[dict[str, Any]] = []
    for i, view_id in enumerate(ids):
        rot, trans = rt_from_extrinsic(exts[i])
        orig_w, orig_h = orig_sizes[i]
        k = scale_intrinsics(ixts[i], proc_w, proc_h, orig_w, orig_h)
        item: dict[str, Any] = {
            "id": view_id,
            "R": rot,
            "t": trans,
            "K": k.reshape(9).tolist(),
        }
        raw_depth = getattr(prediction, "depth", None)
        if raw_depth is not None:
            plane = np.asarray(raw_depth[i], dtype=np.float32)
            if plane.ndim == 2:
                resized = resize_depth(plane, orig_w, orig_h)
                item["depthB64"] = depth_to_b64(resized)
                item["depthWidth"] = orig_w
                item["depthHeight"] = orig_h
        out.append(item)
    return out


def apply_metric_scale(views: list[dict[str, Any]], scale: float) -> list[dict[str, Any]]:
    if not np.isfinite(scale) or scale <= 0:
        return views
    scaled: list[dict[str, Any]] = []
    for view in views:
        trans = [float(c) * scale for c in view["t"]]
        next_view: dict[str, Any] = {**view, "t": trans, "metricScale": scale}
        if isinstance(view.get("depthB64"), str):
            raw = np.frombuffer(base64.b64decode(view["depthB64"]), dtype=np.float32).copy()
            raw *= np.float32(scale)
            next_view["depthB64"] = depth_to_b64(raw)
        scaled.append(next_view)
    return scaled


def _device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _load_da3() -> Any:
    global _da3_model, _last_error
    if _da3_model is not None:
        return _da3_model
    try:
        try:
            from depth_anything_3.api import DepthAnything3
        except ImportError:
            from depth_anything_3 import DepthAnything3  # type: ignore

        name = os.environ.get("LUMEN_DA3_MODEL", "da3-small")
        model = DepthAnything3(model_name=name)
        to = getattr(model, "to", None)
        if callable(to):
            model = to(_device())
        _da3_model = model
        return _da3_model
    except Exception as err:
        _last_error = f"da3-load: {err}"
        return None


def _load_moge() -> Any:
    global _moge_model, _last_error
    if _moge_model is not None:
        return _moge_model
    try:
        from moge.model.v2 import MoGeModel

        name = os.environ.get("LUMEN_MOGE_MODEL", "Ruicheng/moge-2-vits-normal")
        model = MoGeModel.from_pretrained(name).to(_device())
        _moge_model = model
        return _moge_model
    except Exception as err:
        _last_error = f"moge-load: {err}"
        return None


def moge_median_depth(rgb: np.ndarray) -> float | None:
    global _last_error
    model = _load_moge()
    if model is None:
        return None
    try:
        import torch

        tensor = torch.tensor(rgb / 255.0, dtype=torch.float32, device=_device()).permute(2, 0, 1)
        output = model.infer(tensor)
        depth = np.asarray(output["depth"])
        valid = depth[np.isfinite(depth) & (depth > 0)]
        if valid.size < 16:
            return None
        return float(np.median(valid))
    except Exception as err:
        _last_error = f"moge-infer: {err}"
        return None


def da3_median_depth(prediction: Any) -> float | None:
    depth = getattr(prediction, "depth", None)
    if depth is None:
        return None
    arr = np.asarray(depth)
    valid = arr[np.isfinite(arr) & (arr > 0)]
    if valid.size < 16:
        return None
    return float(np.median(valid))


def pose_views_from_request(views: list[Any]) -> tuple[list[dict[str, Any]] | None, str | None]:
    """Returns (views, source) from scene JPEGs. source is da3 or da3+moge."""
    global _last_error
    _last_error = None
    images: list[np.ndarray] = []
    ids: list[str] = []
    sizes: list[tuple[int, int]] = []
    for i, view in enumerate(views):
        if not isinstance(view, dict):
            continue
        jpeg = view.get("jpeg")
        if not isinstance(jpeg, str) or len(jpeg) < 32:
            continue
        try:
            rgb = jpeg_to_rgb(jpeg)
        except Exception as err:
            _last_error = f"jpeg: {err}"
            continue
        images.append(rgb)
        ids.append(str(view.get("id") or f"view-{i}"))
        sizes.append((int(rgb.shape[1]), int(rgb.shape[0])))
    if len(images) < 1:
        return None, None

    if os.environ.get("LUMEN_RUN_DA3") != "1":
        return None, None

    model = _load_da3()
    if model is None:
        return None, None
    try:
        process_res = int(os.environ.get("LUMEN_DA3_RES", "378"))
        prediction = model.inference(
            image=images,
            process_res=process_res,
            ref_view_strategy="first",
        )
        if getattr(prediction, "extrinsics", None) is None:
            _last_error = "da3 returned no extrinsics"
            return None, None
        posed = views_from_da3_prediction(prediction, ids, sizes)
    except Exception as err:
        _last_error = f"da3-infer: {err}"
        return None, None

    source = "da3"
    if os.environ.get("LUMEN_RUN_MOGE") == "1" and len(images) > 0:
        moge_med = moge_median_depth(images[0])
        da3_med = da3_median_depth(prediction)
        if moge_med and da3_med and da3_med > 1e-6:
            posed = apply_metric_scale(posed, moge_med / da3_med)
            source = "da3+moge"
    return posed, source
