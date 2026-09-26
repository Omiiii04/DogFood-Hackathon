import warnings

import numpy as np
import pytest
from app.algorithms import normalization
from app.algorithms.normalization import (
    calculate_shrunk_mean,
    calculate_z_scores,
    run_normalization,
)
from app.models.schemas import JudgeScoreEntry
from tests.fixtures.synthetic_dataset import generate_synthetic_tournament

def test_normalization_worked_example_neutralizes_evaluator_bias():
    # 2 Judges: Judge A (tough), Judge B (lenient)
    scores = [
        JudgeScoreEntry(judge_id="JudgeA", submission_id="Proj1", raw_composite_score=5.0),
        JudgeScoreEntry(judge_id="JudgeA", submission_id="Proj2", raw_composite_score=3.0),
        JudgeScoreEntry(judge_id="JudgeB", submission_id="Proj3", raw_composite_score=9.0),
        JudgeScoreEntry(judge_id="JudgeB", submission_id="Proj4", raw_composite_score=8.0),
    ]

    response = run_normalization(scores, bayesian_prior_k=3.0)

    assert response.status == "success"
    assert response.total_submissions == 4
    assert response.total_scores_processed == 4

    standings_map = {s.submission_id: s for s in response.standings}

    assert set(standings_map) == {"Proj1", "Proj2", "Proj3", "Proj4"}
    assert all(
        np.isfinite((standing.normalized_score, standing.z_score_mean)).all()
        for standing in standings_map.values()
    )

    # Bayesian shrinkage changes the judge centers, so equal within-judge
    # relative positions do not imply equal calibrated values across judges.
    assert standings_map["Proj1"].normalized_score != pytest.approx(
        standings_map["Proj3"].normalized_score
    )

    calibration_map = {metric.judge_id: metric for metric in response.judge_calibrations}
    assert calibration_map["JudgeA"].bayesian_shrunk_mean == pytest.approx(5.35)
    assert calibration_map["JudgeB"].bayesian_shrunk_mean == pytest.approx(7.15)

    expected_normalized_scores = {
        "Proj1": 46.37,
        "Proj2": 0.0,
        "Proj3": 100.0,
        "Proj4": 75.4,
    }
    expected_z_score_means = {
        "Proj1": -0.1513,
        "Proj2": -1.0160,
        "Proj3": 0.8488,
        "Proj4": 0.3900,
    }
    for submission_id, expected_score in expected_normalized_scores.items():
        standing = standings_map[submission_id]
        assert 0.0 <= standing.normalized_score <= 100.0
        assert standing.normalized_score == pytest.approx(expected_score, abs=0.01)
        assert standing.z_score_mean == pytest.approx(
            expected_z_score_means[submission_id], abs=0.0001
        )

    assert [standing.submission_id for standing in response.standings] == [
        "Proj3",
        "Proj4",
        "Proj1",
        "Proj2",
    ]
    assert [standing.rank for standing in response.standings] == [1, 2, 3, 4]

def test_empty_scores_handling():
    response = run_normalization([])
    assert response.total_submissions == 0
    assert response.standings == []


def test_baseline_statistics_known_sample():
    scores = [1, 2, 3, 4, 5]

    assert normalization.calculate_mean(scores) == pytest.approx(3.0)
    assert normalization.calculate_sample_variance(scores) == pytest.approx(2.5)
    assert normalization.calculate_sample_std(scores) == pytest.approx(np.sqrt(2.5))


def test_baseline_statistics_two_observations():
    scores = [2, 4]

    assert normalization.calculate_mean(scores) == pytest.approx(3.0)
    assert normalization.calculate_sample_variance(scores) == pytest.approx(2.0)
    assert normalization.calculate_sample_std(scores) == pytest.approx(np.sqrt(2.0))


def test_baseline_statistics_identical_scores_have_zero_variance():
    scores = [5, 5, 5, 5]

    assert normalization.calculate_mean(scores) == pytest.approx(5.0)
    assert normalization.calculate_sample_variance(scores) == pytest.approx(0.0)
    assert normalization.calculate_sample_std(scores) == pytest.approx(0.0)


def test_baseline_statistics_allow_negative_values():
    scores = [-2, -1, 0, 1]

    assert normalization.calculate_mean(scores) == pytest.approx(-0.5)
    assert normalization.calculate_sample_variance(scores) == pytest.approx(5 / 3)
    assert normalization.calculate_sample_std(scores) == pytest.approx(np.sqrt(5 / 3))


def test_baseline_statistics_are_deterministic():
    scores = [1, 2, 3, 4, 5]
    expected = (
        normalization.calculate_mean(scores),
        normalization.calculate_sample_variance(scores),
        normalization.calculate_sample_std(scores),
    )

    for _ in range(100):
        assert (
            normalization.calculate_mean(scores),
            normalization.calculate_sample_variance(scores),
            normalization.calculate_sample_std(scores),
        ) == pytest.approx(expected)


def test_baseline_statistics_preserve_numpy_nan_behavior_for_insufficient_samples():
    with warnings.catch_warnings(), np.errstate(all="ignore"):
        warnings.simplefilter("ignore", RuntimeWarning)
        assert np.isnan(normalization.calculate_mean([]))
        assert np.isnan(normalization.calculate_sample_variance([]))
        assert np.isnan(normalization.calculate_sample_std([]))
        assert normalization.calculate_mean([5]) == pytest.approx(5.0)
        assert np.isnan(normalization.calculate_sample_variance([5]))
        assert np.isnan(normalization.calculate_sample_std([5]))


def test_shrunk_mean_matches_known_worked_example():
    assert calculate_shrunk_mean(4.0, 2, 6.25) == pytest.approx(5.35)


def test_shrunk_mean_uses_global_mean_for_zero_observations():
    assert calculate_shrunk_mean(4.0, 0, 6.25) == 6.25


def test_shrunk_mean_converges_to_judge_mean_for_large_sample():
    assert calculate_shrunk_mean(4.0, 10**12, 6.25) == pytest.approx(4.0, abs=1e-9)


def test_shrunk_mean_is_neutral_when_means_match():
    for sample_size in (0, 1, 10, 100):
        assert calculate_shrunk_mean(5.0, sample_size, 5.0) == 5.0


def test_stronger_prior_pulls_more_toward_global_mean():
    results = [calculate_shrunk_mean(4.0, 2, 6.0, prior_k=k) for k in (1.0, 3.0, 10.0)]

    assert results[0] < results[1] < results[2] < 6.0


def test_shrunk_mean_is_deterministic():
    expected = calculate_shrunk_mean(4.0, 2, 6.25)

    for _ in range(100):
        assert calculate_shrunk_mean(4.0, 2, 6.25) == expected


@pytest.mark.parametrize("judge_mean, global_mean", [(4.0, 6.25), (8.0, 6.25)])
def test_shrunk_mean_lies_between_judge_and_global_means(judge_mean, global_mean):
    result = calculate_shrunk_mean(judge_mean, 2, global_mean)

    assert min(judge_mean, global_mean) <= result <= max(judge_mean, global_mean)


def test_shrunk_mean_allows_zero_prior_for_positive_sample_size():
    assert calculate_shrunk_mean(4.0, 2, 6.25, prior_k=0.0) == 4.0


@pytest.mark.parametrize(
    "arguments",
    [
        (4.0, 2, 6.25, -1.0),
        (4.0, 2, 6.25, np.nan),
        (np.inf, 2, 6.25, 3.0),
        (4.0, 2, np.inf, 3.0),
    ],
)
def test_shrunk_mean_rejects_invalid_prior_or_non_finite_inputs(arguments):
    with pytest.raises(ValueError):
        calculate_shrunk_mean(*arguments)


def _matrix(scores, mask=None):
    values = np.asarray(scores, dtype=float)
    if values.ndim == 1:
        values = values[None, :, None]
    elif values.ndim == 2:
        values = values[:, :, None]
    if mask is None:
        mask = np.isfinite(values)
    return values, np.asarray(mask, dtype=bool)


def test_z_scores_match_known_sample_with_epsilon():
    values, mask = _matrix([1, 2, 3, 4, 5])

    result = calculate_z_scores(values, mask)
    denominator = np.sqrt(2.5) + 1e-6

    np.testing.assert_allclose(
        result[0, :, 0],
        [(-2) / denominator, (-1) / denominator, 0.0, 1 / denominator, 2 / denominator],
    )


def test_z_scores_have_zero_mean():
    values, mask = _matrix([2, 5, 9, 12])

    result = calculate_z_scores(values, mask)

    assert np.mean(result[0, :, 0]) == pytest.approx(0.0)


def test_z_scores_have_unit_sample_standard_deviation():
    values, mask = _matrix([2, 5, 9, 12])

    result = calculate_z_scores(values, mask)

    assert np.std(result[0, :, 0], ddof=1) == pytest.approx(1.0)


def test_z_scores_with_zero_variance_are_zero():
    values, mask = _matrix([5, 5, 5, 5])

    result = calculate_z_scores(values, mask)

    np.testing.assert_allclose(result[0, :, 0], 0.0)


def test_z_scores_ignore_and_preserve_masked_observations():
    values, mask = _matrix([1, 999, 3, 5])
    mask[0, 1, 0] = False
    values[0, 1, 0] = np.nan

    result = calculate_z_scores(values, mask)

    denominator = 2.0 + 1e-6
    np.testing.assert_allclose(
        result[0, [0, 2, 3], 0], [-2.0 / denominator, 0.0, 2.0 / denominator]
    )
    assert np.isnan(result[0, 1, 0])


def test_z_scores_remove_different_judge_severity():
    values, mask = _matrix([[4, 5, 6], [8, 9, 10]])

    result = calculate_z_scores(values, mask)

    np.testing.assert_allclose(result[0, :, 0], result[1, :, 0])


def test_z_scores_are_deterministic():
    values, mask = _matrix([1, 2, 3, 4, 5])

    first = calculate_z_scores(values, mask)
    second = calculate_z_scores(values, mask)

    np.testing.assert_array_equal(first, second)


def test_z_scores_support_synthetic_dataset_subset():
    tournament = generate_synthetic_tournament()
    judges = tournament.judges[:3]
    submissions = tournament.submissions
    judge_indexes = {judge.judge_id: index for index, judge in enumerate(judges)}
    submission_indexes = {
        submission.submission_id: index for index, submission in enumerate(submissions)
    }
    values = np.full((len(judges), len(submissions), 1), np.nan)
    mask = np.zeros(values.shape, dtype=bool)

    for score in tournament.scores:
        if score.judge_id not in judge_indexes:
            continue
        judge_index = judge_indexes[score.judge_id]
        submission_index = submission_indexes[score.submission_id]
        values[judge_index, submission_index, 0] = score.raw_composite_score
        mask[judge_index, submission_index, 0] = True

    result = calculate_z_scores(values, mask)

    assert result.shape == values.shape
    assert np.isfinite(result[mask]).all()
    assert np.isnan(result[~mask]).all()


def _evaluation(judge_id, submission_id, scores):
    return {
        "judgeId": judge_id,
        "submissionId": submission_id,
        "criteriaScores": [
            {"criteriaName": criterion, "rawScore": score}
            for criterion, score in scores.items()
        ],
    }


def test_parse_score_matrix_builds_complete_judge_submission_criterion_array():
    records = [
        _evaluation("judge-b", "submission-2", {"technical": 8.0, "impact": 7.0, "innovation": 9.0}),
        _evaluation("judge-a", "submission-1", {"technical": 6.0, "impact": 5.0, "innovation": 7.0}),
        _evaluation("judge-a", "submission-2", {"technical": 8.5, "impact": 8.0, "innovation": 8.5}),
        _evaluation("judge-b", "submission-1", {"technical": 7.0, "impact": 6.0, "innovation": 8.0}),
    ]

    result = normalization.parse_score_matrix(
        records, criterion_keys=["technical", "innovation", "impact"]
    )

    assert result.matrix.shape == (2, 2, 3)
    assert result.judge_ids == ("judge-a", "judge-b")
    assert result.submission_ids == ("submission-1", "submission-2")
    assert result.criterion_keys == ("technical", "innovation", "impact")
    assert result.matrix[0, 0].tolist() == [6.0, 7.0, 5.0]
    assert result.matrix[1, 1].tolist() == [8.0, 9.0, 7.0]
    assert result.mask.all()


def test_parse_score_matrix_masks_missing_submission_evaluation_without_zero_fill():
    records = [
        _evaluation("judge-a", "submission-1", {"technical": 6.0, "impact": 5.0}),
        _evaluation("judge-a", "submission-2", {"technical": 8.0, "impact": 7.0}),
        _evaluation("judge-b", "submission-1", {"technical": 7.0, "impact": 6.0}),
    ]

    result = normalization.parse_score_matrix(records, criterion_keys=["technical", "impact"])

    assert result.matrix.shape == (2, 2, 2)
    assert not result.mask[1, 1].any()
    assert np.isnan(result.matrix[1, 1]).all()
    assert not np.any(result.matrix[1, 1] == 0)


def test_parse_score_matrix_masks_missing_criterion():
    records = [_evaluation("judge-a", "submission-1", {"technical": 8.0})]

    result = normalization.parse_score_matrix(
        records, criterion_keys=["technical", "innovation"]
    )

    assert result.mask[0, 0].tolist() == [True, False]
    assert result.matrix[0, 0, 0] == 8.0
    assert np.isnan(result.matrix[0, 0, 1])


def test_parse_score_matrix_is_deterministic_for_same_logical_input():
    records = [
        _evaluation("judge-b", "submission-2", {"technical": 8.0}),
        _evaluation("judge-a", "submission-1", {"technical": 6.0}),
    ]

    first = normalization.parse_score_matrix(records, criterion_keys=["technical"])
    second = normalization.parse_score_matrix(list(reversed(records)), criterion_keys=["technical"])

    assert first.judge_ids == second.judge_ids
    assert first.submission_ids == second.submission_ids
    assert first.criterion_keys == second.criterion_keys
    assert np.all(
        (first.matrix == second.matrix)
        | (np.isnan(first.matrix) & np.isnan(second.matrix))
    )
    np.testing.assert_array_equal(first.mask, second.mask)


def test_parse_score_matrix_rejects_duplicate_judge_submission_record():
    records = [
        _evaluation("judge-a", "submission-1", {"technical": 8.0}),
        _evaluation("judge-a", "submission-1", {"technical": 8.0}),
    ]

    with pytest.raises(ValueError, match="Duplicate evaluation"):
        normalization.parse_score_matrix(records, criterion_keys=["technical"])


def test_parse_score_matrix_rejects_unknown_criterion():
    records = [_evaluation("judge-a", "submission-1", {"technical": 8.0})]

    with pytest.raises(ValueError, match="Unknown criterion"):
        normalization.parse_score_matrix(records, criterion_keys=["impact"])


def test_empirical_bayesian_engine_reuses_shrunk_mean_and_calibrates_scores():
    values = np.array([[2.0, 6.0], [8.5, 8.5]])
    mask = np.ones(values.shape, dtype=bool)

    result = normalization.calculate_empirical_bayesian_shrinkage(values, mask)

    assert result.global_mean == pytest.approx(6.25)
    assert result.judge_results[0].shrunk_mean == pytest.approx(5.35)
    assert result.judge_results[0].shrunk_std == pytest.approx(
        np.sqrt((2 / 5) * 8.0 + (3 / 5) * (28.25 / 3))
    )
    expected_z = (2.0 - 5.35) / (result.judge_results[0].shrunk_std + 1e-6)
    assert result.calibrated_z_scores[0, 0] == pytest.approx(expected_z)


def test_empirical_bayesian_engine_zero_variance_judge_uses_global_variance():
    values = np.array([[5.0, 5.0, 5.0, 5.0], [7.0, 7.0, 7.0, 7.0]])
    result = normalization.calculate_empirical_bayesian_shrinkage(values)
    judge = result.judge_results[0]

    assert judge.raw_std == pytest.approx(0.0)
    assert judge.shrunk_std > 0.0
    expected = (5.0 - judge.shrunk_mean) / (judge.shrunk_std + 1e-6)
    assert result.calibrated_z_scores[0, 0] == pytest.approx(expected)
    assert result.calibrated_z_scores[0, 0] != pytest.approx(0.0)


def test_empirical_bayesian_engine_singleton_preserves_nan_raw_std_without_fake_score():
    values = np.array([[4.0, np.nan, np.nan, np.nan], [5.0, 7.0, 9.0, 11.0]])
    result = normalization.calculate_empirical_bayesian_shrinkage(values)
    judge = result.judge_results[0]

    assert judge.sample_size == 1
    assert np.isnan(judge.raw_std)
    assert np.isfinite(judge.shrunk_std)
    assert np.isfinite(result.calibrated_z_scores[0, 0])
    assert result.calibrated_z_scores[0, 0] != 0.0


@pytest.mark.parametrize("sample_size", [2, 3, 4])
def test_empirical_bayesian_engine_small_samples_shrink_toward_global_mean(sample_size):
    values = np.full((2, 4), np.nan)
    values[0, :sample_size] = np.arange(1.0, sample_size + 1.0)
    values[1] = 9.0

    result = normalization.calculate_empirical_bayesian_shrinkage(values)
    judge = result.judge_results[0]

    assert min(judge.raw_mean, result.global_mean) <= judge.shrunk_mean <= max(
        judge.raw_mean, result.global_mean
    )
    assert abs(judge.shrunk_mean - result.global_mean) < abs(
        judge.raw_mean - result.global_mean
    )


def test_empirical_bayesian_engine_rejects_empty_judge():
    values = np.array([[np.nan, np.nan], [2.0, 4.0]])
    mask = np.array([[False, False], [True, True]])

    with pytest.raises(ValueError, match="at least one observed score"):
        normalization.calculate_empirical_bayesian_shrinkage(values, mask)


def test_empirical_bayesian_engine_large_sample_approaches_raw_statistics():
    values = np.vstack((np.arange(1.0, 101.0), np.full(100, 50.5)))
    result = normalization.calculate_empirical_bayesian_shrinkage(values)
    judge = result.judge_results[0]

    assert judge.shrunk_mean == pytest.approx(judge.raw_mean)
    assert judge.shrunk_std == pytest.approx(judge.raw_std, rel=0.01)


def test_empirical_bayesian_engine_is_neutral_when_global_statistics_match():
    result = normalization.calculate_empirical_bayesian_shrinkage(
        np.array([[1.0, 2.0, 3.0, 4.0]])
    )
    judge = result.judge_results[0]

    assert judge.shrunk_mean == pytest.approx(judge.raw_mean)
    assert judge.shrunk_std == pytest.approx(judge.raw_std)


def test_empirical_bayesian_engine_preserves_masked_nan_and_ignores_placeholders():
    values = np.array([[1.0, np.nan, 3.0, 5.0], [2.0, 4.0, np.nan, np.nan]])
    mask = np.isfinite(values)
    altered = values.copy()
    altered[~mask] = 999.0

    result = normalization.calculate_empirical_bayesian_shrinkage(values, mask)
    altered_result = normalization.calculate_empirical_bayesian_shrinkage(altered, mask)

    assert np.isnan(result.calibrated_z_scores[~mask]).all()
    assert np.isfinite(result.calibrated_z_scores[mask]).all()
    assert result.global_mean == pytest.approx(altered_result.global_mean)
    assert result.global_std == pytest.approx(altered_result.global_std)
    for first, second in zip(result.judge_results, altered_result.judge_results):
        assert first.raw_mean == pytest.approx(second.raw_mean)
        assert first.raw_std == pytest.approx(second.raw_std)
        assert first.shrunk_mean == pytest.approx(second.shrunk_mean)
        assert first.shrunk_std == pytest.approx(second.shrunk_std)


def test_empirical_bayesian_engine_is_deterministic():
    values = np.array([[2.0, np.nan, 4.0], [8.0, 10.0, np.nan]])
    mask = np.isfinite(values)

    first = normalization.calculate_empirical_bayesian_shrinkage(values, mask)
    second = normalization.calculate_empirical_bayesian_shrinkage(values, mask)

    np.testing.assert_allclose(
        first.calibrated_z_scores, second.calibrated_z_scores, equal_nan=True
    )
    for first_judge, second_judge in zip(first.judge_results, second.judge_results):
        assert first_judge.judge_id == second_judge.judge_id
        assert first_judge.sample_size == second_judge.sample_size
        assert first_judge.raw_mean == second_judge.raw_mean
        assert first_judge.raw_std == second_judge.raw_std
        assert first_judge.shrunk_mean == second_judge.shrunk_mean
        assert first_judge.shrunk_std == second_judge.shrunk_std


def test_empirical_bayesian_engine_supports_synthetic_tournament_shape_and_mask():
    tournament = generate_synthetic_tournament()
    submissions = tuple(submission.submission_id for submission in tournament.submissions)
    judges = tuple(judge.judge_id for judge in tournament.judges)
    scores = {
        (score.judge_id, score.submission_id): float(score.raw_composite_score)
        for score in tournament.scores
    }
    values = np.full((len(judges), len(submissions), 1), np.nan)
    mask = np.zeros(values.shape, dtype=bool)
    for judge_index, judge_id in enumerate(judges):
        for submission_index, submission_id in enumerate(submissions):
            if (judge_id, submission_id) in scores:
                values[judge_index, submission_index, 0] = scores[(judge_id, submission_id)]
                mask[judge_index, submission_index, 0] = True

    result = normalization.calculate_empirical_bayesian_shrinkage(
        values, mask, judge_ids=judges
    )
    repeated = normalization.calculate_empirical_bayesian_shrinkage(
        values, mask, judge_ids=judges
    )

    assert result.calibrated_z_scores.shape == values.shape
    assert np.isfinite(result.calibrated_z_scores[mask]).all()
    assert np.isnan(result.calibrated_z_scores[~mask]).all()
    np.testing.assert_allclose(
        result.calibrated_z_scores, repeated.calibrated_z_scores, equal_nan=True
    )
