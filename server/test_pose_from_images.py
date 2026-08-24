from __future__ import annotations

import unittest
from types import SimpleNamespace
import base64
import os

import numpy as np

from pose_from_images import (
    apply_metric_scale,
    depth_to_b64,
    pose_views_from_request,
    rt_from_extrinsic,
    scale_intrinsics,
    views_from_da3_prediction,
)


class PoseFromImagesTest(unittest.TestCase):
    def test_rt_from_3x4_world_to_camera(self) -> None:
        ext = np.array(
            [
                [1.0, 0.0, 0.0, 0.2],
                [0.0, 1.0, 0.0, -0.1],
                [0.0, 0.0, 1.0, 1.5],
            ]
        )
        rot, trans = rt_from_extrinsic(ext)
        self.assertEqual(rot[0], 1.0)
        self.assertEqual(trans, [0.2, -0.1, 1.5])

    def test_scale_intrinsics_to_original_jpeg(self) -> None:
        k = np.array([[200.0, 0.0, 100.0], [0.0, 200.0, 50.0], [0.0, 0.0, 1.0]])
        scaled = scale_intrinsics(k, 200, 100, 400, 200)
        self.assertAlmostEqual(scaled[0, 0], 400.0)
        self.assertAlmostEqual(scaled[0, 2], 200.0)
        self.assertAlmostEqual(scaled[1, 2], 100.0)

    def test_views_from_da3_prediction(self) -> None:
        ext = np.array(
            [
                [
                    [1.0, 0.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0, 0.0],
                    [0.0, 0.0, 1.0, 0.0],
                    [0.0, 0.0, 0.0, 1.0],
                ],
                [
                    [1.0, 0.0, 0.0, 0.4],
                    [0.0, 1.0, 0.0, 0.0],
                    [0.0, 0.0, 1.0, 0.0],
                    [0.0, 0.0, 0.0, 1.0],
                ],
            ]
        )
        ixt = np.array(
            [
                [[100.0, 0.0, 50.0], [0.0, 100.0, 25.0], [0.0, 0.0, 1.0]],
                [[100.0, 0.0, 50.0], [0.0, 100.0, 25.0], [0.0, 0.0, 1.0]],
            ]
        )
        processed = np.zeros((2, 50, 100, 3), dtype=np.uint8)
        depth = np.ones((2, 50, 100), dtype=np.float32)
        depth[1] *= 2.0
        prediction = SimpleNamespace(
            extrinsics=ext,
            intrinsics=ixt,
            processed_images=processed,
            depth=depth,
        )
        views = views_from_da3_prediction(
            prediction,
            ["center", "left"],
            [(200, 100), (200, 100)],
        )
        self.assertEqual(len(views), 2)
        self.assertEqual(views[0]["id"], "center")
        self.assertAlmostEqual(views[0]["K"][0], 200.0)
        self.assertAlmostEqual(views[1]["t"][0], 0.4)
        self.assertIn("depthB64", views[0])
        self.assertEqual(views[0]["depthWidth"], 200)
        raw = np.frombuffer(base64.b64decode(views[0]["depthB64"]), dtype=np.float32)
        self.assertEqual(raw.size, 200 * 100)
        self.assertAlmostEqual(float(np.mean(raw)), 1.0, places=5)

    def test_metric_scale_multiplies_translation(self) -> None:
        views = [{"id": "center", "R": [1, 0, 0, 0, 1, 0, 0, 0, 1], "t": [0.1, 0.0, 0.2], "K": []}]
        scaled = apply_metric_scale(views, 2.0)
        self.assertEqual(scaled[0]["t"], [0.2, 0.0, 0.4])
        self.assertEqual(scaled[0]["metricScale"], 2.0)

    def test_metric_scale_multiplies_depth(self) -> None:
        depth = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        views = [
            {
                "id": "center",
                "R": [1, 0, 0, 0, 1, 0, 0, 0, 1],
                "t": [0.1, 0.0, 0.2],
                "K": [],
                "depthB64": depth_to_b64(depth.reshape(1, 3)),
                "depthWidth": 3,
                "depthHeight": 1,
            }
        ]
        scaled = apply_metric_scale(views, 2.0)
        raw = np.frombuffer(base64.b64decode(scaled[0]["depthB64"]), dtype=np.float32)
        np.testing.assert_allclose(raw, [2.0, 4.0, 6.0])

    def test_pose_requires_da3_and_moge_flags(self) -> None:
        import cv2

        rgb = np.zeros((8, 8, 3), dtype=np.uint8)
        ok, buf = cv2.imencode(".jpg", rgb)
        self.assertTrue(ok)
        jpeg = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()
        old_da3 = os.environ.pop("LUMEN_RUN_DA3", None)
        old_moge = os.environ.pop("LUMEN_RUN_MOGE", None)
        try:
            views, source = pose_views_from_request([{"id": "center", "jpeg": jpeg}])
            self.assertIsNone(views)
            self.assertIsNone(source)
            os.environ["LUMEN_RUN_DA3"] = "1"
            views, source = pose_views_from_request([{"id": "center", "jpeg": jpeg}])
            self.assertIsNone(views)
            self.assertIsNone(source)
        finally:
            os.environ.pop("LUMEN_RUN_DA3", None)
            os.environ.pop("LUMEN_RUN_MOGE", None)
            if old_da3 is not None:
                os.environ["LUMEN_RUN_DA3"] = old_da3
            if old_moge is not None:
                os.environ["LUMEN_RUN_MOGE"] = old_moge


if __name__ == "__main__":
    unittest.main()
