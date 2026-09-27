from fastapi import APIRouter

from ..algorithms.anomaly_detector import analyze_voting_anomalies
from ..models.schemas import VotingAnomalyRequest, VotingAnomalyResponse


router = APIRouter(tags=["Voting Anomalies"])


@router.post("/voting-anomalies", response_model=VotingAnomalyResponse)
def voting_anomalies_endpoint(request: VotingAnomalyRequest) -> VotingAnomalyResponse:
    return analyze_voting_anomalies(request.votes, request.submission_ids)
