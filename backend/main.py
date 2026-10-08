import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import FitRequest, FitResponse
from preprocessing import preprocess_stroke
from fitting import fit_all_families

app = FastAPI(
    title="Reverse Desmos - Curve Fitting API",
    description="Backend API for mathematical equation curve fitting on freehand graph strokes",
    version="1.0.0"
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "milestone": 4, "service": "Reverse Desmos Curve Fitting"}

@app.post("/fit", response_model=FitResponse)
def fit_stroke_curve(req: FitRequest):
    """
    Fits a freehand graph stroke to supported mathematical curve families:
    - Linear: y = mx + b
    - Quadratic: y = ax^2 + bx + c
    - Cubic: y = ax^3 + bx^2 + cx + d
    - Absolute Value: y = a|x - h| + k
    """
    if len(req.points) < 4:
        return FitResponse(
            success=False,
            stroke_id=req.stroke_id,
            rejection_reason="Stroke has too few points (minimum 4 points required).",
            message="Stroke has too few points (minimum 4 points required)."
        )

    # 1. Preprocess and validate single-valued function y = f(x)
    ok, clean_x, clean_y, domain, err_msg = preprocess_stroke(req.points)
    if not ok or clean_x is None or clean_y is None or domain is None:
        return FitResponse(
            success=False,
            stroke_id=req.stroke_id,
            rejection_reason=err_msg or "Stroke is not a valid single-valued function.",
            message=err_msg or "Stroke is not a valid single-valued function."
        )

    # 2. Fit supported families and rank candidates
    success, candidates, fit_err_msg = fit_all_families(clean_x, clean_y, domain, req.families)
    if not success or not candidates:
        return FitResponse(
            success=False,
            stroke_id=req.stroke_id,
            domain=[domain[0], domain[1]],
            rejection_reason=fit_err_msg or "No supported curve family adequately fits this stroke.",
            message=fit_err_msg or "No supported curve family adequately fits this stroke."
        )

    return FitResponse(
        success=True,
        stroke_id=req.stroke_id,
        domain=[domain[0], domain[1]],
        best_family=candidates[0].family,
        candidates=candidates,
        message=f"Fitted {len(candidates)} candidate curve(s). Top match: {candidates[0].family_name} (RMSE: {candidates[0].rmse:.3f})"
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
