from fastapi import APIRouter, HTTPException
from ..models.schemas import (
    PairwiseRankRequest,
    PairwiseRankResponse,
    AnomalyDetectionRequest,
    AnomalyDetectionResponse
)
from ..algorithms.pairwise import run_bradley_terry
from ..algorithms.anomaly_detector import detect_voting_anomalies

# Unmounted router retaining standalone/legacy anomaly route definition.
# Intentionally not mounted in app.api.v1; tests explicitly verify /api/v1/detect-anomaly
# is not exposed. The primary production voting anomaly endpoint is /api/v1/voting-anomalies.
router = APIRouter(prefix="/api/v1", tags=["Pairwise & Anomaly"])

# Production router mounted by app.api.v1 for Bradley-Terry pairwise ranking
pairwise_router = APIRouter(tags=["Pairwise"])

@pairwise_router.post("/pairwise-rank", response_model=PairwiseRankResponse)
def pairwise_rank_endpoint(request: PairwiseRankRequest):
    try:
        response = run_bradley_terry(
            request.comparisons,
            request.max_iterations,
            request.tolerance,
            request.project_ids,
        )
        return response
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

@router.post("/detect-anomaly", response_model=AnomalyDetectionResponse)
def anomaly_detection_endpoint(request: AnomalyDetectionRequest):
    try:
        response = detect_voting_anomalies(
            request.submission_id,
            request.timestamps,
            request.window_seconds,
            request.velocity_threshold
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Anomaly detection failed: {str(e)}")
