const mongoose = require('mongoose');
const adminController = require('../src/controllers/adminController');
const Event = require('../src/models/Event');
const Rubric = require('../src/models/Rubric');
const AuditLog = require('../src/models/AuditLog');

describe('Admin Controller - Rubric Management Unit Tests', () => {
  let req, res, next;
  const dummyOrganizerId = new mongoose.Types.ObjectId();
  const dummyEventId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    if (AuditLog.create.mockRestore) AuditLog.create.mockRestore();
    jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

    req = {
      body: {},
      params: {},
      query: {},
      user: {
        _id: dummyOrganizerId,
        role: 'organizer',
      },
      ip: '127.0.0.1',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('POST /api/v1/admin/rubrics (upsertRubric)', () => {
    it('should reject non-organizer/admin users with 403 Forbidden', async () => {
      req.user.role = 'participant';
      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/organizer permissions required/i),
        })
      );
    });

    it('should return 404 when no active event is found', async () => {
      jest.spyOn(Event, 'findOne').mockImplementation((criteria) => {
        if (criteria && criteria.status === 'active') return Promise.resolve(null);
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      req.body.criteria = [
        { key: 'tech', label: 'Technical', weight: 1.0 },
      ];

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/active event not found/i),
        })
      );
    });

    it('should reject with 400 when rubric is locked', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: true,
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      req.body.criteria = [
        { key: 'tech', label: 'Technical Execution', weight: 1.0 },
      ];

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/rubric is locked against further modification/i),
        })
      );
    });

    it('should reject with 400 when criteria array is empty or missing', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      req.body = { criteria: [] };

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/criteria array is required and cannot be empty/i),
        })
      );
    });

    it('should reject with 400 when criteria weights do not sum to 1.0 (e.g. 0.8)', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      req.body = {
        criteria: [
          { key: 'tech', label: 'Tech', weight: 0.5 },
          { key: 'impact', label: 'Impact', weight: 0.3 },
        ],
      };

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/total criteria weight must sum to 1.0/i),
        })
      );
    });

    it('should reject with 400 when a criterion weight is invalid or out of range', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      req.body = {
        criteria: [
          { key: 'tech', label: 'Tech', weight: -0.2 },
          { key: 'impact', label: 'Impact', weight: 1.2 },
        ],
      };

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/must be a valid number between 0 and 1/i),
        })
      );
    });

    it('should successfully create a new rubric and sync event.rubric when none existed', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
        rubric: [],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(Event, 'updateOne').mockResolvedValue({ acknowledged: true });
      jest.spyOn(Rubric, 'findOne').mockResolvedValue(null);

      const createdRubricDoc = {
        _id: new mongoose.Types.ObjectId(),
        eventId: dummyEventId,
        criteria: [
          { key: 'tech', label: 'Technical Execution', weight: 0.6, minScore: 1, maxScore: 10, step: 1 },
          { key: 'impact', label: 'Impact', weight: 0.4, minScore: 1, maxScore: 10, step: 1 },
        ],
      };
      jest.spyOn(Rubric, 'create').mockResolvedValue(createdRubricDoc);

      req.body = {
        criteria: [
          { key: 'tech', label: 'Technical Execution', weight: 0.6 },
          { key: 'impact', label: 'Impact', weight: 0.4 },
        ],
      };

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Event rubric criteria successfully updated.',
          data: expect.objectContaining({
            rubric: createdRubricDoc,
            criteria: createdRubricDoc.criteria,
            eventId: dummyEventId,
          }),
        })
      );
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RUBRIC_CONFIGURED',
          actorRole: 'organizer',
        })
      );
      expect(Event.updateOne).toHaveBeenCalledWith(
        { _id: dummyEventId },
        expect.objectContaining({ $set: { rubric: expect.any(Array) } })
      );
    });

    it('should successfully update an existing rubric document and sync event.rubric', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
        rubric: [],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(Event, 'updateOne').mockResolvedValue({ acknowledged: true });

      const existingRubricDoc = {
        _id: new mongoose.Types.ObjectId(),
        eventId: dummyEventId,
        criteria: [],
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Rubric, 'findOne').mockResolvedValue(existingRubricDoc);

      req.body = {
        criteria: [
          { key: 'code', label: 'Code Quality', weight: 0.5 },
          { key: 'ux', label: 'UX Design', weight: 0.5 },
        ],
      };

      await adminController.upsertRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(existingRubricDoc.save).toHaveBeenCalled();
      expect(existingRubricDoc.criteria).toHaveLength(2);
      expect(existingRubricDoc.criteria[0].key).toBe('code');
      expect(existingRubricDoc.criteria[1].key).toBe('ux');
    });
  });

  describe('GET /api/v1/admin/rubrics (getRubric)', () => {
    it('should return 404 when no active event exists', async () => {
      jest.spyOn(Event, 'findOne').mockImplementation((criteria) => {
        if (criteria && criteria.status === 'active') return Promise.resolve(null);
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      await adminController.getRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/active event not found/i),
        })
      );
    });

    it('should return saved rubric document when one exists', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
        tracks: ['AI/ML', 'HealthTech'],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      const savedRubric = {
        _id: new mongoose.Types.ObjectId(),
        eventId: dummyEventId,
        criteria: [
          { key: 'c1', label: 'Crit 1', weight: 0.5 },
          { key: 'c2', label: 'Crit 2', weight: 0.5 },
        ],
      };
      jest.spyOn(Rubric, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(savedRubric),
      });

      await adminController.getRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            rubric: savedRubric,
            criteria: savedRubric.criteria,
            eventId: dummyEventId,
            rubricLocked: false,
            tracks: ['AI/ML', 'HealthTech'],
          }),
        })
      );
    });

    it('should fallback to event embedded rubric when no Rubric collection doc exists', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: true,
        tracks: ['AI/ML'],
        rubric: [
          { name: 'Execution', weight: 0.7, scaleMin: 1, scaleMax: 10 },
          { name: 'Polish', weight: 0.3, scaleMin: 1, scaleMax: 10 },
        ],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(Rubric, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await adminController.getRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            eventId: dummyEventId,
            rubricLocked: true,
            criteria: expect.arrayContaining([
              expect.objectContaining({ label: 'Execution', weight: 0.7 }),
              expect.objectContaining({ label: 'Polish', weight: 0.3 }),
            ]),
          }),
        })
      );
    });

    it('should fallback to default rubric criteria when event has no rubric configured', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
        tracks: [],
        rubric: [],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(Rubric, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await adminController.getRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            rubric: expect.objectContaining({
              criteria: expect.arrayContaining([
                expect.objectContaining({ key: 'technical_execution', weight: 0.3 }),
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('POST /api/v1/admin/events/lock-rubric (lockRubric)', () => {
    it('should reject non-organizer/admin users with 403 Forbidden', async () => {
      req.user.role = 'judge';
      await adminController.lockRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/organizer permissions required/i),
        })
      );
    });

    it('should return 404 when active event is not found', async () => {
      jest.spyOn(Event, 'findOne').mockImplementation((criteria) => {
        if (criteria && criteria.status === 'active') return Promise.resolve(null);
        return { sort: jest.fn().mockResolvedValue(null) };
      });

      await adminController.lockRubric(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/active event not found/i),
        })
      );
    });

    it('should freeze rubric by setting rubricLocked to true and log to AuditLog', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: false,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      await adminController.lockRubric(req, res, next);

      expect(mockEvent.rubricLocked).toBe(true);
      expect(mockEvent.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/locked against further modification/i),
          data: expect.objectContaining({
            eventId: dummyEventId,
            rubricLocked: true,
          }),
        })
      );
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RUBRIC_LOCKED',
          actorRole: 'organizer',
          payload: { eventId: dummyEventId, rubricLocked: true },
        })
      );
    });

    it('should allow unlocking rubric when locked: false is passed in body', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Hackathon 2026',
        rubricLocked: true,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      req.body = { locked: false };

      await adminController.lockRubric(req, res, next);

      expect(mockEvent.rubricLocked).toBe(false);
      expect(mockEvent.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/unlocked/i),
          data: expect.objectContaining({
            eventId: dummyEventId,
            rubricLocked: false,
          }),
        })
      );
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RUBRIC_UNLOCKED',
          actorRole: 'organizer',
        })
      );
    });
  });

  describe('Supertest Route Integration Tests', () => {
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const app = require('../src/index');
    const User = require('../src/models/User');

    const organizerToken = jwt.sign(
      { userId: dummyOrganizerId },
      process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026'
    );
    const mockOrganizerUser = {
      _id: dummyOrganizerId,
      role: 'organizer',
      name: 'Organizer',
      email: 'org@test.local',
    };

    beforeEach(() => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockOrganizerUser),
      });
    });

    it('GET /api/v1/admin/rubrics should require authentication', async () => {
      const res = await request(app).get('/api/v1/admin/rubrics');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/admin/rubrics should return 200 with valid organizer auth', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Active Tournament',
        rubricLocked: false,
        tracks: ['AI/ML'],
        rubric: [{ name: 'Tech', weight: 1.0, scaleMin: 1, scaleMax: 10 }],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(Rubric, 'findOne').mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const res = await request(app)
        .get('/api/v1/admin/rubrics')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rubric).toBeDefined();
    });

    it('POST /api/v1/admin/events/lock-rubric should lock rubric via route', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Active Tournament',
        rubricLocked: false,
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);

      const res = await request(app)
        .post('/api/v1/admin/events/lock-rubric')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ locked: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rubricLocked).toBe(true);
    });

    it('POST /api/v1/admin/rubrics should create/update rubric criteria via route', async () => {
      const mockEvent = {
        _id: dummyEventId,
        title: 'Active Tournament',
        rubricLocked: false,
        rubric: [],
      };
      jest.spyOn(Event, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(Event, 'updateOne').mockResolvedValue({ acknowledged: true });
      jest.spyOn(Rubric, 'findOne').mockResolvedValue(null);

      const createdRubric = {
        _id: new mongoose.Types.ObjectId(),
        eventId: dummyEventId,
        criteria: [
          { key: 'tech', label: 'Technical Execution', weight: 1.0, minScore: 1, maxScore: 10, step: 1 },
        ],
      };
      jest.spyOn(Rubric, 'create').mockResolvedValue(createdRubric);

      const res = await request(app)
        .post('/api/v1/admin/rubrics')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          criteria: [
            { key: 'tech', label: 'Technical Execution', weight: 1.0 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.criteria).toHaveLength(1);
    });
  });
});

