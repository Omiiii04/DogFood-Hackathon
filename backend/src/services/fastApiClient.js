const axios = require('axios');

const DEFAULT_JUDGING_URL = 'http://judging-service:8000';
const FASTAPI_URL = process.env.JUDGING_SERVICE_URL || DEFAULT_JUDGING_URL;
const NORMALIZE_ENDPOINT = '/api/v1/normalize';
const NORMALIZE_URL = `${FASTAPI_URL.replace(/\/+$/, '')}${NORMALIZE_ENDPOINT}`;

const fastApiClient = axios.create({
  baseURL: FASTAPI_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

fastApiClient.normalizeUrl = NORMALIZE_URL;
fastApiClient.normalizeEndpoint = NORMALIZE_ENDPOINT;

/**
 * Safely extract an identifier string from an ObjectId, object with _id, or string
 */
const extractId = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    if (typeof val.toHexString === 'function') return val.toHexString();
    if (val._id && val._id !== val) return extractId(val._id);
    if (typeof val.toString === 'function') {
      const str = val.toString();
      if (str && str !== '[object Object]') return str;
    }
  }
  return String(val);
};

/**
 * Extract raw composite score or calculate from criteriaScores
 * Clamps within [1.0, 10.0] as required by FastAPI NormalizationRequest schema
 */
const extractRawScore = (doc) => {
  let val = null;
  if (doc.rawCompositeScore != null && !isNaN(Number(doc.rawCompositeScore))) {
    val = Number(doc.rawCompositeScore);
  } else if (doc.totalRawScore != null && !isNaN(Number(doc.totalRawScore))) {
    val = Number(doc.totalRawScore);
  } else if (doc.raw_composite_score != null && !isNaN(Number(doc.raw_composite_score))) {
    val = Number(doc.raw_composite_score);
  } else if (Array.isArray(doc.criteriaScores) && doc.criteriaScores.length > 0) {
    let weightedSum = 0;
    let weightSum = 0;
    for (const c of doc.criteriaScores) {
      const s = Number(c.score ?? c.rawScore ?? c.raw_score ?? 0);
      const w = Number(c.weight ?? 1.0);
      weightedSum += s * w;
      weightSum += w;
    }
    val = weightSum > 0 ? weightedSum / weightSum : 1.0;
  }

  if (val == null || isNaN(val)) {
    val = 1.0;
  }

  const clamped = Math.min(10.0, Math.max(1.0, val));
  return Math.round(clamped * 1000) / 1000;
};

/**
 * Transform Mongoose Score records into NormalizationRequest payload
 */
const transformScoresToPayload = (eventId, scores, bayesianPriorK = 3.0) => {
  const transformedScores = [];

  if (Array.isArray(scores)) {
    for (const item of scores) {
      if (!item) continue;
      const doc = typeof item.toObject === 'function' ? item.toObject() : item;
      const judgeId = extractId(doc.judgeId || doc.judge || doc.judge_id);
      const submissionId = extractId(doc.submissionId || doc.submission || doc.submission_id);

      if (!judgeId || !submissionId) continue;

      const rawComposite = extractRawScore(doc);
      transformedScores.push({
        judge_id: judgeId,
        submission_id: submissionId,
        raw_composite_score: rawComposite,
      });
    }
  }

  return {
    event_id: String(eventId || 'default-event'),
    scores: transformedScores,
    bayesian_prior_k: Number(bayesianPriorK) || 3.0,
  };
};

/**
 * Compute fallback raw weighted average standings if FastAPI service is unreachable
 */
const computeFallbackStandings = (eventId, scores, bayesianPriorK = 3.0) => {
  const payload = transformScoresToPayload(eventId, scores, bayesianPriorK);
  const transformedScores = payload.scores;

  if (transformedScores.length === 0) {
    return {
      status: 'fallback',
      algorithm: 'raw_weighted_average_fallback',
      total_submissions: 0,
      total_scores_processed: 0,
      judge_calibrations: [],
      standings: [],
      is_fallback: true,
    };
  }

  // Group by submission
  const scoresBySubmission = {};
  for (const entry of transformedScores) {
    if (!scoresBySubmission[entry.submission_id]) {
      scoresBySubmission[entry.submission_id] = [];
    }
    scoresBySubmission[entry.submission_id].push(entry.raw_composite_score);
  }

  // Group by judge for calibrations
  const scoresByJudge = {};
  for (const entry of transformedScores) {
    if (!scoresByJudge[entry.judge_id]) {
      scoresByJudge[entry.judge_id] = [];
    }
    scoresByJudge[entry.judge_id].push(entry.raw_composite_score);
  }

  const judgeCalibrations = Object.entries(scoresByJudge).map(([jId, scoreList]) => {
    const n = scoreList.length;
    const mean = scoreList.reduce((acc, s) => acc + s, 0) / n;
    const variance = n > 1
      ? scoreList.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / (n - 1)
      : 0;
    const std = Math.sqrt(variance);

    return {
      judge_id: jId,
      sample_size: n,
      raw_mean: Number(mean.toFixed(3)),
      raw_std: Number(std.toFixed(3)),
      bayesian_shrunk_mean: Number(mean.toFixed(3)),
    };
  });

  const projectResults = [];
  for (const [subId, scoreList] of Object.entries(scoresBySubmission)) {
    const count = scoreList.length;
    const rawMean = scoreList.reduce((acc, s) => acc + s, 0) / count;
    projectResults.push({
      submission_id: subId,
      raw_mean: rawMean,
      ballot_count: count,
    });
  }

  // Sort descending by raw_mean
  projectResults.sort((a, b) => b.raw_mean - a.raw_mean);

  const standings = projectResults.map((p, idx) => {
    const rawMeanFixed = Number(p.raw_mean.toFixed(2));
    const normalizedScore = Number(
      Math.min(100, Math.max(0, p.raw_mean > 10 ? p.raw_mean : p.raw_mean * 10)).toFixed(2)
    );

    return {
      submission_id: p.submission_id,
      raw_mean: rawMeanFixed,
      normalized_score: normalizedScore,
      raw_weighted_average: rawMeanFixed,
      z_score_mean: 0,
      z_mean: 0,
      ballot_count: p.ballot_count,
      rank: idx + 1,
    };
  });

  return {
    status: 'fallback',
    algorithm: 'raw_weighted_average_fallback',
    total_submissions: standings.length,
    total_scores_processed: transformedScores.length,
    judge_calibrations: judgeCalibrations,
    standings,
    is_fallback: true,
  };
};

/**
 * Call FastAPI scoring normalization microservice with graceful fallback
 */
const normalizeScores = async (eventId, scores, bayesianPriorK = 3.0) => {
  const payload = transformScoresToPayload(eventId, scores, bayesianPriorK);

  if (payload.scores.length === 0) {
    return {
      status: 'success',
      algorithm: 'z_score_bayesian_shrinkage',
      total_submissions: 0,
      total_scores_processed: 0,
      judge_calibrations: [],
      standings: [],
    };
  }

  try {
    const endpoint = fastApiClient.defaults.baseURL?.endsWith(NORMALIZE_ENDPOINT)
      ? ''
      : NORMALIZE_ENDPOINT;
    const response = await fastApiClient.post(endpoint, payload);
    const data = response.data;
    if (data && Array.isArray(data.standings)) {
      data.standings.forEach((s) => {
        if (s.z_mean === undefined && s.z_score_mean !== undefined) {
          s.z_mean = s.z_score_mean;
        }
        if (s.z_score_mean === undefined && s.z_mean !== undefined) {
          s.z_score_mean = s.z_mean;
        }
      });
    }
    return data;
  } catch (error) {
    console.error(
      `[CRITICAL] FastAPI judging-service unreachable at ${fastApiClient.defaults.baseURL || FASTAPI_URL}${NORMALIZE_ENDPOINT}: ${error.message}. Computing fallback raw weighted average.`
    );
    return computeFallbackStandings(eventId, scores, bayesianPriorK);
  }
};

/**
 * Call FastAPI Bradley-Terry pairwise ranking model
 */
const computePairwiseRankings = async (comparisons, maxIterations = 100, tolerance = 1e-6) => {
  try {
    const response = await fastApiClient.post('/api/v1/pairwise-rank', {
      comparisons,
      max_iterations: maxIterations,
      tolerance,
    });
    return response.data;
  } catch (error) {
    console.error('[FastAPI Client Error] Pairwise call failed:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.detail || 'Failed to compute pairwise rankings.'
    );
  }
};

/**
 * Check health of judging-service
 */
const checkJudgingServiceHealth = async () => {
  try {
    const response = await fastApiClient.get('/health');
    return response.data;
  } catch (error) {
    return { status: 'down', error: error.message };
  }
};

fastApiClient.fastApiClient = fastApiClient;
fastApiClient.normalizeScores = normalizeScores;
fastApiClient.computePairwiseRankings = computePairwiseRankings;
fastApiClient.checkJudgingServiceHealth = checkJudgingServiceHealth;
fastApiClient.transformScoresToPayload = transformScoresToPayload;
fastApiClient.computeFallbackStandings = computeFallbackStandings;
fastApiClient.FASTAPI_URL = FASTAPI_URL;
fastApiClient.NORMALIZE_URL = NORMALIZE_URL;

module.exports = fastApiClient;
module.exports.fastApiClient = fastApiClient;
module.exports.normalizeScores = normalizeScores;
module.exports.computePairwiseRankings = computePairwiseRankings;
module.exports.checkJudgingServiceHealth = checkJudgingServiceHealth;
module.exports.transformScoresToPayload = transformScoresToPayload;
module.exports.computeFallbackStandings = computeFallbackStandings;
module.exports.FASTAPI_URL = FASTAPI_URL;
module.exports.NORMALIZE_URL = NORMALIZE_URL;
