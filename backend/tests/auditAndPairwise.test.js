const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const AuditLog = require('../src/models/AuditLog');
const PairwiseComparison = require('../src/models/PairwiseComparison');
const Score = require('../src/models/Score');
const User = require('../src/models/User');
const Submission = require('../src/models/Submission');

describe('AuditLog, Middleware Hooks, and Pairwise Comparison Tests', () => {
  const dummyJudgeId = new mongoose.Types.ObjectId();
  const dummyAdminId = new mongoose.Types.ObjectId();
  const dummyParticipantId = new mongoose.Types.ObjectId();
  const dummySubAId = new mongoose.Types.ObjectId();
  const dummySubBId = new mongoose.Types.ObjectId();

  const adminToken = jwt.sign(
    { userId: dummyAdminId },
    process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026'
  );
  const judgeToken = jwt.sign(
    { userId: dummyJudgeId },
    process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026'
  );
  const participantToken = jwt.sign(
    { userId: dummyParticipantId },
    process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026'
  );

  beforeEach(() => {
    jest.clearAllMocks();
    if (AuditLog.create.mockRestore) AuditLog.create.mockRestore();

    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === dummyAdminId.toString()) {
        return {
          select: jest.fn().mockResolvedValue({
            _id: dummyAdminId,
            role: 'admin',
            name: 'Admin User',
            email: 'admin@dogfood.test',
          }),
        };
      }
      if (idStr === dummyJudgeId.toString()) {
        return {
          select: jest.fn().mockResolvedValue({
            _id: dummyJudgeId,
            role: 'judge',
            name: 'Judge User',
            email: 'judge@dogfood.test',
          }),
        };
      }
      return {
        select: jest.fn().mockResolvedValue({
          _id: dummyParticipantId,
          role: 'participant',
          name: 'Participant User',
          email: 'participant@dogfood.test',
        }),
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AuditLog Model Schema Specification', () => {
    it('should validate a valid AuditLog document with required fields', () => {
      const log = new AuditLog({
        actor: dummyAdminId,
        action: 'SCORE_OVERRIDE',
        targetResource: 'Score',
        targetId: new mongoose.Types.ObjectId(),
        previousState: { rawCompositeScore: 8.0 },
        newState: { rawCompositeScore: 9.5 },
        ipAddress: '192.168.1.100',
        timestamp: new Date(),
      });

      const err = log.validateSync();
      expect(err).toBeUndefined();
      expect(log.actor.toString()).toBe(dummyAdminId.toString());
      expect(log.action).toBe('SCORE_OVERRIDE');
      expect(log.targetResource).toBe('Score');
      expect(log.previousState).toEqual({ rawCompositeScore: 8.0 });
      expect(log.newState).toEqual({ rawCompositeScore: 9.5 });
      expect(log.ipAddress).toBe('192.168.1.100');
    });

    it('should allow diverse administrative actions such as RUBRIC_CHANGE and ROLE_ELEVATION', () => {
      ['SCORE_OVERRIDE', 'RUBRIC_CHANGE', 'ROLE_ELEVATION', 'JUDGES_ASSIGNED', 'NORMALIZATION_EXECUTED'].forEach((action) => {
        const log = new AuditLog({
          actor: dummyAdminId,
          action,
          targetResource: 'Event',
          targetId: new mongoose.Types.ObjectId(),
        });
        const err = log.validateSync();
        expect(err).toBeUndefined();
        expect(log.action).toBe(action);
      });
    });

    it('should synchronize actor and actorId, targetId and resourceId, ipAddress and ipHash for backward compatibility', () => {
      const targetId = new mongoose.Types.ObjectId();
      const log = new AuditLog({
        actor: dummyAdminId,
        action: 'SCORE_OVERRIDE',
        targetResource: 'Score',
        targetId,
        ipAddress: '10.0.0.1',
        previousState: { val: 1 },
        newState: { val: 2 },
      });

      log.validateSync();
      expect(log.actorId.toString()).toBe(dummyAdminId.toString());
      expect(log.resourceId.toString()).toBe(targetId.toString());
      expect(log.ipHash).toBe('10.0.0.1');
      expect(log.payload).toEqual({ previousState: { val: 1 }, newState: { val: 2 } });
    });
  });

  describe('PairwiseComparison Model Schema Specification', () => {
    it('should validate a valid PairwiseComparison document (A > B)', () => {
      const comparison = new PairwiseComparison({
        judge: dummyJudgeId,
        submissionA: dummySubAId,
        submissionB: dummySubBId,
        winner: dummySubAId,
        notes: 'Project A exhibited superior distributed consensus handling.',
      });

      const err = comparison.validateSync();
      expect(err).toBeUndefined();
      expect(comparison.judge.toString()).toBe(dummyJudgeId.toString());
      expect(comparison.submissionA.toString()).toBe(dummySubAId.toString());
      expect(comparison.submissionB.toString()).toBe(dummySubBId.toString());
      expect(comparison.winner.toString()).toBe(dummySubAId.toString());
      expect(comparison.notes).toContain('superior');
    });

    it('should reject when winner is neither submissionA nor submissionB', () => {
      const thirdSubId = new mongoose.Types.ObjectId();
      const comparison = new PairwiseComparison({
        judge: dummyJudgeId,
        submissionA: dummySubAId,
        submissionB: dummySubBId,
        winner: thirdSubId,
      });

      const err = comparison.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.winner).toBeDefined();
      expect(err.errors.winner.message).toMatch(/Winner must be either submissionA or submissionB/);
    });

    it('should reject when submissionA and submissionB are identical', () => {
      const comparison = new PairwiseComparison({
        judge: dummyJudgeId,
        submissionA: dummySubAId,
        submissionB: dummySubAId,
        winner: dummySubAId,
      });

      const err = comparison.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.submissionB).toBeDefined();
      expect(err.errors.submissionB.message).toMatch(/distinct/);
    });

    it('should fail validation if required fields are missing', () => {
      const empty = new PairwiseComparison({});
      const err = empty.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.judge).toBeDefined();
      expect(err.errors.submissionA).toBeDefined();
      expect(err.errors.submissionB).toBeDefined();
      expect(err.errors.winner).toBeDefined();
    });
  });

  describe('Mongoose Middleware Hooks on Score and User', () => {
    it('should automatically record SCORE_OVERRIDE in AuditLog when an existing Score is saved', async () => {
      const auditCreateSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      const scoreDoc = new Score({
        _id: new mongoose.Types.ObjectId(),
        judge: dummyJudgeId,
        submission: dummySubAId,
        criteriaScores: [{ key: 'tech', score: 7 }],
        rawCompositeScore: 7,
      });
      scoreDoc.isNew = false;
      scoreDoc._original = { rawCompositeScore: 7 };

      scoreDoc._actor = dummyAdminId;
      scoreDoc._ipAddress = '127.0.0.1';
      scoreDoc.rawCompositeScore = 9;

      // Execute registered pre and post save lifecycle hooks
      const preHooks = Score.schema.s.hooks._pres.get('save') || [];
      for (const hook of preHooks) {
        hook.fn.call(scoreDoc, () => {});
      }

      const postHooks = Score.schema.s.hooks._posts.get('save') || [];
      for (const hook of postHooks) {
        await hook.fn.call(scoreDoc, scoreDoc);
      }

      expect(auditCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SCORE_OVERRIDE',
          targetResource: 'Score',
          targetId: scoreDoc._id,
          actor: dummyAdminId,
          previousState: expect.objectContaining({ rawCompositeScore: 7 }),
          newState: expect.objectContaining({ rawCompositeScore: 9 }),
        })
      );
    });

    it('should automatically record ROLE_ELEVATION in AuditLog when a User role is modified', async () => {
      const auditCreateSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      const userDoc = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Bob Participant',
        email: 'bob@example.com',
        passwordHash: 'hash123',
        role: 'participant',
      });
      userDoc.isNew = false;
      userDoc._original = { role: 'participant' };

      userDoc._actor = dummyAdminId;
      userDoc._ipAddress = '127.0.0.1';
      userDoc.role = 'judge';

      const preHooks = User.schema.s.hooks._pres.get('save') || [];
      for (const hook of preHooks) {
        hook.fn.call(userDoc, () => {});
      }

      const postHooks = User.schema.s.hooks._posts.get('save') || [];
      for (const hook of postHooks) {
        await hook.fn.call(userDoc, userDoc);
      }

      expect(auditCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_ELEVATION',
          targetResource: 'User',
          targetId: userDoc._id,
          actor: dummyAdminId,
          previousState: expect.objectContaining({ role: 'participant' }),
          newState: expect.objectContaining({ role: 'judge' }),
        })
      );
    });
  });

  describe('POST /api/v1/judging/pairwise Endpoint', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .send({
          submissionA: dummySubAId.toString(),
          submissionB: dummySubBId.toString(),
          winner: dummySubAId.toString(),
        });

      expect(res.status).toBe(401);
    });

    it('should return 403 when user is participant', async () => {
      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .set('Authorization', `Bearer ${participantToken}`)
        .send({
          submissionA: dummySubAId.toString(),
          submissionB: dummySubBId.toString(),
          winner: dummySubAId.toString(),
        });

      expect(res.status).toBe(403);
    });

    it('should return 400 when submissionA or submissionB is missing', async () => {
      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submissionA: dummySubAId.toString(),
          winner: dummySubAId.toString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Both submissionA and submissionB are required/);
    });

    it('should return 400 when submissionA and submissionB are identical', async () => {
      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submissionA: dummySubAId.toString(),
          submissionB: dummySubAId.toString(),
          winner: dummySubAId.toString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/distinct projects/);
    });

    it('should return 404 if submissions do not exist in the database', async () => {
      jest.spyOn(Submission, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submissionA: dummySubAId.toString(),
          submissionB: dummySubBId.toString(),
          winner: dummySubAId.toString(),
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/could not be found/);
    });

    it('should return 201 and record pairwise comparison (A > B) successfully', async () => {
      jest.spyOn(Submission, 'findById').mockImplementation((id) => {
        const idStr = id.toString();
        return Promise.resolve({
          _id: idStr,
          title: idStr === dummySubAId.toString() ? 'Project Alpha' : 'Project Beta',
        });
      });

      const mockCreated = {
        _id: new mongoose.Types.ObjectId(),
        judge: dummyJudgeId,
        submissionA: dummySubAId,
        submissionB: dummySubBId,
        winner: dummySubAId,
        notes: 'Alpha demonstrated clearer utility',
      };
      jest.spyOn(PairwiseComparison, 'create').mockResolvedValue(mockCreated);

      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submissionA: dummySubAId.toString(),
          submissionB: dummySubBId.toString(),
          winner: dummySubAId.toString(),
          notes: 'Alpha demonstrated clearer utility',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.comparison).toBeDefined();
      expect(res.body.data.comparison.winner.toString()).toBe(dummySubAId.toString());
      expect(PairwiseComparison.create).toHaveBeenCalledWith(
        expect.objectContaining({
          judge: dummyJudgeId,
          submissionA: dummySubAId.toString(),
          submissionB: dummySubBId.toString(),
          winner: dummySubAId.toString(),
        })
      );
    });

    it('should resolve winner aliases such as submission_a / A or submission_b / B', async () => {
      jest.spyOn(Submission, 'findById').mockImplementation((id) => {
        return Promise.resolve({ _id: id.toString(), title: 'Test Project' });
      });

      jest.spyOn(PairwiseComparison, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        judge: dummyJudgeId,
        submissionA: dummySubAId,
        submissionB: dummySubBId,
        winner: dummySubBId,
      });

      const res = await request(app)
        .post('/api/v1/judging/pairwise')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submissionA: dummySubAId.toString(),
          submissionB: dummySubBId.toString(),
          winner: 'submission_b',
        });

      expect(res.status).toBe(201);
      expect(PairwiseComparison.create).toHaveBeenCalledWith(
        expect.objectContaining({
          winner: dummySubBId.toString(),
        })
      );
    });
  });

  describe('GET /api/v1/admin/audit-logs Endpoint', () => {
    it('should return 401 when no auth token provided', async () => {
      const res = await request(app).get('/api/v1/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('should return 403 when non-admin / non-organizer accesses audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${participantToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 with formatted logs, total count, and support pagination', async () => {
      const mockLogs = [
        {
          _id: new mongoose.Types.ObjectId(),
          actor: { _id: dummyAdminId, name: 'Admin User', role: 'admin' },
          action: 'SCORE_OVERRIDE',
          targetResource: 'Score',
          targetId: new mongoose.Types.ObjectId(),
          previousState: { score: 8 },
          newState: { score: 9.5 },
          ipAddress: '127.0.0.1',
          timestamp: new Date(),
        },
      ];

      const findChain = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLogs),
      };

      jest.spyOn(AuditLog, 'find').mockReturnValue(findChain);
      jest.spyOn(AuditLog, 'countDocuments').mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/admin/audit-logs?page=1&limit=50&action=SCORE_OVERRIDE')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logs.length).toBe(1);
      expect(res.body.data.logs[0].action).toBe('SCORE_OVERRIDE');
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.page).toBe(1);
    });
  });
});
