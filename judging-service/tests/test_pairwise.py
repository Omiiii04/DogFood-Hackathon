import math

import pytest

from app.algorithms.pairwise import pairwise_probability, run_bradley_terry
from app.models.schemas import PairwiseComparison


def comparison(winner, loser):
    return PairwiseComparison(submission_a=winner, submission_b=loser, winner=winner)


def synthetic_tournament():
    return [
        comparison("A", "B"),
        comparison("A", "C"),
        comparison("B", "C"),
        comparison("A", "B"),
        comparison("B", "C"),
    ]


def test_pairwise_bradley_terry_convergence():
    comparisons = [
        PairwiseComparison(submission_a="Alpha", submission_b="Beta", winner="Alpha"),
        PairwiseComparison(submission_a="Alpha", submission_b="Gamma", winner="Alpha"),
        PairwiseComparison(submission_a="Beta", submission_b="Gamma", winner="Beta"),
    ]

    response = run_bradley_terry(comparisons)

    assert response.status == "success"
    assert response.total_comparisons == 3
    assert len(response.standings) == 3

    # Alpha beat both Beta and Gamma -> Rank 1
    assert response.standings[0].submission_id == "Alpha"
    assert response.standings[0].rank == 1

    # Beta beat Gamma -> Rank 2
    assert response.standings[1].submission_id == "Beta"
    assert response.standings[1].rank == 2

    # Gamma lost both -> Rank 3
    assert response.standings[2].submission_id == "Gamma"
    assert response.standings[2].rank == 3


def test_probability_calculation():
    assert pairwise_probability(2.0, 1.0) == pytest.approx(2.0 / 3.0)


def test_known_repeated_comparison_case_preserves_order():
    response = run_bradley_terry(synthetic_tournament())
    assert [standing.submission_id for standing in response.standings] == ["A", "B", "C"]


def test_symmetry():
    response = run_bradley_terry([comparison("A", "B"), comparison("B", "A")])
    assert response.skill_ratings["A"] == pytest.approx(response.skill_ratings["B"])


def test_dominant_project_has_greater_skill():
    response = run_bradley_terry(
        [comparison("A", "B")] * 5
        + [comparison("A", "C")] * 5
        + [comparison("B", "C")]
    )
    assert response.skill_ratings["A"] > response.skill_ratings["B"]
    assert response.skill_ratings["B"] > response.skill_ratings["C"]


def test_determinism():
    first = run_bradley_terry(synthetic_tournament())
    second = run_bradley_terry(synthetic_tournament())
    assert first.skill_ratings == second.skill_ratings
    assert first.iterations == second.iterations
    assert first.converged == second.converged
    assert first.log_likelihood == second.log_likelihood


def test_convergence_and_positive_normalized_skills():
    response = run_bradley_terry(
        [comparison("A", "B"), comparison("B", "C"), comparison("C", "A")]
    )
    assert response.converged
    assert response.iterations <= 100
    assert all(skill > 0 and math.isfinite(skill) for skill in response.skill_ratings.values())
    assert sum(response.skill_ratings.values()) == pytest.approx(1.0)


def test_log_likelihood_does_not_decrease():
    response = run_bradley_terry(synthetic_tournament())
    for previous, current in zip(
        response.log_likelihood_history, response.log_likelihood_history[1:]
    ):
        assert current >= previous - 1e-12


def test_unknown_project_is_rejected_when_ids_are_declared():
    with pytest.raises(ValueError, match="unknown project"):
        run_bradley_terry([comparison("A", "X")], project_ids=["A", "B"])


def test_self_comparison_is_rejected():
    with pytest.raises(ValueError, match="self-comparisons"):
        run_bradley_terry(
            [PairwiseComparison(submission_a="A", submission_b="A", winner="A")]
        )


def test_invalid_comparison_is_rejected():
    with pytest.raises(ValueError, match="winner"):
        run_bradley_terry(
            [PairwiseComparison(submission_a="A", submission_b="B", winner="C")]
        )


def test_empty_input_is_explicit_and_safe():
    response = run_bradley_terry([])
    assert response.skill_ratings == {}
    assert response.iterations == 0
    assert response.converged
    assert response.log_likelihood == 0.0


def test_disconnected_graph_is_rejected():
    with pytest.raises(ValueError, match="connected"):
        run_bradley_terry(
            [comparison("A", "B"), comparison("C", "D")],
            project_ids=["A", "B", "C", "D"],
        )


def test_more_observations_keep_the_estimated_order():
    response = run_bradley_terry(synthetic_tournament() * 10)
    assert [standing.submission_id for standing in response.standings] == ["A", "B", "C"]
