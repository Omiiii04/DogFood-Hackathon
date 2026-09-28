from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np

from .normalization import (
    ScoreMatrix,
    calculate_mean,
    calculate_sample_std,
    calculate_shrunk_mean,
)


Severity = Literal["Strict Grader", "Balanced Grader", "Lenient Grader"]


@dataclass(frozen=True)
class JudgeCalibrationDiagnostic:
    """Calibration statistics for one judge with at least one observation."""

    judge_id: str
    sample_size: int
    raw_mean: float
    raw_std: float
    global_mean: float
    global_std: float
    bayesian_shrunk_mean: float
    severity: Severity
    standard_error: float


def classify_judge_severity(
    judge_mean: float,
    global_mean: float,
    global_std: float,
) -> Severity:
    """Classify a judge using strict inequalities at the global one-sigma bounds."""
    if np.isfinite(global_std):
        if judge_mean < global_mean - global_std:
            return "Strict Grader"
        if judge_mean > global_mean + global_std:
            return "Lenient Grader"
    return "Balanced Grader"


def calculate_judge_diagnostics(
    scores: np.ndarray | ScoreMatrix,
    mask: np.ndarray | None = None,
    judge_ids: Sequence[str] | None = None,
    prior_k: float = 3.0,
) -> tuple[JudgeCalibrationDiagnostic, ...]:
    """Return deterministic judge diagnostics from scores and existing mask data.

    Scores may be one-, two-, or three-dimensional. The first dimension is the
    judge dimension; remaining dimensions are flattened into observations.
    Sample standard deviation uses ``ddof=1``. Therefore a judge with one
    observation has an undefined ``raw_std`` and ``standard_error`` (``NaN``).
    """
    if isinstance(scores, ScoreMatrix):
        values = np.asarray(scores.matrix, dtype=float)
        if mask is None:
            mask = scores.mask
        if judge_ids is None:
            judge_ids = scores.judge_ids
    else:
        values = np.asarray(scores, dtype=float)

    if values.ndim not in (1, 2, 3):
        raise ValueError("scores must be one-, two-, or three-dimensional")

    observed = np.isfinite(values) if mask is None else np.asarray(mask, dtype=bool)
    if observed.shape != values.shape:
        raise ValueError("mask must have the same shape as scores")
    valid = observed & np.isfinite(values)

    judge_count = 1 if values.ndim == 1 else values.shape[0]
    if judge_ids is None:
        ordered_judge_ids = tuple(f"judge-{index}" for index in range(judge_count))
    else:
        ordered_judge_ids = tuple(str(judge_id) for judge_id in judge_ids)
        if len(ordered_judge_ids) != judge_count:
            raise ValueError("judge_ids must match the number of judges")

    judge_views = (
        ((values, valid),)
        if values.ndim == 1
        else tuple((values[index], valid[index]) for index in range(judge_count))
    )
    observed_by_judge = [
        judge_values[judge_mask]
        for judge_values, judge_mask in judge_views
    ]
    all_observed = [scores_for_judge for scores_for_judge in observed_by_judge if scores_for_judge.size]
    if not all_observed:
        return ()

    flattened_scores = np.concatenate(all_observed)
    global_mean = calculate_mean(flattened_scores)
    global_std = (
        calculate_sample_std(flattened_scores)
        if flattened_scores.size >= 2
        else float("nan")
    )

    diagnostics = []
    for judge_id, judge_scores in zip(ordered_judge_ids, observed_by_judge):
        sample_size = int(judge_scores.size)
        if sample_size == 0:
            continue

        raw_mean = calculate_mean(judge_scores)
        raw_std = (
            calculate_sample_std(judge_scores)
            if sample_size >= 2
            else float("nan")
        )
        standard_error = (
            raw_std / np.sqrt(sample_size)
            if sample_size >= 2
            else float("nan")
        )
        diagnostics.append(
            JudgeCalibrationDiagnostic(
                judge_id=judge_id,
                sample_size=sample_size,
                raw_mean=raw_mean,
                raw_std=raw_std,
                global_mean=global_mean,
                global_std=global_std,
                bayesian_shrunk_mean=calculate_shrunk_mean(
                    raw_mean, sample_size, global_mean, prior_k=prior_k
                ),
                severity=classify_judge_severity(raw_mean, global_mean, global_std),
                standard_error=float(standard_error),
            )
        )

    return tuple(diagnostics)
