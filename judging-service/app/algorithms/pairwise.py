import math
from typing import Dict, List, Optional, Sequence, Tuple

from ..models.schemas import PairwiseComparison, PairwiseRankResponse, PairwiseStanding


def pairwise_probability(theta_i: float, theta_j: float) -> float:
    """Return P(i beats j) for two positive Bradley-Terry skills."""
    if not math.isfinite(theta_i) or not math.isfinite(theta_j) or theta_i <= 0 or theta_j <= 0:
        raise ValueError("Bradley-Terry skills must be positive and finite")
    return theta_i / (theta_i + theta_j)


def _log_likelihood(
    comparisons: Sequence[PairwiseComparison],
    skills: Dict[str, float],
) -> float:
    total = 0.0
    for comparison in comparisons:
        winner = skills[comparison.winner]
        loser = skills[
            comparison.submission_b
            if comparison.winner == comparison.submission_a
            else comparison.submission_a
        ]
        log_winner = math.log(winner)
        log_loser = math.log(loser)
        log_denominator = max(log_winner, log_loser) + math.log1p(
            math.exp(-abs(log_winner - log_loser))
        )
        total += log_winner - log_denominator
    return total


def _validate_and_index(
    comparisons: Sequence[PairwiseComparison],
    project_ids: Optional[Sequence[str]],
) -> Tuple[List[str], Dict[str, int]]:
    declared_ids = set(project_ids) if project_ids is not None else set()
    if project_ids is not None and len(declared_ids) != len(project_ids):
        raise ValueError("project_ids must not contain duplicates")
    if any(not isinstance(project_id, str) or not project_id for project_id in declared_ids):
        raise ValueError("project IDs must be non-empty strings")

    observed_ids = set()
    edges = set()
    for comparison in comparisons:
        if not comparison.submission_a or not comparison.submission_b:
            raise ValueError("comparison project IDs must be non-empty")
        if comparison.submission_a == comparison.submission_b:
            raise ValueError("self-comparisons are not allowed")
        if comparison.winner not in (comparison.submission_a, comparison.submission_b):
            raise ValueError("winner must identify one of the compared projects")
        if project_ids is not None and (
            comparison.submission_a not in declared_ids
            or comparison.submission_b not in declared_ids
        ):
            raise ValueError("comparison contains an unknown project ID")
        observed_ids.update((comparison.submission_a, comparison.submission_b))
        edges.add(tuple(sorted((comparison.submission_a, comparison.submission_b))))

    ids = sorted(declared_ids if project_ids is not None else observed_ids)
    if len(ids) > 1:
        visited = {ids[0]}
        while True:
            newly_reached = {
                project_id
                for edge in edges
                for project_id in edge
                if edge[0] in visited or edge[1] in visited
            } - visited
            if not newly_reached:
                break
            visited.update(newly_reached)
        if len(visited) != len(ids):
            raise ValueError("comparison graph must be connected")
    return ids, {}

def run_bradley_terry(
    comparisons: List[PairwiseComparison],
    max_iterations: int = 100,
    tolerance: float = 1e-6,
    project_ids: Optional[Sequence[str]] = None,
) -> PairwiseRankResponse:
    if max_iterations <= 0:
        raise ValueError("max_iterations must be positive")
    if not math.isfinite(tolerance) or tolerance <= 0:
        raise ValueError("tolerance must be positive and finite")
    if not comparisons:
        return PairwiseRankResponse(
            status="success",
            total_comparisons=0,
            iterations_converged=0,
            standings=[],
            skill_ratings={},
            iterations=0,
            converged=True,
            log_likelihood=0.0,
            log_likelihood_history=[0.0],
        )

    items_list, _ = _validate_and_index(comparisons, project_ids)
    wins = {project_id: 0.0 for project_id in items_list}
    match_counts = {
        tuple(sorted((comparison.submission_a, comparison.submission_b))): 0.0
        for comparison in comparisons
    }
    for comparison in comparisons:
        wins[comparison.winner] += 1.0
        match_counts[tuple(sorted((comparison.submission_a, comparison.submission_b)))] += 1.0

    skills = {project_id: 1.0 / len(items_list) for project_id in items_list}
    likelihood_history = [_log_likelihood(comparisons, skills)]
    converged = False
    iterations = 0
    positive_floor = math.nextafter(0.0, 1.0)
    for iterations in range(1, max_iterations + 1):
        previous = skills.copy()
        updated = {}
        for project_id in items_list:
            denominator = 0.0
            for opponent_id in items_list:
                if opponent_id == project_id:
                    continue
                pair = tuple(sorted((project_id, opponent_id)))
                if pair in match_counts:
                    denominator += match_counts[pair] / (previous[project_id] + previous[opponent_id])
            updated[project_id] = max(wins[project_id] / denominator, positive_floor)

        scale = sum(updated.values())
        if not math.isfinite(scale) or scale <= 0:
            raise FloatingPointError("Bradley-Terry update became non-finite")
        skills = {project_id: updated[project_id] / scale for project_id in items_list}
        likelihood = _log_likelihood(comparisons, skills)
        likelihood_history.append(likelihood)
        max_change = max(abs(skills[project_id] - previous[project_id]) for project_id in items_list)
        if max_change <= tolerance:
            converged = True
            break

    # Build standings
    ranked_ids = sorted(items_list, key=lambda project_id: (-skills[project_id], project_id))
    standings = []
    for rank, project_id in enumerate(ranked_ids, start=1):
        standings.append(PairwiseStanding(
            submission_id=project_id,
            latent_score=skills[project_id],
            rank=rank
        ))

    return PairwiseRankResponse(
        status="success",
        total_comparisons=len(comparisons),
        iterations_converged=iterations,
        standings=standings,
        skill_ratings=skills,
        iterations=iterations,
        converged=converged,
        log_likelihood=likelihood_history[-1],
        log_likelihood_history=likelihood_history,
    )
