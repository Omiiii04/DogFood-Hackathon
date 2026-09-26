const User = require('../models/User');
const Team = require('../models/Team');
const Submission = require('../models/Submission');
const Score = require('../models/Score');
const JudgeAssignment = require('../models/JudgeAssignment');
const Event = require('../models/Event');
const Rubric = require('../models/Rubric');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');
const { solveJudgeAssignments } = require('../services/assignmentSolver');
const { normalizeScores } = require('../services/fastApiClient');
const { generateStandingsCSV } = require('../services/csvExporter');

exports.assignJudges = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer or Admin permissions required.',
      });
    }

    const target = req.body && req.body.targetPerProject !== undefined
      ? Number(req.body.targetPerProject)
      : 3;

    if (isNaN(target) || target <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid targetPerProject: must be a positive integer.',
      });
    }

    const submissionFilter = { status: { $in: ['submitted', 'locked'] } };
    if (req.body && req.body.eventId) {
      submissionFilter.event = req.body.eventId;
    }

    const submissions = await Submission.find(submissionFilter);
    const judges = await User.find({ role: 'judge' });

    if (!submissions || submissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No submitted projects available to assign.',
      });
    }

    if (!judges || judges.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No registered judges found in the system.',
      });
    }

    // Execute constraint-satisfied assignment engine
    let solution;
    try {
      solution = solveJudgeAssignments(submissions, judges, target);
    } catch (solverError) {
      return res.status(400).json({
        success: false,
        error: solverError.message || 'Unable to satisfy judge assignment constraints.',
      });
    }

    const { assignments, judgeLoad, totalAssigned } = solution;

    // Clear existing uncompleted assignments to prevent duplicates
    await JudgeAssignment.deleteMany({ status: { $in: ['assigned', 'pending'] } });

    // Batch-insert new assignments into MongoDB
    let insertedAssignments = [];
    if (assignments && assignments.length > 0) {
      try {
        insertedAssignments = await JudgeAssignment.insertMany(assignments, { ordered: false });
      } catch (insertError) {
        if (insertError.insertedDocs && insertError.insertedDocs.length > 0) {
          insertedAssignments = insertError.insertedDocs;
        } else if (insertError.code === 11000 || insertError.writeErrors) {
          insertedAssignments = await JudgeAssignment.find({
            submissionId: { $in: submissions.map((s) => s._id) },
          });
        } else {
          throw insertError;
        }
      }
    }

    // Audit log
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
    await AuditLog.create({
      actorId: req.user?._id,
      actorRole: req.user?.role || 'organizer',
      action: 'JUDGES_ASSIGNED',
      targetResource: 'JudgeAssignment',
      resourceId: req.user?._id,
      payload: { totalAssigned, judgeLoad, targetPerProject: target },
      ipHash,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully assigned ${totalAssigned} judge evaluations.`,
      data: {
        totalAssigned,
        judgeLoad,
        assignments: insertedAssignments.length > 0 ? insertedAssignments : assignments,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.runNormalization = async (req, res, next) => {
  try {
    const activeEvent = await Event.findOne({ status: 'active' });
    const eventId = activeEvent?._id || 'hackathon-2026';

    const scores = await Score.find();
    if (scores.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No judge score ballots found to normalize.',
      });
    }

    // Call FastAPI normalization microservice
    const result = await normalizeScores(eventId, scores, 3.0);

    // Save normalized score back to each score and submission
    if (result && result.standings) {
      for (const standing of result.standings) {
        await Score.updateMany(
          { submissionId: standing.submission_id },
          { normalizedScore: standing.normalized_score }
        );
      }
    }

    // Audit log
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
    await AuditLog.create({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: 'NORMALIZATION_EXECUTED',
      targetResource: 'Score',
      resourceId: req.user._id,
      payload: { totalProcessed: result.total_scores_processed },
      ipHash,
    });

    return res.status(200).json({
      success: true,
      message: 'Score normalization successfully computed by microservice.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getLeaderboard = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ status: { $in: ['submitted', 'locked'] } })
      .populate('teamId', 'name')
      .lean();

    const scores = await Score.find().lean();

    // Group scores by submissionId
    const scoresBySub = {};
    scores.forEach((s) => {
      const subId = s.submissionId.toString();
      if (!scoresBySub[subId]) scoresBySub[subId] = [];
      scoresBySub[subId].push(s);
    });

    const leaderboard = submissions.map((sub) => {
      const subId = sub._id.toString();
      const subScores = scoresBySub[subId] || [];

      const ballotCount = subScores.length;
      const rawMean =
        ballotCount > 0
          ? subScores.reduce((sum, s) => sum + s.totalRawScore, 0) / ballotCount
          : 0;

      const normalizedScore =
        ballotCount > 0 && subScores[0].normalizedScore != null
          ? subScores[0].normalizedScore
          : null;

      return {
        id: sub._id,
        title: sub.title,
        tagline: sub.tagline,
        track: sub.track,
        teamName: sub.teamId?.name || 'Unknown Team',
        repoUrl: sub.repoUrl,
        demoUrl: sub.demoUrl,
        thumbnailPath: sub.thumbnailPath,
        publicVoteCount: sub.publicVoteCount || 0,
        ballotCount,
        rawMean: Number(rawMean.toFixed(2)),
        normalizedScore: normalizedScore != null ? Number(normalizedScore.toFixed(2)) : null,
      };
    });

    // Default sort: if normalizedScore exists sort by normalizedScore desc, else rawMean desc
    leaderboard.sort((a, b) => {
      if (a.normalizedScore != null && b.normalizedScore != null) {
        return b.normalizedScore - a.normalizedScore;
      }
      return b.rawMean - a.rawMean;
    });

    // Assign rank
    leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });

    return res.status(200).json({
      success: true,
      data: { leaderboard },
    });
  } catch (error) {
    next(error);
  }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ status: { $in: ['submitted', 'locked'] } })
      .populate('teamId', 'name')
      .lean();

    const scores = await Score.find().lean();
    const scoresBySub = {};
    scores.forEach((s) => {
      const subId = s.submissionId.toString();
      if (!scoresBySub[subId]) scoresBySub[subId] = [];
      scoresBySub[subId].push(s);
    });

    const standings = submissions.map((sub) => {
      const subScores = scoresBySub[sub._id.toString()] || [];
      const ballotCount = subScores.length;
      const rawMean =
        ballotCount > 0
          ? subScores.reduce((sum, s) => sum + s.totalRawScore, 0) / ballotCount
          : 0;
      const normalizedScore =
        ballotCount > 0 ? subScores[0].normalizedScore : null;

      return {
        id: sub._id,
        title: sub.title,
        teamName: sub.teamId?.name || 'Unknown Team',
        track: sub.track,
        repoUrl: sub.repoUrl,
        ballotCount,
        rawMean,
        normalizedScore,
        publicVoteCount: sub.publicVoteCount || 0,
      };
    });

    standings.sort((a, b) => (b.normalizedScore || b.rawMean) - (a.normalizedScore || a.rawMean));
    standings.forEach((s, idx) => (s.rank = idx + 1));

    const csvContent = generateStandingsCSV(standings);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dogfood-2026-standings.csv"');
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .populate('actorId', 'fullName email role')
      .sort({ timestamp: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    next(error);
  }
};

exports.getSystemStats = async (req, res, next) => {
  try {
    const [totalUsers, totalTeams, totalSubmissions, totalJudges, totalScores, totalAssignments] =
      await Promise.all([
        User.countDocuments(),
        Team.countDocuments(),
        Submission.countDocuments({ status: { $in: ['submitted', 'locked'] } }),
        User.countDocuments({ role: 'judge' }),
        Score.countDocuments(),
        JudgeAssignment.countDocuments(),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalTeams,
        totalSubmissions,
        totalJudges,
        totalScores,
        totalAssignments,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admin/rubrics
 * Create or update event rubric criteria (organizer only).
 */
exports.upsertRubric = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer permissions required.',
      });
    }

    let event = null;
    if (req.body.eventId) {
      event = await Event.findById(req.body.eventId);
    } else {
      event = await Event.findOne({ status: 'active' });
      if (!event) {
        event = await Event.findOne().sort({ createdAt: -1 });
      }
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Active event not found.',
      });
    }

    if (event.rubricLocked) {
      return res.status(400).json({
        success: false,
        error: 'Rubric is locked against further modification once scoring begins.',
      });
    }

    const rawCriteria =
      req.body.criteria || req.body.rubric || (Array.isArray(req.body) ? req.body : null);

    if (!rawCriteria || !Array.isArray(rawCriteria) || rawCriteria.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Criteria array is required and cannot be empty.',
      });
    }

    const formattedCriteria = rawCriteria.map((item, index) => {
      const key =
        item.key ||
        (item.name
          ? item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
          : `criterion_${index + 1}`);
      const label = item.label || item.name || key;
      const description = item.description || '';
      const weight = typeof item.weight === 'number' ? item.weight : parseFloat(item.weight);
      const minScore =
        item.minScore !== undefined
          ? item.minScore
          : item.scaleMin !== undefined
          ? item.scaleMin
          : 0;
      const maxScore =
        item.maxScore !== undefined
          ? item.maxScore
          : item.scaleMax !== undefined
          ? item.scaleMax
          : 10;
      const step = item.step !== undefined ? item.step : 1;

      return {
        key,
        label,
        description,
        weight,
        minScore,
        maxScore,
        step,
      };
    });

    for (const c of formattedCriteria) {
      if (isNaN(c.weight) || c.weight < 0 || c.weight > 1) {
        return res.status(400).json({
          success: false,
          error: 'Each criterion weight must be a valid number between 0 and 1.',
        });
      }
    }

    const totalWeight = formattedCriteria.reduce((sum, c) => sum + c.weight, 0);
    const DELTA = 1e-5;
    if (Math.abs(totalWeight - 1.0) > DELTA) {
      return res.status(400).json({
        success: false,
        error: `Total criteria weight must sum to 1.0 (within delta ${DELTA}). Current sum: ${totalWeight}`,
      });
    }

    let rubricDoc = await Rubric.findOne({ eventId: event._id });
    if (rubricDoc) {
      rubricDoc.criteria = formattedCriteria;
      await rubricDoc.save();
    } else {
      rubricDoc = await Rubric.create({
        eventId: event._id,
        criteria: formattedCriteria,
      });
    }

    // Synchronize event.rubric
    event.rubric = formattedCriteria.map((c) => ({
      name: c.label,
      weight: c.weight,
      scaleMin: c.minScore >= 1 ? c.minScore : 1,
      scaleMax: c.maxScore || 10,
    }));
    await Event.updateOne({ _id: event._id }, { $set: { rubric: event.rubric } });

    // Audit log
    try {
      const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
      await AuditLog.create({
        actorId: req.user?._id,
        actorRole: req.user?.role,
        action: 'RUBRIC_CONFIGURED',
        targetResource: 'Rubric',
        resourceId: rubricDoc._id,
        payload: { eventId: event._id, criteriaCount: formattedCriteria.length },
        ipHash,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation failed:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Event rubric criteria successfully updated.',
      data: {
        rubric: rubricDoc,
        criteria: rubricDoc.criteria,
        eventId: event._id,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};
exports.createOrUpdateRubric = exports.upsertRubric;

/**
 * GET /api/v1/admin/rubrics
 * Return active event rubric configuration.
 */
exports.getRubric = async (req, res, next) => {
  try {
    let event = null;
    if (req.query.eventId) {
      event = await Event.findById(req.query.eventId);
    } else {
      event = await Event.findOne({ status: 'active' });
      if (!event) {
        event = await Event.findOne().sort({ createdAt: -1 });
      }
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Active event not found.',
      });
    }

    let rubric = await Rubric.findOne({ eventId: event._id }).lean();

    if (!rubric && event.rubric && event.rubric.length > 0) {
      const criteria = event.rubric.map((item) => ({
        key: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        label: item.name,
        description: '',
        weight: item.weight,
        minScore: item.scaleMin !== undefined ? item.scaleMin : 1,
        maxScore: item.scaleMax !== undefined ? item.scaleMax : 10,
        step: 1,
      }));
      rubric = {
        eventId: event._id,
        criteria,
      };
    } else if (!rubric) {
      const defaultCriteria = [
        {
          key: 'technical_execution',
          label: 'Technical Execution',
          description: 'Code quality, architecture, and engineering complexity',
          weight: 0.3,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
        {
          key: 'innovation',
          label: 'Innovation & Originality',
          description: 'Novelty of approach and creativity',
          weight: 0.25,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
        {
          key: 'practical_impact',
          label: 'Practical Impact',
          description: 'Real-world utility and viability',
          weight: 0.25,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
        {
          key: 'presentation',
          label: 'Polish & Presentation',
          description: 'Pitch clarity and UI polish',
          weight: 0.2,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
      ];
      rubric = {
        eventId: event._id,
        criteria: defaultCriteria,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        rubric,
        criteria: rubric.criteria,
        eventId: event._id,
        rubricLocked: Boolean(event.rubricLocked),
        tracks: event.tracks || [],
      },
    });
  } catch (error) {
    next(error);
  }
};
exports.getRubrics = exports.getRubric;

/**
 * POST /api/v1/admin/events/lock-rubric
 * Freeze rubric against further modification once scoring begins.
 */
exports.lockRubric = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer permissions required.',
      });
    }

    let event = null;
    if (req.body.eventId) {
      event = await Event.findById(req.body.eventId);
    } else {
      event = await Event.findOne({ status: 'active' });
      if (!event) {
        event = await Event.findOne().sort({ createdAt: -1 });
      }
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Active event not found.',
      });
    }

    const locked = req.body.locked !== undefined ? Boolean(req.body.locked) : true;
    event.rubricLocked = locked;
    await event.save();

    // Audit log
    try {
      const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
      await AuditLog.create({
        actorId: req.user?._id,
        actorRole: req.user?.role,
        action: locked ? 'RUBRIC_LOCKED' : 'RUBRIC_UNLOCKED',
        targetResource: 'Event',
        resourceId: event._id,
        payload: { eventId: event._id, rubricLocked: locked },
        ipHash,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation failed:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: locked
        ? 'Rubric has been successfully locked against further modification.'
        : 'Rubric has been unlocked.',
      data: {
        eventId: event._id,
        rubricLocked: event.rubricLocked,
      },
    });
  } catch (error) {
    next(error);
  }
};
exports.freezeRubric = exports.lockRubric;

