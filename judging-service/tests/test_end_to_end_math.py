import math
from statistics import mean, stdev

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.algorithms.diagnostics import calculate_judge_diagnostics
from app.algorithms.normalization import (
    calculate_empirical_bayesian_shrinkage,
    calculate_shrunk_mean,
    run_normalization,
)
from app.main import app
from app.models.schemas import JudgeScoreEntry
from tests.test_variance_benchmark import run_benchmark


WEIGHTS = {"technical": 0.5, "impact": 0.3, "polish": 0.2}
REFERENCE_PRIOR_K = 3.0
REFERENCE_EPSILON = 1e-6
PROJECT_IDS = ("project-1", "project-2", "project-3", "project-4", "project-5")
JUDGE_IDS = ("judge-harsh", "judge-neutral", "judge-lenient", "judge-small")


def _criteria(value, *, impact=None, polish=None):
    return {
        "technical": float(value),
        "impact": float(value if impact is None else impact),
        "polish": float(value if polish is None else polish),
    }


BALLOTS = (
    *(
        {"judge_id": "judge-harsh", "submission_id": project_id, "criteria": _criteria(value)}
        for project_id, value in zip(PROJECT_IDS, (1, 2, 3, 4, 5))
    ),
    *(
        {"judge_id": "judge-neutral", "submission_id": project_id, "criteria": _criteria(value)}
        for project_id, value in zip(PROJECT_IDS, (4, 5, 6, 7, 8))
    ),
    *(
        {"judge_id": "judge-lenient", "submission_id": project_id, "criteria": _criteria(value)}
        for project_id, value in zip(PROJECT_IDS, (7, 8, 9, 9, 10))
    ),
    {
        "judge_id": "judge-small",
        "submission_id": "project-3",
        "criteria": _criteria(5, impact=6, polish=5),
    },
)


def weighted_composite(criteria):
    """Independent reference calculation for the rubric-weighted ballot value."""
    return sum(criteria[key] * WEIGHTS[key] for key in WEIGHTS)


def reference_calculation():
    """Calculate the documented pipeline without calling production math helpers."""
    ballots = [
        {
            **ballot,
            "raw_score": weighted_composite(ballot["criteria"]),
        }
        for ballot in BALLOTS
    ]
    scores_by_judge = {judge_id: [] for judge_id in JUDGE_IDS}
    for ballot in ballots:
        scores_by_judge[ballot["judge_id"]].append(ballot["raw_score"])

    all_scores = [ballot["raw_score"] for ballot in ballots]
    global_mean = mean(all_scores)
    global_std = stdev(all_scores)
    judge_stats = {}
    for judge_id, scores in scores_by_judge.items():
        sample_size = len(scores)
        raw_mean = mean(scores)
        raw_std = stdev(scores) if sample_size > 1 else math.nan
        shrunk_mean = (
            sample_size * raw_mean + REFERENCE_PRIOR_K * global_mean
        ) / (sample_size + REFERENCE_PRIOR_K)
        raw_variance = 0.0 if math.isnan(raw_std) else raw_std**2
        shrunk_std = math.sqrt(
            sample_size / (sample_size + REFERENCE_PRIOR_K) * raw_variance
            + REFERENCE_PRIOR_K / (sample_size + REFERENCE_PRIOR_K) * global_std**2
        )
        judge_stats[judge_id] = {
            "sample_size": sample_size,
            "raw_mean": raw_mean,
            "raw_std": raw_std,
            "shrunk_mean": shrunk_mean,
            "shrunk_std": shrunk_std,
            "sem": raw_std / math.sqrt(sample_size) if sample_size > 1 else math.nan,
        }

    for ballot in ballots:
        stats = judge_stats[ballot["judge_id"]]
        ballot["z_score"] = (
            ballot["raw_score"] - stats["shrunk_mean"]
        ) / (stats["shrunk_std"] + REFERENCE_EPSILON)

    projects = {}
    for project_id in PROJECT_IDS:
        project_ballots = [b for b in ballots if b["submission_id"] == project_id]
        projects[project_id] = {
            "raw_mean": mean([b["raw_score"] for b in project_ballots]),
            "z_mean": mean([b["z_score"] for b in project_ballots]),
            "ballot_count": len(project_ballots),
        }

    z_values = [project["z_mean"] for project in projects.values()]
    min_z, max_z = min(z_values), max(z_values)
    final_scores = {
        project_id: 100.0 * (project["z_mean"] - min_z) / (max_z - min_z + REFERENCE_EPSILON)
        for project_id, project in projects.items()
    }
    ranking = tuple(sorted(PROJECT_IDS, key=lambda project_id: (-final_scores[project_id], project_id)))
    return {
        "ballots": ballots,
        "global_mean": global_mean,
        "global_std": global_std,
        "judge_stats": judge_stats,
        "projects": projects,
        "final_scores": final_scores,
        "ranking": ranking,
    }


def production_scores(reference):
    return [
        JudgeScoreEntry(
            judge_id=ballot["judge_id"],
            submission_id=ballot["submission_id"],
            raw_composite_score=ballot["raw_score"],
        )
        for ballot in reference["ballots"]
    ]


def production_matrix(reference):
    values = np.full((len(JUDGE_IDS), len(PROJECT_IDS)), np.nan)
    mask = np.zeros(values.shape, dtype=bool)
    judge_indexes = {judge_id: index for index, judge_id in enumerate(JUDGE_IDS)}
    project_indexes = {project_id: index for index, project_id in enumerate(PROJECT_IDS)}
    for ballot in reference["ballots"]:
        judge_index = judge_indexes[ballot["judge_id"]]
        project_index = project_indexes[ballot["submission_id"]]
        values[judge_index, project_index] = ballot["raw_score"]
        mask[judge_index, project_index] = True
    return values, mask


def response_by_project(response):
    return {standing.submission_id: standing for standing in response.standings}


def test_five_project_reference_matches_production_standings():
    reference = reference_calculation()
    response = run_normalization(production_scores(reference))
    production = response_by_project(response)

    assert set(production) == set(PROJECT_IDS)
    for project_id in PROJECT_IDS:
        assert production[project_id].raw_mean == pytest.approx(
            round(reference["projects"][project_id]["raw_mean"], 2)
        )
        assert production[project_id].z_score_mean == pytest.approx(
            round(reference["projects"][project_id]["z_mean"], 4)
        )
        assert production[project_id].normalized_score == pytest.approx(
            round(reference["final_scores"][project_id], 2)
        )


def test_judge_level_raw_statistics_match_reference():
    reference = reference_calculation()
    values, mask = production_matrix(reference)
    diagnostics = calculate_judge_diagnostics(values, mask, judge_ids=JUDGE_IDS)

    for diagnostic in diagnostics:
        expected = reference["judge_stats"][diagnostic.judge_id]
        assert diagnostic.sample_size == expected["sample_size"]
        assert diagnostic.raw_mean == pytest.approx(expected["raw_mean"])
        if math.isnan(expected["raw_std"]):
            assert math.isnan(diagnostic.raw_std)
        else:
            assert diagnostic.raw_std == pytest.approx(expected["raw_std"])
    assert diagnostics[0].global_mean == pytest.approx(reference["global_mean"])
    assert diagnostics[0].global_std == pytest.approx(reference["global_std"])


def test_bayesian_mean_matches_reference():
    reference = reference_calculation()
    for judge_id, stats in reference["judge_stats"].items():
        actual = calculate_shrunk_mean(
            stats["raw_mean"], stats["sample_size"], reference["global_mean"], REFERENCE_PRIOR_K
        )
        assert actual == pytest.approx(stats["shrunk_mean"])


def test_bayesian_variance_matches_reference():
    reference = reference_calculation()
    values, mask = production_matrix(reference)
    result = calculate_empirical_bayesian_shrinkage(
        values, mask, judge_ids=JUDGE_IDS, prior_k=REFERENCE_PRIOR_K
    )

    assert result.global_mean == pytest.approx(reference["global_mean"])
    assert result.global_std == pytest.approx(reference["global_std"])
    for judge_result in result.judge_results:
        expected = reference["judge_stats"][judge_result.judge_id]
        if math.isnan(expected["raw_std"]):
            assert math.isnan(judge_result.raw_std)
        else:
            assert judge_result.raw_std == pytest.approx(expected["raw_std"])
        assert judge_result.shrunk_std == pytest.approx(expected["shrunk_std"])


def test_calibrated_z_scores_match_reference():
    reference = reference_calculation()
    values, mask = production_matrix(reference)
    result = calculate_empirical_bayesian_shrinkage(
        values, mask, judge_ids=JUDGE_IDS, prior_k=REFERENCE_PRIOR_K
    )
    expected = np.full(values.shape, np.nan)
    judge_indexes = {judge_id: index for index, judge_id in enumerate(JUDGE_IDS)}
    project_indexes = {project_id: index for index, project_id in enumerate(PROJECT_IDS)}
    for ballot in reference["ballots"]:
        expected[
            judge_indexes[ballot["judge_id"]], project_indexes[ballot["submission_id"]]
        ] = ballot["z_score"]

    np.testing.assert_allclose(result.calibrated_z_scores, expected, rtol=1e-12, atol=1e-12, equal_nan=True)


def test_weighted_criterion_aggregation_matches_reference():
    reference = reference_calculation()
    for ballot in reference["ballots"]:
        expected = sum(ballot["criteria"][key] * WEIGHTS[key] for key in WEIGHTS)
        assert ballot["raw_score"] == pytest.approx(expected)
        assert 1.0 <= ballot["raw_score"] <= 10.0


def test_final_scores_match_reference_and_are_bounded():
    reference = reference_calculation()
    response = run_normalization(production_scores(reference))
    production = response_by_project(response)
    for project_id, expected_score in reference["final_scores"].items():
        assert 0.0 <= production[project_id].normalized_score <= 100.0
        assert production[project_id].normalized_score == pytest.approx(round(expected_score, 2))


def test_final_ranking_matches_reference():
    reference = reference_calculation()
    response = run_normalization(production_scores(reference))

    assert tuple(standing.submission_id for standing in response.standings) == reference["ranking"]
    assert tuple(standing.rank for standing in response.standings) == (1, 2, 3, 4, 5)


def test_judge_severity_and_sem_match_reference():
    reference = reference_calculation()
    values, mask = production_matrix(reference)
    diagnostics = calculate_judge_diagnostics(values, mask, judge_ids=JUDGE_IDS)
    expected_severity = {
        "judge-harsh": "Strict Grader",
        "judge-neutral": "Balanced Grader",
        "judge-lenient": "Lenient Grader",
        "judge-small": "Balanced Grader",
    }

    for diagnostic in diagnostics:
        expected = reference["judge_stats"][diagnostic.judge_id]
        assert diagnostic.severity == expected_severity[diagnostic.judge_id]
        if math.isnan(expected["sem"]):
            assert math.isnan(diagnostic.standard_error)
        else:
            assert diagnostic.standard_error == pytest.approx(expected["sem"])


def test_fastapi_response_matches_reference_calculation():
    reference = reference_calculation()
    payload = {
        "event_id": "wbs-44-deterministic-fixture",
        "scores": [score.model_dump() for score in production_scores(reference)],
        "bayesian_prior_k": REFERENCE_PRIOR_K,
    }
    response = TestClient(app).post("/api/v1/normalize", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["total_submissions"] == len(PROJECT_IDS)
    assert body["total_scores_processed"] == len(reference["ballots"])
    assert [item["submission_id"] for item in body["standings"]] == list(reference["ranking"])
    for item in body["standings"]:
        project_id = item["submission_id"]
        assert item["normalized_score"] == pytest.approx(round(reference["final_scores"][project_id], 2))
        assert item["z_score_mean"] == pytest.approx(round(reference["projects"][project_id]["z_mean"], 4))


def test_wbs38_variance_benchmark_remains_qualified():
    result = run_benchmark()

    assert result.raw_metric == pytest.approx(4.294584743741017, abs=1e-12)
    assert result.normalized_metric == pytest.approx(0.09136752254529971, abs=1e-12)
    assert result.reduction_percent == pytest.approx(97.87249459500224, abs=1e-12)
    assert result.qualifies


def test_ten_run_end_to_end_determinism():
    snapshots = []
    for _ in range(10):
        reference = reference_calculation()
        response = run_normalization(production_scores(reference))
        values, mask = production_matrix(reference)
        diagnostics = calculate_judge_diagnostics(values, mask, judge_ids=JUDGE_IDS)
        benchmark = run_benchmark()
        snapshots.append(
            (
                tuple((b["judge_id"], b["submission_id"], round(b["z_score"], 12)) for b in reference["ballots"]),
                tuple((s.submission_id, s.normalized_score, s.z_score_mean, s.rank) for s in response.standings),
                tuple(
                    (d.judge_id, d.raw_mean, None if math.isnan(d.raw_std) else d.raw_std,
                     d.bayesian_shrunk_mean, d.severity)
                    for d in diagnostics
                ),
                (benchmark.raw_metric, benchmark.normalized_metric, benchmark.reduction_percent, benchmark.normalized_order),
            )
        )

    assert all(snapshot == snapshots[0] for snapshot in snapshots[1:])
