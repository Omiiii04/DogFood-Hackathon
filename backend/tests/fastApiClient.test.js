const mongoose = require('mongoose');
const fastApiClient = require('../src/services/fastApiClient');
const {
  normalizeScores,
  transformScoresToPayload,
  computeFallbackStandings,
  computePairwiseRankings,
  checkJudgingServiceHealth,
  FASTAPI_URL,
  NORMALIZE_URL,
} = fastApiClient;

describe('FastAPI Client & Score Normalization Service', () => {
  describe('Axios Client Configuration', () => {
    it('should be configured with 5000ms timeout', () => {
      expect(fastApiClient.defaults.timeout).toBe(5000);
    });

    it('should default baseURL to http://judging-service:8000 when env is not set', () => {
      expect(fastApiClient.defaults.baseURL).toMatch(/http:\/\/judging-service:8000/);
    });

    it('should configure internal normalize URL', () => {
      expect(NORMALIZE_URL).toBe('http://judging-service:8000/api/v1/normalize');
    });

    it('should have Content-Type application/json header', () => {
      expect(fastApiClient.defaults.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Transform Mongoose Score records into NormalizationRequest payload', () => {
    it('should transform plain score objects with judgeId, submissionId, totalRawScore', () => {
      const mockScores = [
        {
          judgeId: new mongoose.Types.ObjectId(),
          submissionId: new mongoose.Types.ObjectId(),
          totalRawScore: 8.5,
        },
        {
          judgeId: new mongoose.Types.ObjectId(),
          submissionId: new mongoose.Types.ObjectId(),
          totalRawScore: 9.0,
        },
      ];

      const payload = transformScoresToPayload('event-123', mockScores, 3.0);

      expect(payload.event_id).toBe('event-123');
      expect(payload.bayesian_prior_k).toBe(3.0);
      expect(payload.scores).toHaveLength(2);
      expect(payload.scores[0].judge_id).toBe(mockScores[0].judgeId.toString());
      expect(payload.scores[0].submission_id).toBe(mockScores[0].submissionId.toString());
      expect(payload.scores[0].raw_composite_score).toBe(8.5);
    });

    it('should transform Mongoose documents with .toObject() method', () => {
      const judgeId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();
      const mockDoc = {
        toObject: () => ({
          judge: judgeId,
          submission: submissionId,
          rawCompositeScore: 7.25,
        }),
      };

      const payload = transformScoresToPayload('event-456', [mockDoc]);

      expect(payload.scores).toHaveLength(1);
      expect(payload.scores[0].judge_id).toBe(judgeId.toString());
      expect(payload.scores[0].submission_id).toBe(submissionId.toString());
      expect(payload.scores[0].raw_composite_score).toBe(7.25);
    });

    it('should compute composite score from criteriaScores if rawCompositeScore is missing', () => {
      const judgeId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();
      const mockScore = {
        judgeId,
        submissionId,
        criteriaScores: [
          { key: 'tech', score: 8.0, weight: 0.5 },
          { key: 'ui', score: 6.0, weight: 0.5 },
        ],
      };

      const payload = transformScoresToPayload('event-789', [mockScore]);

      expect(payload.scores).toHaveLength(1);
      // (8 * 0.5 + 6 * 0.5) / 1.0 = 7.0
      expect(payload.scores[0].raw_composite_score).toBe(7.0);
    });

    it('should clamp raw scores within [1.0, 10.0] as required by NormalizationRequest schema', () => {
      const mockScores = [
        {
          judgeId: 'j1',
          submissionId: 's1',
          rawCompositeScore: 0.2, // Below 1.0
        },
        {
          judgeId: 'j2',
          submissionId: 's2',
          rawCompositeScore: 12.5, // Above 10.0
        },
      ];

      const payload = transformScoresToPayload('evt', mockScores);

      expect(payload.scores[0].raw_composite_score).toBe(1.0);
      expect(payload.scores[1].raw_composite_score).toBe(10.0);
    });

    it('should ignore invalid entries without judge or submission identifiers', () => {
      const mockScores = [
        { judgeId: 'j1', rawCompositeScore: 5.0 }, // missing submission
        { submissionId: 's1', rawCompositeScore: 5.0 }, // missing judge
        null,
        undefined,
      ];

      const payload = transformScoresToPayload('evt', mockScores);
      expect(payload.scores).toHaveLength(0);
    });
  });

  describe('Fallback Raw Weighted Average Computation', () => {
    it('should compute raw mean, normalized score, and rank submissions descending', () => {
      const sub1 = new mongoose.Types.ObjectId().toString();
      const sub2 = new mongoose.Types.ObjectId().toString();
      const j1 = 'judge-alpha';
      const j2 = 'judge-beta';

      // sub1 has scores 9.0 and 8.0 (mean = 8.5)
      // sub2 has scores 6.0 and 7.0 (mean = 6.5)
      const mockScores = [
        { judgeId: j1, submissionId: sub1, rawCompositeScore: 9.0 },
        { judgeId: j2, submissionId: sub1, rawCompositeScore: 8.0 },
        { judgeId: j1, submissionId: sub2, rawCompositeScore: 6.0 },
        { judgeId: j2, submissionId: sub2, rawCompositeScore: 7.0 },
      ];

      const fallback = computeFallbackStandings('event-fb', mockScores);

      expect(fallback.status).toBe('fallback');
      expect(fallback.algorithm).toBe('raw_weighted_average_fallback');
      expect(fallback.is_fallback).toBe(true);
      expect(fallback.total_submissions).toBe(2);
      expect(fallback.total_scores_processed).toBe(4);

      // Rank 1 should be sub1 (mean 8.5)
      expect(fallback.standings[0].submission_id).toBe(sub1);
      expect(fallback.standings[0].rank).toBe(1);
      expect(fallback.standings[0].raw_mean).toBe(8.5);
      expect(fallback.standings[0].normalized_score).toBe(85.0);
      expect(fallback.standings[0].ballot_count).toBe(2);
      expect(fallback.standings[0].z_score_mean).toBe(0);
      expect(fallback.standings[0].z_mean).toBe(0);

      // Rank 2 should be sub2 (mean 6.5)
      expect(fallback.standings[1].submission_id).toBe(sub2);
      expect(fallback.standings[1].rank).toBe(2);
      expect(fallback.standings[1].raw_mean).toBe(6.5);
      expect(fallback.standings[1].normalized_score).toBe(65.0);
      expect(fallback.standings[1].ballot_count).toBe(2);

      // Judge calibrations
      expect(fallback.judge_calibrations).toHaveLength(2);
      const alphaCal = fallback.judge_calibrations.find((c) => c.judge_id === j1);
      expect(alphaCal).toBeDefined();
      expect(alphaCal.sample_size).toBe(2);
      expect(alphaCal.raw_mean).toBe(7.5);
    });

    it('should handle empty score array gracefully', () => {
      const fallback = computeFallbackStandings('event-empty', []);
      expect(fallback.status).toBe('fallback');
      expect(fallback.total_submissions).toBe(0);
      expect(fallback.total_scores_processed).toBe(0);
      expect(fallback.standings).toEqual([]);
    });
  });

  describe('normalizeScores with Graceful Fallback', () => {
    let originalPost;
    let consoleErrorSpy;

    beforeEach(() => {
      originalPost = fastApiClient.post;
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      fastApiClient.post = originalPost;
      consoleErrorSpy.mockRestore();
    });

    it('should return microservice result when FastAPI succeeds', async () => {
      const mockFastApiResponse = {
        data: {
          status: 'success',
          algorithm: 'z_score_bayesian_shrinkage',
          total_submissions: 1,
          total_scores_processed: 2,
          judge_calibrations: [],
          standings: [
            {
              submission_id: 'sub-100',
              raw_mean: 8.5,
              normalized_score: 92.4,
              z_score_mean: 1.25,
              ballot_count: 2,
              rank: 1,
            },
          ],
        },
      };

      fastApiClient.post = jest.fn().mockResolvedValue(mockFastApiResponse);

      const scores = [
        { judgeId: 'j1', submissionId: 'sub-100', rawCompositeScore: 8.0 },
        { judgeId: 'j2', submissionId: 'sub-100', rawCompositeScore: 9.0 },
      ];

      const result = await normalizeScores('event-100', scores);

      expect(result.status).toBe('success');
      expect(result.standings[0].normalized_score).toBe(92.4);
      expect(result.standings[0].z_mean).toBe(1.25);
      expect(result.standings[0].z_score_mean).toBe(1.25);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log critical error and compute fallback raw weighted average when FastAPI is unreachable', async () => {
      // Simulate network failure / connection refused
      const networkError = new Error('connect ECONNREFUSED 172.28.0.3:8000');
      fastApiClient.post = jest.fn().mockRejectedValue(networkError);

      const scores = [
        { judgeId: 'j1', submissionId: 'sub-alpha', rawCompositeScore: 8.0 },
        { judgeId: 'j2', submissionId: 'sub-alpha', rawCompositeScore: 9.0 },
        { judgeId: 'j1', submissionId: 'sub-beta', rawCompositeScore: 6.0 },
      ];

      const result = await normalizeScores('event-offline', scores);

      // Verify critical error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMsg = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMsg).toMatch(/\[CRITICAL\]/);
      expect(loggedMsg).toMatch(/unreachable/);

      // Verify fallback was computed instead of crashing
      expect(result.status).toBe('fallback');
      expect(result.is_fallback).toBe(true);
      expect(result.standings).toHaveLength(2);
      expect(result.standings[0].submission_id).toBe('sub-alpha');
      expect(result.standings[0].raw_mean).toBe(8.5);
      expect(result.standings[0].normalized_score).toBe(85.0);
      expect(result.standings[1].submission_id).toBe('sub-beta');
      expect(result.standings[1].raw_mean).toBe(6.0);
      expect(result.standings[1].normalized_score).toBe(60.0);
    });

    it('should log critical error and compute fallback on timeout (5000ms exceeded)', async () => {
      const timeoutError = new Error('timeout of 5000ms exceeded');
      fastApiClient.post = jest.fn().mockRejectedValue(timeoutError);

      const scores = [
        { judgeId: 'j1', submissionId: 'sub-1', totalRawScore: 7.5 },
      ];

      const result = await normalizeScores('event-timeout', scores);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/\[CRITICAL\]/);
      expect(result.status).toBe('fallback');
      expect(result.standings[0].submission_id).toBe('sub-1');
      expect(result.standings[0].raw_mean).toBe(7.5);
    });
  });

  describe('Pairwise Rankings & Health Check', () => {
    let originalPost;
    let originalGet;

    beforeEach(() => {
      originalPost = fastApiClient.post;
      originalGet = fastApiClient.get;
    });

    afterEach(() => {
      fastApiClient.post = originalPost;
      fastApiClient.get = originalGet;
    });

    it('should call pairwise-rank endpoint and return data', async () => {
      const mockData = {
        status: 'success',
        total_comparisons: 3,
        iterations_converged: 15,
        standings: [{ submission_id: 'sub-1', latent_score: 1.5, rank: 1 }],
      };
      fastApiClient.post = jest.fn().mockResolvedValue({ data: mockData });

      const res = await computePairwiseRankings([{ submission_a: 'sub-1', submission_b: 'sub-2', winner: 'sub-1' }]);
      expect(res).toEqual(mockData);
    });

    it('should check health and return healthy status', async () => {
      fastApiClient.get = jest.fn().mockResolvedValue({ data: { status: 'healthy' } });
      const res = await checkJudgingServiceHealth();
      expect(res.status).toBe('healthy');
    });

    it('should return down status if health check fails', async () => {
      fastApiClient.get = jest.fn().mockRejectedValue(new Error('Connection refused'));
      const res = await checkJudgingServiceHealth();
      expect(res.status).toBe('down');
      expect(res.error).toBe('Connection refused');
    });
  });
});
