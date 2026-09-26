const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/index');
const submissionController = require('../src/controllers/submissionController');
const Submission = require('../src/models/Submission');
const Team = require('../src/models/Team');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const AuditLog = require('../src/models/AuditLog');

describe('Submission Controller & Static Serving Unit Tests', () => {
  let req, res, next;
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyTeamId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    if (AuditLog.create.mockRestore) AuditLog.create.mockRestore();
    jest.spyOn(AuditLog, 'create').mockResolvedValue(true);
    req = {
      body: {},
      params: {},
      query: {},
      user: {
        _id: dummyUserId,
        role: 'participant',
        teamId: dummyTeamId,
        save: jest.fn().mockResolvedValue(true),
      },
      ip: '127.0.0.1',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('POST /api/v1/submissions (upsertSubmission)', () => {
    it('should reject with 400 when user does not belong to a team', async () => {
      req.user.teamId = null;
      jest.spyOn(Team, 'findById').mockResolvedValue(null);
      jest.spyOn(Team, 'findOne').mockResolvedValue(null);

      await submissionController.upsertSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/form or join a team/i),
        })
      );
    });

    it('should reject with 423 when submission is already locked or submitted', async () => {
      const mockTeam = { _id: dummyTeamId, name: 'CyberDinos', track: 'AI/ML' };
      const mockSubmission = { _id: new mongoose.Types.ObjectId(), status: 'submitted' };

      jest.spyOn(Team, 'findById').mockResolvedValue(mockTeam);
      jest.spyOn(Submission, 'findOne').mockResolvedValue(mockSubmission);

      await submissionController.upsertSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(423);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/locked and can no longer be edited/i),
        })
      );
    });

    it('should create a new draft submission when none exists', async () => {
      const mockTeam = { _id: dummyTeamId, name: 'CyberDinos', track: 'AI/ML' };
      const createdSub = {
        _id: new mongoose.Types.ObjectId(),
        team: dummyTeamId,
        title: 'Project Raptor',
        tagline: 'ML Evaluation Engine',
        track: 'AI/ML',
        githubUrl: 'https://github.com/raptor/eval',
        demoVideoUrl: 'https://youtu.be/demo',
        description: '# Project Details',
        thumbnailUrl: '/uploads/default-thumbnail.webp',
        status: 'draft',
      };

      jest.spyOn(Team, 'findById').mockResolvedValue(mockTeam);
      jest.spyOn(Submission, 'findOne').mockResolvedValue(null);
      jest.spyOn(Submission, 'create').mockResolvedValue(createdSub);

      req.body = {
        title: 'Project Raptor',
        tagline: 'ML Evaluation Engine',
        repoUrl: 'https://github.com/raptor/eval',
        demoUrl: 'https://youtu.be/demo',
        descriptionMarkdown: '# Project Details',
      };

      await submissionController.upsertSubmission(req, res, next);

      expect(Submission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          team: dummyTeamId,
          title: 'Project Raptor',
          tagline: 'ML Evaluation Engine',
          track: 'AI/ML',
          githubUrl: 'https://github.com/raptor/eval',
          demoVideoUrl: 'https://youtu.be/demo',
          description: '# Project Details',
          status: 'draft',
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Submission draft created successfully.',
        data: { submission: createdSub },
      });
    });

    it('should update an existing draft submission', async () => {
      const mockTeam = { _id: dummyTeamId, name: 'CyberDinos', track: 'AI/ML' };
      const existingSub = {
        _id: new mongoose.Types.ObjectId(),
        team: dummyTeamId,
        title: 'Old Title',
        tagline: 'Old Tagline',
        githubUrl: 'https://github.com/old/repo',
        demoVideoUrl: '',
        description: 'Old description',
        thumbnailUrl: '/uploads/default-thumbnail.webp',
        status: 'draft',
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Team, 'findById').mockResolvedValue(mockTeam);
      jest.spyOn(Submission, 'findOne').mockResolvedValue(existingSub);

      req.body = {
        title: 'Updated Title',
        tagline: 'Updated Tagline',
        githubUrl: 'https://github.com/new/repo',
        description: 'Updated markdown',
        thumbnailUrl: '/uploads/thumbnails/custom.png',
      };

      await submissionController.upsertSubmission(req, res, next);

      expect(existingSub.title).toBe('Updated Title');
      expect(existingSub.tagline).toBe('Updated Tagline');
      expect(existingSub.githubUrl).toBe('https://github.com/new/repo');
      expect(existingSub.description).toBe('Updated markdown');
      expect(existingSub.thumbnailUrl).toBe('/uploads/thumbnails/custom.png');
      expect(existingSub.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Submission successfully saved.',
        data: { submission: existingSub },
      });
    });

    it('should resolve user team from membership if teamId is not set on user', async () => {
      req.user.teamId = null;
      const mockTeam = { _id: dummyTeamId, name: 'Fallback Team', track: 'Web3' };
      const createdSub = {
        _id: new mongoose.Types.ObjectId(),
        team: dummyTeamId,
        title: "Fallback Team's Project",
        status: 'draft',
      };

      jest.spyOn(Team, 'findById').mockResolvedValue(null);
      jest.spyOn(Team, 'findOne').mockResolvedValue(mockTeam);
      jest.spyOn(Submission, 'findOne').mockResolvedValue(null);
      jest.spyOn(Submission, 'create').mockResolvedValue(createdSub);

      await submissionController.upsertSubmission(req, res, next);

      expect(Team.findOne).toHaveBeenCalledWith({
        $or: [{ members: dummyUserId.toString() }, { captain: dummyUserId.toString() }],
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { submission: createdSub },
        })
      );
    });
  });

  describe('GET /api/v1/submissions/my-submission (getMySubmission)', () => {
    it('should return 404 when user has no team', async () => {
      req.user.teamId = null;
      jest.spyOn(Team, 'findById').mockResolvedValue(null);
      jest.spyOn(Team, 'findOne').mockResolvedValue(null);

      await submissionController.getMySubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User does not belong to a team.',
      });
    });

    it('should return 404 when team has no submission yet', async () => {
      const mockTeam = { _id: dummyTeamId, name: 'CyberDinos' };
      const populateChain = {
        populate: jest.fn().mockReturnThis(),
      };
      // Emulate chained populate returning null
      populateChain.populate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(null),
      }));

      jest.spyOn(Team, 'findById').mockResolvedValue(mockTeam);
      jest.spyOn(Submission, 'findOne').mockReturnValue(populateChain);

      await submissionController.getMySubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No submission found for this team.',
      });
    });

    it('should return 200 with populated submission when found', async () => {
      const mockTeam = { _id: dummyTeamId, name: 'CyberDinos', track: 'AI/ML' };
      const mockSub = {
        _id: new mongoose.Types.ObjectId(),
        team: mockTeam,
        title: 'Neural Engine',
        tagline: 'Deep Learning',
        status: 'draft',
      };

      const populateChain = {
        populate: jest.fn().mockImplementation(() => ({
          populate: jest.fn().mockResolvedValue(mockSub),
        })),
      };

      jest.spyOn(Team, 'findById').mockResolvedValue(mockTeam);
      jest.spyOn(Submission, 'findOne').mockReturnValue(populateChain);

      await submissionController.getMySubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { submission: mockSub },
      });
    });
  });

  describe('POST /api/v1/submissions/:id/finalize (finalizeSubmission)', () => {
    const dummySubId = new mongoose.Types.ObjectId();
    const validDescription = 'A'.repeat(120);

    it('should return 404 for invalid ObjectId in :id', async () => {
      req.params = { id: 'invalid-id' };
      await submissionController.finalizeSubmission(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Project submission not found.' })
      );
    });

    it('should return 404 when submission does not exist', async () => {
      req.params = { id: dummySubId.toString() };
      jest.spyOn(Submission, 'findById').mockResolvedValue(null);

      await submissionController.finalizeSubmission(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'No submission found to finalize.' })
      );
    });

    it('should return 403 when participant attempts to finalize a submission from another team', async () => {
      req.params = { id: dummySubId.toString() };
      const otherTeamId = new mongoose.Types.ObjectId();
      const mockSub = {
        _id: dummySubId,
        team: otherTeamId,
        title: 'Other Team Project',
      };
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Team, 'findById').mockResolvedValue({ _id: dummyTeamId });

      await submissionController.finalizeSubmission(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringMatching(/not authorized/i) })
      );
    });

    it('should return 423 Locked with message "Submission window has closed" when current server time > deadline', async () => {
      req.params = { id: dummySubId.toString() };
      const mockSub = {
        _id: dummySubId,
        team: dummyTeamId,
        title: 'Project Title',
        tagline: 'Great Pitch',
        track: 'AI/ML',
        description: validDescription,
        save: jest.fn().mockResolvedValue(true),
      };
      const pastDeadline = new Date(Date.now() - 3600000);
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Event, 'findOne').mockResolvedValue({ submissionDeadline: pastDeadline });

      await submissionController.finalizeSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(423);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Submission window has closed',
        })
      );
    });

    it('should reject with 400 when Title is missing', async () => {
      req.params = { id: dummySubId.toString() };
      const futureDeadline = new Date(Date.now() + 3600000);
      const mockSub = {
        _id: dummySubId,
        team: dummyTeamId,
        title: '',
        tagline: 'A valid pitch',
        track: 'AI/ML',
        description: validDescription,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Event, 'findOne').mockResolvedValue({ submissionDeadline: futureDeadline });

      await submissionController.finalizeSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Title/i),
        })
      );
    });

    it('should reject with 400 when Pitch is missing', async () => {
      req.params = { id: dummySubId.toString() };
      const futureDeadline = new Date(Date.now() + 3600000);
      const mockSub = {
        _id: dummySubId,
        team: dummyTeamId,
        title: 'Neural Engine',
        tagline: '',
        track: 'AI/ML',
        description: validDescription,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Event, 'findOne').mockResolvedValue({ submissionDeadline: futureDeadline });

      await submissionController.finalizeSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Pitch/i),
        })
      );
    });

    it('should reject with 400 when Track is missing', async () => {
      req.params = { id: dummySubId.toString() };
      const futureDeadline = new Date(Date.now() + 3600000);
      const mockSub = {
        _id: dummySubId,
        team: dummyTeamId,
        title: 'Neural Engine',
        tagline: 'AI evaluation tool',
        track: '',
        description: validDescription,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Event, 'findOne').mockResolvedValue({ submissionDeadline: futureDeadline });

      await submissionController.finalizeSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Track/i),
        })
      );
    });

    it('should reject with 400 when Description is less than 100 characters', async () => {
      req.params = { id: dummySubId.toString() };
      const futureDeadline = new Date(Date.now() + 3600000);
      const shortDesc = 'Too short description';
      const mockSub = {
        _id: dummySubId,
        team: dummyTeamId,
        title: 'Neural Engine',
        tagline: 'AI evaluation tool',
        track: 'AI/ML',
        description: shortDesc,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Event, 'findOne').mockResolvedValue({ submissionDeadline: futureDeadline });

      await submissionController.finalizeSubmission(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/100 characters/i),
        })
      );
    });

    it('should flip status to submitted, set submittedAt, and mark team.hasSubmitted when valid', async () => {
      req.params = { id: dummySubId.toString() };
      const futureDeadline = new Date(Date.now() + 3600000);
      const mockTeam = {
        _id: dummyTeamId,
        hasSubmitted: false,
        save: jest.fn().mockResolvedValue(true),
      };
      const mockSub = {
        _id: dummySubId,
        team: dummyTeamId,
        title: 'Neural Engine',
        tagline: 'Autonomous air-gapped machine learning evaluator',
        track: 'AI/ML',
        description: validDescription,
        status: 'draft',
        submittedAt: null,
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(Submission, 'findById').mockResolvedValue(mockSub);
      jest.spyOn(Team, 'findById').mockResolvedValue(mockTeam);
      jest.spyOn(Event, 'findOne').mockResolvedValue({ submissionDeadline: futureDeadline });

      await submissionController.finalizeSubmission(req, res, next);

      expect(mockSub.status).toBe('submitted');
      expect(mockSub.submittedAt).toBeInstanceOf(Date);
      expect(mockSub.save).toHaveBeenCalled();
      expect(mockTeam.hasSubmitted).toBe(true);
      expect(mockTeam.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/submitted and locked/i),
          data: { submission: mockSub },
        })
      );
    });
  });

  describe('Static Uploads Serving (/uploads/)', () => {
    it('should serve default-thumbnail.webp at /uploads/default-thumbnail.webp with 200 and image/webp type', async () => {
      const res = await request(app).get('/uploads/default-thumbnail.webp');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/webp/);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('should return 404 JSON for non-existent upload files', async () => {
      const res = await request(app).get('/uploads/non-existent-image-12345.png');
      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Route Precedence & Auth Protection', () => {
    it('GET /api/v1/submissions/my-submission requires authentication', async () => {
      const res = await request(app).get('/api/v1/submissions/my-submission');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authentication token required/i);
    });

    it('GET /api/v1/submissions/:id returns 404 for invalid ObjectId without throwing 500 CastError', async () => {
      const res = await request(app).get('/api/v1/submissions/invalid-id-string');
      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Project submission not found.');
    });

    it('POST /api/v1/submissions/:id/finalize requires authentication', async () => {
      const res = await request(app).post('/api/v1/submissions/652f12345678901234567890/finalize');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Authentication token required/i);
    });

    it('GET /api/v1/submissions/public is accessible publicly and not intercepted by /:id', async () => {
      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(Submission, 'find').mockReturnValue(mockFindQuery);

      const res = await request(app).get('/api/v1/submissions/public');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submissions).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });
  });

  describe('GET /api/v1/submissions/public (getPublicSubmissions)', () => {
    it('returns all finalized submissions with selected team and track metadata', async () => {
      const mockSubmissions = [
        {
          _id: new mongoose.Types.ObjectId(),
          title: 'Neural Raptor',
          tagline: 'ML evaluator',
          track: 'AI/ML',
          status: 'submitted',
          team: {
            _id: dummyTeamId,
            name: 'CyberDinos',
            track: 'AI/ML',
            members: [dummyUserId],
          },
        },
      ];

      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockSubmissions),
      };
      jest.spyOn(Submission, 'find').mockReturnValue(mockFindQuery);

      req.query = {};
      await submissionController.getPublicSubmissions(req, res, next);

      expect(Submission.find).toHaveBeenCalledWith({ status: { $in: ['submitted', 'locked'] } });
      expect(mockFindQuery.populate).toHaveBeenCalledWith('team', 'name track members');
      expect(mockFindQuery.populate).toHaveBeenCalledWith('teamId', 'name track members');
      expect(mockFindQuery.sort).toHaveBeenCalledWith({ publicVoteCount: -1, createdAt: -1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          submissions: mockSubmissions,
          total: 1,
        },
      });
    });

    it('filters by track when track query parameter is provided and not "All"', async () => {
      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(Submission, 'find').mockReturnValue(mockFindQuery);

      req.query = { track: 'HealthTech' };
      await submissionController.getPublicSubmissions(req, res, next);

      expect(Submission.find).toHaveBeenCalledWith({
        status: { $in: ['submitted', 'locked'] },
        track: 'HealthTech',
      });
    });

    it('applies full-text search indexing filter when search query parameter is provided', async () => {
      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(Submission, 'find').mockReturnValue(mockFindQuery);

      req.query = { search: 'telemetry diagnostics' };
      await submissionController.getPublicSubmissions(req, res, next);

      expect(Submission.find).toHaveBeenCalledWith({
        status: { $in: ['submitted', 'locked'] },
        $text: { $search: 'telemetry diagnostics' },
      });
    });

    it('supports q parameter as alias for search', async () => {
      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(Submission, 'find').mockReturnValue(mockFindQuery);

      req.query = { q: 'blockchain' };
      await submissionController.getPublicSubmissions(req, res, next);

      expect(Submission.find).toHaveBeenCalledWith({
        status: { $in: ['submitted', 'locked'] },
        $text: { $search: 'blockchain' },
      });
    });

    it('combines track and text search filters correctly', async () => {
      const mockFindQuery = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(Submission, 'find').mockReturnValue(mockFindQuery);

      req.query = { track: 'AI/ML', search: 'raptor' };
      await submissionController.getPublicSubmissions(req, res, next);

      expect(Submission.find).toHaveBeenCalledWith({
        status: { $in: ['submitted', 'locked'] },
        track: 'AI/ML',
        $text: { $search: 'raptor' },
      });
    });

    it('handles exceptions and calls next(error)', async () => {
      const dbError = new Error('Database failure');
      jest.spyOn(Submission, 'find').mockImplementation(() => {
        throw dbError;
      });

      await submissionController.getPublicSubmissions(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
