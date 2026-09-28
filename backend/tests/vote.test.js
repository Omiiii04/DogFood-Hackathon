const mongoose = require('mongoose');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/index');
const Vote = require('../src/models/Vote');
const Submission = require('../src/models/Submission');
const AuditLog = require('../src/models/AuditLog');
const { voteRateLimiter, TokenBucketSlidingWindowLimiter } = require('../src/middleware/rateLimiter');
const voteController = require('../src/controllers/voteController');

describe('Tier 3: Sybil-Resistant Community Voting & Rate Limiting Unit & Integration Tests', () => {
  const dummySubmissionId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const secretSalt = 'test-secret-salt-2026';

  beforeEach(() => {
    jest.clearAllMocks();
    if (voteRateLimiter && voteRateLimiter.reset) {
      voteRateLimiter.reset();
    }
  });

  describe('1. Vote Model Schema & Validation', () => {
    it('should validate a valid Vote document with canonical fields', () => {
      const clientIp = '192.168.1.100';
      const userAgent = 'Mozilla/5.0 DogFoodTest/1.0';
      const voterHash = crypto
        .createHash('sha256')
        .update(`${clientIp}${userAgent}${secretSalt}`)
        .digest('hex');

      const vote = new Vote({
        submission: dummySubmissionId,
        voterHash,
        user: dummyUserId,
        votedAt: new Date(),
      });

      const err = vote.validateSync();
      expect(err).toBeUndefined();
      expect(vote.submission).toEqual(dummySubmissionId);
      expect(vote.voterHash).toBe(voterHash);
      expect(vote.user).toEqual(dummyUserId);
      expect(vote.votedAt).toBeInstanceOf(Date);
    });

    it('should allow optional user field for unauthenticated votes', () => {
      const vote = new Vote({
        submission: dummySubmissionId,
        voterHash: 'a'.repeat(64),
      });

      const err = vote.validateSync();
      expect(err).toBeUndefined();
      expect(vote.user).toBeNull();
      expect(vote.votedAt).toBeDefined();
    });

    it('should reject when required fields (submission, voterHash) are missing', () => {
      const vote = new Vote({});
      const err = vote.validateSync();

      expect(err).toBeDefined();
      expect(err.errors.submission).toBeDefined();
      expect(err.errors.voterHash).toBeDefined();
    });

    it('should support legacy aliases (submissionId, fingerprintHash, createdAt, userId)', () => {
      const vote = new Vote({
        submissionId: dummySubmissionId,
        fingerprintHash: 'b'.repeat(64),
        userId: dummyUserId,
        createdAt: new Date('2026-09-27T10:00:00Z'),
      });

      const err = vote.validateSync();
      expect(err).toBeUndefined();
      expect(vote.submission).toEqual(dummySubmissionId);
      expect(vote.voterHash).toBe('b'.repeat(64));
      expect(vote.user).toEqual(dummyUserId);
      expect(vote.votedAt).toEqual(new Date('2026-09-27T10:00:00Z'));

      // Check alias accessors
      expect(vote.submissionId).toEqual(dummySubmissionId);
      expect(vote.fingerprintHash).toBe('b'.repeat(64));
      expect(vote.userId).toEqual(dummyUserId);
    });

    it('should define a unique compound index on [submission, voterHash]', () => {
      const indexes = Vote.schema.indexes();
      const compoundIndex = indexes.find(
        ([fields, options]) =>
          fields.submission === 1 && fields.voterHash === 1 && options && options.unique === true
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should verify Vote.generateVoterHash computes SHA-256 of clientIP + userAgent + secretSalt', () => {
      const ip = '10.0.0.42';
      const ua = 'DogFoodBrowser/2026';
      const salt = 'custom-salt-123';

      const expected = crypto
        .createHash('sha256')
        .update(`${ip}${ua}${salt}`)
        .digest('hex');

      const computed = Vote.generateVoterHash(ip, ua, salt);
      expect(computed).toBe(expected);
      expect(computed).toHaveLength(64);
    });

    it('should verify 24h TTL expiration index is configured on votedAt (expires: 86400)', () => {
      const votedAtSchema = Vote.schema.path('votedAt');
      expect(votedAtSchema.options.expires).toBe(86400);
    });
  });

  describe('2. Rate Limiter Middleware (Token-bucket sliding window)', () => {
    let limiter;
    let req, res, next;

    beforeEach(() => {
      limiter = new TokenBucketSlidingWindowLimiter({
        windowMs: 60 * 1000,
        maxRequests: 5,
        retryAfterSeconds: 60,
      });

      req = {
        headers: {},
        ip: '198.51.100.1',
        socket: { remoteAddress: '198.51.100.1' },
      };

      res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      next = jest.fn();
    });

    it('should allow up to 5 requests in a 1-minute window', () => {
      const mw = limiter.middleware();

      for (let i = 0; i < 5; i++) {
        next.mockClear();
        mw(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('should block 6th request within window with 429 Too Many Requests and Retry-After: 60', () => {
      const mw = limiter.middleware();

      // First 5 requests pass
      for (let i = 0; i < 5; i++) {
        mw(req, res, next);
      }

      // 6th request is blocked
      next.mockClear();
      mw(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Too Many Requests',
          statusCode: 429,
          retryAfter: 60,
        })
      );
    });

    it('should maintain independent rate limit buckets per client IP', () => {
      const mw = limiter.middleware();

      const reqA = { headers: {}, ip: '10.1.1.1' };
      const reqB = { headers: {}, ip: '10.1.1.2' };

      // Consume all 5 tokens for IP A
      for (let i = 0; i < 5; i++) {
        mw(reqA, res, next);
      }

      // 6th request for IP A should fail
      res.status.mockClear();
      mw(reqA, res, next);
      expect(res.status).toHaveBeenCalledWith(429);

      // Request for IP B should succeed
      next.mockClear();
      res.status.mockClear();
      mw(reqB, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reset client records when reset() is called', () => {
      const mw = limiter.middleware();

      for (let i = 0; i < 5; i++) {
        mw(req, res, next);
      }

      // Exceeded
      res.status.mockClear();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);

      // Reset
      limiter.reset();

      // Now allowed again
      next.mockClear();
      res.status.mockClear();
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Vote Controller Endpoints (POST, DELETE, GET)', () => {
    let req, res, next;
    let mockSubmission;

    beforeEach(() => {
      mockSubmission = {
        _id: dummySubmissionId,
        title: 'Project Antigravity',
        publicVoteCount: 3,
        save: jest.fn().mockResolvedValue(true),
      };

      req = {
        params: { submissionId: dummySubmissionId.toString() },
        body: {},
        headers: {
          'user-agent': 'Jest-Agent/1.0',
        },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      };

      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      next = jest.fn();

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSubmission);
      jest.spyOn(Vote, 'create').mockResolvedValue({});
      jest.spyOn(Vote, 'countDocuments').mockResolvedValue(1);
      jest.spyOn(Vote, 'findOne').mockResolvedValue(null);
      jest.spyOn(Vote, 'findOneAndDelete').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
      jest.spyOn(AuditLog, 'create').mockResolvedValue(true);
    });

    describe('POST /api/v1/votes/:submissionId (castVote)', () => {
      it('should successfully record a vote and increment publicVoteCount', async () => {
        await voteController.castVote(req, res, next);

        expect(Submission.findById).toHaveBeenCalledWith(dummySubmissionId.toString());
        expect(Vote.create).toHaveBeenCalledWith(
          expect.objectContaining({
            submission: dummySubmissionId,
            voterHash: expect.any(String),
            user: null,
          })
        );
        expect(mockSubmission.publicVoteCount).toBe(4);
        expect(mockSubmission.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: 'Vote successfully recorded!',
            data: {
              submissionId: dummySubmissionId,
              newVoteCount: 4,
              voted: true,
            },
          })
        );
      });

      it('should record user ID when authenticated', async () => {
        req.user = { _id: dummyUserId };

        await voteController.castVote(req, res, next);

        expect(Vote.create).toHaveBeenCalledWith(
          expect.objectContaining({
            submission: dummySubmissionId,
            user: dummyUserId,
          })
        );
      });

      it('should reject duplicate vote with 409 Conflict if unique constraint fails', async () => {
        const duplicateErr = new Error('E11000 duplicate key error');
        duplicateErr.code = 11000;
        jest.spyOn(Vote, 'create').mockRejectedValue(duplicateErr);

        await voteController.castVote(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'You have already voted for this project within the last 24 hours.',
          })
        );
      });

      it('should detect velocity spike anomaly (>= 10 votes in last min) and log to AuditLog', async () => {
        jest.spyOn(Vote, 'countDocuments').mockResolvedValue(12);

        await voteController.castVote(req, res, next);

        expect(AuditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'VOTE_ANOMALY_DETECTED',
            targetResource: 'Submission',
            resourceId: dummySubmissionId,
          })
        );
      });

      it('should return 400 if submissionId is invalid format', async () => {
        req.params.submissionId = 'invalid-id-xyz';

        await voteController.castVote(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Invalid submission ID format.',
          })
        );
      });

      it('should return 404 if submission is not found', async () => {
        jest.spyOn(Submission, 'findById').mockResolvedValue(null);

        await voteController.castVote(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Submission not found.',
          })
        );
      });
    });

    describe('DELETE /api/v1/votes/:submissionId (unvote)', () => {
      it('should successfully remove a vote and decrement publicVoteCount', async () => {
        await voteController.unvote(req, res, next);

        expect(Submission.findById).toHaveBeenCalledWith(dummySubmissionId.toString());
        expect(Vote.findOneAndDelete).toHaveBeenCalledWith(
          expect.objectContaining({
            submission: dummySubmissionId,
            voterHash: expect.any(String),
          })
        );
        expect(mockSubmission.publicVoteCount).toBe(2);
        expect(mockSubmission.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: 'Vote successfully removed!',
            data: {
              submissionId: dummySubmissionId,
              newVoteCount: 2,
              voted: false,
            },
          })
        );
      });

      it('should not allow publicVoteCount to decrement below zero', async () => {
        mockSubmission.publicVoteCount = 0;

        await voteController.unvote(req, res, next);

        expect(mockSubmission.publicVoteCount).toBe(0);
        expect(mockSubmission.save).toHaveBeenCalled();
      });

      it('should return 404 if no active vote is found to remove', async () => {
        jest.spyOn(Vote, 'findOneAndDelete').mockResolvedValue(null);

        await voteController.unvote(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'No active vote found for this project to remove.',
          })
        );
      });

      it('should return 404 if submission does not exist', async () => {
        jest.spyOn(Submission, 'findById').mockResolvedValue(null);

        await voteController.unvote(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Submission not found.',
          })
        );
      });

      it('should return 400 for invalid submission ID', async () => {
        req.params.submissionId = 'not-a-mongo-id';

        await voteController.unvote(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Invalid submission ID format.',
          })
        );
      });
    });

    describe('GET /api/v1/votes/:submissionId (getVoteStatus)', () => {
      it('should return hasVoted: true when user has active vote', async () => {
        jest.spyOn(Vote, 'findOne').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

        await voteController.getVoteStatus(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: {
              submissionId: dummySubmissionId,
              hasVoted: true,
              voteCount: 3,
            },
          })
        );
      });

      it('should return hasVoted: false when user has not voted', async () => {
        jest.spyOn(Vote, 'findOne').mockResolvedValue(null);

        await voteController.getVoteStatus(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: {
              submissionId: dummySubmissionId,
              hasVoted: false,
              voteCount: 3,
            },
          })
        );
      });
    });
  });

  describe('4. Supertest End-to-End Route Integration', () => {
    it('POST /api/v1/votes/:submissionId and DELETE /api/v1/votes/:submissionId via Express Router', async () => {
      const mockSub = {
        _id: dummySubmissionId,
        title: 'Supertest Project',
        publicVoteCount: 5,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Vote, 'create').mockResolvedValue({});
      jest.spyOn(Vote, 'findOneAndDelete').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
      jest.spyOn(Vote, 'countDocuments').mockResolvedValue(1);

      // POST vote
      const postRes = await request(app)
        .post(`/api/v1/votes/${dummySubmissionId}`)
        .set('User-Agent', 'Supertest-Agent');

      expect(postRes.status).toBe(200);
      expect(postRes.body.success).toBe(true);
      expect(postRes.body.data.newVoteCount).toBe(6);

      // DELETE unvote
      const delRes = await request(app)
        .delete(`/api/v1/votes/${dummySubmissionId}`)
        .set('User-Agent', 'Supertest-Agent');

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(delRes.body.data.newVoteCount).toBe(5);
    });

    it('Backward-compatible POST /api/v1/votes with body { submissionId }', async () => {
      const mockSub = {
        _id: dummySubmissionId,
        title: 'Legacy Compatibility Project',
        publicVoteCount: 10,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Vote, 'create').mockResolvedValue({});
      jest.spyOn(Vote, 'countDocuments').mockResolvedValue(1);

      const res = await request(app)
        .post('/api/v1/votes')
        .send({ submissionId: dummySubmissionId.toString() })
        .set('User-Agent', 'Legacy-Widget-Agent');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.newVoteCount).toBe(11);
    });
  });
});
