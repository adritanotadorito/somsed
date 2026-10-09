import unittest
import numpy as np
import time
from models import Point
from preprocessing import preprocess_stroke
from fitting import fit_all_families

class TestCurveFitting(unittest.TestCase):

    def test_ordinary_and_sideways_parabola(self):
        # Ordinary parabola: y = 0.5x^2 - 1, x in [-3, 3]
        pts_ord = []
        for x in np.linspace(-3, 3, 50):
            noise = np.random.normal(0, 0.02)
            pts_ord.append(Point(x=float(x), y=float(0.5 * x**2 - 1.0 + noise)))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_ord)
        self.assertTrue(ok)
        self.assertIn("y_of_x", orients)
        succ, cands, _, timings = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "quadratic")
        self.assertEqual(cands[0].orientation, "y_of_x")
        self.assertAlmostEqual(cands[0].params["a"], 0.5, delta=0.1)

        # Sideways parabola: x = 0.5y^2 - 1, y in [-3, 3]
        pts_side = []
        for y in np.linspace(-3, 3, 50):
            noise = np.random.normal(0, 0.02)
            pts_side.append(Point(x=float(0.5 * y**2 - 1.0 + noise), y=float(y)))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_side)
        self.assertTrue(ok)
        self.assertIn("x_of_y", orients)
        succ, cands, _, timings = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "quadratic")
        self.assertEqual(cands[0].orientation, "x_of_y")
        self.assertIn("x =", cands[0].latex)
        self.assertIn("y^2", cands[0].latex)
        print(f"  ✅ [PASS] Ordinary & Sideways Parabolas: {cands[0].latex} (Time: {timings['total_ms']}ms)")

    def test_ordinary_and_sideways_cubic(self):
        # Sideways cubic: x = 0.1y^3 - 0.5y, y in [-3, 3]
        pts_side = []
        for y in np.linspace(-3, 3, 60):
            noise = np.random.normal(0, 0.02)
            pts_side.append(Point(x=float(0.1 * y**3 - 0.5 * y + noise), y=float(y)))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_side)
        self.assertTrue(ok)
        self.assertIn("x_of_y", orients)
        succ, cands, _, timings = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "cubic")
        self.assertEqual(cands[0].orientation, "x_of_y")
        self.assertIn("y^3", cands[0].latex)
        print(f"  ✅ [PASS] Sideways Cubic (S-curve): {cands[0].latex} (Time: {timings['total_ms']}ms)")

    def test_sine_wave_fitting(self):
        # y = 1.5 sin(2x - 0.5) + 1.0, x in [-3, 3] (approx 2 cycles)
        pts_sine = []
        for x in np.linspace(-3, 3, 70):
            noise = np.random.normal(0, 0.04)
            pts_sine.append(Point(x=float(x), y=float(1.5 * np.sin(2.0 * x - 0.5) + 1.0 + noise)))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_sine)
        self.assertTrue(ok)
        succ, cands, _, timings = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "sine")
        self.assertAlmostEqual(cands[0].params["A"], 1.5, delta=0.2)
        self.assertAlmostEqual(cands[0].params["B"], 2.0, delta=0.2)
        self.assertAlmostEqual(cands[0].params["D"], 1.0, delta=0.2)
        print(f"  ✅ [PASS] Sine Wave Fit: {cands[0].text} (Time: {timings['total_ms']}ms)")

    def test_sideways_sine_wave(self):
        # x = 1.2 sin(1.8y + 0.3) - 0.5, y in [-4, 4]
        pts_side_sine = []
        for y in np.linspace(-4, 4, 80):
            noise = np.random.normal(0, 0.03)
            pts_side_sine.append(Point(x=float(1.2 * np.sin(1.8 * y + 0.3) - 0.5 + noise), y=float(y)))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_side_sine)
        self.assertTrue(ok)
        self.assertIn("x_of_y", orients)
        succ, cands, _, timings = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "sine")
        self.assertEqual(cands[0].orientation, "x_of_y")
        self.assertIn("x =", cands[0].text)
        print(f"  ✅ [PASS] Sideways Sine Wave: {cands[0].text} (Time: {timings['total_ms']}ms)")

    def test_rejection_of_loop_needs_parametric(self):
        # Circle / closed loop
        pts_circle = []
        for a in np.linspace(0, 2 * np.pi, 60):
            pts_circle.append(Point(x=float(3 * np.cos(a)), y=float(3 * np.sin(a))))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_circle)
        self.assertFalse(ok)
        self.assertTrue(is_param)
        self.assertIn("parametric", err.lower())
        print(f"  ✅ [PASS] Circle correctly identified as needing parametric fitting: '{err}'")

    def test_forced_quadratic_on_wave_reports_poor_fit(self):
        # 3-cycle sine wave: y = 2.0 sin(3x)
        pts_wave = []
        for x in np.linspace(-4, 4, 80):
            pts_wave.append(Point(x=float(x), y=float(2.0 * np.sin(3.0 * x))))
        ok, res_pts, orients, is_param, err = preprocess_stroke(pts_wave)
        self.assertTrue(ok)
        
        t0 = time.perf_counter()
        succ, cands, _, timings = fit_all_families(res_pts, orients, requested_families=['quadratic'])
        elapsed_ms = (time.perf_counter() - t0) * 1000
        
        self.assertTrue(succ)
        self.assertEqual(len(cands), 1)
        self.assertEqual(cands[0].family, "quadratic")
        self.assertTrue(cands[0].is_poor_fit)
        self.assertIsNotNone(cands[0].warning)
        self.assertLess(elapsed_ms, 50)  # Must complete promptly (< 50ms)
        print(f"  ✅ [PASS] Forced Quadratic on Sine Wave finishes in {elapsed_ms:.2f}ms with poor fit warning: '{cands[0].warning}'")

    def test_lines_in_both_orientations(self):
        # Horizontal line: y = 2
        pts_h = [Point(x=float(x), y=2.0 + np.random.normal(0, 0.01)) for x in np.linspace(-5, 5, 40)]
        ok, res_pts, orients, _, _ = preprocess_stroke(pts_h)
        self.assertTrue(ok)
        succ, cands, _, _ = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "linear")
        self.assertEqual(cands[0].orientation, "y_of_x")

        # Vertical line: x = 3
        pts_v = [Point(x=3.0 + np.random.normal(0, 0.01), y=float(y)) for y in np.linspace(-5, 5, 40)]
        ok, res_pts, orients, _, _ = preprocess_stroke(pts_v)
        self.assertTrue(ok)
        self.assertIn("x_of_y", orients)
        succ, cands, _, _ = fit_all_families(res_pts, orients)
        self.assertTrue(succ)
        self.assertEqual(cands[0].family, "linear")
        self.assertEqual(cands[0].orientation, "x_of_y")
        self.assertIn("x =", cands[0].latex)
        print("  ✅ [PASS] Lines in both horizontal and vertical orientations fitted correctly.")

if __name__ == "__main__":
    print("\n=== RUNNING MILESTONE 4 BACKEND TESTS (SINE, SIDEWAYS, QUALITY GATES, TIMINGS) ===")
    unittest.main()
