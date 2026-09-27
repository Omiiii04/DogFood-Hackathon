from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

class JudgeScoreEntry(BaseModel):
    judge_id: str = Field(..., description="Unique judge identifier")
    submission_id: str = Field(..., description="Unique project submission identifier")
    raw_composite_score: float = Field(..., ge=1.0, le=10.0, description="Raw weighted score")

class NormalizationRequest(BaseModel):
    event_id: str
    scores: List[JudgeScoreEntry]
    bayesian_prior_k: float = Field(default=3.0, ge=1.0, le=10.0)

class ProjectStanding(BaseModel):
    submission_id: str
    raw_mean: float
    normalized_score: float = Field(..., ge=0.0, le=100.0)
    z_score_mean: float
    ballot_count: int
    rank: int

class JudgeCalibrationMetric(BaseModel):
    judge_id: str
    sample_size: int
    raw_mean: float
    raw_std: float
    bayesian_shrunk_mean: float

class NormalizationResponse(BaseModel):
    status: str
    algorithm: str
    total_submissions: int
    total_scores_processed: int
    judge_calibrations: List[JudgeCalibrationMetric]
    standings: List[ProjectStanding]

class JudgeDiagnosticsRequest(BaseModel):
    scores: List[JudgeScoreEntry]
    bayesian_prior_k: float = Field(default=3.0, ge=0.0)

class JudgeCalibrationDiagnosticResponse(BaseModel):
    judge_id: str
    sample_size: int
    raw_mean: float
    raw_std: Optional[float]
    global_mean: float
    global_std: Optional[float]
    bayesian_shrunk_mean: float
    severity: str
    standard_error: Optional[float]

class JudgeDiagnosticsResponse(BaseModel):
    diagnostics: List[JudgeCalibrationDiagnosticResponse]

class PairwiseComparison(BaseModel):
    submission_a: str
    submission_b: str
    winner: str # submission_a or submission_b

class PairwiseRankRequest(BaseModel):
    comparisons: List[PairwiseComparison]
    max_iterations: int = 100
    tolerance: float = 1e-6

class PairwiseStanding(BaseModel):
    submission_id: str
    latent_score: float
    rank: int

class PairwiseRankResponse(BaseModel):
    status: str
    total_comparisons: int
    iterations_converged: int
    standings: List[PairwiseStanding]
    skill_ratings: Dict[str, float] = Field(default_factory=dict)
    iterations: int = 0
    converged: bool = False
    log_likelihood: float = 0.0
    log_likelihood_history: List[float] = Field(default_factory=list)

class AnomalyDetectionRequest(BaseModel):
    submission_id: str
    timestamps: List[float] # Unix epoch timestamps in seconds
    window_seconds: float = 60.0
    velocity_threshold: int = 15

class AnomalyDetectionResponse(BaseModel):
    submission_id: str
    is_anomalous: bool
    peak_velocity: int
    entropy: float
    message: str


class VoteRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    submission_id: str = Field(
        ...,
        min_length=1,
        validation_alias=AliasChoices("submission_id", "submissionId", "submission"),
    )
    timestamp: float = Field(
        ...,
        validation_alias=AliasChoices("timestamp", "votedAt", "createdAt"),
    )
    user_agent: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("user_agent", "userAgent"),
    )

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: Any) -> float:
        if isinstance(value, datetime):
            parsed = value
        elif isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            return value

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()

    @field_validator("timestamp")
    @classmethod
    def require_finite_timestamp(cls, value: float) -> float:
        import math

        if not math.isfinite(value):
            raise ValueError("timestamp must be finite")
        return value


class VotingAnomalyRequest(BaseModel):
    votes: List[VoteRecord]
    submission_ids: List[str] = Field(default_factory=list, min_length=0)


class FlaggedSubmission(BaseModel):
    submission_id: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    reasons: List[str] = Field(..., min_length=1)
    vote_count: int = Field(..., ge=0)
    velocity: float = Field(..., ge=0.0)
    velocity_z_score: float
    entropy: float = Field(..., ge=0.0)
    normalized_entropy: float = Field(..., ge=0.0, le=1.0)


class VotingAnomalyResponse(BaseModel):
    status: str
    total_votes: int = Field(..., ge=0)
    total_submissions: int = Field(..., ge=0)
    observation_window_seconds: float = Field(..., gt=0.0)
    tournament_mean_velocity: float = Field(..., ge=0.0)
    tournament_velocity_std: float = Field(..., ge=0.0)
    flagged_submissions: List[FlaggedSubmission]
