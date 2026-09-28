import pytest
from app.algorithms.anomaly_detector import detect_voting_anomalies

def test_anomaly_velocity_spike():
    # 20 votes within 10 seconds (exceeds velocity_threshold of 15)
    timestamps = [1000.0 + (i * 0.5) for i in range(20)]

    response = detect_voting_anomalies("sub_spike", timestamps, window_seconds=60.0, velocity_threshold=15)
    assert response.is_anomalous is True
    assert response.peak_velocity == 20

def test_anomaly_normal_traffic():
    # 5 votes spread across 300 seconds
    timestamps = [1000.0, 1060.0, 1120.0, 1180.0, 1240.0]

    response = detect_voting_anomalies("sub_normal", timestamps, window_seconds=60.0, velocity_threshold=15)
    assert response.is_anomalous is False
    assert response.peak_velocity <= 2


def test_anomaly_periodicity_entropy():
    # 15 votes spaced with identical 10.0s intervals (len(intervals) > 10, entropy = 0.0)
    timestamps = [1000.0 + (i * 10.0) for i in range(15)]

    response = detect_voting_anomalies("sub_periodic", timestamps, window_seconds=60.0, velocity_threshold=15)
    assert response.is_anomalous is True
    assert response.entropy == 0.0
    assert "requires organizer review" in response.message
