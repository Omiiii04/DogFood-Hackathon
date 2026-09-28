const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const adminController = require('../src/controllers/adminController');
const Score = require('../src/models/Score');
const Submission = require('../src/models/Submission');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const AuditLog = require('../src/models/AuditLog');
const LeaderboardCache = require('../src/models/LeaderboardCache');
const fastApiClient = require('../src/services/fastApiClient');

describe('Admin Controller - POST /api/v1/admin/normalize-scores Endpoint', () => {
  let req, res, next;
  const dummyAdminId = new mongoose.Types.ObjectId();
  const dummyJudge1 = new mongoose.Types.ObjectId();
  const dummyJudge2 = new mongoose.Types.ObjectId();
  const dummySub1 = new mongoose.Types.ObjectId();
  const dummySub2 = new mongoose.Types.ObjectId();
  const activeEventId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(AuditLog, 'create').mockResolvedValue(true);
    jest.spyOn(Event, 'findOne').mockResolvedValue({ _id: activeEventId, status: 'active' });
    jest.spyOn(Submission, 'find').mockResolvedValue([]);

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

  describe('Unit Tests: adminController.runNormalization', () => {
    it('should reject non-admin/organizer users with 403 Forbidden', async () => {
      req.user.role = 'participant';
      await adminController.runNormalization(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/organizer or admin permissions required/i),
        })
      );
    });

    it('should return 400 when no completed scores exist to normalize', async () => {
      jest.spyOn(Score, 'find').mockResolvedValue([]);

      await adminController.runNormalization(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/no completed scores found/i),
        })
      );
    });

    it('should query completed scores with isFinal filter', async () => {
      const scoreFindSpy = jest.spyOn(Score, 'find').mockResolvedValue([]);

      await adminController.runNormalization(req, res, next);

      expect(scoreFindSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isFinal: { $ne: false },
        })
      );
    });

    it('should pass the resolved event id to FastAPI, store results, update scores, and return standings', async () => {
      const mockCompletedScores = [
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudge1,
          submissionId: dummySub1,
          totalRawScore: 9.0,
          rawCompositeScore: 9.0,
          isFinal: true,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudge2,
          submissionId: dummySub1,
          totalRawScore: 8.0,
          rawCompositeScore: 8.0,
          isFinal: true,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudge1,
          submissionId: dummySub2,
          totalRawScore: 6.0,
          rawCompositeScore: 6.0,
          isFinal: true,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudge2,
          submissionId: dummySub2,
          totalRawScore: 7.0,
          rawCompositeScore: 7.0,
          isFinal: true,
        },
      ];

      jest.spyOn(Score, 'find').mockResolvedValue(mockCompletedScores);
      const scoreUpdateSpy = jest.spyOn(Score, 'updateMany').mockResolvedValue({ modifiedCount: 2 });
      const cacheSpy = jest.spyOn(LeaderboardCache, 'findOneAndUpdate').mockResolvedValue({});

      const fastApiNormalizeSpy = jest.spyOn(fastApiClient, 'normalizeScores').mockResolvedValue({
        status: 'success',
        algorithm: 'z_score_bayesian_shrinkage',
        total_submissions: 2,
        total_scores_processed: 4,
        judge_calibrations: [
          { judge_id: dummyJudge1.toString(), sample_size: 2, raw_mean: 7.5, raw_std: 1.5 },
          { judge_id: dummyJudge2.toString(), sample_size: 2, raw_mean: 7.5, raw_std: 0.5 },
        ],
        standings: [
          {
            submission_id: dummySub1.toString(),
            rank: 1,
            raw_mean: 8.5,
            normalized_score: 91.2,
            z_score_mean: 1.2,
            z_mean: 1.2,
            ballot_count: 2,
          },
          {
            submission_id: dummySub2.toString(),
            rank: 2,
            raw_mean: 6.5,
            normalized_score: 72.8,
            z_score_mean: -1.2,
            z_mean: -1.2,
            ballot_count: 2,
          },
        ],
      });

      await adminController.runNormalization(req, res, next);

      // Verify fastApiClient.normalizeScores called with scores
      expect(fastApiNormalizeSpy).toHaveBeenCalledWith(activeEventId.toString(), mockCompletedScores);

      // Verify LeaderboardCache updated with normalized scores, ranks, and calibrations
      expect(cacheSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          algorithm: 'z_score_bayesian_shrinkage',
          standings: expect.arrayContaining([
            expect.objectContaining({
              submission_id: dummySub1.toString(),
              rank: 1,
              normalizedScore: 91.2,
            }),
            expect.objectContaining({
              submission_id: dummySub2.toString(),
              rank: 2,
              normalizedScore: 72.8,
            }),
          ]),
          judgeCalibrations: expect.arrayContaining([
            expect.objectContaining({
              judge_id: dummyJudge1.toString(),
              sample_size: 2,
            }),
          ]),
        }),
        expect.objectContaining({ upsert: true, new: true })
      );

      // Verify Score documents updated with normalized score & zScore
      expect(scoreUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ $or: [{ submission: dummySub1.toString() }, { submissionId: dummySub1.toString() }] }),
        expect.objectContaining({ normalizedScore: 91.2, zScore: 1.2 })
      );

      // Verify response returns 200 and computed standings
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          standings: expect.any(Array),
          data: expect.objectContaining({
            standings: expect.any(Array),
            total_scores_processed: 4,
            total_submissions: 2,
          }),
        })
      );
    });

    it('should compute fallback standings if FastAPI service is unreachable and save fallback to LeaderboardCache', async () => {
      const mockScores = [
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudge1,
          submissionId: dummySub1,
          totalRawScore: 9.0,
          rawCompositeScore: 9.0,
          isFinal: true,
        },
      ];

      jest.spyOn(Score, 'find').mockResolvedValue(mockScores);
      jest.spyOn(Score, 'updateMany').mockResolvedValue({ modifiedCount: 1 });
      const cacheSpy = jest.spyOn(LeaderboardCache, 'findOneAndUpdate').mockResolvedValue({});

      // Simulate network error calling FastAPI microservice
      jest.spyOn(fastApiClient, 'post').mockRejectedValue(new Error('ECONNREFUSED'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await adminController.runNormalization(req, res, next);

      expect(cacheSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          algorithm: 'raw_weighted_average_fallback',
          isFallback: true,
          standings: expect.arrayContaining([
            expect.objectContaining({
              submission_id: dummySub1.toString(),
              rank: 1,
              normalizedScore: 90.0,
            }),
          ]),
        }),
        expect.any(Object)
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          standings: expect.arrayContaining([
            expect.objectContaining({
              submission_id: dummySub1.toString(),
              rank: 1,
            }),
          ]),
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Route Integration Tests: POST /api/v1/admin/normalize-scores', () => {
    const adminToken = jwt.sign(
      { userId: dummyAdminId },
      process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026'
    );
    const participantId = new mongoose.Types.ObjectId();
    const participantToken = jwt.sign(
      { userId: participantId },
      process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026'
    );

    beforeEach(() => {
      jest.spyOn(User, 'findById').mockImplementation((id) => {
        const idStr = id.toString();
        if (idStr === dummyAdminId.toString()) {
          return {
            select: jest.fn().mockResolvedValue({
              _id: dummyAdminId,
              role: 'admin',
              name: 'Admin User',
              email: 'admin@test.local',
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({
            _id: participantId,
            role: 'participant',
            name: 'Regular Participant',
            email: 'participant@test.local',
          }),
        };
      });
    });

    it('should return 401 when no auth token provided', async () => {
      const res = await request(app).post('/api/v1/admin/normalize-scores');
      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not organizer or admin', async () => {
      const res = await request(app)
        .post('/api/v1/admin/normalize-scores')
        .set('Authorization', `Bearer ${participantToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 and return computed standings when admin calls normalize-scores', async () => {
      const mockCompletedScores = [
        {
          _id: new mongoose.Types.ObjectId(),
          judgeId: dummyJudge1,
          submissionId: dummySub1,
          totalRawScore: 9.0,
          rawCompositeScore: 9.0,
          isFinal: true,
        },
      ];

      jest.spyOn(Score, 'find').mockResolvedValue(mockCompletedScores);
      jest.spyOn(Score, 'updateMany').mockResolvedValue({ modifiedCount: 1 });
      jest.spyOn(LeaderboardCache, 'findOneAndUpdate').mockResolvedValue({});

      jest.spyOn(fastApiClient, 'post').mockResolvedValue({
        data: {
          status: 'success',
          algorithm: 'z_score_bayesian_shrinkage',
          total_submissions: 1,
          total_scores_processed: 1,
          judge_calibrations: [{ judge_id: dummyJudge1.toString(), sample_size: 1, raw_mean: 9.0 }],
          standings: [
            {
              submission_id: dummySub1.toString(),
              rank: 1,
              raw_mean: 9.0,
              normalized_score: 95.0,
              z_score_mean: 1.5,
              z_mean: 1.5,
              ballot_count: 1,
            },
          ],
        },
      });

      const res = await request(app)
        .post('/api/v1/admin/normalize-scores')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.standings).toBeDefined();
      expect(res.body.standings[0].rank).toBe(1);
      expect(res.body.standings[0].normalizedScore).toBe(95.0);
      expect(res.body.data.total_scores_processed).toBe(1);
    });
  });
});
