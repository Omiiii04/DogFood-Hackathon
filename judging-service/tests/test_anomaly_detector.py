import math

import pytest

from app.algorithms.anomaly_detector import (
    OBSERVATION_WINDOW_SECONDS,
    analyze_voting_anomalies,
    calculate_user_agent_entropy,
)
from app.models.schemas import VoteRecord


def vote(submission_id, timestamp, user_agent="browser-a"):
    return VoteRecord(
        submission_id=submission_id,
        timestamp=timestamp,
        user_agent=user_agent,
    )


def normal_fixture(submission_count=10):
    votes = []
    for index in range(submission_count):
        submission_id = f"normal-{index}"
        votes.extend(
            [
                vote(submission_id, 1000 + index * 3, "browser-a"),
                vote(submission_id, 1001 + index * 3, "browser-b"),
                vote(submission_id, 1002 + index * 3, "browser-a"),
                vote(submission_id, 1003 + index * 3, "browser-b"),
            ]
        )
    return votes


def test_normal_voting_is_not_flagged():
    result = analyze_voting_anomalies(normal_fixture())

    assert result.flagged_submissions == []


def test_velocity_spike_uses_tournament_three_sigma_rule():
    votes = normal_fixture()
    votes.extend(vote("spike", 1000 + index * 0.5, f"browser-{index % 2}") for index in range(50))

    result = analyze_voting_anomalies(votes)
    flagged = next(item for item in result.flagged_submissions if item.submission_id == "spike")

    assert "velocity_spike" in flagged.reasons
    assert flagged.velocity_z_score > 3.0
    assert flagged.velocity == pytest.approx(50 / OBSERVATION_WINDOW_SECONDS)


def test_velocity_boundary_is_strictly_greater_than_three_sigma():
    result = analyze_voting_anomalies(
        [vote("same-a", 1000, "browser-a"), vote("same-b", 1000, "browser-b")]
    )

    assert result.tournament_velocity_std == 0.0
    assert result.flagged_submissions == []


def test_low_entropy_is_flagged_without_velocity_spike():
    votes = normal_fixture()
    votes.extend(vote("low-entropy", 1000 + index, "script") for index in range(4))

    result = analyze_voting_anomalies(votes)
    flagged = next(item for item in result.flagged_submissions if item.submission_id == "low-entropy")

    assert flagged.reasons == ["low_user_agent_entropy"]
    assert flagged.entropy == 0.0
    assert flagged.normalized_entropy == 0.0


def test_mixed_anomaly_gets_both_reasons_and_maximum_rule_score():
    votes = normal_fixture()
    votes.extend(vote("both", 1000 + index * 0.5, "script") for index in range(50))

    flagged = next(
        item
        for item in analyze_voting_anomalies(votes).flagged_submissions
        if item.submission_id == "both"
    )

    assert flagged.reasons == ["velocity_spike", "low_user_agent_entropy"]
    assert flagged.risk_score == 1.0


def test_entropy_matches_known_distribution():
    entropy, normalized = calculate_user_agent_entropy(
        ["a", "a", "b", "c"]
    )

    assert entropy == pytest.approx(-(0.5 * math.log(0.5) + 2 * 0.25 * math.log(0.25)))
    assert normalized == pytest.approx(entropy / math.log(3))


def test_single_user_agent_has_zero_entropy():
    assert calculate_user_agent_entropy(["same", "same", "same"]) == (0.0, 0.0)


def test_missing_user_agent_is_ignored_without_crashing_or_flagging_entropy():
    votes = normal_fixture()
    votes.extend(vote("missing", 1000 + index, None) for index in range(4))

    result = analyze_voting_anomalies(votes)
    assert all(item.submission_id != "missing" for item in result.flagged_submissions)


def test_zero_velocity_variance_has_finite_scores():
    votes = [
        vote("a", 1000, "browser-a"),
        vote("b", 1000, "browser-b"),
        vote("c", 1000, "browser-c"),
    ]

    result = analyze_voting_anomalies(votes)

    assert result.tournament_velocity_std == 0.0
    assert all(math.isfinite(item.velocity_z_score) for item in result.flagged_submissions)
    assert result.flagged_submissions == []


def test_empty_input_returns_deterministic_empty_response():
    result = analyze_voting_anomalies([])

    assert result.status == "success"
    assert result.total_votes == 0
    assert result.total_submissions == 0
    assert result.flagged_submissions == []


def test_identical_input_is_deterministic_across_repeated_runs():
    votes = normal_fixture() + [vote("both", 1000 + index * 0.5, "script") for index in range(50)]

    results = [analyze_voting_anomalies(votes).model_dump() for _ in range(10)]

    assert all(result == results[0] for result in results)


def test_deterministic_fixture_contains_normal_velocity_entropy_and_mixed_cases():
    votes = normal_fixture(100)
    votes.extend(vote("velocity", 1000 + index * 0.5, f"browser-{index % 2}") for index in range(50))
    votes.extend(vote("low-entropy", 1000 + index, "script") for index in range(4))
    votes.extend(vote("both", 1000 + index * 0.5, "script") for index in range(50))

    result = analyze_voting_anomalies(votes)
    flagged = {item.submission_id: item for item in result.flagged_submissions}

    assert {"velocity", "low-entropy", "both"}.issubset(flagged)
    assert all(f"normal-{index}" not in flagged for index in range(100))
    assert flagged["velocity"].reasons == ["velocity_spike"]
    assert flagged["low-entropy"].reasons == ["low_user_agent_entropy"]
    assert flagged["both"].reasons == ["velocity_spike", "low_user_agent_entropy"]
