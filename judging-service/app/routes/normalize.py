from fastapi import APIRouter
from ..models.schemas import NormalizationRequest, NormalizationResponse
from ..algorithms.normalization import run_normalization

router = APIRouter(tags=["Normalization"])

@router.post("/normalize", response_model=NormalizationResponse)
def normalize_scores_endpoint(request: NormalizationRequest):
    return run_normalization(request.scores, request.bayesian_prior_k)
