import numpy as np
from typing import Tuple, Optional

def preprocess_stroke(raw_points: list) -> Tuple[bool, Optional[np.ndarray], Optional[np.ndarray], Optional[Tuple[float, float]], Optional[str]]:
    """
    Preprocesses a raw freehand stroke for mathematical function curve fitting:
    1. Validates point coordinates are finite.
    2. Resamples by Euclidean arc length to remove speed/sampling bias.
    3. Checks whether the stroke represents a single-valued function y = f(x).
       Rejects circles, vertical lines, loops, and multi-branched strokes.
    4. Returns sorted, cleaned (x, y) arrays and domain (x_min, x_max).
    """
    if not raw_points or len(raw_points) < 4:
        return False, None, None, None, "Stroke has too few points for curve fitting (minimum 4 points required)."

    # Extract coordinates
    try:
        pts = np.array([[p['x'] if isinstance(p, dict) else p.x, 
                         p['y'] if isinstance(p, dict) else p.y] for p in raw_points], dtype=np.float64)
    except Exception as e:
        return False, None, None, None, f"Invalid point data format: {str(e)}"

    if not np.all(np.isfinite(pts)):
        return False, None, None, None, "Stroke contains invalid or non-finite coordinates."

    # 1. Deduplicate consecutive identical points
    diffs = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    keep_mask = np.concatenate(([True], diffs > 1e-5))
    pts = pts[keep_mask]
    if len(pts) < 4:
        return False, None, None, None, "Stroke is too short or lacks distinct points."

    # 2. Resample by arc length
    diffs = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum_dist = np.concatenate(([0.0], np.cumsum(diffs)))
    total_len = cum_dist[-1]

    if total_len < 0.2:
        return False, None, None, None, "Stroke is too small in graph coordinate space."

    num_samples = max(50, min(150, int(total_len * 20)))
    target_dists = np.linspace(0, total_len, num_samples)

    resampled_x = np.interp(target_dists, cum_dist, pts[:, 0])
    resampled_y = np.interp(target_dists, cum_dist, pts[:, 1])

    # 3. Single-valued function validation (y = f(x))
    x_min, x_max = float(np.min(resampled_x)), float(np.max(resampled_x))
    span_x = x_max - x_min
    y_min, y_max = float(np.min(resampled_y)), float(np.max(resampled_y))
    span_y = y_max - y_min

    # A. Check horizontal span (reject vertical lines)
    if span_x < 0.35:
        return False, None, None, None, f"Stroke is nearly vertical (horizontal span Δx = {span_x:.2f} < 0.35). Functions y = f(x) require horizontal domain variation."

    # B. Check total horizontal path length vs net horizontal span (detects loops, circles, S-turns)
    total_horizontal_travel = np.sum(np.abs(np.diff(resampled_x)))
    ratio_x = total_horizontal_travel / span_x

    if ratio_x > 1.85:
        return False, None, None, None, "Stroke doubles back or contains loops (not a single-valued function y = f(x))."

    # C. Multi-valued vertical spread check across domain bins
    # Splits domain into bins and detects if multiple disjoint stroke segments overlap the same x
    num_bins = 15
    bin_edges = np.linspace(x_min, x_max, num_bins + 1)
    
    for b in range(num_bins):
        in_bin = (resampled_x >= bin_edges[b]) & (resampled_x <= bin_edges[b + 1])
        indices = np.where(in_bin)[0]
        if len(indices) >= 2:
            # If points inside this bin are separated along the path by more than 25% of stroke length
            idx_separation = np.max(indices) - np.min(indices)
            y_spread = np.max(resampled_y[indices]) - np.min(resampled_y[indices])
            if idx_separation > (num_samples * 0.28) and y_spread > max(0.8, span_y * 0.35):
                return False, None, None, None, "Stroke contains multiple y-values for the same x (e.g. circle, loop, or multi-branch curve)."

    # 4. Check for loop closure (start and end points very close compared to perimeter)
    end_to_end_dist = np.hypot(resampled_x[-1] - resampled_x[0], resampled_y[-1] - resampled_y[0])
    if end_to_end_dist < 0.15 * total_len and total_len > 1.5:
        return False, None, None, None, "Stroke forms a closed loop (closed curves cannot be represented as y = f(x))."

    # 5. Sort by x for fitting
    sort_order = np.argsort(resampled_x)
    clean_x = resampled_x[sort_order]
    clean_y = resampled_y[sort_order]

    return True, clean_x, clean_y, (x_min, x_max), None
