import math

import numpy as np
from fastapi import APIRouter

from ..algorithms.diagnostics import calculate_judge_diagnostics
from ..models.schemas import (
    JudgeCalibrationDiagnosticResponse,
    JudgeDiagnosticsRequest,
    JudgeDiagnosticsResponse,
)


router = APIRouter(tags=["Judge Diagnostics"])


def _finite_or_none(value: float) -> float | None:
    return float(value) if math.isfinite(value) else None


@router.post("/judge-diagnostics", response_model=JudgeDiagnosticsResponse)
def judge_diagnostics_endpoint(request: JudgeDiagnosticsRequest):
    judge_ids = tuple(sorted({score.judge_id for score in request.scores}))
    scores_by_judge = {judge_id: [] for judge_id in judge_ids}
    for score in request.scores:
        scores_by_judge[score.judge_id].append(score.raw_composite_score)

    observation_count = max((len(scores) for scores in scores_by_judge.values()), default=0)
    values = np.full((len(judge_ids), observation_count), np.nan)
    for judge_index, judge_id in enumerate(judge_ids):
        values[judge_index, : len(scores_by_judge[judge_id])] = scores_by_judge[judge_id]

    diagnostics = calculate_judge_diagnostics(
        values,
        judge_ids=judge_ids,
        prior_k=request.bayesian_prior_k,
    )
    return JudgeDiagnosticsResponse(
        diagnostics=[
            JudgeCalibrationDiagnosticResponse(
                judge_id=diagnostic.judge_id,
                sample_size=diagnostic.sample_size,
                raw_mean=diagnostic.raw_mean,
                raw_std=_finite_or_none(diagnostic.raw_std),
                global_mean=diagnostic.global_mean,
                global_std=_finite_or_none(diagnostic.global_std),
                bayesian_shrunk_mean=diagnostic.bayesian_shrunk_mean,
                severity=diagnostic.severity,
                standard_error=_finite_or_none(diagnostic.standard_error),
            )
            for diagnostic in diagnostics
        ]
    )
