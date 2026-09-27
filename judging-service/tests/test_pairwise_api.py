import math

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import PairwiseRankResponse


client = TestClient(app)


def ranking_payload():
    return {
        "comparisons": [
            {"submission_a": "A", "submission_b": "B", "winner": "A"},
            {"submission_a": "A", "submission_b": "C", "winner": "A"},
            {"submission_a": "B", "submission_b": "C", "winner": "B"},
        ]
    }


def test_successful_ranking_returns_expected_order():
    response = client.post("/api/v1/pairwise-rank", json=ranking_payload())

    assert response.status_code == 200
    body = response.json()
    assert [standing["submission_id"] for standing in body["standings"]] == ["A", "B", "C"]
    assert body["converged"] is False or body["converged"] is True
    assert isinstance(body["iterations"], int)
    assert isinstance(body["log_likelihood"], float)


def test_ratings_produce_a_valid_pairwise_probability():
    body = client.post("/api/v1/pairwise-rank", json=ranking_payload()).json()
    ratings = body["skill_ratings"]
    probability_a_beats_b = ratings["A"] / (ratings["A"] + ratings["B"])

    assert ratings["A"] > ratings["B"] > ratings["C"]
    assert 0 < probability_a_beats_b < 1


def test_response_matches_canonical_schema():
    response = client.post("/api/v1/pairwise-rank", json=ranking_payload())

    assert response.status_code == 200
    parsed = PairwiseRankResponse.model_validate(response.json())
    assert parsed.skill_ratings
    assert math.isfinite(parsed.log_likelihood)


def test_identical_requests_are_deterministic():
    first = client.post("/api/v1/pairwise-rank", json=ranking_payload()).json()
    second = client.post("/api/v1/pairwise-rank", json=ranking_payload()).json()

    assert second["skill_ratings"] == first["skill_ratings"]
    assert second["iterations"] == first["iterations"]
    assert second["converged"] == first["converged"]
    assert second["log_likelihood"] == first["log_likelihood"]


def test_self_comparison_is_rejected_as_domain_validation():
    response = client.post(
        "/api/v1/pairwise-rank",
        json={"comparisons": [{"submission_a": "A", "submission_b": "A", "winner": "A"}]},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "self-comparisons are not allowed"
    assert "Traceback" not in response.text


def test_unknown_project_is_rejected_when_project_ids_are_explicit():
    response = client.post(
        "/api/v1/pairwise-rank",
        json={
            "comparisons": [{"submission_a": "A", "submission_b": "X", "winner": "A"}],
            "project_ids": ["A", "B"],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "comparison contains an unknown project ID"


def test_disconnected_graph_is_returned_as_clean_domain_error():
    response = client.post(
        "/api/v1/pairwise-rank",
        json={
            "comparisons": [
                {"submission_a": "A", "submission_b": "B", "winner": "A"},
                {"submission_a": "C", "submission_b": "D", "winner": "C"},
            ],
            "project_ids": ["A", "B", "C", "D"],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "comparison graph must be connected"
    assert "Traceback" not in response.text


def test_empty_comparisons_follow_engine_behavior():
    response = client.post("/api/v1/pairwise-rank", json={"comparisons": []})

    assert response.status_code == 200
    assert response.json()["skill_ratings"] == {}
    assert response.json()["iterations"] == 0
    assert response.json()["converged"] is True
    assert response.json()["log_likelihood"] == 0.0


def test_malformed_payload_uses_fastapi_validation():
    response = client.post(
        "/api/v1/pairwise-rank",
        json={"comparisons": [{"submission_a": "A", "submission_b": "B"}]},
    )

    assert response.status_code == 422
    assert any(error["loc"][-1] == "winner" for error in response.json()["detail"])


def test_pairwise_rank_is_in_openapi_but_anomaly_route_is_not_exposed():
    openapi = client.get("/openapi.json")

    assert openapi.status_code == 200
    assert "/api/v1/pairwise-rank" in openapi.json()["paths"]
    assert "/api/v1/detect-anomaly" not in openapi.json()["paths"]


def test_docs_is_available():
    response = client.get("/docs")

    assert response.status_code == 200
