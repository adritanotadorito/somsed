import numpy as np
import unittest
from models import FitRequest, Point
from preprocessing import preprocess_stroke
from fitting import fit_all_families, fit_linear, fit_quadratic, fit_cubic, fit_absolute_value
from main import fit_stroke_curve

class TestCurveFitting(unittest.TestCase):

    def setUp(self):
        np.random.seed(42)

    def test_linear_curve(self):
        # y = 1.5x - 2.0 on [-4, 4] with small noise
        x = np.linspace(-4, 4, 60)
        y = 1.5 * x - 2.0 + np.random.normal(0, 0.04, size=len(x))
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_line")
        resp = fit_stroke_curve(req)

        self.assertTrue(resp.success)
        self.assertIsNotNone(resp.candidates)
        self.assertGreater(len(resp.candidates), 0)
        self.assertEqual(resp.best_family, "linear")
        best = resp.candidates[0]
        self.assertAlmostEqual(best.params["m"], 1.5, delta=0.1)
        self.assertAlmostEqual(best.params["b"], -2.0, delta=0.15)
        self.assertLess(best.rmse, 0.12)
        print("  ✅ [PASS] Linear fit accurate: m=1.5, b=-2.0, RMSE < 0.12")

    def test_quadratic_curve(self):
        # y = -0.5x^2 + 1.0x + 2.0 on [-3, 3] with noise
        x = np.linspace(-3, 3, 60)
        y = -0.5 * (x ** 2) + 1.0 * x + 2.0 + np.random.normal(0, 0.05, size=len(x))
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_quad")
        resp = fit_stroke_curve(req)

        self.assertTrue(resp.success)
        self.assertEqual(resp.best_family, "quadratic")
        best = resp.candidates[0]
        self.assertAlmostEqual(best.params["a"], -0.5, delta=0.1)
        self.assertAlmostEqual(best.params["b"], 1.0, delta=0.15)
        self.assertAlmostEqual(best.params["c"], 2.0, delta=0.2)
        self.assertLess(best.rmse, 0.15)
        print("  ✅ [PASS] Quadratic fit accurate: a=-0.5, b=1.0, c=2.0, RMSE < 0.15")

    def test_cubic_curve(self):
        # y = 0.1x^3 - 0.6x + 0.5 on [-4, 4] with noise
        x = np.linspace(-4, 4, 70)
        y = 0.1 * (x ** 3) - 0.6 * x + 0.5 + np.random.normal(0, 0.05, size=len(x))
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_cubic")
        resp = fit_stroke_curve(req)

        self.assertTrue(resp.success)
        self.assertEqual(resp.best_family, "cubic")
        best = resp.candidates[0]
        self.assertAlmostEqual(best.params["a"], 0.1, delta=0.05)
        self.assertAlmostEqual(best.params["c"], -0.6, delta=0.2)
        self.assertLess(best.rmse, 0.18)
        print("  ✅ [PASS] Cubic fit accurate: a=0.1, c=-0.6, RMSE < 0.18")

    def test_absolute_value_curve(self):
        # y = -1.2 |x - 1.5| + 3.0 on [-3, 5] with noise
        x = np.linspace(-3, 5, 80)
        y = -1.2 * np.abs(x - 1.5) + 3.0 + np.random.normal(0, 0.05, size=len(x))
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_abs")
        resp = fit_stroke_curve(req)

        self.assertTrue(resp.success)
        self.assertEqual(resp.best_family, "absolute_value")
        best = resp.candidates[0]
        self.assertAlmostEqual(best.params["a"], -1.2, delta=0.15)
        self.assertAlmostEqual(best.params["h"], 1.5, delta=0.2)
        self.assertAlmostEqual(best.params["k"], 3.0, delta=0.2)
        self.assertLess(best.rmse, 0.15)
        print("  ✅ [PASS] Absolute value fit accurate: a=-1.2, h=1.5, k=3.0, RMSE < 0.15")

    def test_reject_circle_loop(self):
        # Circle radius 4 centered at origin
        theta = np.linspace(0, 2 * np.pi, 60)
        x = 4.0 * np.cos(theta)
        y = 4.0 * np.sin(theta)
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_circle")
        resp = fit_stroke_curve(req)

        self.assertFalse(resp.success)
        self.assertIsNotNone(resp.rejection_reason)
        print(f"  ✅ [PASS] Circle correctly rejected: '{resp.rejection_reason}'")

    def test_reject_vertical_line(self):
        # Vertical segment at x = 2
        y = np.linspace(-5, 5, 50)
        x = np.full_like(y, 2.0)
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_vertical")
        resp = fit_stroke_curve(req)

        self.assertFalse(resp.success)
        self.assertTrue("vertical" in (resp.rejection_reason or "").lower())
        print(f"  ✅ [PASS] Vertical line correctly rejected: '{resp.rejection_reason}'")

    def test_reject_backward_loop(self):
        # S-curve turning backwards horizontally
        t = np.linspace(0, 3 * np.pi, 80)
        x = t - 2.0 * np.sin(t) # Turns back on itself
        y = np.cos(t)
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_loop")
        resp = fit_stroke_curve(req)

        self.assertFalse(resp.success)
        print(f"  ✅ [PASS] Backward loop correctly rejected: '{resp.rejection_reason}'")

    def test_simplicity_preference(self):
        # Straight line with slight hand jitter should NOT pick cubic over linear
        x = np.linspace(-4, 4, 60)
        y = 0.8 * x + 1.0 + np.random.normal(0, 0.03, size=len(x))
        raw_pts = [Point(x=float(px), y=float(py)) for px, py in zip(x, y)]

        req = FitRequest(points=raw_pts, stroke_id="test_simplicity")
        resp = fit_stroke_curve(req)

        self.assertTrue(resp.success)
        self.assertEqual(resp.best_family, "linear", "Nearly straight line with hand wobble must prefer linear over cubic")
        print("  ✅ [PASS] Simplicity hurdle verified: straight stroke with wobble prefers linear over cubic")

if __name__ == "__main__":
    print("\n=== RUNNING BACKEND CURVE FITTING UNIT & REGRESSION TESTS ===\n")
    unittest.main()
