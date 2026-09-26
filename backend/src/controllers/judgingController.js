const mongoose = require('mongoose');
const Score = require('../models/Score');
const JudgeAssignment = require('../models/JudgeAssignment');
const Submission = require('../models/Submission');
const Event = require('../models/Event');
const Rubric = require('../models/Rubric');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');

exports.getAssignedQueue = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required.',
      });
    }

    // Query assignments strictly belonging to req.user.id
    const assignments = await JudgeAssignment.find({
      $or: [{ judgeId: userId }, { judge: userId }],
    })
      .populate({
        path: 'submissionId',
        populate: { path: 'teamId', select: 'name' },
      })
      .populate({
        path: 'submission',
        populate: { path: 'teamId', select: 'name' },
      })
      .sort({ status: 1, createdAt: 1 });

    // Attach existing scores if any (only authenticated judge's own score)
    const submissionIds = assignments
      .map((a) => a.submissionId?._id || a.submission?._id || a.submissionId || a.submission)
      .filter(Boolean);

    const existingScores = await Score.find({
      $and: [
        { $or: [{ judge: userId }, { judgeId: userId }] },
        {
          $or: [
            { submission: { $in: submissionIds } },
            { submissionId: { $in: submissionIds } },
          ],
        },
      ],
    });

    const scoreMap = {};
    existingScores.forEach((s) => {
      const subId = (s.submission || s.submissionId)?.toString();
      if (subId) scoreMap[subId] = s;
    });

    const queue = assignments
      .map((assignment) => {
        const sub = assignment.submissionId || assignment.submission;
        if (!sub) return null;
        const subIdStr = sub?._id ? sub._id.toString() : sub?.toString();
        const score = subIdStr ? scoreMap[subIdStr] || null : null;
        return {
          assignmentId: assignment._id,
          track: assignment.track,
          status: assignment.status,
          submission: sub,
          score,
        };
      })
      .filter(Boolean);

    const submissions = queue.map((item) => item.submission);

    return res.status(200).json({
      success: true,
      data: {
        queue,
        submissions,
      },
      submissions,
    });
  } catch (error) {
    next(error);
  }
};

exports.submitScore = async (req, res, next) => {
  try {
    const { submissionId, criteriaScores, privateNotes } = req.body;
    const userId = req.user._id || req.user.id;

    if (!submissionId || !criteriaScores || !Array.isArray(criteriaScores) || criteriaScores.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'submissionId and criteriaScores array are required.',
      });
    }

    // Calculate total weighted raw score
    let totalWeightedScore = 0;
    let totalWeight = 0;

    const normalizedCriteriaScores = criteriaScores.map((item) => {
      const key = item.key || item.criteriaName;
      const score = item.score !== undefined ? item.score : item.rawScore;
      const weight = item.weight !== undefined ? item.weight : 1.0;
      return {
        key,
        score,
        criteriaName: item.criteriaName || key,
        rawScore: score,
        weight,
      };
    });

    for (const item of normalizedCriteriaScores) {
      if (item.score < 1.0 || item.score > 10.0) {
        return res.status(400).json({
          success: false,
          error: `Raw score for ${item.key} must be between 1.0 and 10.0.`,
        });
      }
      totalWeightedScore += item.score * item.weight;
      totalWeight += item.weight;
    }

    const rawCompositeScore = Number((totalWeightedScore / totalWeight).toFixed(3));

    // Upsert score
    const score = await Score.findOneAndUpdate(
      {
        $or: [
          { judge: userId, submission: submissionId },
          { judgeId: userId, submissionId: submissionId },
        ],
      },
      {
        judge: userId,
        submission: submissionId,
        judgeId: userId,
        submissionId: submissionId,
        criteriaScores: normalizedCriteriaScores,
        rawCompositeScore,
        totalRawScore: rawCompositeScore,
        privateNotes: privateNotes || '',
        isFinal: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update assignment status
    await JudgeAssignment.findOneAndUpdate(
      {
        $or: [
          { judgeId: userId, submissionId: submissionId },
          { judge: userId, submission: submissionId },
        ],
      },
      { status: 'completed' }
    );

    // Log to audit log
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
    await AuditLog.create({
      actorId: userId,
      actorRole: req.user.role,
      action: 'SCORE_SUBMITTED',
      targetResource: 'Score',
      resourceId: score._id,
      payload: { submissionId, totalRawScore: rawCompositeScore, rawCompositeScore },
      ipHash,
    });

    return res.status(201).json({
      success: true,
      message: 'Evaluation ballot successfully recorded.',
      data: { score },
    });
  } catch (error) {
    next(error);
  }
};

exports.getScoreBySubmissionId = async (req, res, next) => {
  try {
    const submissionId = req.params.submissionId || req.params.scoreId || req.params.id;
    const userId = (req.user?._id || req.user?.id)?.toString();
    const isJudge = req.user?.role === 'judge';

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submissionId is required.',
      });
    }

    // 1. If param is a valid ObjectId, check if it directly matches a Score._id
    let ownScore = null;
    if (mongoose.Types.ObjectId.isValid(submissionId)) {
      const scoreDoc = await Score.findById(submissionId);
      if (scoreDoc) {
        const ownerId = (scoreDoc.judge || scoreDoc.judgeId)?.toString();
        if (isJudge && ownerId !== userId) {
          return res.status(403).json({
            success: false,
            error: "Security Violation: You are strictly prohibited from inspecting other judges' scores.",
            message: "Security Violation: You are strictly prohibited from inspecting other judges' scores.",
            statusCode: 403,
          });
        }
        if (ownerId === userId || ['organizer', 'admin'].includes(req.user?.role)) {
          ownScore = scoreDoc;
        }
      }
    }

    // 2. Query authenticated judge's own score ballot for this submission
    if (!ownScore) {
      ownScore = await Score.findOne({
        $and: [
          { $or: [{ submission: submissionId }, { submissionId: submissionId }] },
          { $or: [{ judge: userId }, { judgeId: userId }] },
        ],
      });
    }

    // 3. For organizers and admins: audit access
    if (!ownScore && ['organizer', 'admin'].includes(req.user?.role)) {
      const allScores = await Score.find({
        $or: [{ submission: submissionId }, { submissionId: submissionId }],
      });

      if (allScores.length > 0) {
        return res.status(200).json({
          success: true,
          data: {
            score: allScores[0],
            scores: allScores,
          },
          score: allScores[0],
        });
      }
    }

    // If still no score found for this judge and submission
    if (!ownScore) {
      return res.status(404).json({
        success: false,
        error: 'Score ballot not found.',
        message: 'Score ballot not found.',
        statusCode: 404,
      });
    }

    // Returns ONLY authenticated judge's own ballot; strips all competitor scores
    return res.status(200).json({
      success: true,
      data: {
        score: ownScore,
      },
      score: ownScore,
    });
  } catch (error) {
    next(error);
  }
};

exports.getScoreById = exports.getScoreBySubmissionId;

exports.getEventRubric = async (req, res, next) => {
  try {
    let event = await Event.findOne({ status: 'active' });
    if (!event) {
      event = await Event.findOne().sort({ createdAt: -1 });
    }

    const defaultRubric = [
      { name: 'Technical Execution', weight: 0.3, scaleMin: 1, scaleMax: 10 },
      { name: 'Innovation & Originality', weight: 0.25, scaleMin: 1, scaleMax: 10 },
      { name: 'Practical Impact', weight: 0.25, scaleMin: 1, scaleMax: 10 },
      { name: 'Polish & Presentation', weight: 0.2, scaleMin: 1, scaleMax: 10 },
    ];

    let rubric = event?.rubric?.length ? event.rubric : defaultRubric;

    if (event) {
      const rubricDoc = await Rubric.findOne({ eventId: event._id });
      if (rubricDoc && rubricDoc.criteria && rubricDoc.criteria.length > 0) {
        rubric = rubricDoc.criteria.map((c) => ({
          name: c.label || c.key,
          key: c.key,
          weight: c.weight,
          scaleMin: c.minScore !== undefined ? c.minScore : 1,
          scaleMax: c.maxScore !== undefined ? c.maxScore : 10,
        }));
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        rubric,
        tracks: event?.tracks || ['AI/ML', 'Web3 & Blockchain', 'FinTech', 'HealthTech'],
      },
    });
  } catch (error) {
    next(error);
  }
};
