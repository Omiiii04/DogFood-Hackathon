const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const adminController = require('../src/controllers/adminController');
const Submission = require('../src/models/Submission');
const User = require('../src/models/User');
const JudgeAssignment = require('../src/models/JudgeAssignment');
const Score = require('../src/models/Score');

describe('Admin Controller - GET /api/v1/admin/analytics Endpoint', () => {
  let req, res, next;
  const dummyAdminId = new mongoose.Types.ObjectId();
  const dummyJudge1Id = new mongoose.Types.ObjectId();
  const dummyJudge2Id = new mongoose.Types.ObjectId();
  const dummyJudge3Id = new mongoose.Types.ObjectId();
  const dummyJudge4Id = new mongoose.Types.ObjectId();
  const dummySub1Id = new mongoose.Types.ObjectId();
  const dummySub2Id = new mongoose.Types.ObjectId();
  const dummySub3Id = new mongoose.Types.ObjectId();

  const JWT_SECRET = process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026';
  const adminToken = jwt.sign({ userId: dummyAdminId.toString(), role: 'admin' }, JWT_SECRET);
  const organizerToken = jwt.sign({ userId: dummyAdminId.toString(), role: 'organizer' }, JWT_SECRET);
  const participantId = new mongoose.Types.ObjectId();
  const participantToken = jwt.sign({ userId: participantId.toString(), role: 'participant' }, JWT_SECRET);

  beforeEach(() => {
    jest.restoreAllMocks();

    req = {
      body: {},
      params: {},
      query: {},
      user: {
        _id: dummyAdminId,
        role: 'admin',
      },
      ip: '127.0.0.1',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('Unit Tests: adminController.getAnalytics', () => {
    it('should reject non-organizer/admin users with 403 Forbidden', async () => {
      req.user.role = 'participant';
      await adminController.getAnalytics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/organizer or admin permissions required/i),
        })
      );
    });

    it('should return default empty metrics when database has no records', async () => {
      jest.spyOn(Submission, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });

      await adminController.getAnalytics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          submissionMetrics: expect.objectContaining({
            totalSubmissions: 0,
            finalizedCount: 0,
            draftCount: 0,
            trackBreakdown: {},
          }),
          judgingMetrics: expect.objectContaining({
            totalBallotsAssigned: 0,
            completedBallots: 0,
            completionPercentage: 0,
          }),
          judgeVarianceMetrics: [],
          flaggedAnomalies: [],
        })
      );
    });

    it('should correctly calculate submission metrics (total, finalized, track breakdown)', async () => {
      const mockSubmissions = [
        { _id: dummySub1Id, track: 'AI/ML', status: 'submitted' },
        { _id: dummySub2Id, track: 'AI/ML', status: 'draft' },
        { _id: dummySub3Id, track: 'Fintech', status: 'locked' },
        { _id: new mongoose.Types.ObjectId(), track: 'Healthcare', status: 'submitted' },
      ];

      jest.spyOn(Submission, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockSubmissions) });
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });

      await adminController.getAnalytics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;

      expect(data.submissionMetrics.totalSubmissions).toBe(4);
      expect(data.submissionMetrics.finalizedCount).toBe(3); // 2 submitted + 1 locked
      expect(data.submissionMetrics.draftCount).toBe(1);
      expect(data.submissionMetrics.trackBreakdown).toEqual({
        'AI/ML': 2,
        Fintech: 1,
        Healthcare: 1,
      });
    });

    it('should correctly calculate judging metrics (assigned, completed, percentage)', async () => {
      const mockSubmissions = [{ _id: dummySub1Id, track: 'AI/ML', status: 'submitted' }];
      const mockAssignments = [
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge2Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge3Id, submissionId: dummySub1Id, status: 'assigned' },
        { judgeId: dummyJudge4Id, submissionId: dummySub1Id, status: 'assigned' },
      ];

      jest.spyOn(Submission, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockSubmissions) });
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAssignments) });
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });

      await adminController.getAnalytics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;

      expect(data.judgingMetrics.totalBallotsAssigned).toBe(4);
      expect(data.judgingMetrics.completedBallots).toBe(2);
      expect(data.judgingMetrics.completionPercentage).toBe(50.0);
    });

    it('should correctly calculate judge variance metrics (mean, std, bayesian delta)', async () => {
      // Judge 1 gives scores: 8.0, 9.0 (mean = 8.5)
      // Judge 2 gives scores: 6.0, 7.0 (mean = 6.5)
      // All scores: [8.0, 9.0, 6.0, 7.0] -> globalMean = (8+9+6+7)/4 = 7.5
      // Judge 1:
      // sample size n = 2
      // rawMean = 8.5
      // variance = ((8.0-8.5)^2 + (9.0-8.5)^2) / (2-1) = (0.25 + 0.25) / 1 = 0.5
      // std = sqrt(0.5) = 0.7071
      // bayesianShrunkMean (prior_k = 3.0): (2 * 8.5 + 3 * 7.5) / (2 + 3) = (17 + 22.5) / 5 = 39.5 / 5 = 7.9
      // bayesianDelta: 7.9 - 7.5 = 0.4
      const mockScores = [
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, totalRawScore: 8.0, isFinal: true },
        { judgeId: dummyJudge1Id, submissionId: dummySub2Id, totalRawScore: 9.0, isFinal: true },
        { judgeId: dummyJudge2Id, submissionId: dummySub1Id, totalRawScore: 6.0, isFinal: true },
        { judgeId: dummyJudge2Id, submissionId: dummySub2Id, totalRawScore: 7.0, isFinal: true },
      ];

      const mockJudges = [
        { _id: dummyJudge1Id, fullName: 'Judge One', email: 'judge1@test.local', role: 'judge' },
        { _id: dummyJudge2Id, fullName: 'Judge Two', email: 'judge2@test.local', role: 'judge' },
      ];

      const mockAssignments = [
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge1Id, submissionId: dummySub2Id, status: 'completed' },
        { judgeId: dummyJudge2Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge2Id, submissionId: dummySub2Id, status: 'completed' },
      ];

      jest.spyOn(Submission, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAssignments) });
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockScores) }),
      });
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockJudges) }),
      });

      await adminController.getAnalytics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;

      expect(data.globalMetrics.globalMean).toBe(7.5);

      const judge1Metric = data.judgeVarianceMetrics.find((j) => j.judgeId === dummyJudge1Id.toString());
      expect(judge1Metric).toBeDefined();
      expect(judge1Metric.rawMean).toBe(8.5);
      expect(judge1Metric.variance).toBeCloseTo(0.5, 3);
      expect(judge1Metric.standardDeviation).toBeCloseTo(0.7071, 3);
      expect(judge1Metric.shrunkMean).toBe(7.9);
      expect(judge1Metric.bayesianDelta).toBeCloseTo(0.4, 3);

      const judge2Metric = data.judgeVarianceMetrics.find((j) => j.judgeId === dummyJudge2Id.toString());
      expect(judge2Metric).toBeDefined();
      expect(judge2Metric.rawMean).toBe(6.5);
      expect(judge2Metric.variance).toBeCloseTo(0.5, 3);
      expect(judge2Metric.bayesianDelta).toBeCloseTo(-0.4, 3);
    });

    it('should flag anomalies: judges with zero variance or completion rate < 50%', async () => {
      // Judge 1: Straight-liner (3 completed ballots, all scored 8.0) -> variance = 0! (Flagged: zero_variance)
      // Judge 2: Low completion (assigned 4 ballots, completed only 1) -> completion rate 25% < 50%! (Flagged: low_completion_rate)
      // Judge 3: Normal judge (assigned 3, completed 3, scores 7.0, 8.0, 9.0) -> variance > 0, 100% completion (NOT flagged)
      // Judge 4: Both (assigned 4, completed 1... wait, 1 evaluation has undefined sample variance, or assigned 4, completed 2 with identical scores [8,8] -> 50% completion? If assigned 5, completed 2 with identical scores [8,8] -> rate 40% < 50% AND zero variance!)
      const mockJudges = [
        { _id: dummyJudge1Id, fullName: 'Judge Zero Variance', email: 'zero@test.local', role: 'judge' },
        { _id: dummyJudge2Id, fullName: 'Judge Low Completion', email: 'low@test.local', role: 'judge' },
        { _id: dummyJudge3Id, fullName: 'Judge Normal', email: 'normal@test.local', role: 'judge' },
        { _id: dummyJudge4Id, fullName: 'Judge Double Anomaly', email: 'double@test.local', role: 'judge' },
      ];

      const mockAssignments = [
        // Judge 1: 3 assigned, 3 completed
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge1Id, submissionId: dummySub2Id, status: 'completed' },
        { judgeId: dummyJudge1Id, submissionId: dummySub3Id, status: 'completed' },
        // Judge 2: 4 assigned, 1 completed
        { judgeId: dummyJudge2Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge2Id, submissionId: dummySub2Id, status: 'assigned' },
        { judgeId: dummyJudge2Id, submissionId: dummySub3Id, status: 'assigned' },
        { judgeId: dummyJudge2Id, submissionId: new mongoose.Types.ObjectId(), status: 'assigned' },
        // Judge 3: 3 assigned, 3 completed
        { judgeId: dummyJudge3Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge3Id, submissionId: dummySub2Id, status: 'completed' },
        { judgeId: dummyJudge3Id, submissionId: dummySub3Id, status: 'completed' },
        // Judge 4: 5 assigned, 2 completed (rate = 40% < 50%)
        { judgeId: dummyJudge4Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge4Id, submissionId: dummySub2Id, status: 'completed' },
        { judgeId: dummyJudge4Id, submissionId: dummySub3Id, status: 'assigned' },
        { judgeId: dummyJudge4Id, submissionId: new mongoose.Types.ObjectId(), status: 'assigned' },
        { judgeId: dummyJudge4Id, submissionId: new mongoose.Types.ObjectId(), status: 'assigned' },
      ];

      const mockScores = [
        // Judge 1: identical scores [8.0, 8.0, 8.0]
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, totalRawScore: 8.0, isFinal: true },
        { judgeId: dummyJudge1Id, submissionId: dummySub2Id, totalRawScore: 8.0, isFinal: true },
        { judgeId: dummyJudge1Id, submissionId: dummySub3Id, totalRawScore: 8.0, isFinal: true },
        // Judge 2: 1 score
        { judgeId: dummyJudge2Id, submissionId: dummySub1Id, totalRawScore: 7.0, isFinal: true },
        // Judge 3: [7.0, 8.0, 9.0]
        { judgeId: dummyJudge3Id, submissionId: dummySub1Id, totalRawScore: 7.0, isFinal: true },
        { judgeId: dummyJudge3Id, submissionId: dummySub2Id, totalRawScore: 8.0, isFinal: true },
        { judgeId: dummyJudge3Id, submissionId: dummySub3Id, totalRawScore: 9.0, isFinal: true },
        // Judge 4: identical scores [8.0, 8.0]
        { judgeId: dummyJudge4Id, submissionId: dummySub1Id, totalRawScore: 8.0, isFinal: true },
        { judgeId: dummyJudge4Id, submissionId: dummySub2Id, totalRawScore: 8.0, isFinal: true },
      ];

      jest.spyOn(Submission, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAssignments) });
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockScores) }),
      });
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockJudges) }),
      });

      await adminController.getAnalytics(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      const flagged = data.flaggedAnomalies;

      // Judge 3 (Normal) must NOT be flagged
      const normalJudgeFlagged = flagged.find((f) => f.judgeId === dummyJudge3Id.toString());
      expect(normalJudgeFlagged).toBeUndefined();

      // Judge 1 (Zero variance) must be flagged
      const zeroVarianceJudge = flagged.find((f) => f.judgeId === dummyJudge1Id.toString());
      expect(zeroVarianceJudge).toBeDefined();
      expect(zeroVarianceJudge.reasons).toContain('zero_variance');
      expect(zeroVarianceJudge.variance).toBe(0);
      expect(zeroVarianceJudge.hasZeroVariance).toBe(true);

      // Judge 2 (Low completion) must be flagged
      const lowCompletionJudge = flagged.find((f) => f.judgeId === dummyJudge2Id.toString());
      expect(lowCompletionJudge).toBeDefined();
      expect(lowCompletionJudge.reasons).toContain('low_completion_rate');
      expect(lowCompletionJudge.completionRate).toBe(25.0);
      expect(lowCompletionJudge.hasLowCompletion).toBe(true);

      // Judge 4 (Both anomalies) must have both reasons
      const doubleAnomalyJudge = flagged.find((f) => f.judgeId === dummyJudge4Id.toString());
      expect(doubleAnomalyJudge).toBeDefined();
      expect(doubleAnomalyJudge.reasons).toContain('zero_variance');
      expect(doubleAnomalyJudge.reasons).toContain('low_completion_rate');
      expect(doubleAnomalyJudge.hasZeroVariance).toBe(true);
      expect(doubleAnomalyJudge.hasLowCompletion).toBe(true);
    });
  });

  describe('Integration Route Tests: GET /api/v1/admin/analytics', () => {
    beforeEach(() => {
      jest.spyOn(User, 'findById').mockImplementation((id) => {
        const idStr = id.toString();
        if (idStr === dummyAdminId.toString()) {
          return {
            select: jest.fn().mockResolvedValue({
              _id: dummyAdminId,
              role: 'admin',
              fullName: 'Admin User',
              email: 'admin@test.local',
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            role: 'participant',
            fullName: 'Participant User',
            email: 'participant@test.local',
          }),
        };
      });
    });

    it('should return 401 when no token is supplied', async () => {
      const res = await request(app).get('/api/v1/admin/analytics');
      expect(res.status).toBe(401);
    });

    it('should return 403 when authenticated as participant', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${participantToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 with full analytics when accessed by organizer or admin', async () => {
      const mockSubmissions = [
        { _id: dummySub1Id, track: 'AI/ML', status: 'submitted' },
        { _id: dummySub2Id, track: 'Web3', status: 'submitted' },
      ];
      const mockAssignments = [
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, status: 'completed' },
        { judgeId: dummyJudge1Id, submissionId: dummySub2Id, status: 'completed' },
      ];
      const mockScores = [
        { judgeId: dummyJudge1Id, submissionId: dummySub1Id, totalRawScore: 8.5, isFinal: true },
        { judgeId: dummyJudge1Id, submissionId: dummySub2Id, totalRawScore: 9.0, isFinal: true },
      ];
      const mockJudges = [
        { _id: dummyJudge1Id, fullName: 'Judge One', email: 'j1@test.local', role: 'judge' },
      ];

      jest.spyOn(Submission, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockSubmissions) });
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(mockAssignments) });
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockScores) }),
      });
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(mockJudges) }),
      });

      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.submissionMetrics.totalSubmissions).toBe(2);
      expect(res.body.submissionMetrics.finalizedCount).toBe(2);
      expect(res.body.submissionMetrics.trackBreakdown).toEqual({ 'AI/ML': 1, Web3: 1 });
      expect(res.body.judgingMetrics.totalBallotsAssigned).toBe(2);
      expect(res.body.judgingMetrics.completedBallots).toBe(2);
      expect(res.body.judgingMetrics.completionPercentage).toBe(100);
      expect(res.body.judgeVarianceMetrics.length).toBe(1);
      expect(res.body.judgeVarianceMetrics[0].mean).toBe(8.75);
      expect(res.body.judgeVarianceMetrics[0].bayesianDelta).toBeDefined();
      expect(Array.isArray(res.body.flaggedAnomalies)).toBe(true);
    });
  });
});
