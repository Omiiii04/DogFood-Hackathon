from collections import defaultdict
from dataclasses import dataclass
from statistics import mean
from time import perf_counter

import numpy as np
import pytest

from app.algorithms.normalization import (
    calculate_empirical_bayesian_shrinkage,
    run_normalization,
)
from tests.fixtures.synthetic_dataset import generate_synthetic_tournament


VARIANCE_REDUCTION_THRESHOLD_PERCENT = 65.0
SEED = 2026


@dataclass(frozen=True)
class JudgeEffect:
    judge_id: str
    bias: float
    raw_mean: float
    latent_mean: float
    raw_effect_in_std: float
    normalized_effect_in_std: float


@dataclass(frozen=True)
class BenchmarkResult:
    submissions: int
    judges: int
    tracks: int
    score_records: int
    seed: int
    harsh_bias: float
    lenient_bias: float
    neutral_bias: float
    noise_std: float
    raw_metric: float
    normalized_metric: float
    reduction: float
    reduction_percent: float
    qualifies: bool
    harsh_judge: JudgeEffect
    lenient_judge: JudgeEffect
    latent_order: tuple[str, ...]
    raw_order: tuple[str, ...]
    normalized_order: tuple[str, ...]
    raw_rank_inversions: int
    normalized_rank_inversions: int
    raw_spearman: float
    normalized_spearman: float
    representative_raw_inversions: tuple[tuple[str, str], ...]
    representative_normalized_inversions: tuple[tuple[str, str], ...]
    benchmark_runtime_ms: float
    normalization_runtime_ms: float


def _population_variance(values):
    return float(np.var(np.asarray(values, dtype=float), ddof=0))


def _rank_inversions(order, latent_quality):
    positions = {submission_id: rank for rank, submission_id in enumerate(order)}
    ids = tuple(latent_quality)
    inversions = []
    for index, higher_id in enumerate(ids):
        for lower_id in ids[index + 1:]:
            if latent_quality[higher_id] <= latent_quality[lower_id]:
                continue
            if positions[higher_id] > positions[lower_id]:
                inversions.append((higher_id, lower_id))
    return tuple(inversions)


def _spearman(order, latent_order):
    positions = {submission_id: rank for rank, submission_id in enumerate(order)}
    squared_distance = sum(
        (rank - positions[submission_id]) ** 2
        for rank, submission_id in enumerate(latent_order)
    )
    count = len(latent_order)
    return float(1.0 - (6.0 * squared_distance) / (count * (count**2 - 1)))


def run_benchmark(**generator_kwargs):
    started = perf_counter()
    tournament = generate_synthetic_tournament(seed=SEED, **generator_kwargs)
    submissions_by_id = {
        submission.submission_id: submission for submission in tournament.submissions
    }
    judges_by_id = {judge.judge_id: judge for judge in tournament.judges}
    scores_by_submission = defaultdict(list)
    for score in tournament.scores:
        numeric_score = float(score.raw_composite_score)
        scores_by_submission[score.submission_id].append(numeric_score)

    raw_means = {
        submission_id: mean(scores)
        for submission_id, scores in scores_by_submission.items()
    }
    latent_quality = {
        submission_id: submission.latent_quality
        for submission_id, submission in submissions_by_id.items()
    }

    judge_ids = tuple(sorted(judges_by_id))
    submission_ids = tuple(sorted(submissions_by_id))
    judge_indexes = {judge_id: index for index, judge_id in enumerate(judge_ids)}
    submission_indexes = {
        submission_id: index for index, submission_id in enumerate(submission_ids)
    }
    values = np.full((len(judge_ids), len(submission_ids)), np.nan, dtype=float)
    mask = np.zeros(values.shape, dtype=bool)
    for score in tournament.scores:
        judge_index = judge_indexes[score.judge_id]
        submission_index = submission_indexes[score.submission_id]
        values[judge_index, submission_index] = float(score.raw_composite_score)
        mask[judge_index, submission_index] = True

    normalized_started = perf_counter()
    normalized_response = run_normalization(list(tournament.scores))
    normalization_runtime_ms = (perf_counter() - normalized_started) * 1000.0
    normalized_by_submission = {
        standing.submission_id: standing for standing in normalized_response.standings
    }

    # Use the production shrinkage engine to expose the per-judge calibrated z
    # values; run_normalization is the authoritative submission-level output.
    shrinkage = calculate_empirical_bayesian_shrinkage(
        values, mask, judge_ids=judge_ids
    )
    for submission_id, submission_index in submission_indexes.items():
        observed = mask[:, submission_index]
        expected_z_mean = float(np.mean(shrinkage.calibrated_z_scores[observed, submission_index]))
        assert normalized_by_submission[submission_id].z_score_mean == pytest.approx(
            expected_z_mean, abs=0.0001
        )

    judge_effects = []
    for judge_index, judge_id in enumerate(judge_ids):
        observed = mask[judge_index]
        judge_scores = values[judge_index, observed]
        judged_latents = np.array(
            [latent_quality[submission_ids[index]] for index in np.flatnonzero(observed)]
        )
        raw_std = float(np.std(judge_scores, ddof=1))
        raw_mean = float(np.mean(judge_scores))
        latent_mean = float(np.mean(judged_latents))
        judge_effects.append(
            JudgeEffect(
                judge_id=judge_id,
                bias=judges_by_id[judge_id].bias,
                raw_mean=raw_mean,
                latent_mean=latent_mean,
                raw_effect_in_std=(raw_mean - latent_mean) / raw_std,
                normalized_effect_in_std=float(
                    np.mean(shrinkage.calibrated_z_scores[judge_index, observed])
                ),
            )
        )

    raw_effects = [effect.raw_effect_in_std for effect in judge_effects]
    normalized_effects = [effect.normalized_effect_in_std for effect in judge_effects]
    raw_metric = _population_variance(raw_effects)
    normalized_metric = _population_variance(normalized_effects)
    reduction = raw_metric - normalized_metric
    reduction_percent = 100.0 * reduction / raw_metric

    latent_order = tuple(
        sorted(submission_ids, key=lambda submission_id: (-latent_quality[submission_id], submission_id))
    )
    raw_order = tuple(
        sorted(submission_ids, key=lambda submission_id: (-raw_means[submission_id], submission_id))
    )
    normalized_order = tuple(
        standing.submission_id for standing in normalized_response.standings
    )
    raw_inversions = _rank_inversions(raw_order, latent_quality)
    normalized_inversions = _rank_inversions(normalized_order, latent_quality)
    harsh_judge = min(judge_effects, key=lambda effect: (effect.bias, effect.judge_id))
    lenient_judge = max(judge_effects, key=lambda effect: (effect.bias, effect.judge_id))

    return BenchmarkResult(
        submissions=len(tournament.submissions),
        judges=len(tournament.judges),
        tracks=len({submission.track for submission in tournament.submissions}),
        score_records=len(tournament.scores),
        seed=SEED,
        harsh_bias=generator_kwargs.get("harsh_bias", -1.8),
        lenient_bias=generator_kwargs.get("lenient_bias", 1.5),
        neutral_bias=generator_kwargs.get("neutral_bias", 0.0),
        noise_std=generator_kwargs.get("noise_std", 0.2),
        raw_metric=raw_metric,
        normalized_metric=normalized_metric,
        reduction=reduction,
        reduction_percent=reduction_percent,
        qualifies=reduction_percent > VARIANCE_REDUCTION_THRESHOLD_PERCENT,
        harsh_judge=harsh_judge,
        lenient_judge=lenient_judge,
        latent_order=latent_order,
        raw_order=raw_order,
        normalized_order=normalized_order,
        raw_rank_inversions=len(raw_inversions),
        normalized_rank_inversions=len(normalized_inversions),
        raw_spearman=_spearman(raw_order, latent_order),
        normalized_spearman=_spearman(normalized_order, latent_order),
        representative_raw_inversions=raw_inversions[:3],
        representative_normalized_inversions=normalized_inversions[:3],
        benchmark_runtime_ms=(perf_counter() - started) * 1000.0,
        normalization_runtime_ms=normalization_runtime_ms,
    )


def qualifies_at_threshold(reduction_percent, threshold=VARIANCE_REDUCTION_THRESHOLD_PERCENT):
    return float(reduction_percent) > float(threshold)


def test_full_benchmark_uses_the_wbs20_dataset():
    result = run_benchmark()

    assert result.submissions == 50
    assert result.judges == 12
    assert result.tracks == 4
    assert result.score_records == 150
    assert result.seed == SEED


def test_raw_and_normalized_results_are_produced_from_the_same_scores():
    result = run_benchmark()

    assert len(result.raw_order) == result.submissions
    assert len(result.normalized_order) == result.submissions
    assert result.raw_metric > 0.0
    assert result.normalized_metric >= 0.0
    assert result.raw_order != result.normalized_order


def test_harsh_judge_effect_moves_toward_zero_after_calibration():
    result = run_benchmark()

    assert result.harsh_judge.raw_mean < result.harsh_judge.latent_mean
    assert result.harsh_judge.normalized_effect_in_std > result.harsh_judge.raw_effect_in_std


def test_lenient_judge_effect_moves_toward_zero_after_calibration():
    result = run_benchmark()

    assert result.lenient_judge.raw_mean > result.lenient_judge.latent_mean
    assert result.lenient_judge.normalized_effect_in_std < result.lenient_judge.raw_effect_in_std


def test_bias_sensitive_variance_decreases_after_normalization():
    result = run_benchmark()

    assert result.normalized_metric < result.raw_metric
    assert result.reduction == pytest.approx(result.raw_metric - result.normalized_metric)


def test_variance_reduction_percentage_is_calculated_correctly():
    result = run_benchmark()

    expected = 100.0 * (result.raw_metric - result.normalized_metric) / result.raw_metric
    assert result.reduction_percent == pytest.approx(expected)


def test_qualification_threshold_is_strictly_greater_than_65_percent():
    assert qualifies_at_threshold(65.000001)
    assert not qualifies_at_threshold(65.0)
    assert not qualifies_at_threshold(64.999999)
    assert run_benchmark().qualifies


def test_ranking_comparison_reports_actual_inversions_and_correlation():
    result = run_benchmark()

    assert result.raw_rank_inversions > result.normalized_rank_inversions
    assert result.raw_spearman < result.normalized_spearman
    assert result.representative_raw_inversions
    assert result.representative_normalized_inversions


def test_repeated_benchmark_runs_are_deterministic():
    results = [run_benchmark() for _ in range(10)]
    first = results[0]

    for result in results[1:]:
        assert result.raw_metric == first.raw_metric
        assert result.normalized_metric == first.normalized_metric
        assert result.reduction_percent == first.reduction_percent
        assert result.raw_rank_inversions == first.raw_rank_inversions
        assert result.normalized_rank_inversions == first.normalized_rank_inversions
        assert result.latent_order == first.latent_order
        assert result.raw_order == first.raw_order
        assert result.normalized_order == first.normalized_order


def test_stronger_bias_configuration_remains_qualified():
    primary = run_benchmark()
    stronger_bias = run_benchmark(harsh_bias=-3.0, lenient_bias=3.0)

    assert stronger_bias.raw_metric != primary.raw_metric
    assert stronger_bias.normalized_metric != primary.normalized_metric
    assert stronger_bias.qualifies
