from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

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
