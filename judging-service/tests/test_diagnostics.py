import numpy as np
import pytest

from app.algorithms.diagnostics import (
    calculate_judge_diagnostics,
    classify_judge_severity,
)
from tests.fixtures.synthetic_dataset import generate_synthetic_tournament


def test_strict_grader_is_below_global_lower_bound():
    diagnostics = calculate_judge_diagnostics(
        np.array([[1.0, np.nan, np.nan, np.nan, np.nan], [6.0, 6.0, 6.0, 6.0, 6.0]])
    )

    assert diagnostics[0].severity == "Strict Grader"


def test_balanced_grader_is_inside_global_one_sigma_interval():
    diagnostics = calculate_judge_diagnostics(np.array([[3.0, 4.0, 5.0], [5.0, 6.0, 7.0]]))

    assert diagnostics[0].severity == "Balanced Grader"


def test_lenient_grader_is_above_global_upper_bound():
    diagnostics = calculate_judge_diagnostics(
        np.array([[9.0, np.nan, np.nan, np.nan, np.nan], [4.0, 4.0, 4.0, 4.0, 4.0]])
    )

    assert diagnostics[0].severity == "Lenient Grader"


def test_lower_boundary_is_balanced():
    assert classify_judge_severity(4.0, 5.0, 1.0) == "Balanced Grader"


def test_upper_boundary_is_balanced():
    assert classify_judge_severity(6.0, 5.0, 1.0) == "Balanced Grader"


def test_standard_error_uses_sample_std_and_sample_size():
    sigma_two_scores = np.sqrt(6.0)
    diagnostics = calculate_judge_diagnostics(
        np.array([[-sigma_two_scores, 0.0, 0.0, sigma_two_scores]])
    )

    assert diagnostics[0].raw_std == pytest.approx(2.0)
    assert diagnostics[0].standard_error == pytest.approx(1.0)


def test_standard_error_decreases_with_larger_sample_size():
    def scores_with_std(sample_size):
        magnitude = 2.0 * np.sqrt((sample_size - 1) / sample_size)
        return np.r_[-np.full(sample_size // 2, magnitude), np.full(sample_size // 2, magnitude)]

    small = calculate_judge_diagnostics(scores_with_std(4))[0]
    large = calculate_judge_diagnostics(scores_with_std(8))[0]

    assert small.raw_std == pytest.approx(2.0)
    assert large.raw_std == pytest.approx(2.0)
    assert large.standard_error < small.standard_error


def test_zero_variance_has_zero_standard_error():
    diagnostic = calculate_judge_diagnostics(np.array([[5.0, 5.0, 5.0, 5.0]]))[0]

    assert diagnostic.raw_std == pytest.approx(0.0)
    assert diagnostic.standard_error == pytest.approx(0.0)


def test_single_observation_preserves_undefined_sample_statistics():
    diagnostics = calculate_judge_diagnostics(np.array([[5.0, np.nan], [6.0, 8.0]]))
    singleton = diagnostics[0]

    assert singleton.sample_size == 1
    assert np.isnan(singleton.raw_std)
    assert np.isnan(singleton.standard_error)


def test_masked_values_do_not_affect_diagnostics():
    values = np.array([[1.0, 999.0, 3.0], [2.0, 4.0, 999.0]])
    mask = np.array([[True, False, True], [True, True, False]])
    diagnostics = calculate_judge_diagnostics(values, mask, judge_ids=("a", "b"))

    assert [(d.judge_id, d.sample_size, d.raw_mean) for d in diagnostics] == [
        ("a", 2, 2.0),
        ("b", 2, 3.0),
    ]
    assert all(np.isfinite(d.standard_error) for d in diagnostics)


def test_empty_judges_do_not_receive_diagnostics():
    values = np.array([[np.nan, np.nan], [2.0, 4.0]])
    diagnostics = calculate_judge_diagnostics(values, judge_ids=("empty", "observed"))

    assert [diagnostic.judge_id for diagnostic in diagnostics] == ["observed"]


def test_synthetic_dataset_diagnostics_match_generated_bias_roles():
    tournament = generate_synthetic_tournament()
    judge_ids = tuple(judge.judge_id for judge in tournament.judges)
    submission_ids = tuple(submission.submission_id for submission in tournament.submissions)
    submission_indexes = {submission_id: index for index, submission_id in enumerate(submission_ids)}
    judge_indexes = {judge_id: index for index, judge_id in enumerate(judge_ids)}
    values = np.full((len(judge_ids), len(submission_ids)), np.nan)

    for score in tournament.scores:
        values[judge_indexes[score.judge_id], submission_indexes[score.submission_id]] = float(
            score.raw_composite_score
        )

    diagnostics = calculate_judge_diagnostics(values, judge_ids=judge_ids)
    by_judge = {diagnostic.judge_id: diagnostic for diagnostic in diagnostics}

    assert by_judge["judge-1-1"].severity == "Strict Grader"
    assert by_judge["judge-3-2"].severity == "Lenient Grader"
    assert by_judge["judge-1-3"].severity == "Balanced Grader"
    assert by_judge["judge-2-3"].severity == "Balanced Grader"


def test_diagnostics_are_deterministic():
    values = np.array([[2.0, np.nan, 4.0], [8.0, 10.0, np.nan]])
    first = calculate_judge_diagnostics(values)
    second = calculate_judge_diagnostics(values)

    for left, right in zip(first, second):
        assert left.judge_id == right.judge_id
        assert left.sample_size == right.sample_size
        assert left.raw_mean == right.raw_mean
        assert left.raw_std == right.raw_std or (np.isnan(left.raw_std) and np.isnan(right.raw_std))
        assert left.global_mean == right.global_mean
        assert left.global_std == right.global_std
        assert left.bayesian_shrunk_mean == right.bayesian_shrunk_mean
        assert left.severity == right.severity
        assert left.standard_error == right.standard_error
