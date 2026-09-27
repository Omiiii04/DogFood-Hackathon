import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import JudgeDiagnosticsResponse


client = TestClient(app)


def payload():
    return {
        "scores": [
            {"judge_id": "strict", "submission_id": f"s{i}", "raw_composite_score": 1.0}
            for i in range(5)
        ]
        + [
            {"judge_id": "balanced", "submission_id": f"b{i}", "raw_composite_score": 5.0}
            for i in range(5)
        ]
        + [
            {"judge_id": "lenient", "submission_id": f"l{i}", "raw_composite_score": 9.0}
            for i in range(5)
        ]
    }


def diagnostics(response):
    return {item["judge_id"]: item for item in response.json()["diagnostics"]}


def test_judge_diagnostics_returns_success_and_typed_response():
    response = client.post("/api/v1/judge-diagnostics", json=payload())

    assert response.status_code == 200
    JudgeDiagnosticsResponse.model_validate(response.json())


def test_judge_diagnostics_classifies_judges():
    result = diagnostics(client.post("/api/v1/judge-diagnostics", json=payload()))

    assert result["strict"]["severity"] == "Strict Grader"
    assert result["balanced"]["severity"] == "Balanced Grader"
    assert result["lenient"]["severity"] == "Lenient Grader"


def test_judge_diagnostics_keeps_exact_one_sigma_boundaries_balanced():
    response = client.post(
        "/api/v1/judge-diagnostics",
        json={
            "scores": [
                {"judge_id": "a", "submission_id": "a1", "raw_composite_score": 4.0},
                {"judge_id": "b", "submission_id": "b1", "raw_composite_score": 6.0},
            ]
        },
    )

    assert {item["severity"] for item in response.json()["diagnostics"]} == {
        "Balanced Grader"
    }


def test_judge_diagnostics_returns_sem():
    response = client.post(
        "/api/v1/judge-diagnostics",
        json={
            "scores": [
                {"judge_id": "a", "submission_id": "a1", "raw_composite_score": 3.0},
                {"judge_id": "a", "submission_id": "a2", "raw_composite_score": 5.0},
                {"judge_id": "a", "submission_id": "a3", "raw_composite_score": 7.0},
            ]
        },
    )

    assert response.json()["diagnostics"][0]["standard_error"] == pytest.approx(
        2.0 / 3**0.5
    )


def test_judge_diagnostics_singleton_sem_is_undefined_json_null():
    response = client.post(
        "/api/v1/judge-diagnostics",
        json={
            "scores": [
                {"judge_id": "a", "submission_id": "a1", "raw_composite_score": 5.0}
            ]
        },
    )

    item = response.json()["diagnostics"][0]
    assert item["sample_size"] == 1
    assert item["raw_std"] is None
    assert item["standard_error"] is None


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"scores": [{"judge_id": "a"}]},
        {"scores": [{"judge_id": "a", "submission_id": "s", "raw_composite_score": 11}]},
        {"scores": [{"judge_id": "a", "submission_id": "s", "raw_composite_score": "NaN"}]},
        {"scores": [{"judge_id": "a", "submission_id": "s", "raw_composite_score": "Infinity"}]},
        {"scores": [], "bayesian_prior_k": -1},
    ],
)
def test_judge_diagnostics_rejects_malformed_or_missing_fields(body):
    assert client.post("/api/v1/judge-diagnostics", json=body).status_code == 422


def test_judge_diagnostics_rejects_malformed_json():
    assert client.post("/api/v1/judge-diagnostics", content="{").status_code == 422


def test_judge_diagnostics_accepts_empty_scores_using_diagnostic_semantics():
    response = client.post("/api/v1/judge-diagnostics", json={"scores": []})

    assert response.status_code == 200
    assert response.json() == {"diagnostics": []}


def test_judge_diagnostics_is_deterministic():
    first = client.post("/api/v1/judge-diagnostics", json=payload()).json()
    second = client.post("/api/v1/judge-diagnostics", json=payload()).json()

    assert first == second


def test_judge_diagnostics_does_not_expose_unrelated_routes():
    assert client.post("/api/v1/pairwise-rank", json={}).status_code == 404
    assert set(app.openapi()["paths"]) == {
        "/health",
        "/api/v1/normalize",
        "/api/v1/judge-diagnostics",
    }


def test_judge_diagnostics_openapi_registers_post_and_schemas():
    operation = app.openapi()["paths"]["/api/v1/judge-diagnostics"]["post"]

    assert operation["requestBody"]["content"]["application/json"]["schema"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]
