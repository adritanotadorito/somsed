from typing import List, Dict, Optional, Union
from pydantic import BaseModel, Field

class Point(BaseModel):
    x: float
    y: float

class FitRequest(BaseModel):
    points: List[Point] = Field(..., min_length=3, description="List of graph coordinate points from the freehand stroke")
    stroke_id: Optional[Union[str, int]] = Field(None, description="Optional stroke identifier for stale request tracking")
    families: Optional[List[str]] = Field(None, description="Optional list of supported families to fit")
    allowed_families: Optional[List[str]] = Field(None, description="Alias for families")

class FitCandidate(BaseModel):
    family: str
    family_name: str
    params: Dict[str, float]
    latex: str
    text: str
    domain: List[float]
    orientation: str = "y_of_x"  # "y_of_x" | "x_of_y"
    rmse: float
    r_squared: float
    geom_error: float
    score: float
    is_poor_fit: bool = False
    warning: Optional[str] = None
    plot_points: List[Point]

class FitResponse(BaseModel):
    success: bool
    stroke_id: Optional[Union[str, int]] = None
    domain: Optional[List[float]] = None
    orientation: str = "y_of_x"  # "y_of_x" | "x_of_y"
    best_family: Optional[str] = None
    candidates: List[FitCandidate] = []
    rejection_reason: Optional[str] = None
    is_parametric_needed: bool = False
    message: Optional[str] = None
    timings_ms: Optional[Dict[str, float]] = None
