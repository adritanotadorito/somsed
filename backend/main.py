import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models import FitRequest, FitResponse
from preprocessing import preprocess_stroke
from fitting import fit_all_families

app = FastAPI(
    title="Somsed - Curve Fitting API",
    version="1.1.0"
)

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*")
if allowed_origins_env == "*":
    origins = ["*"]
else:
    origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "milestone": 4, "service": "Reverse Desmos Curve Fitting"}

@app.post("/fit", response_model=FitResponse)
def fit_stroke_curve(req: FitRequest):
    if len(req.points) < 4:
        return FitResponse(
            success=False,
            stroke_id=req.stroke_id,
            rejection_reason="Stroke has too few points (minimum 4 points required).",
            is_parametric_needed=False,
            message="Stroke has too few points (minimum 4 points required)."
        )

    ok, resampled_pts, valid_orientations, is_parametric_needed, err_msg = preprocess_stroke(req.points)
    if not ok or resampled_pts is None or not valid_orientations:
        return FitResponse(
            success=False,
            stroke_id=req.stroke_id,
            rejection_reason=err_msg or "This curve needs parametric fitting, which is not supported yet.",
            is_parametric_needed=is_parametric_needed,
            message=err_msg or "This curve needs parametric fitting, which is not supported yet."
        )

    families = req.families or req.allowed_families
    success, candidates, fit_err_msg, timings = fit_all_families(resampled_pts, valid_orientations, families)
    if not success or not candidates:
        return FitResponse(
            success=False,
            stroke_id=req.stroke_id,
            rejection_reason=fit_err_msg or "No supported equation fits this stroke well.",
            is_parametric_needed=False,
            message=fit_err_msg or "No supported equation fits this stroke well.",
            timings_ms=timings
        )

    return FitResponse(
        success=True,
        stroke_id=req.stroke_id,
        domain=candidates[0].domain,
        orientation=candidates[0].orientation,
        best_family=candidates[0].family,
        candidates=candidates,
        message=f"Fitted {len(candidates)} candidate curve(s). Top match: {candidates[0].family_name} ({candidates[0].orientation}) (Geom Error: {candidates[0].geom_error:.3f})",
        timings_ms=timings
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
