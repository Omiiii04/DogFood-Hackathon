const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Score = require('../src/models/Score');
const JudgeAssignment = require('../src/models/JudgeAssignment');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const Rubric = require('../src/models/Rubric');
const app = require('../src/index');
const isolationGuard = require('../src/middleware/isolationGuard');

describe('Score Model & isolationGuard Middleware Tests', () => {
  const dummyJudgeId = new mongoose.Types.ObjectId();
  const dummySubmissionId = new mongoose.Types.ObjectId();
  const dummyOtherSubId = new mongoose.Types.ObjectId();

  describe('Score Model Specification', () => {
    it('should validate a valid Score document with judge, submission, criteriaScores [{ key, score }], rawCompositeScore, and privateNotes', async () => {
      const score = new Score({
        judge: dummyJudgeId,
        submission: dummySubmissionId,
        criteriaScores: [
          { key: 'tech_execution', score: 8.5 },
          { key: 'innovation', score: 9.0 },
          { key: 'polish', score: 7.5 },
        ],
        rawCompositeScore: 8.333,
        privateNotes: 'Well architected project.',
      });

      const err = score.validateSync();
      expect(err).toBeUndefined();
      expect(score.judge.toString()).toBe(dummyJudgeId.toString());
      expect(score.submission.toString()).toBe(dummySubmissionId.toString());
      expect(score.criteriaScores.length).toBe(3);
      expect(score.criteriaScores[0].key).toBe('tech_execution');
      expect(score.criteriaScores[0].score).toBe(8.5);
      expect(score.rawCompositeScore).toBe(8.333);
      expect(score.privateNotes).toBe('Well architected project.');
    });

    it('should have a compound unique index on [judge, submission]', () => {
      const indexes = Score.schema.indexes();
      const compoundIndex = indexes.find(
        ([fields]) => fields.judge === 1 && fields.submission === 1
      );
      expect(compoundIndex).toBeDefined();
      expect(compoundIndex[1]).toEqual(expect.objectContaining({ unique: true }));
    });

    it('should fail validation when judge is missing', () => {
      const score = new Score({
        submission: dummySubmissionId,
        criteriaScores: [{ key: 'tech', score: 7 }],
        rawCompositeScore: 7,
      });

      const err = score.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.judge).toBeDefined();
    });

    it('should fail validation when submission is missing', () => {
      const score = new Score({
        judge: dummyJudgeId,
        criteriaScores: [{ key: 'tech', score: 7 }],
        rawCompositeScore: 7,
      });

      const err = score.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.submission).toBeDefined();
    });

    it('should fail validation when rawCompositeScore is missing', () => {
      const score = new Score({
        judge: dummyJudgeId,
        submission: dummySubmissionId,
        criteriaScores: [{ key: 'tech', score: 7 }],
      });

      const err = score.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.rawCompositeScore).toBeDefined();
    });

    it('should synchronize judge and judgeId, submission and submissionId, rawCompositeScore and totalRawScore', () => {
      const score = new Score({
        judge: dummyJudgeId,
        submission: dummySubmissionId,
        criteriaScores: [{ key: 'tech', score: 9 }],
        rawCompositeScore: 9,
      });

      score.validateSync();
      expect(score.judgeId.toString()).toBe(dummyJudgeId.toString());
      expect(score.submissionId.toString()).toBe(dummySubmissionId.toString());
      expect(score.totalRawScore).toBe(9);
    });

    it('should support legacy field names in criteriaScores and synchronize key/score', () => {
      const score = new Score({
        judge: dummyJudgeId,
        submission: dummySubmissionId,
        criteriaScores: [{ criteriaName: 'Impact', weight: 0.3, rawScore: 8 }],
        rawCompositeScore: 8,
      });

      score.validateSync();
      expect(score.criteriaScores[0].key).toBe('Impact');
      expect(score.criteriaScores[0].score).toBe(8);
    });
  });

  describe('isolationGuard Middleware Unit Tests', () => {
    let req, res, next;

    beforeEach(() => {
      jest.clearAllMocks();
      req = {
        user: {
          id: dummyJudgeId.toString(),
          _id: dummyJudgeId,
          role: 'judge',
        },
        body: {},
        params: {},
        query: {},
        method: 'POST',
        path: '/scores',
        originalUrl: '/api/v1/judging/scores',
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      next = jest.fn();
    });

    it('should return 403 Forbidden with exact message when judge is not assigned to the project', async () => {
      req.body.submissionId = dummySubmissionId.toString();
      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue(null);

      await isolationGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Access Denied: You are not assigned to evaluate this project',
          message: 'Access Denied: You are not assigned to evaluate this project',
          statusCode: 403,
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should verify authenticated req.user.id matches active JudgeAssignment and call next()', async () => {
      req.user = { id: dummyJudgeId.toString(), role: 'judge' };
      req.body.submissionId = dummySubmissionId.toString();

      const mockAssignment = {
        _id: new mongoose.Types.ObjectId(),
        judgeId: dummyJudgeId,
        submissionId: dummySubmissionId,
        status: 'assigned',
        track: 'AI/ML',
      };

      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue(mockAssignment);

      await isolationGuard(req, res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(req.assignment).toBe(mockAssignment);
    });

    it('should accept submissionId from req.params.submissionId', async () => {
      req.method = 'GET';
      req.path = '/submissions/' + dummySubmissionId.toString();
      req.params.submissionId = dummySubmissionId.toString();

      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        judgeId: dummyJudgeId,
        submissionId: dummySubmissionId,
        status: 'assigned',
      });

      await isolationGuard(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject unassigned request when submissionId is in req.query.submissionId', async () => {
      req.method = 'GET';
      req.path = '/evaluate';
      req.query.submissionId = dummyOtherSubId.toString();

      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue(null);

      await isolationGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Access Denied: You are not assigned to evaluate this project',
        })
      );
    });

    it('should bypass assignment verification for organizer and admin users', async () => {
      req.user.role = 'admin';
      req.body.submissionId = dummySubmissionId.toString();

      await isolationGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should pass through requests without target submission (such as /rubric or /assigned queue)', async () => {
      req.method = 'GET';
      req.path = '/rubric';
      req.originalUrl = '/api/v1/judging/rubric';
      req.body = {};
      req.params = {};
      req.query = {};

      await isolationGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when submitting a score without submissionId', async () => {
      req.method = 'POST';
      req.path = '/scores';
      req.originalUrl = '/api/v1/judging/scores';
      req.body = {};

      await isolationGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'submissionId is required.',
        })
      );
    });

    it('should return 401 if unauthenticated', async () => {
      req.user = null;
      req.body.submissionId = dummySubmissionId.toString();

      await isolationGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized: Authentication required.',
        })
      );
    });
  });

  describe('Route Integration Tests with isolationGuard', () => {
    const secret = process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026';
    let judgeToken;
    let mockJudgeUser;

    beforeEach(() => {
      jest.clearAllMocks();

      mockJudgeUser = {
        _id: dummyJudgeId,
        id: dummyJudgeId.toString(),
        name: 'Judge Dredd',
        email: 'judge@example.com',
        role: 'judge',
      };

      judgeToken = jwt.sign(
        { userId: dummyJudgeId.toString(), role: 'judge' },
        secret,
        { expiresIn: '1h' }
      );

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockJudgeUser),
      });
    });

    it('POST /api/v1/judging/scores should return 403 Forbidden when judge is unassigned', async () => {
      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/judging/scores')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submissionId: dummySubmissionId.toString(),
          criteriaScores: [{ key: 'tech', score: 8 }],
          privateNotes: 'Test',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Access Denied: You are not assigned to evaluate this project');
    });

    it('GET /api/v1/judging/rubric should be accessible without submissionId', async () => {
      jest.spyOn(Event, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          status: 'active',
          rubric: [{ name: 'Technical Execution', weight: 0.4 }],
          tracks: ['AI/ML'],
        }),
      });
      jest.spyOn(Rubric, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/judging/rubric')
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rubric).toBeDefined();
    });

    it('GET /api/v1/judging/assigned should return ONLY submissions assigned to req.user.id and attach only own scores', async () => {
      const assignedSub1 = {
        _id: dummySubmissionId,
        title: 'Assigned Project 1',
        tagline: 'Tagline 1',
      };
      const assignedSub2 = {
        _id: dummyOtherSubId,
        title: 'Assigned Project 2',
        tagline: 'Tagline 2',
      };

      const mockAssignments = [
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudgeId,
          submissionId: assignedSub1,
          track: 'AI/ML',
          status: 'assigned',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudgeId,
          submissionId: assignedSub2,
          track: 'AI/ML',
          status: 'completed',
        },
      ];

      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockAssignments),
      };
      jest.spyOn(JudgeAssignment, 'find').mockReturnValue(mockFindQuery);

      // Suppose Judge has evaluated assignedSub2, and competitor Judge B has also evaluated assignedSub1 & assignedSub2
      const ownScore = {
        _id: new mongoose.Types.ObjectId(),
        judge: dummyJudgeId,
        submission: dummyOtherSubId,
        rawCompositeScore: 9.0,
      };
      jest.spyOn(Score, 'find').mockResolvedValue([ownScore]);

      const res = await request(app)
        .get('/api/v1/judging/assigned')
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.queue).toHaveLength(2);
      expect(res.body.data.submissions).toHaveLength(2);

      // Verify that query was strictly filtered by req.user.id
      expect(JudgeAssignment.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ judgeId: dummyJudgeId.toString() }, { judge: dummyJudgeId.toString() }],
        })
      );

      // Verify scores attached: assignedSub1 has null score, assignedSub2 has ownScore
      expect(res.body.data.queue[0].score).toBeNull();
      expect(res.body.data.queue[1].score).toBeDefined();
      expect(res.body.data.queue[1].score.rawCompositeScore).toBe(9.0);
    });

    it('GET /api/v1/judging/scores/:submissionId should return 403 Forbidden when judge is unassigned to submission', async () => {
      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/judging/scores/${dummySubmissionId.toString()}`)
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Access Denied: You are not assigned to evaluate this project');
    });

    it('GET /api/v1/judging/scores/:submissionId should return 404 when judge is assigned but has not scored yet (strips competitor scores)', async () => {
      // Judge is assigned to submission
      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        judgeId: dummyJudgeId,
        submissionId: dummySubmissionId,
        status: 'assigned',
      });

      // No score from dummyJudgeId exists
      jest.spyOn(Score, 'findById').mockResolvedValue(null);
      jest.spyOn(Score, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/judging/scores/${dummySubmissionId.toString()}`)
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Score ballot not found.');
    });

    it('GET /api/v1/judging/scores/:submissionId should return ONLY authenticated judge own ballot and strip all competitor scores', async () => {
      // Judge is assigned to submission
      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        judgeId: dummyJudgeId,
        submissionId: dummySubmissionId,
        status: 'completed',
      });

      const ownBallot = {
        _id: new mongoose.Types.ObjectId(),
        judge: dummyJudgeId,
        judgeId: dummyJudgeId,
        submission: dummySubmissionId,
        submissionId: dummySubmissionId,
        criteriaScores: [
          { key: 'technical', score: 9.5 },
          { key: 'impact', score: 8.5 },
        ],
        rawCompositeScore: 9.0,
        privateNotes: 'My confidential review',
      };

      jest.spyOn(Score, 'findById').mockResolvedValue(null);
      jest.spyOn(Score, 'findOne').mockResolvedValue(ownBallot);

      const res = await request(app)
        .get(`/api/v1/judging/scores/${dummySubmissionId.toString()}`)
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBeDefined();
      expect(res.body.data.score.rawCompositeScore).toBe(9.0);
      expect(res.body.data.score.privateNotes).toBe('My confidential review');
      expect(res.body.data.score.judge.toString()).toBe(dummyJudgeId.toString());

      // Ensure no competitor scores leaked
      expect(res.body.data.scores).toBeUndefined();
    });

    it('GET /api/v1/judging/scores/:submissionId should return 403 Forbidden if a judge directly attempts to inspect another judge score ballot', async () => {
      const otherJudgeId = new mongoose.Types.ObjectId();
      const otherJudgeScoreId = new mongoose.Types.ObjectId();

      const otherJudgeScore = {
        _id: otherJudgeScoreId,
        judge: otherJudgeId,
        judgeId: otherJudgeId,
        submission: dummySubmissionId,
        rawCompositeScore: 6.5,
        privateNotes: 'Other judge private notes',
      };

      // Mock finding other judge's score by ID
      jest.spyOn(Score, 'findById').mockResolvedValue(otherJudgeScore);

      // JudgeAssignment passes for this submission
      jest.spyOn(JudgeAssignment, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        judgeId: dummyJudgeId,
        submissionId: dummySubmissionId,
        status: 'assigned',
      });

      const res = await request(app)
        .get(`/api/v1/judging/scores/${otherJudgeScoreId.toString()}`)
        .set('Authorization', `Bearer ${judgeToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe(
        "Security Violation: You are strictly prohibited from inspecting other judges' scores."
      );
    });

    it('GET /api/v1/judging/scores/:submissionId should allow admin to inspect ballot', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const adminToken = jwt.sign(
        { userId: adminId.toString(), role: 'admin' },
        secret,
        { expiresIn: '1h' }
      );

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: adminId,
          id: adminId.toString(),
          role: 'admin',
        }),
      });

      const ballot = {
        _id: new mongoose.Types.ObjectId(),
        submission: dummySubmissionId,
        rawCompositeScore: 8.7,
      };

      jest.spyOn(Score, 'findById').mockResolvedValue(ballot);
      jest.spyOn(Score, 'findOne').mockResolvedValue(ballot);

      const res = await request(app)
        .get(`/api/v1/judging/scores/${dummySubmissionId.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBeDefined();
    });
  });
});
