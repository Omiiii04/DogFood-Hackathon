from fastapi import APIRouter
from ...routes.normalize import router as normalize_router


router = APIRouter(prefix="/api/v1", tags=["v1"])
router.include_router(normalize_router)
