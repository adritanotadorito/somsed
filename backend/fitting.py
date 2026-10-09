import numpy as np
from scipy.optimize import minimize_scalar
from typing import List, Dict, Tuple, Optional
from models import FitCandidate, Point
import time

def format_coeff(val: float, decimals: int = 2) -> str:
    if abs(val) < 1e-5:
        return "0"
    rounded = round(val, decimals)
    if rounded == 0.0:
        return "0"
    if rounded == int(rounded):
        return str(int(rounded))
    s = f"{rounded:.{decimals}f}".rstrip('0').rstrip('.')
    return s

def format_domain(domain: Tuple[float, float], indep_var: str = "x", decimals: int = 2) -> Tuple[str, str]:
    u_min_s = format_coeff(domain[0], decimals)
    u_max_s = format_coeff(domain[1], decimals)
    dom_latex = f"\\quad \\left\\{{ {u_min_s} \\le {indep_var} \\le {u_max_s} \\right\\}}"
    dom_text = f"  {{{u_min_s} <= {indep_var} <= {u_max_s}}}"
    return dom_latex, dom_text

def format_linear_equation(m: float, b: float, domain: Tuple[float, float], orientation: str = "y_of_x", decimals: int = 2) -> Tuple[str, str]:
    dep_var = "y" if orientation == "y_of_x" else "x"
    indep_var = "x" if orientation == "y_of_x" else "y"
    dom_latex, dom_text = format_domain(domain, indep_var, decimals)

    if abs(m) < 1e-4:
        b_s = format_coeff(b, decimals)
        return f"{dep_var} = {b_s}{dom_latex}", f"{dep_var} = {b_s}{dom_text}"

    if abs(m - 1.0) < 1e-4:
        m_s = indep_var
    elif abs(m - (-1.0)) < 1e-4:
        m_s = f"-{indep_var}"
    else:
        m_s = f"{format_coeff(m, decimals)}{indep_var}"

    b_formatted = format_coeff(abs(b), decimals)
    if b_formatted == "0":
        b_s = ""
    elif b > 0:
        b_s = f" + {b_formatted}"
    else:
        b_s = f" - {b_formatted}"

    expr = f"{m_s}{b_s}"
    return f"{dep_var} = {expr}{dom_latex}", f"{dep_var} = {expr}{dom_text}"

def format_quadratic_equation(a: float, b: float, c: float, domain: Tuple[float, float], orientation: str = "y_of_x", decimals: int = 2) -> Tuple[str, str]:
    dep_var = "y" if orientation == "y_of_x" else "x"
    indep_var = "x" if orientation == "y_of_x" else "y"
    dom_latex, dom_text = format_domain(domain, indep_var, decimals)

    terms_latex = []
    terms_text = []

    a_val = format_coeff(a, decimals)
    if a_val != "0":
        if abs(a - 1.0) < 1e-4:
            terms_latex.append(f"{indep_var}^2")
            terms_text.append(f"{indep_var}²")
        elif abs(a - (-1.0)) < 1e-4:
            terms_latex.append(f"-{indep_var}^2")
            terms_text.append(f"-{indep_var}²")
        else:
            terms_latex.append(f"{a_val}{indep_var}^2")
            terms_text.append(f"{a_val}{indep_var}²")

    b_val = format_coeff(abs(b), decimals)
    if b_val != "0":
        prefix = " + " if (terms_latex and b > 0) else (" - " if (terms_latex and b < 0) else ("-" if b < 0 else ""))
        if abs(abs(b) - 1.0) < 1e-4:
            terms_latex.append(f"{prefix}{indep_var}")
            terms_text.append(f"{prefix}{indep_var}")
        else:
            terms_latex.append(f"{prefix}{b_val}{indep_var}")
            terms_text.append(f"{prefix}{b_val}{indep_var}")

    c_val = format_coeff(abs(c), decimals)
    if c_val != "0" or not terms_latex:
        prefix = " + " if (terms_latex and c > 0) else (" - " if (terms_latex and c < 0) else ("-" if c < 0 else ""))
        terms_latex.append(f"{prefix}{c_val}")
        terms_text.append(f"{prefix}{c_val}")

    expr_latex = "".join(terms_latex) or "0"
    expr_text = "".join(terms_text) or "0"
    return f"{dep_var} = {expr_latex}{dom_latex}", f"{dep_var} = {expr_text}{dom_text}"

def format_cubic_equation(a: float, b: float, c: float, d: float, domain: Tuple[float, float], orientation: str = "y_of_x", decimals: int = 2) -> Tuple[str, str]:
    dep_var = "y" if orientation == "y_of_x" else "x"
    indep_var = "x" if orientation == "y_of_x" else "y"
    dom_latex, dom_text = format_domain(domain, indep_var, decimals)

    terms_latex = []
    terms_text = []

    a_val = format_coeff(a, decimals)
    if a_val != "0":
        if abs(a - 1.0) < 1e-4:
            terms_latex.append(f"{indep_var}^3")
            terms_text.append(f"{indep_var}³")
        elif abs(a - (-1.0)) < 1e-4:
            terms_latex.append(f"-{indep_var}^3")
            terms_text.append(f"-{indep_var}³")
        else:
            terms_latex.append(f"{a_val}{indep_var}^3")
            terms_text.append(f"{a_val}{indep_var}³")

    b_val = format_coeff(abs(b), decimals)
    if b_val != "0":
        prefix = " + " if (terms_latex and b > 0) else (" - " if (terms_latex and b < 0) else ("-" if b < 0 else ""))
        if abs(abs(b) - 1.0) < 1e-4:
            terms_latex.append(f"{prefix}{indep_var}^2")
            terms_text.append(f"{prefix}{indep_var}²")
        else:
            terms_latex.append(f"{prefix}{b_val}{indep_var}^2")
            terms_text.append(f"{prefix}{b_val}{indep_var}²")

    c_val = format_coeff(abs(c), decimals)
    if c_val != "0":
        prefix = " + " if (terms_latex and c > 0) else (" - " if (terms_latex and c < 0) else ("-" if c < 0 else ""))
        if abs(abs(c) - 1.0) < 1e-4:
            terms_latex.append(f"{prefix}{indep_var}")
            terms_text.append(f"{prefix}{indep_var}")
        else:
            terms_latex.append(f"{prefix}{c_val}{indep_var}")
            terms_text.append(f"{prefix}{c_val}{indep_var}")

    d_val = format_coeff(abs(d), decimals)
    if d_val != "0" or not terms_latex:
        prefix = " + " if (terms_latex and d > 0) else (" - " if (terms_latex and d < 0) else ("-" if d < 0 else ""))
        terms_latex.append(f"{prefix}{d_val}")
        terms_text.append(f"{prefix}{d_val}")

    expr_latex = "".join(terms_latex) or "0"
    expr_text = "".join(terms_text) or "0"
    return f"{dep_var} = {expr_latex}{dom_latex}", f"{dep_var} = {expr_text}{dom_text}"

def format_abs_equation(a: float, h: float, k: float, domain: Tuple[float, float], orientation: str = "y_of_x", decimals: int = 2) -> Tuple[str, str]:
    dep_var = "y" if orientation == "y_of_x" else "x"
    indep_var = "x" if orientation == "y_of_x" else "y"
    dom_latex, dom_text = format_domain(domain, indep_var, decimals)

    if abs(a - 1.0) < 1e-4:
        a_s = ""
    elif abs(a - (-1.0)) < 1e-4:
        a_s = "-"
    else:
        a_s = format_coeff(a, decimals)

    h_formatted = format_coeff(abs(h), decimals)
    if h_formatted == "0":
        inner = indep_var
    elif h > 0:
        inner = f"{indep_var} - {h_formatted}"
    else:
        inner = f"{indep_var} + {h_formatted}"

    k_formatted = format_coeff(abs(k), decimals)
    if k_formatted == "0":
        k_s = ""
    elif k > 0:
        k_s = f" + {k_formatted}"
    else:
        k_s = f" - {k_formatted}"

    latex = f"{dep_var} = {a_s}\\left|{inner}\\right|{k_s}{dom_latex}"
    text = f"{dep_var} = {a_s}|{inner}|{k_s}{dom_text}"
    return latex, text

def format_sine_equation(A: float, B: float, C: float, D: float, domain: Tuple[float, float], orientation: str = "y_of_x", decimals: int = 2) -> Tuple[str, str]:
    dep_var = "y" if orientation == "y_of_x" else "x"
    indep_var = "x" if orientation == "y_of_x" else "y"
    dom_latex, dom_text = format_domain(domain, indep_var, decimals)

    if A < 0:
        A = -A
        C = C + np.pi

    C = (C + np.pi) % (2.0 * np.pi) - np.pi
    if abs(C + np.pi) < 1e-4:
        C = np.pi

    if abs(A - 1.0) < 1e-4:
        A_s = ""
    else:
        A_s = format_coeff(A, decimals)

    if abs(B - 1.0) < 1e-4:
        B_s = indep_var
    else:
        B_s = f"{format_coeff(B, decimals)}{indep_var}"

    C_val = format_coeff(abs(C), decimals)
    if C_val == "0":
        inner_s = B_s
    elif C > 0:
        inner_s = f"{B_s} + {C_val}"
    else:
        inner_s = f"{B_s} - {C_val}"

    D_val = format_coeff(abs(D), decimals)
    if D_val == "0":
        D_s = ""
    elif D > 0:
        D_s = f" + {D_val}"
    else:
        D_s = f" - {D_val}"

    latex = f"{dep_var} = {A_s}\\sin\\left({inner_s}\\right){D_s}{dom_latex}"
    text = f"{dep_var} = {A_s} sin({inner_s}){D_s}{dom_text}"
    return latex, text

def compute_geometric_error(stroke_pts: np.ndarray, curve_pts: List[Point]) -> float:
    if not curve_pts or len(curve_pts) < 2 or len(stroke_pts) == 0:
        return float('inf')

    c_arr = np.array([[p.x, p.y] for p in curve_pts], dtype=np.float64)
    p1 = c_arr[:-1]
    p2 = c_arr[1:]
    seg_vec = p2 - p1
    seg_len_sq = np.sum(seg_vec ** 2, axis=1)
    seg_len_sq = np.maximum(seg_len_sq, 1e-8)

    pts = stroke_pts[:, np.newaxis, :]
    v_vec = pts - p1[np.newaxis, :, :]

    t = np.sum(v_vec * seg_vec[np.newaxis, :, :], axis=2) / seg_len_sq[np.newaxis, :]
    t = np.clip(t, 0.0, 1.0)

    proj = p1[np.newaxis, :, :] + t[:, :, np.newaxis] * seg_vec[np.newaxis, :, :]
    dists_sq = np.sum((pts - proj) ** 2, axis=2)
    min_dists_sq = np.min(dists_sq, axis=1)

    return float(np.sqrt(np.mean(min_dists_sq)))

def compute_residual_metrics(v_actual: np.ndarray, v_pred: np.ndarray) -> Tuple[float, float, float, int]:
    residuals = v_actual - v_pred
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    ss_tot = float(np.sum((v_actual - np.mean(v_actual)) ** 2))
    ss_res = float(np.sum(residuals ** 2))

    if ss_tot < 1e-6:
        r2 = 1.0 if rmse < 0.15 else 0.0
    else:
        r2 = float(max(0.0, 1.0 - (ss_res / ss_tot)))

    if len(residuals) > 2 and ss_res > 1e-6:
        r_mean = np.mean(residuals)
        r_cent = residuals - r_mean
        autocorr = float(np.sum(r_cent[:-1] * r_cent[1:]) / np.sum(r_cent ** 2))
    else:
        autocorr = 0.0

    signs = np.sign(residuals)
    sign_changes = int(np.sum(signs[:-1] * signs[1:] < 0))

    return rmse, r2, autocorr, sign_changes

def make_plot_points(u_vals: np.ndarray, v_vals: np.ndarray, orientation: str) -> List[Point]:
    if orientation == "y_of_x":
        return [Point(x=round(float(u), 4), y=round(float(v), 4)) for u, v in zip(u_vals, v_vals)]
    else:
        return [Point(x=round(float(v), 4), y=round(float(u), 4)) for u, v in zip(u_vals, v_vals)]

def fit_linear(u: np.ndarray, v: np.ndarray, domain: Tuple[float, float], orientation: str, stroke_pts: np.ndarray) -> FitCandidate:
    mu_u = float(np.mean(u))
    sigma_u = float(np.std(u)) or 1.0
    u_norm = (u - mu_u) / sigma_u

    c1, c0 = np.polyfit(u_norm, v, deg=1)
    m = float(c1 / sigma_u)
    b = float(c0 - (c1 * mu_u / sigma_u))

    v_pred = m * u + b
    rmse, r2, autocorr, signs = compute_residual_metrics(v, v_pred)

    us = np.linspace(domain[0], domain[1], 80)
    vs = m * us + b
    plot_pts = make_plot_points(us, vs, orientation)
    geom_err = compute_geometric_error(stroke_pts, plot_pts)

    latex, text = format_linear_equation(m, b, domain, orientation)
    score = geom_err * 1.10

    return FitCandidate(
        family="linear",
        family_name="Linear",
        params={"m": m, "b": b},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        orientation=orientation,
        rmse=round(rmse, 4),
        r_squared=round(r2, 4),
        geom_error=round(geom_err, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_quadratic(u: np.ndarray, v: np.ndarray, domain: Tuple[float, float], orientation: str, stroke_pts: np.ndarray) -> FitCandidate:
    mu_u = float(np.mean(u))
    sigma_u = float(np.std(u)) or 1.0
    u_norm = (u - mu_u) / sigma_u

    c2, c1, c0 = np.polyfit(u_norm, v, deg=2)
    a = float(c2 / (sigma_u ** 2))
    b = float((c1 / sigma_u) - (2.0 * c2 * mu_u / (sigma_u ** 2)))
    c = float(c0 - (c1 * mu_u / sigma_u) + (c2 * (mu_u ** 2) / (sigma_u ** 2)))

    v_pred = a * (u ** 2) + b * u + c
    rmse, r2, autocorr, signs = compute_residual_metrics(v, v_pred)

    us = np.linspace(domain[0], domain[1], 80)
    vs = a * (us ** 2) + b * us + c
    plot_pts = make_plot_points(us, vs, orientation)
    geom_err = compute_geometric_error(stroke_pts, plot_pts)

    latex, text = format_quadratic_equation(a, b, c, domain, orientation)
    score = geom_err * 1.16

    return FitCandidate(
        family="quadratic",
        family_name="Quadratic",
        params={"a": a, "b": b, "c": c},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        orientation=orientation,
        rmse=round(rmse, 4),
        r_squared=round(r2, 4),
        geom_error=round(geom_err, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_cubic(u: np.ndarray, v: np.ndarray, domain: Tuple[float, float], orientation: str, stroke_pts: np.ndarray) -> FitCandidate:
    mu_u = float(np.mean(u))
    sigma_u = float(np.std(u)) or 1.0
    u_norm = (u - mu_u) / sigma_u

    c3, c2, c1, c0 = np.polyfit(u_norm, v, deg=3)
    z = mu_u / sigma_u

    a = float(c3 / (sigma_u ** 3))
    b = float((c2 / (sigma_u ** 2)) - (3.0 * c3 * z / (sigma_u ** 2)))
    c = float((c1 / sigma_u) - (2.0 * c2 * z / sigma_u) + (3.0 * c3 * (z ** 2) / sigma_u))
    d = float(c0 - (c1 * z) + (c2 * (z ** 2)) - (c3 * (z ** 3)))

    v_pred = a * (u ** 3) + b * (u ** 2) + c * u + d
    rmse, r2, autocorr, signs = compute_residual_metrics(v, v_pred)

    us = np.linspace(domain[0], domain[1], 80)
    vs = a * (us ** 3) + b * (us ** 2) + c * us + d
    plot_pts = make_plot_points(us, vs, orientation)
    geom_err = compute_geometric_error(stroke_pts, plot_pts)

    latex, text = format_cubic_equation(a, b, c, d, domain, orientation)
    score = geom_err * 1.24

    return FitCandidate(
        family="cubic",
        family_name="Cubic",
        params={"a": a, "b": b, "c": c, "d": d},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        orientation=orientation,
        rmse=round(rmse, 4),
        r_squared=round(r2, 4),
        geom_error=round(geom_err, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_absolute_value(u: np.ndarray, v: np.ndarray, domain: Tuple[float, float], orientation: str, stroke_pts: np.ndarray) -> FitCandidate:
    u_min, u_max = domain
    span_u = max(1e-4, u_max - u_min)
    search_min = u_min + 0.08 * span_u
    search_max = u_max - 0.08 * span_u

    def solve_for_h(h_val: float) -> Tuple[float, float, float]:
        A = np.column_stack((np.abs(u - h_val), np.ones_like(u)))
        (a_val, k_val), _, _, _ = np.linalg.lstsq(A, v, rcond=None)
        pred = a_val * np.abs(u - h_val) + k_val
        err = float(np.sum((v - pred) ** 2))
        return float(a_val), float(k_val), err

    candidate_hs = np.linspace(search_min, search_max, 40)
    best_h = float(candidate_hs[0])
    best_err = float('inf')
    best_a, best_k = 0.0, 0.0

    for h_cand in candidate_hs:
        a_cand, k_cand, err = solve_for_h(h_cand)
        if err < best_err:
            best_err = err
            best_h = float(h_cand)
            best_a = a_cand
            best_k = k_cand

    res = minimize_scalar(lambda h: solve_for_h(h)[2], bounds=(search_min, search_max), method='bounded', options={'maxiter': 50, 'xatol': 1e-3})
    if res.success:
        refined_h = float(res.x)
        refined_a, refined_k, refined_err = solve_for_h(refined_h)
        if refined_err < best_err:
            best_h = refined_h
            best_a = refined_a
            best_k = refined_k

    v_pred = best_a * np.abs(u - best_h) + best_k
    rmse, r2, autocorr, signs = compute_residual_metrics(v, v_pred)

    us = np.linspace(domain[0], domain[1], 80)
    vs = best_a * np.abs(us - best_h) + best_k
    plot_pts = make_plot_points(us, vs, orientation)
    geom_err = compute_geometric_error(stroke_pts, plot_pts)

    latex, text = format_abs_equation(best_a, best_h, best_k, domain, orientation)
    score = geom_err * 1.18

    return FitCandidate(
        family="absolute_value",
        family_name="Absolute Value",
        params={"a": best_a, "h": best_h, "k": best_k},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        orientation=orientation,
        rmse=round(rmse, 4),
        r_squared=round(r2, 4),
        geom_error=round(geom_err, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_sine(u: np.ndarray, v: np.ndarray, domain: Tuple[float, float], orientation: str, stroke_pts: np.ndarray) -> FitCandidate:
    u_min, u_max = domain
    span_u = max(1e-4, u_max - u_min)

    b_min = float(2.0 * np.pi * 0.6 / span_u)
    b_max = float(min(2.0 * np.pi * 8.0 / span_u, 25.0))

    def solve_linear_sine(b_val: float) -> Tuple[float, float, float, float, float]:
        M = np.column_stack((np.sin(b_val * u), np.cos(b_val * u), np.ones_like(u)))
        (alpha, beta, D), _, _, _ = np.linalg.lstsq(M, v, rcond=None)
        A = float(np.hypot(alpha, beta))
        C = float(np.arctan2(beta, alpha))
        pred = alpha * np.sin(b_val * u) + beta * np.cos(b_val * u) + D
        err = float(np.sum((v - pred) ** 2))
        return A, float(b_val), C, float(D), err

    b_grid = np.linspace(b_min, b_max, 60)
    best_err = float('inf')
    best_A, best_B, best_C, best_D = 1.0, b_min, 0.0, 0.0

    for b_cand in b_grid:
        A, B, C, D, err = solve_linear_sine(b_cand)
        if err < best_err:
            best_err = err
            best_A, best_B, best_C, best_D = A, B, C, D

    b_bracket_min = max(b_min, best_B - (b_max - b_min) / 30.0)
    b_bracket_max = min(b_max, best_B + (b_max - b_min) / 30.0)
    res = minimize_scalar(lambda b: solve_linear_sine(b)[4], bounds=(b_bracket_min, b_bracket_max), method='bounded', options={'maxiter': 40, 'xatol': 1e-3})
    if res.success:
        refined_b = float(res.x)
        A, B, C, D, err = solve_linear_sine(refined_b)
        if err < best_err:
            best_A, best_B, best_C, best_D = A, B, C, D

    v_pred = best_A * np.sin(best_B * u + best_C) + best_D
    rmse, r2, autocorr, signs = compute_residual_metrics(v, v_pred)

    us = np.linspace(domain[0], domain[1], 100)
    vs = best_A * np.sin(best_B * us + best_C) + best_D
    plot_pts = make_plot_points(us, vs, orientation)
    geom_err = compute_geometric_error(stroke_pts, plot_pts)

    latex, text = format_sine_equation(best_A, best_B, best_C, best_D, domain, orientation)
    score = geom_err * 1.22

    return FitCandidate(
        family="sine",
        family_name="Sine",
        params={"A": best_A, "B": best_B, "C": best_C, "D": best_D},
        latex=latex,
        text=text,
        domain=[domain[0], domain[1]],
        orientation=orientation,
        rmse=round(rmse, 4),
        r_squared=round(r2, 4),
        geom_error=round(geom_err, 4),
        score=round(score, 4),
        plot_points=plot_pts
    )

def fit_all_families(
    stroke_pts: np.ndarray,
    valid_orientations: List[str],
    requested_families: Optional[List[str]] = None
) -> Tuple[bool, List[FitCandidate], Optional[str], Dict[str, float]]:
    timings: Dict[str, float] = {}
    t_start = time.perf_counter()

    allowed = requested_families or ['linear', 'quadratic', 'cubic', 'absolute_value', 'sine']
    all_evaluated: List[FitCandidate] = []

    resamp_x = stroke_pts[:, 0]
    resamp_y = stroke_pts[:, 1]
    span_x = float(np.max(resamp_x) - np.min(resamp_x))
    span_y = float(np.max(resamp_y) - np.min(resamp_y))

    for orient in valid_orientations:
        if orient == "y_of_x":
            sort_idx = np.argsort(resamp_x)
            u = resamp_x[sort_idx]
            v = resamp_y[sort_idx]
            dom = (float(np.min(u)), float(np.max(u)))
        else:
            sort_idx = np.argsort(resamp_y)
            u = resamp_y[sort_idx]
            v = resamp_x[sort_idx]
            dom = (float(np.min(u)), float(np.max(u)))

        if 'linear' in allowed:
            t0 = time.perf_counter()
            c = fit_linear(u, v, dom, orient, stroke_pts)
            all_evaluated.append(c)
            timings[f'{orient}_linear_ms'] = round((time.perf_counter() - t0) * 1000, 2)

        if 'quadratic' in allowed:
            t0 = time.perf_counter()
            c = fit_quadratic(u, v, dom, orient, stroke_pts)
            all_evaluated.append(c)
            timings[f'{orient}_quadratic_ms'] = round((time.perf_counter() - t0) * 1000, 2)

        if 'cubic' in allowed:
            t0 = time.perf_counter()
            c = fit_cubic(u, v, dom, orient, stroke_pts)
            all_evaluated.append(c)
            timings[f'{orient}_cubic_ms'] = round((time.perf_counter() - t0) * 1000, 2)

        if 'absolute_value' in allowed:
            t0 = time.perf_counter()
            c = fit_absolute_value(u, v, dom, orient, stroke_pts)
            all_evaluated.append(c)
            timings[f'{orient}_absolute_value_ms'] = round((time.perf_counter() - t0) * 1000, 2)

        if 'sine' in allowed:
            t0 = time.perf_counter()
            c = fit_sine(u, v, dom, orient, stroke_pts)
            all_evaluated.append(c)
            timings[f'{orient}_sine_ms'] = round((time.perf_counter() - t0) * 1000, 2)

    if not all_evaluated:
        return False, [], "No supported curve families selected.", timings

    def is_candidate_adequate(c: FitCandidate) -> Tuple[bool, Optional[str]]:
        v_data = resamp_y if c.orientation == "y_of_x" else resamp_x
        v_std = float(np.std(v_data))
        v_span = float(np.max(v_data) - np.min(v_data))
        noise_floor = 0.15

        if v_std <= noise_floor:
            if c.geom_error <= noise_floor * 1.5:
                return True, None
            return False, f"Geometric error {c.geom_error:.2f} exceeds noise floor."

        if c.r_squared < 0.45 and c.geom_error > noise_floor * 1.5:
            return False, f"R² ({c.r_squared:.2f}) is too low (explains < 45% of variation)."

        max_geom = min(1.40, max(0.40, 0.45 * max(span_x, span_y)))
        if c.geom_error > max_geom:
            return False, f"Geometric error ({c.geom_error:.2f}) exceeds maximum allowed tolerance ({max_geom:.2f})."

        return True, None

    is_user_forced = (requested_families is not None and len(requested_families) == 1)

    if is_user_forced:
        all_evaluated.sort(key=lambda c: c.geom_error)
        cand = all_evaluated[0]
        adequate, reason = is_candidate_adequate(cand)
        if not adequate:
            cand.is_poor_fit = True
            cand.warning = f"⚠️ Poor Fit: This stroke does not match a {cand.family_name} curve well (R² = {cand.r_squared:.2f}, Error = {cand.geom_error:.2f})."
        timings['total_ms'] = round((time.perf_counter() - t_start) * 1000, 2)
        return True, [cand], None, timings

    for orient in valid_orientations:
        cands_for_orient = {c.family: c for c in all_evaluated if c.orientation == orient}
        lin = cands_for_orient.get('linear')
        quad = cands_for_orient.get('quadratic')
        cub = cands_for_orient.get('cubic')
        abs_v = cands_for_orient.get('absolute_value')
        sine_c = cands_for_orient.get('sine')

        scale = max(1.0, span_y if orient == "y_of_x" else span_x)

        if lin and quad:
            if quad.geom_error > 0.85 * lin.geom_error:
                quad.score += 0.25 * scale

        if quad and cub:
            if cub.geom_error > 0.82 * quad.geom_error:
                cub.score += 0.35 * scale

        if lin and abs_v:
            if abs_v.geom_error > 0.82 * lin.geom_error or abs(abs_v.params['a']) < 0.08:
                abs_v.score += 0.30 * scale

        if sine_c:
            dom_span = sine_c.domain[1] - sine_c.domain[0]
            cycles = sine_c.params['B'] * dom_span / (2.0 * np.pi)
            if cycles < 0.70 or sine_c.r_squared < 0.60:
                sine_c.score += 0.50 * scale

    valid_cands = []
    for c in all_evaluated:
        adequate, _ = is_candidate_adequate(c)
        if adequate:
            valid_cands.append(c)

    if not valid_cands:
        timings['total_ms'] = round((time.perf_counter() - t_start) * 1000, 2)
        return False, [], "No supported equation fits this stroke well.", timings

    valid_cands.sort(key=lambda c: c.score)

    seen_keys = set()
    top_candidates = []
    for c in valid_cands:
        key = (c.family, c.orientation)
        if key not in seen_keys:
            seen_keys.add(key)
            top_candidates.append(c)
        if len(top_candidates) >= 3:
            break

    timings['total_ms'] = round((time.perf_counter() - t_start) * 1000, 2)
    return True, top_candidates, None, timings
