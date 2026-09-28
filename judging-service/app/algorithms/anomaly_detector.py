import math
from collections import Counter, defaultdict
from typing import List, Sequence

import numpy as np

from ..models.schemas import (
    AnomalyDetectionResponse,
    FlaggedSubmission,
    VoteRecord,
    VotingAnomalyResponse,
)


OBSERVATION_WINDOW_SECONDS = 60.0
LOW_ENTROPY_THRESHOLD = 0.2
MIN_ENTROPY_VOTES = 2
# ponytail: fixed rule-based score; calibrated modeling needs labeled review outcomes.


def calculate_user_agent_entropy(user_agents: Sequence[str | None]) -> tuple[float, float]:
    """Return raw natural-log entropy and entropy normalized to [0, 1]."""
    observed = [agent.strip() for agent in user_agents if agent and agent.strip()]
    if not observed:
        return 0.0, 0.0

    counts = Counter(observed)
    total = len(observed)
    entropy = -math.fsum(
        (count / total) * math.log(count / total) for count in counts.values()
    )
    if entropy == 0.0:
        entropy = 0.0
    normalized = entropy / math.log(len(counts)) if len(counts) > 1 else 0.0
    return entropy, normalized


def _peak_vote_count(timestamps: Sequence[float]) -> int:
    ordered = sorted(timestamps)
    left = 0
    peak = 0
    for right, timestamp in enumerate(ordered):
        while timestamp - ordered[left] > OBSERVATION_WINDOW_SECONDS:
            left += 1
        peak = max(peak, right - left + 1)
    return peak


def analyze_voting_anomalies(
    votes: Sequence[VoteRecord], submission_ids: Sequence[str] = ()
) -> VotingAnomalyResponse:
    """Detect review-worthy velocity and User-Agent diversity signals."""
    votes_by_submission: dict[str, list[VoteRecord]] = defaultdict(list)
    for vote in votes:
        votes_by_submission[vote.submission_id].append(vote)

    all_submission_ids = sorted(
        set(votes_by_submission).union(str(submission_id) for submission_id in submission_ids)
    )
    velocities = {
        submission_id: _peak_vote_count(
            [vote.timestamp for vote in votes_by_submission[submission_id]]
        )
        / OBSERVATION_WINDOW_SECONDS
        for submission_id in all_submission_ids
    }

    if velocities:
        mean_velocity = math.fsum(velocities.values()) / len(velocities)
    else:
        mean_velocity = 0.0
    if len(velocities) > 1:
        variance = math.fsum(
            (velocity - mean_velocity) ** 2 for velocity in velocities.values()
        ) / (len(velocities) - 1)
        std_velocity = math.sqrt(variance)
    else:
        std_velocity = 0.0
    velocity_threshold = mean_velocity + 3.0 * std_velocity

    flagged = []
    for submission_id in all_submission_ids:
        submission_votes = votes_by_submission[submission_id]
        velocity = velocities[submission_id]
        velocity_spike = std_velocity > 0.0 and velocity > velocity_threshold
        velocity_z_score = (
            (velocity - mean_velocity) / std_velocity if std_velocity > 0.0 else 0.0
        )
        user_agents = [vote.user_agent for vote in submission_votes]
        entropy, normalized_entropy = calculate_user_agent_entropy(user_agents)
        observed_user_agents = sum(bool(agent and agent.strip()) for agent in user_agents)
        low_entropy = (
            observed_user_agents >= MIN_ENTROPY_VOTES
            and normalized_entropy <= LOW_ENTROPY_THRESHOLD
        )

        reasons = []
        if velocity_spike:
            reasons.append("velocity_spike")
        if low_entropy:
            reasons.append("low_user_agent_entropy")
        if not reasons:
            continue

        flagged.append(
            FlaggedSubmission(
                submission_id=submission_id,
                risk_score=min(1.0, 0.5 * len(reasons)),
                reasons=reasons,
                vote_count=len(submission_votes),
                velocity=velocity,
                velocity_z_score=velocity_z_score,
                entropy=entropy,
                normalized_entropy=normalized_entropy,
            )
        )

    return VotingAnomalyResponse(
        status="success",
        total_votes=len(votes),
        total_submissions=len(all_submission_ids),
        observation_window_seconds=OBSERVATION_WINDOW_SECONDS,
        tournament_mean_velocity=mean_velocity,
        tournament_velocity_std=std_velocity,
        flagged_submissions=flagged,
    )

def detect_voting_anomalies(
    submission_id: str,
    timestamps: List[float],
    window_seconds: float = 60.0,
    velocity_threshold: int = 15
) -> AnomalyDetectionResponse:
    """Single-submission velocity burst and inter-arrival periodicity analyzer.

    Note: This is a standalone algorithm utility (tested directly in test_anomaly.py)
    providing a statistical review signal. It is not mounted as a public API route;
    the production tournament-wide voting anomaly endpoint is /api/v1/voting-anomalies.
    """
    if not timestamps or len(timestamps) < 2:
        return AnomalyDetectionResponse(
            submission_id=submission_id,
            is_anomalous=False,
            peak_velocity=len(timestamps),
            entropy=1.0,
            message="Insufficient voting data to detect anomalies."
        )

    # Sort timestamps
    sorted_ts = sorted(timestamps)

    # Compute sliding window velocity
    peak_velocity = 0
    left = 0
    for right in range(len(sorted_ts)):
        while sorted_ts[right] - sorted_ts[left] > window_seconds:
            left += 1
        current_window_count = right - left + 1
        if current_window_count > peak_velocity:
            peak_velocity = current_window_count

    # Compute inter-arrival time intervals
    intervals = np.diff(sorted_ts)
    if len(intervals) > 0 and np.sum(intervals) > 0:
        # Discretize intervals into bins to compute Shannon entropy
        hist, _ = np.histogram(intervals, bins=min(10, max(2, len(intervals))))
        probs = hist / np.sum(hist)
        # Filter 0
        probs = probs[probs > 0]
        entropy = -float(np.sum(probs * np.log2(probs)))
    else:
        entropy = 0.0

    # Flag condition: velocity exceeds threshold or unnaturally zero entropy (automated script)
    is_velocity_anomalous = peak_velocity >= velocity_threshold
    is_entropy_anomalous = len(intervals) > 10 and entropy < 0.2

    is_anomalous = is_velocity_anomalous or is_entropy_anomalous

    if is_velocity_anomalous:
        msg = f"Alert: Rapid velocity spike detected ({peak_velocity} votes within {int(window_seconds)}s)."
    elif is_entropy_anomalous:
        msg = "Alert: Unnatural timestamp periodicity detected (low inter-arrival entropy; requires organizer review)."
    else:
        msg = "Voting velocity pattern is normal."

    return AnomalyDetectionResponse(
        submission_id=submission_id,
        is_anomalous=is_anomalous,
        peak_velocity=peak_velocity,
        entropy=round(entropy, 3),
        message=msg
    )
