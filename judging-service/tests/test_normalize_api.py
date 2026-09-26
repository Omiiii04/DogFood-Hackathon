import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import NormalizationResponse


client = TestClient(app)


def worked_example_payload(bayesian_prior_k=3.0):
    return {
        "event_id": "event-1",
        "scores": [
            {"judge_id": "JudgeA", "submission_id": "Proj1", "raw_composite_score": 5.0},
            {"judge_id": "JudgeA", "submission_id": "Proj2", "raw_composite_score": 3.0},
            {"judge_id": "JudgeB", "submission_id": "Proj3", "raw_composite_score": 9.0},
            {"judge_id": "JudgeB", "submission_id": "Proj4", "raw_composite_score": 8.0},
        ],
        "bayesian_prior_k": bayesian_prior_k,
    }


def test_normalize_returns_canonical_success_response():
    response = client.post("/api/v1/normalize", json=worked_example_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["total_submissions"] == 4
    assert body["total_scores_processed"] == 4
    assert body["judge_calibrations"]
    assert body["standings"]
    NormalizationResponse.model_validate(body)


def test_normalize_matches_known_pipeline_example():
    response = client.post("/api/v1/normalize", json=worked_example_payload())

    standings = {item["submission_id"]: item for item in response.json()["standings"]}
    assert standings["Proj1"]["normalized_score"] == pytest.approx(46.37)
    assert standings["Proj2"]["normalized_score"] == pytest.approx(0.0)
    assert standings["Proj3"]["normalized_score"] == pytest.approx(100.0)
    assert standings["Proj4"]["normalized_score"] == pytest.approx(75.4)


@pytest.mark.parametrize(
    "payload",
    [
        {"scores": [], "bayesian_prior_k": 3.0},
        {"event_id": "event-1", "scores": [{"judge_id": "j"}], "bayesian_prior_k": 3.0},
        {"event_id": "event-1", "scores": [{"judge_id": "j", "submission_id": "s", "raw_composite_score": 11.0}]},
        {"event_id": "event-1", "scores": [], "bayesian_prior_k": 0.0},
    ],
)
def test_normalize_rejects_invalid_payload(payload):
    assert client.post("/api/v1/normalize", json=payload).status_code == 422


def test_normalize_rejects_malformed_json():
    assert client.post("/api/v1/normalize", content="{").status_code == 422


def test_normalize_empty_scores_uses_pipeline_empty_response():
    response = client.post(
        "/api/v1/normalize",
        json={"event_id": "event-1", "scores": [], "bayesian_prior_k": 3.0},
    )

    assert response.status_code == 200
    assert response.json()["total_submissions"] == 0
    assert response.json()["standings"] == []


def test_normalize_is_deterministic_and_forwards_bayesian_prior():
    payload = worked_example_payload()
    first = client.post("/api/v1/normalize", json=payload).json()
    second = client.post("/api/v1/normalize", json=payload).json()
    changed_prior = client.post(
        "/api/v1/normalize", json=worked_example_payload(bayesian_prior_k=10.0)
    ).json()

    assert first == second
    assert first["standings"] != changed_prior["standings"]


def test_normalize_does_not_expose_unrelated_routes():
    assert client.post("/api/v1/pairwise-rank", json={}).status_code == 404
    assert client.post("/api/v1/detect-anomaly", json={}).status_code == 404


def test_normalize_does_not_expose_unexpected_exception_details(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("internal detail")

    monkeypatch.setattr("app.routes.normalize.run_normalization", fail)
    error_client = TestClient(app, raise_server_exceptions=False)

    response = error_client.post("/api/v1/normalize", json=worked_example_payload())

    assert response.status_code == 500
    assert response.text == "Internal Server Error"


def test_normalize_supports_concurrent_async_requests():
    async def post_normalize():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
            return await async_client.post("/api/v1/normalize", json=worked_example_payload())

    async def run_many():
        return await asyncio.gather(*(post_normalize() for _ in range(3)))

    responses = asyncio.run(run_many())
    assert [response.status_code for response in responses] == [200, 200, 200]
    assert responses[0].json() == responses[1].json() == responses[2].json()
