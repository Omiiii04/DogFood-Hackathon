from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import VotingAnomalyResponse


client = TestClient(app)


def payload(votes):
    return {"votes": votes}


def test_voting_anomalies_returns_typed_success_response():
    response = client.post(
        "/api/v1/voting-anomalies",
        json=payload(
            [
                {"submission_id": "a", "timestamp": 1000, "user_agent": "browser-a"},
                {"submission_id": "b", "timestamp": 1000, "user_agent": "browser-b"},
            ]
        ),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    VotingAnomalyResponse.model_validate(response.json())


def test_voting_anomalies_rejects_malformed_request():
    response = client.post(
        "/api/v1/voting-anomalies",
        json={"votes": [{"submission_id": "a"}]},
    )

    assert response.status_code == 422


def test_voting_anomalies_accepts_empty_vote_set():
    response = client.post("/api/v1/voting-anomalies", json=payload([]))

    assert response.status_code == 200
    assert response.json()["flagged_submissions"] == []


def test_voting_anomalies_accepts_existing_vote_field_aliases():
    response = client.post(
        "/api/v1/voting-anomalies",
        json=payload(
            [
                {"submission": "a", "votedAt": 1000, "userAgent": "browser-a"},
            ]
        ),
    )

    assert response.status_code == 200
    assert response.json()["total_votes"] == 1


def test_voting_anomalies_is_deterministic():
    request = payload(
        [
            {"submission_id": "a", "timestamp": 1000 + index, "user_agent": "script"}
            for index in range(4)
        ]
    )

    first = client.post("/api/v1/voting-anomalies", json=request)
    second = client.post("/api/v1/voting-anomalies", json=request)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()


def test_voting_anomalies_reports_velocity_anomaly():
    votes = [
        {"submission_id": f"normal-{index}", "timestamp": 1000, "user_agent": "browser-a"}
        for index in range(10)
    ]
    votes.extend(
        {"submission_id": "spike", "timestamp": 1000 + index * 0.5, "user_agent": "browser-a"}
        for index in range(50)
    )

    response = client.post("/api/v1/voting-anomalies", json=payload(votes))
    flagged = {item["submission_id"]: item for item in response.json()["flagged_submissions"]}

    assert response.status_code == 200
    assert "velocity_spike" in flagged["spike"]["reasons"]


def test_voting_anomalies_reports_low_entropy_and_combined_anomaly():
    votes = [
        {"submission_id": f"normal-{index}", "timestamp": 1000, "user_agent": f"browser-{index}"}
        for index in range(10)
    ]
    votes.extend(
        {"submission_id": "low", "timestamp": 1000 + index, "user_agent": "script"}
        for index in range(4)
    )
    votes.extend(
        {"submission_id": "both", "timestamp": 1000 + index * 0.5, "user_agent": "script"}
        for index in range(50)
    )

    response = client.post("/api/v1/voting-anomalies", json=payload(votes))
    flagged = {item["submission_id"]: item for item in response.json()["flagged_submissions"]}

    assert flagged["low"]["reasons"] == ["low_user_agent_entropy"]
    assert flagged["both"]["reasons"] == ["velocity_spike", "low_user_agent_entropy"]


def test_voting_anomalies_is_registered_in_openapi():
    openapi = client.get("/openapi.json").json()

    assert "/api/v1/voting-anomalies" in openapi["paths"]
