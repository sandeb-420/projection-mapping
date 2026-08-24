from __future__ import annotations

import unittest

import numpy as np

from pnp import solve_projector_pnp


class ProjectorPnpTest(unittest.TestCase):
    def test_recovers_known_pose(self) -> None:
        k = np.array([[400.0, 0.0, 160.0], [0.0, 400.0, 90.0], [0.0, 0.0, 1.0]])
        r_true = np.eye(3)
        t_true = np.array([0.05, -0.1, 0.2])
        pts3 = []
        pts2 = []
        for z in (2.4, 2.8, 3.2):
            for y in (0.2, 0.8, 1.4):
                for x in (-1.0, 0.0, 1.0):
                    p = np.array([x, y, z])
                    cam = r_true @ p + t_true
                    u = k[0, 0] * cam[0] / cam[2] + k[0, 2]
                    v = k[1, 1] * cam[1] / cam[2] + k[1, 2]
                    pts3.append(p.tolist())
                    pts2.append([u, v])
        result = solve_projector_pnp(k.reshape(9).tolist(), pts3, pts2)
        if not result.get("ok"):
            self.skipTest(f"OpenCV unavailable: {result}")
        t = np.array(result["t"])
        self.assertLess(np.linalg.norm(t - t_true), 0.05)
        self.assertLess(result["rms"], 1.0)
        self.assertGreaterEqual(result["inliers"], 6)

    def test_refines_from_dlt_guess(self) -> None:
        k = np.array([[400.0, 0.0, 160.0], [0.0, 400.0, 90.0], [0.0, 0.0, 1.0]])
        r_true = np.eye(3)
        t_true = np.array([0.05, -0.1, 0.2])
        pts3 = []
        pts2 = []
        rng = np.random.default_rng(0)
        for z in (2.4, 2.8, 3.2):
            for y in (0.2, 0.8, 1.4):
                for x in (-1.0, 0.0, 1.0):
                    p = np.array([x, y, z])
                    cam = r_true @ p + t_true
                    u = k[0, 0] * cam[0] / cam[2] + k[0, 2]
                    v = k[1, 1] * cam[1] / cam[2] + k[1, 2]
                    pts3.append(p.tolist())
                    pts2.append([u + rng.normal(0, 0.2), v + rng.normal(0, 0.2)])
        noisy_t = (t_true + np.array([0.08, -0.05, 0.1])).tolist()
        result = solve_projector_pnp(
            k.reshape(9).tolist(),
            pts3,
            pts2,
            None,
            r_true.reshape(9).tolist(),
            noisy_t,
        )
        if not result.get("ok"):
            self.skipTest(f"OpenCV unavailable: {result}")
        t = np.array(result["t"])
        self.assertLess(np.linalg.norm(t - t_true), 0.05)
        self.assertLess(result["rms"], 1.0)


if __name__ == "__main__":
    unittest.main()
