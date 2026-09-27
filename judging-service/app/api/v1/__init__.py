from fastapi import APIRouter
from ...routes.judge_diagnostics import router as judge_diagnostics_router
from ...routes.normalize import router as normalize_router
from ...routes.pairwise import pairwise_router
from ...routes.voting_anomalies import router as voting_anomalies_router


router = APIRouter(prefix="/api/v1", tags=["v1"])
router.include_router(normalize_router)
router.include_router(judge_diagnostics_router)
router.include_router(pairwise_router)
router.include_router(voting_anomalies_router)
