import numpy as np
from scipy.optimize import minimize_scalar
from typing import List, Dict, Tuple, Optional
from models import FitCandidate, Point

def format_coeff(val: float, decimals: int = 2) -> str:
    """Formats a float cleanly for equation display."""
    if abs(val) < 1e-5:
        return "0"
    rounded = round(val, decimals)
    if rounded == 0.0:
        return "0"
    if rounded == int(rounded):
        return str(int(rounded))
    # Format with up to `decimals` places, stripping trailing zeros
    s = f"{rounded:.{decimals}f}".rstrip('0').rstrip('.')
    return s

def format_linear_equation(m: float, b: float, domain: Tuple[float, float], decimals: int = 2) -> Tuple[str, str]:
    x_min_s = format_coeff(domain[0], decimals)
    x_max_s = format_coeff(domain[1], decimals)
    dom_latex = f"\\quad \\left\\{{ {x_min_s} \\le x \\le {x_max_s} \\right\\}}"
    dom_text = f"  {{{x_min_s} <= x <= {x_max_s}}}"

    if abs(m) < 1e-4:
        b_s = format_coeff(b, decimals)
        return f"y = {b_s}{dom_latex}", f"y = {b_s}{dom_text}"

    # m string
    if abs(m - 1.0) < 1e-4:
        m_s = "x"
    elif abs(m - (-1.0)) < 1e-4:
        m_s = "-x"
    else:
        m_s = f"{format_coeff(m, decimals)}x"

    # b string
    b_formatted = format_coeff(abs(b), decimals)
    if b_formatted == "0":
        b_s = ""
    elif b > 0:
        b_s = f" + {b_formatted}"
    else:
        b_s = f" - {b_formatted}"

    expr = f"{m_s}{b_s}"
    return f"y = {expr}{dom_latex}", f"y = {expr}{dom_text}"

def format_quadratic_equation(a: float, b: float, c: float, domain: Tuple[float, float], decimals: int = 2) -> Tuple[str, str]:
    x_min_s = format_coeff(domain[0], decimals)
    x_max_s = format_coeff(domain[1], decimals)
    dom_latex = f"\\quad \\left\\{{ {x_min_s} \\le x \\le {x_max_s} \\right\\}}"
    dom_text = f"  {{{x_min_s} <= x <= {x_max_s}}}"

    terms_latex = []
    terms_text = []

    # a x^2
    a_val = format_coeff(a, decimals)
    if a_val != "0":
        if abs(a - 1.0) < 1e-4:
            terms_latex.append("x^2")
            terms_text.append("x²")
        elif abs(a - (-1.0)) < 1e-4:
            terms_latex.append("-x^2")
            terms_text.append("-x²")
        else:
            terms_latex.append(f"{a_val}x^2")
            terms_text.append(f"{a_val}x²")

    # b x
    b_val = format_coeff(abs(b), decimals)
    if b_val != "0":
        prefix = " + " if (terms_latex and b > 0) else (" - " if (terms_latex and b < 0) else ("-" if b < 0 else ""))
        if abs(abs(b) - 1.0) < 1e-4:
            terms_latex.append(f"{prefix}x")
            terms_text.append(f"{prefix}x")
        else:
            terms_latex.append(f"{prefix}{b_val}x")
            terms_text.append(f"{prefix}{b_val}x")

    # c
    c_val = format_coeff(abs(c), decimals)
    if c_val != "0" or not terms_latex:
        prefix = " + " if (terms_latex and c > 0) else (" - " if (terms_latex and c < 0) else ("-" if c < 0 else ""))
        terms_latex.append(f"{prefix}{c_val}")
        terms_text.append(f"{prefix}{c_val}")

    expr_latex = "".join(terms_latex) or "0"
    expr_text = "".join(terms_text) or "0"
    return f"y = {expr_latex}{dom_latex}", f"y = {expr_text}{dom_text}"

def format_cubic_equation(a: float, b: float, c: float, d: float, domain: Tuple[float, float], decimals: int = 2) -> Tuple[str, str]:
    x_min_s = format_coeff(domain[0], decimals)
    x_max_s = format_coeff(domain[1], decimals)
    dom_latex = f"\\quad \\left\\{{ {x_min_s} \\le x \\le {x_max_s} \\right\\}}"
    dom_text = f"  {{{x_min_s} <= x <= {x_max_s}}}"

    terms_latex = []
    terms_text = []

    # a x^3
    a_val = format_coeff(a, decimals)
    if a_val != "0":
        if abs(a - 1.0) < 1e-4:
            terms_latex.append("x^3")
            terms_text.append("x³")
        elif abs(a - (-1.0)) < 1e-4:
            terms_latex.append("-x^3")
            terms_text.append("-x³")
        else:
            terms_latex.append(f"{a_val}x^3")
            terms_text.append(f"{a_val}x³")

    # b x^2
    b_val = format_coeff(abs(b), decimals)
    if b_val != "0":
        prefix = " + " if (terms_latex and b > 0) else (" - " if (terms_latex and b < 0) else ("-" if b < 0 else ""))
        if abs(abs(b) - 1.0) < 1e-4:
            terms_latex.append(f"{prefix}x^2")
            terms_text.append(f"{prefix}x²")
        else:
            terms_latex.append(f"{prefix}{b_val}x^2")
            terms_text.append(f"{prefix}{b_val}x²")

    # c x
    c_val = format_coeff(abs(c), decimals)
    if c_val != "0":
        prefix = " + " if (terms_latex and c > 0) else (" - " if (terms_latex and c < 0) else ("-" if c < 0 else ""))
        if abs(abs(c) - 1.0) < 1e-4:
            terms_latex.append(f"{prefix}x")
            terms_text.append(f"{prefix}x")
        else:
            terms_latex.append(f"{prefix}{c_val}x")
            terms_text.append(f"{prefix}{c_val}x")

    # d
    d_val = format_coeff(abs(d), decimals)
    if d_val != "0" or not terms_latex:
        prefix = " + " if (terms_latex and d > 0) else (" - " if (terms_latex and d < 0) else ("-" if d < 0 else ""))
        terms_latex.append(f"{prefix}{d_val}")
        terms_text.append(f"{prefix}{d_val}")

    expr_latex = "".join(terms_latex) or "0"
    expr_text = "".join(terms_text) or "0"
    return f"y = {expr_latex}{dom_latex}", f"y = {expr_text}{dom_text}"

def format_abs_equation(a: float, h: float, k: float, domain: Tuple[float, float], decimals: int = 2) -> Tuple[str, str]:
    x_min_s = format_coeff(domain[0], decimals)
    x_max_s = format_coeff(domain[1], decimals)
    dom_latex = f"\\quad \\left\\{{ {x_min_s} \\le x \\le {x_max_s} \\right\\}}"
    dom_text = f"  {{{x_min_s} <= x <= {x_max_s}}}"

    # a factor
    if abs(a - 1.0) < 1e-4:
        a_s = ""
    elif abs(a - (-1.0)) < 1e-4:
        a_s = "-"
    else:
        a_s = format_coeff(a, decimals)

    # (x - h)
    h_formatted = format_coeff(abs(h), decimals)
    if h_formatted == "0":
        inner = "x"
    elif h > 0:
        inner = f"x - {h_formatted}"
    else:
        inner = f"x + {h_formatted}"

    # k
    k_formatted = format_coeff(abs(k), decimals)
    if k_formatted == "0":
        k_s = ""
    elif k > 0:
        k_s = f" + {k_formatted}"
    else:
        k_s = f" - {k_formatted}"

    latex = f"y = {a_s}\\left|{inner}\\right|{k_s}{dom_latex}"
    text = f"y = {a_s}|{inner}|{k_s}{dom_text}"
    return latex, text

def fit_linear(x: np.ndarray, y: np.ndarray, domain: Tuple[float, float]) -> FitCandidate:
    # Normalized least squares for stability
    mu_x = float(np.mean(x))
    sigma_x = float(np.std(x)) or 1.0
    u = (x - mu_x) / sigma_x

    c1, c0 = np.polyfit(u, y, deg=1)
    m = float(c1 / sigma_x)
    b = float(c0 - (c1 * mu_x / sigma_x))

    y_pred = m * x + b
    rmse = float(np.sqrt(np.mean((y - y_pred) ** 2)))

    latex, text = format_linear_equation(m, b, domain)

    # Sample 80 smooth points in drawn domain
    xs = np.linspace(domain[0], domain[1], 80)
    ys = m * xs + b
    plot_pts = [Point(x=round(float(px), 4), y=round(float(py), 4)) for px, py in zip(xs, ys)]

    return FitCandidate(
        family="linear",
        family_name="Linear",
        params={"m": m, "b": b},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        rmse=round(rmse, 4),
        score=rmse, # Base complexity score (k=2)
        plot_points=plot_pts
    )

def fit_quadratic(x: np.ndarray, y: np.ndarray, domain: Tuple[float, float]) -> FitCandidate:
    mu_x = float(np.mean(x))
    sigma_x = float(np.std(x)) or 1.0
    u = (x - mu_x) / sigma_x

    c2, c1, c0 = np.polyfit(u, y, deg=2)
    a = float(c2 / (sigma_x ** 2))
    b = float((c1 / sigma_x) - (2.0 * c2 * mu_x / (sigma_x ** 2)))
    c = float(c0 - (c1 * mu_x / sigma_x) + (c2 * (mu_x ** 2) / (sigma_x ** 2)))

    y_pred = a * (x ** 2) + b * x + c
    rmse = float(np.sqrt(np.mean((y - y_pred) ** 2)))

    latex, text = format_quadratic_equation(a, b, c, domain)

    xs = np.linspace(domain[0], domain[1], 80)
    ys = a * (xs ** 2) + b * xs + c
    plot_pts = [Point(x=round(float(px), 4), y=round(float(py), 4)) for px, py in zip(xs, ys)]

    # Complexity penalty for 3 parameters
    score = rmse * 1.08

    return FitCandidate(
        family="quadratic",
        family_name="Quadratic",
        params={"a": a, "b": b, "c": c},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        rmse=round(rmse, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_cubic(x: np.ndarray, y: np.ndarray, domain: Tuple[float, float]) -> FitCandidate:
    mu_x = float(np.mean(x))
    sigma_x = float(np.std(x)) or 1.0
    u = (x - mu_x) / sigma_x

    c3, c2, c1, c0 = np.polyfit(u, y, deg=3)
    z = mu_x / sigma_x

    a = float(c3 / (sigma_x ** 3))
    b = float((c2 / (sigma_x ** 2)) - (3.0 * c3 * z / (sigma_x ** 2)))
    c = float((c1 / sigma_x) - (2.0 * c2 * z / sigma_x) + (3.0 * c3 * (z ** 2) / sigma_x))
    d = float(c0 - (c1 * z) + (c2 * (z ** 2)) - (c3 * (z ** 3)))

    y_pred = a * (x ** 3) + b * (x ** 2) + c * x + d
    rmse = float(np.sqrt(np.mean((y - y_pred) ** 2)))

    latex, text = format_cubic_equation(a, b, c, d, domain)

    xs = np.linspace(domain[0], domain[1], 80)
    ys = a * (xs ** 3) + b * (xs ** 2) + c * xs + d
    plot_pts = [Point(x=round(float(px), 4), y=round(float(py), 4)) for px, py in zip(xs, ys)]

    # Complexity penalty for 4 parameters
    score = rmse * 1.22

    return FitCandidate(
        family="cubic",
        family_name="Cubic",
        params={"a": a, "b": b, "c": c, "d": d},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        rmse=round(rmse, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_absolute_value(x: np.ndarray, y: np.ndarray, domain: Tuple[float, float]) -> FitCandidate:
    """
    Fits y = a|x - h| + k by optimizing the non-differentiable corner h
    using a multi-start grid + 1D bounded scalar minimization.
    """
    x_min, x_max = domain
    span_x = x_max - x_min
    search_min = x_min + 0.08 * span_x
    search_max = x_max - 0.08 * span_x

    def solve_for_h(h_val: float) -> Tuple[float, float, float]:
        # Design matrix: A = [|x - h|, 1]
        A = np.column_stack((np.abs(x - h_val), np.ones_like(x)))
        (a_val, k_val), residuals, _, _ = np.linalg.lstsq(A, y, rcond=None)
        pred = a_val * np.abs(x - h_val) + k_val
        err = np.sum((y - pred) ** 2)
        return float(a_val), float(k_val), float(err)

    # 1. Multi-start grid search over 40 candidate corner locations
    candidate_hs = np.linspace(search_min, search_max, 40)
    best_h = candidate_hs[0]
    best_err = float('inf')
    best_a, best_k = 0.0, 0.0

    for h_cand in candidate_hs:
        a_cand, k_cand, err = solve_for_h(h_cand)
        if err < best_err:
            best_err = err
            best_h = float(h_cand)
            best_a = a_cand
            best_k = k_cand

    # 2. Refine h with scalar optimization
    res = minimize_scalar(lambda h: solve_for_h(h)[2], bounds=(search_min, search_max), method='bounded')
    if res.success:
        refined_h = float(res.x)
        refined_a, refined_k, refined_err = solve_for_h(refined_h)
        if refined_err < best_err:
            best_h = refined_h
            best_a = refined_a
            best_k = refined_k

    y_pred = best_a * np.abs(x - best_h) + best_k
    rmse = float(np.sqrt(np.mean((y - y_pred) ** 2)))

    latex, text = format_abs_equation(best_a, best_h, best_k, domain)

    xs = np.linspace(domain[0], domain[1], 80)
    ys = best_a * np.abs(xs - best_h) + best_k
    plot_pts = [Point(x=round(float(px), 4), y=round(float(py), 4)) for px, py in zip(xs, ys)]

    score = rmse * 1.10

    return FitCandidate(
        family="absolute_value",
        family_name="Absolute Value",
        params={"a": best_a, "h": best_h, "k": best_k},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        rmse=round(rmse, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_all_families(x: np.ndarray, y: np.ndarray, domain: Tuple[float, float], requested_families: Optional[List[str]] = None) -> Tuple[bool, List[FitCandidate], Optional[str]]:
    """
    Fits all supported curve families, applies progressive model selection hurdles,
    and returns ranked candidates if acceptance thresholds are satisfied.
    """
    families = requested_families or ['linear', 'quadratic', 'cubic', 'absolute_value']
    candidates: List[FitCandidate] = []

    y_span = float(np.max(y) - np.min(y))
    scale_y = max(1.0, y_span)

    # 1. Fit individual families
    cand_map: Dict[str, FitCandidate] = {}

    if 'linear' in families:
        cand_map['linear'] = fit_linear(x, y, domain)
    if 'quadratic' in families:
        cand_map['quadratic'] = fit_quadratic(x, y, domain)
    if 'cubic' in families:
        cand_map['cubic'] = fit_cubic(x, y, domain)
    if 'absolute_value' in families:
        cand_map['absolute_value'] = fit_absolute_value(x, y, domain)

    # 2. Progressive model selection hurdles (prevent wobble from promoting higher-degree polynomials)
    lin_cand = cand_map.get('linear')
    quad_cand = cand_map.get('quadratic')
    cub_cand = cand_map.get('cubic')
    abs_cand = cand_map.get('absolute_value')

    if lin_cand and quad_cand:
        # Require >= 18% improvement over linear to consider quadratic
        if quad_cand.rmse > 0.82 * lin_cand.rmse:
            quad_cand.score += 0.25 * scale_y

    if quad_cand and cub_cand:
        # Require >= 20% improvement over quadratic to consider cubic
        if cub_cand.rmse > 0.80 * quad_cand.rmse:
            cub_cand.score += 0.35 * scale_y

    if lin_cand and abs_cand:
        # Require >= 20% improvement over linear to consider absolute value
        if abs_cand.rmse > 0.80 * lin_cand.rmse or abs(abs_cand.params['a']) < 0.08:
            abs_cand.score += 0.30 * scale_y

    all_cands = list(cand_map.values())
    all_cands.sort(key=lambda c: c.score)

    if not all_cands:
        return False, [], "No curve families could be fitted."

    best = all_cands[0]

    # 3. Acceptance threshold check (account for graph scale)
    # Absolute max allowed RMSE is 1.45 units (in [-10, 10] grid), or 35% of stroke vertical span
    max_allowed_rmse = min(1.45, max(0.45, 0.35 * scale_y))

    if best.rmse > max_allowed_rmse:
        return False, [], f"No supported curve family (Linear, Quadratic, Cubic, Absolute Value) adequately matches this stroke (Best RMSE = {best.rmse:.2f} exceeds tolerance {max_allowed_rmse:.2f})."

    # Filter top viable candidates (up to 3) where RMSE is reasonable
    acceptable = [c for c in all_cands if c.rmse <= max_allowed_rmse * 1.3][:3]

    return True, acceptable, None
