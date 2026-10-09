import numpy as np
from typing import Tuple, List, Optional

def preprocess_stroke(raw_points: list) -> Tuple[bool, Optional[np.ndarray], List[str], bool, Optional[str]]:
    if not raw_points or len(raw_points) < 4:
        return False, None, [], False, "Stroke has too few points for curve fitting (minimum 4 points required)."

    try:
        pts = np.array([[p['x'] if isinstance(p, dict) else p.x, 
                         p['y'] if isinstance(p, dict) else p.y] for p in raw_points], dtype=np.float64)
    except Exception as e:
        return False, None, [], False, f"Invalid point data format: {str(e)}"

    if not np.all(np.isfinite(pts)):
        return False, None, [], False, "Stroke contains invalid or non-finite coordinates."

    diffs = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    keep_mask = np.concatenate(([True], diffs > 1e-5))
    pts = pts[keep_mask]
    if len(pts) < 4:
        return False, None, [], False, "Stroke lacks sufficient distinct points."

    diffs = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum_dist = np.concatenate(([0.0], np.cumsum(diffs)))
    total_len = float(cum_dist[-1])

    if total_len < 0.2:
        return False, None, [], False, "Stroke is too small in graph coordinate space."

    end_to_end_dist = float(np.hypot(pts[-1, 0] - pts[0, 0], pts[-1, 1] - pts[0, 1]))
    if end_to_end_dist < 0.18 * total_len and total_len > 1.2:
        return False, None, [], True, "This curve needs parametric fitting, which is not supported yet."

    num_samples = max(60, min(160, int(total_len * 22)))
    target_dists = np.linspace(0, total_len, num_samples)

    resampled_x = np.interp(target_dists, cum_dist, pts[:, 0])
    resampled_y = np.interp(target_dists, cum_dist, pts[:, 1])
    resampled_pts = np.column_stack((resampled_x, resampled_y))

    x_min, x_max = float(np.min(resampled_x)), float(np.max(resampled_x))
    span_x = x_max - x_min
    y_min, y_max = float(np.min(resampled_y)), float(np.max(resampled_y))
    span_y = y_max - y_min

    valid_y_of_x = False
    if span_x >= 0.35:
        total_x_travel = float(np.sum(np.abs(np.diff(resampled_x))))
        ratio_x = total_x_travel / span_x
        if ratio_x <= 1.85:
            num_bins = 16
            bin_edges = np.linspace(x_min, x_max, num_bins + 1)
            has_overlap_x = False
            for b in range(num_bins):
                in_bin = (resampled_x >= bin_edges[b]) & (resampled_x <= bin_edges[b + 1])
                indices = np.where(in_bin)[0]
                if len(indices) >= 2:
                    idx_separation = np.max(indices) - np.min(indices)
                    y_spread = np.max(resampled_y[indices]) - np.min(resampled_y[indices])
                    if idx_separation > (num_samples * 0.28) and y_spread > max(0.8, span_y * 0.35):
                        has_overlap_x = True
                        break
            if not has_overlap_x:
                valid_y_of_x = True

    valid_x_of_y = False
    if span_y >= 0.35:
        total_y_travel = float(np.sum(np.abs(np.diff(resampled_y))))
        ratio_y = total_y_travel / span_y
        if ratio_y <= 1.85:
            num_bins = 16
            bin_edges = np.linspace(y_min, y_max, num_bins + 1)
            has_overlap_y = False
            for b in range(num_bins):
                in_bin = (resampled_y >= bin_edges[b]) & (resampled_y <= bin_edges[b + 1])
                indices = np.where(in_bin)[0]
                if len(indices) >= 2:
                    idx_separation = np.max(indices) - np.min(indices)
                    x_spread = np.max(resampled_x[indices]) - np.min(resampled_x[indices])
                    if idx_separation > (num_samples * 0.28) and x_spread > max(0.8, span_x * 0.35):
                        has_overlap_y = True
                        break
            if not has_overlap_y:
                valid_x_of_y = True

    valid_orientations: List[str] = []
    if valid_y_of_x:
        valid_orientations.append("y_of_x")
    if valid_x_of_y:
        valid_orientations.append("x_of_y")

    if not valid_orientations:
        return False, None, [], True, "This curve needs parametric fitting, which is not supported yet."

    return True, resampled_pts, valid_orientations, False, None
