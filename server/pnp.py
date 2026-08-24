"""OpenCV PnP for projector pose. Same 3D↔projector-pixel pairs, better solver."""

from __future__ import annotations

from typing import Any

import numpy as np


def solve_projector_pnp(
    k: list[float] | list[list[float]],
    points3d: list[list[float]],
    points2d: list[list[float]],
    dist: list[float] | None = None,
    r_init: list[float] | list[list[float]] | None = None,
    t_init: list[float] | None = None,
) -> dict[str, Any]:
    try:
        import cv2
    except ImportError as err:
        return {"ok": False, "reason": "opencv-missing", "error": str(err)}

    obj = np.asarray(points3d, dtype=np.float64)
    img = np.asarray(points2d, dtype=np.float64)
    if obj.ndim != 2 or obj.shape[1] != 3 or img.shape[0] != obj.shape[0] or img.shape[1] != 2:
        return {"ok": False, "reason": "bad-points"}
    if obj.shape[0] < 6:
        return {"ok": False, "reason": "too-few-points"}

    camera = np.asarray(k, dtype=np.float64).reshape(3, 3)
    distort = np.zeros(5, dtype=np.float64) if not dist else np.asarray(dist, dtype=np.float64)

    guess_r, guess_t = _as_rt(r_init, t_init)
    use_guess = guess_r is not None
    if use_guess:
        rvec0, _ = cv2.Rodrigues(guess_r)
        tvec0 = guess_t
        flags = cv2.SOLVEPNP_ITERATIVE
    else:
        rvec0 = np.zeros((3, 1), dtype=np.float64)
        tvec0 = np.zeros((3, 1), dtype=np.float64)
        flags = cv2.SOLVEPNP_EPNP

    ok, rvec, tvec, inliers = cv2.solvePnPRansac(
        obj,
        img,
        camera,
        distort,
        rvec0,
        tvec0,
        use_guess,
        200,
        3.0,
        0.999,
        None,
        flags,
    )
    if (not ok or inliers is None or len(inliers) < 6) and flags != cv2.SOLVEPNP_EPNP:
        ok, rvec, tvec, inliers = cv2.solvePnPRansac(
            obj,
            img,
            camera,
            distort,
            np.zeros((3, 1), dtype=np.float64),
            np.zeros((3, 1), dtype=np.float64),
            False,
            200,
            3.0,
            0.999,
            None,
            cv2.SOLVEPNP_EPNP,
        )
    if not ok or inliers is None or len(inliers) < 6:
        return {"ok": False, "reason": "pnp-failed"}

    idx = inliers.reshape(-1)
    obj_in = obj[idx]
    img_in = img[idx]
    try:
        rvec, tvec = cv2.solvePnPRefineLM(obj_in, img_in, camera, distort, rvec, tvec)
    except cv2.error:
        pass
    rot, _ = cv2.Rodrigues(rvec)
    trans = tvec.reshape(3)

    projected, _ = cv2.projectPoints(obj_in, rvec, tvec, camera, distort)
    projected = projected.reshape(-1, 2)
    err = projected - img_in
    rms = float(np.sqrt(np.mean(np.sum(err * err, axis=1))))

    return {
        "ok": True,
        "source": "opencv-pnp",
        "R": rot.reshape(9).tolist(),
        "t": trans.tolist(),
        "rms": rms,
        "inliers": int(len(idx)),
        "K": camera.reshape(9).tolist(),
    }


def _as_rt(
    r_init: list[float] | list[list[float]] | None,
    t_init: list[float] | None,
) -> tuple[np.ndarray, np.ndarray] | tuple[None, None]:
    if r_init is None or t_init is None:
        return None, None
    try:
        rot = np.asarray(r_init, dtype=np.float64).reshape(3, 3)
        trans = np.asarray(t_init, dtype=np.float64).reshape(3, 1)
    except ValueError:
        return None, None
    if not np.all(np.isfinite(rot)) or not np.all(np.isfinite(trans)):
        return None, None
    return rot, trans
