from fastapi import APIRouter, HTTPException
from ..models.schemas import (
    PairwiseRankRequest,
    PairwiseRankResponse,
    AnomalyDetectionRequest,
    AnomalyDetectionResponse
)
from ..algorithms.pairwise import run_bradley_terry
from ..algorithms.anomaly_detector import detect_voting_anomalies

router = APIRouter(prefix="/api/v1", tags=["Pairwise & Anomaly"])
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
