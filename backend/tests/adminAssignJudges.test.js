const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const adminController = require('../src/controllers/adminController');
const Submission = require('../src/models/Submission');
const User = require('../src/models/User');
const JudgeAssignment = require('../src/models/JudgeAssignment');
const AuditLog = require('../src/models/AuditLog');

describe('Admin Controller - assignJudges Endpoint Unit & Route Tests', () => {
  let req, res, next;
  const dummyAdminId = new mongoose.Types.ObjectId();
  const dummySubId1 = new mongoose.Types.ObjectId();
  const dummySubId2 = new mongoose.Types.ObjectId();
  const dummyJudgeId1 = new mongoose.Types.ObjectId();
  const dummyJudgeId2 = new mongoose.Types.ObjectId();
  const dummyJudgeId3 = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    if (AuditLog.create.mockRestore) AuditLog.create.mockRestore();
    jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

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

  describe('Unit Tests: adminController.assignJudges', () => {
    it('should reject non-organizer/admin users with 403 Forbidden', async () => {
      req.user.role = 'participant';
      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/organizer or admin permissions required/i),
        })
      );
    });

    it('should reject invalid targetPerProject <= 0 with 400 Bad Request', async () => {
      req.body.targetPerProject = 0;
      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/positive integer/i),
        })
      );
    });

    it('should reject non-numeric targetPerProject with 400 Bad Request', async () => {
      req.body.targetPerProject = 'invalid-number';
      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/positive integer/i),
        })
      );
    });

    it('should return 400 if no submitted projects exist', async () => {
      jest.spyOn(Submission, 'find').mockResolvedValue([]);
      jest.spyOn(User, 'find').mockResolvedValue([{ _id: dummyJudgeId1, role: 'judge' }]);

      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/no submitted projects available/i),
        })
      );
    });

    it('should return 400 if no registered judges exist in system', async () => {
      jest.spyOn(Submission, 'find').mockResolvedValue([
        { _id: dummySubId1, track: 'AI/ML', teamId: 't1', status: 'submitted' },
      ]);
      jest.spyOn(User, 'find').mockResolvedValue([]);

      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/no registered judges found/i),
        })
      );
    });

    it('should return 400 with descriptive error when solver cannot satisfy constraints (e.g. quorum failure)', async () => {
      const mockSubmissions = [
        { _id: dummySubId1, track: 'AI/ML', teamId: 'team1', title: 'Sub 1', status: 'submitted' },
      ];
      // Only 2 judges, but targetPerProject is 3
      const mockJudges = [
        { _id: dummyJudgeId1, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
        { _id: dummyJudgeId2, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      jest.spyOn(Submission, 'find').mockResolvedValue(mockSubmissions);
      jest.spyOn(User, 'find').mockResolvedValue(mockJudges);

      req.body.targetPerProject = 3;
      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/insufficient judges available to satisfy target quorum/i),
        })
      );
    });

    it('should clear old uncompleted assignments, execute solver, batch-insert new assignments, and log audit', async () => {
      const mockSubmissions = [
        { _id: dummySubId1, track: 'AI/ML', teamId: 'team1', title: 'Sub 1', status: 'submitted' },
        { _id: dummySubId2, track: 'AI/ML', teamId: 'team2', title: 'Sub 2', status: 'submitted' },
      ];
      const mockJudges = [
        { _id: dummyJudgeId1, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
        { _id: dummyJudgeId2, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
        { _id: dummyJudgeId3, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      jest.spyOn(Submission, 'find').mockResolvedValue(mockSubmissions);
      jest.spyOn(User, 'find').mockResolvedValue(mockJudges);
      jest.spyOn(JudgeAssignment, 'deleteMany').mockResolvedValue({ deletedCount: 2 });
      
      const mockInsertedDocs = [
        { _id: new mongoose.Types.ObjectId(), judgeId: dummyJudgeId1, submissionId: dummySubId1, track: 'AI/ML', status: 'assigned' },
        { _id: new mongoose.Types.ObjectId(), judgeId: dummyJudgeId2, submissionId: dummySubId1, track: 'AI/ML', status: 'assigned' },
      ];
      jest.spyOn(JudgeAssignment, 'insertMany').mockResolvedValue(mockInsertedDocs);

      req.body = { targetPerProject: 2 };
      await adminController.assignJudges(req, res, next);

      // Verify deletion of old pending/assigned
      expect(JudgeAssignment.deleteMany).toHaveBeenCalledWith({
        status: { $in: ['assigned', 'pending'] },
      });

      // Verify batch insert was called with generated assignments
      expect(JudgeAssignment.insertMany).toHaveBeenCalledWith(
        expect.any(Array),
        { ordered: false }
      );

      // Verify AuditLog creation
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'JUDGES_ASSIGNED',
          targetResource: 'JudgeAssignment',
          actorId: dummyAdminId,
          payload: expect.objectContaining({
            totalAssigned: 4,
            targetPerProject: 2,
          }),
        })
      );

      // Verify successful response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/successfully assigned 4 judge evaluations/i),
          data: expect.objectContaining({
            totalAssigned: 4,
            judgeLoad: expect.any(Object),
            assignments: expect.any(Array),
          }),
        })
      );
    });

    it('should support optional eventId filter', async () => {
      const dummyEventId = new mongoose.Types.ObjectId();
      const mockSubmissions = [
        { _id: dummySubId1, event: dummyEventId, track: 'AI/ML', teamId: 't1', title: 'Sub 1', status: 'submitted' },
      ];
      const mockJudges = [
        { _id: dummyJudgeId1, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      const findSpy = jest.spyOn(Submission, 'find').mockResolvedValue(mockSubmissions);
      jest.spyOn(User, 'find').mockResolvedValue(mockJudges);
      jest.spyOn(JudgeAssignment, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
      jest.spyOn(JudgeAssignment, 'insertMany').mockResolvedValue([]);

      req.body = { targetPerProject: 1, eventId: dummyEventId };
      await adminController.assignJudges(req, res, next);

      expect(findSpy).toHaveBeenCalledWith({
        status: { $in: ['submitted', 'locked'] },
        event: dummyEventId,
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle partial bulk write duplicate errors gracefully', async () => {
      const mockSubmissions = [
        { _id: dummySubId1, track: 'AI/ML', teamId: 'team1', title: 'Sub 1', status: 'submitted' },
      ];
      const mockJudges = [
        { _id: dummyJudgeId1, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      jest.spyOn(Submission, 'find').mockResolvedValue(mockSubmissions);
      jest.spyOn(User, 'find').mockResolvedValue(mockJudges);
      jest.spyOn(JudgeAssignment, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

      const bulkError = new Error('Duplicate key');
      bulkError.code = 11000;
      jest.spyOn(JudgeAssignment, 'insertMany').mockRejectedValue(bulkError);
      jest.spyOn(JudgeAssignment, 'find').mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(), judgeId: dummyJudgeId1, submissionId: dummySubId1 },
      ]);

      req.body = { targetPerProject: 1 };
      await adminController.assignJudges(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            totalAssigned: 1,
          }),
        })
      );
    });
  });

  describe('Route Integration Tests: POST /api/v1/admin/assign-judges', () => {
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
      const res = await request(app)
        .post('/api/v1/admin/assign-judges')
        .send({ targetPerProject: 3 });

      expect(res.status).toBe(401);
    });

    it('should return 403 when user is not organizer or admin', async () => {
      const res = await request(app)
        .post('/api/v1/admin/assign-judges')
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ targetPerProject: 3 });

      expect(res.status).toBe(403);
    });

    it('should return 200 and create assignments when admin calls endpoint with valid data', async () => {
      const mockSubmissions = [
        { _id: dummySubId1, track: 'AI/ML', teamId: 't1', title: 'Sub 1', status: 'submitted' },
      ];
      const mockJudges = [
        { _id: dummyJudgeId1, role: 'judge', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      jest.spyOn(Submission, 'find').mockResolvedValue(mockSubmissions);
      jest.spyOn(User, 'find').mockResolvedValue(mockJudges);
      jest.spyOn(JudgeAssignment, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
      jest.spyOn(JudgeAssignment, 'insertMany').mockResolvedValue([
        { judgeId: dummyJudgeId1, submissionId: dummySubId1, track: 'AI/ML', status: 'assigned' },
      ]);

      const res = await request(app)
        .post('/api/v1/admin/assign-judges')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ targetPerProject: 1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAssigned).toBe(1);
      expect(res.body.data.judgeLoad).toBeDefined();
    });
  });
});
