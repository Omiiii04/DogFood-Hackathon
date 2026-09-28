const mongoose = require('mongoose');
const Score = require('../models/Score');
const JudgeAssignment = require('../models/JudgeAssignment');
const Submission = require('../models/Submission');
const Event = require('../models/Event');
const Rubric = require('../models/Rubric');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');
const PairwiseComparison = require('../models/PairwiseComparison');

exports.getAssignedQueue = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required.',
      });
    }

    try {
      const { ensureSubmissionsAssigned } = require('../services/assignmentSolver');
      await ensureSubmissionsAssigned();
    } catch (_) {}

    // Query assignments strictly belonging to req.user.id
    let assignments = await JudgeAssignment.find({
      $or: [{ judgeId: userId }, { judge: userId }],
    })
      .populate({
        path: 'submissionId',
        select: 'title tagline description githubUrl repoUrl demoVideoUrl demoUrl thumbnailUrl track status team teamId publicVoteCount submittedAt',
        populate: [
          { path: 'team', select: 'name' },
        ],
      })
      .sort({ status: 1, createdAt: 1 });

    // If judge has no assignments, try to explicitly assign them to submitted projects
    if (assignments.length === 0 && req.user?.role === 'judge') {
      try {
        const { autoAssignSubmission } = require('../services/assignmentSolver');
        const submittedSubs = await Submission.find({ status: { $in: ['submitted', 'locked'] } });
        for (const sub of submittedSubs) {
          await autoAssignSubmission(sub);
        }
        // Re-fetch after attempting assignment
        assignments = await JudgeAssignment.find({
          $or: [{ judgeId: userId }, { judge: userId }],
        })
          .populate({
            path: 'submissionId',
            select: 'title tagline description githubUrl repoUrl demoVideoUrl demoUrl thumbnailUrl track status team teamId publicVoteCount submittedAt',
            populate: [
              { path: 'team', select: 'name' },
            ],
          })
          .sort({ status: 1, createdAt: 1 });
      } catch (_) {}
    }

    const isOrganizerOrAdmin = ['organizer', 'admin'].includes(req.user?.role);
    if (isOrganizerOrAdmin) {
      // For organizers and admins, always surface all active submitted projects in the portal
      const allSubs = await Submission.find({ status: { $in: ['submitted', 'locked'] } })
        .select('title tagline description githubUrl repoUrl demoVideoUrl demoUrl thumbnailUrl track status team publicVoteCount submittedAt createdAt')
        .populate('team', 'name')
        .sort({ createdAt: -1 });

      const subIds = allSubs.map((s) => s._id);
      const existingScores = await Score.find({
        $and: [
          { $or: [{ judge: userId }, { judgeId: userId }] },
          {
            $or: [
              { submission: { $in: subIds } },
              { submissionId: { $in: subIds } },
            ],
          },
        ],
      });

      const scoreMap = {};
      existingScores.forEach((s) => {
        const subId = (s.submission || s.submissionId)?.toString();
        if (subId) scoreMap[subId] = s;
      });

      const queue = allSubs.map((sub) => {
        const subIdStr = sub._id.toString();
        const score = scoreMap[subIdStr] || null;
        return {
          assignmentId: sub._id,
          track: sub.track,
          status: score?.isFinal ? 'completed' : 'assigned',
          submission: sub,
          score,
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          queue,
          submissions: allSubs,
        },
        submissions: allSubs,
      });
    }

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


const isValidScore = (score) => {
  if (typeof score !== 'number' || isNaN(score) || !Number.isFinite(score)) return false;
  if (score < 1.0 || score > 10.0) return false;
  const doubled = Math.round(score * 1000) / 1000 * 2;
  return Math.abs(doubled - Math.round(doubled)) < 1e-6;
};

const resolveRubricWeights = async (criteriaScores) => {
  const missingAnyWeight = criteriaScores.some(
    (item) => item.weight === undefined || typeof item.weight !== 'number'
  );

  if (!missingAnyWeight) return null;

  let event = await Event.findOne({ status: 'active' });
  if (!event) event = await Event.findOne().sort({ createdAt: -1 });
  if (event) {
    const rubricDoc = await Rubric.findOne({ eventId: event._id });
    if (rubricDoc && rubricDoc.criteria && rubricDoc.criteria.length > 0) {
      const map = new Map();
      rubricDoc.criteria.forEach((c) => {
        map.set(c.key, c.weight);
        if (c.label) map.set(c.label, c.weight);
      });
      return map;
    } else if (event.rubric && event.rubric.length > 0) {
      const map = new Map();
      event.rubric.forEach((c) => {
        map.set(c.name, c.weight);
        if (c.key) map.set(c.key, c.weight);
      });
      return map;
    }
  }
  return null;
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

    const rubricMap = await resolveRubricWeights(criteriaScores);

    let totalWeightedScore = 0;
    let totalWeight = 0;

    const normalizedCriteriaScores = [];
    for (const item of criteriaScores) {
      const key = item.key || item.criteriaName;
      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'Each criterion must have a key or criteriaName.',
        });
      }

      const rawVal = item.score !== undefined ? item.score : item.rawScore;
      if (rawVal === undefined || rawVal === null || rawVal === '') {
        return res.status(400).json({
          success: false,
          error: `Score is required for criterion ${key}.`,
        });
      }

      const score = Number(rawVal);
      if (!isValidScore(score)) {
        return res.status(400).json({
          success: false,
          error: `Raw score for ${key} must be between 1.0 and 10.0 with step 0.5.`,
        });
      }

      let weight = item.weight;
      if (weight === undefined || typeof weight !== 'number') {
        if (rubricMap && rubricMap.has(key)) {
          weight = rubricMap.get(key);
        } else {
          weight = 1.0 / criteriaScores.length;
        }
      }

      normalizedCriteriaScores.push({
        key,
        score,
        criteriaName: item.criteriaName || key,
        rawScore: score,
        weight,
      });

      totalWeightedScore += score * weight;
      totalWeight += weight;
    }

    // rawCompositeScore = \sum (w_c \times score_c)
    let rawCompositeScore;
    if (Math.abs(totalWeight - 1.0) < 1e-5) {
      rawCompositeScore = Number(totalWeightedScore.toFixed(3));
    } else {
      rawCompositeScore = Number((totalWeightedScore / (totalWeight || 1)).toFixed(3));
    }

    // Upsert score
    const score = await Score.findOneAndUpdate(
      {
        judge: userId,
        submission: submissionId,
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
    const subObjId = mongoose.Types.ObjectId.isValid(submissionId) ? new mongoose.Types.ObjectId(submissionId) : submissionId;
    const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
    await JudgeAssignment.findOneAndUpdate(
      {
        $or: [
          { judgeId: userObjId, submissionId: subObjId },
          { judge: userObjId, submission: subObjId },
          { judgeId: userId, submissionId: submissionId },
          { judge: userId, submission: submissionId },
        ],
      },
      { status: 'completed' },
      { new: true }
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
      score,
    });
  } catch (error) {
    next(error);
  }
};

exports.saveDraftScore = async (req, res, next) => {
  try {
    const { submissionId, criteriaScores, privateNotes } = req.body;
    const userId = req.user._id || req.user.id;

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submissionId is required.',
      });
    }

    // Reject draft updates for completed evaluation ballots
    const existingAssignment = await JudgeAssignment.findOne({
      $or: [
        { judgeId: userId, submissionId: submissionId },
        { judge: userId, submission: submissionId },
      ],
    });

    if (existingAssignment && existingAssignment.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update draft for an evaluation ballot that has already been submitted.',
      });
    }

    let normalizedCriteriaScores = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;

    if (Array.isArray(criteriaScores) && criteriaScores.length > 0) {
      const rubricMap = await resolveRubricWeights(criteriaScores);

      for (const item of criteriaScores) {
        const key = item.key || item.criteriaName;
        if (!key) continue;

        const rawVal = item.score !== undefined ? item.score : item.rawScore;
        if (rawVal === undefined || rawVal === null || rawVal === '') continue;

        const score = Number(rawVal);
        if (!isValidScore(score)) {
          return res.status(400).json({
            success: false,
            error: `Raw score for ${key} must be between 1.0 and 10.0 with step 0.5.`,
          });
        }

        let weight = item.weight;
        if (weight === undefined || typeof weight !== 'number') {
          if (rubricMap && rubricMap.has(key)) {
            weight = rubricMap.get(key);
          } else {
            weight = 1.0 / criteriaScores.length;
          }
        }

        normalizedCriteriaScores.push({
          key,
          score,
          criteriaName: item.criteriaName || key,
          rawScore: score,
          weight,
        });

        totalWeightedScore += score * weight;
        totalWeight += weight;
      }
    }

    let rawCompositeScore = 0;
    if (totalWeight > 0) {
      if (Math.abs(totalWeight - 1.0) < 1e-5) {
        rawCompositeScore = Number(totalWeightedScore.toFixed(3));
      } else {
        rawCompositeScore = Number((totalWeightedScore / totalWeight).toFixed(3));
      }
    } else {
      const existingScore = await Score.findOne({
        judge: userId,
        submission: submissionId,
      });
      if (existingScore && existingScore.rawCompositeScore != null) {
        rawCompositeScore = existingScore.rawCompositeScore;
      }
    }

    const updateDoc = {
      judge: userId,
      submission: submissionId,
      judgeId: userId,
      submissionId: submissionId,
      rawCompositeScore,
      totalRawScore: rawCompositeScore,
      isFinal: false,
    };

    if (normalizedCriteriaScores.length > 0) {
      updateDoc.criteriaScores = normalizedCriteriaScores;
    }
    if (privateNotes !== undefined) {
      updateDoc.privateNotes = privateNotes;
    }

    const score = await Score.findOneAndUpdate(
      {
        judge: userId,
        submission: submissionId,
      },
      updateDoc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update assignment status to in_progress
    await JudgeAssignment.findOneAndUpdate(
      {
        $or: [
          { judgeId: userId, submissionId: submissionId },
          { judge: userId, submission: submissionId },
        ],
        status: { $ne: 'completed' },
      },
      { status: 'in_progress' }
    );

    return res.status(200).json({
      success: true,
      message: 'Evaluation draft auto-saved successfully.',
      data: { score },
      score,
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

/**
 * Auto-evaluate all pending assignments in the current judge's queue.
 * Scores each unscored submission using the rubric median (5.0 per criterion)
 * and marks them as final ballots.
 * POST /api/v1/judging/auto-evaluate
 */
exports.autoEvaluateQueue = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    // Resolve the active rubric
    let event = await Event.findOne({ status: 'active' });
    if (!event) event = await Event.findOne().sort({ createdAt: -1 });

    const defaultRubric = [
      { name: 'Technical Execution', key: 'technical_execution', weight: 0.3 },
      { name: 'Innovation & Originality', key: 'innovation_originality', weight: 0.25 },
      { name: 'Practical Impact', key: 'practical_impact', weight: 0.25 },
      { name: 'Polish & Presentation', key: 'polish_presentation', weight: 0.2 },
    ];

    let rubricCriteria = defaultRubric;
    if (event) {
      const rubricDoc = await Rubric.findOne({ eventId: event._id });
      if (rubricDoc?.criteria?.length > 0) {
        rubricCriteria = rubricDoc.criteria.map((c) => ({
          name: c.label || c.key,
          key: c.key,
          weight: c.weight,
        }));
      } else if (event.rubric?.length > 0) {
        rubricCriteria = event.rubric.map((c) => ({
          name: c.name,
          key: c.key || c.name,
          weight: c.weight,
        }));
      }
    }

    // Default auto-eval score: median (5.0) — valid 0.5-step value
    const AUTO_SCORE = 5.0;

    // Find all pending/assigned queue items for this judge
    const assignments = await JudgeAssignment.find({
      $or: [{ judgeId: userId }, { judge: userId }],
      status: { $nin: ['completed'] },
    }).populate({ path: 'submissionId', select: 'title track status' });

    if (!assignments.length) {
      return res.status(200).json({
        success: true,
        message: 'No pending assignments to evaluate.',
        data: { evaluated: 0, skipped: 0 },
      });
    }

    let evaluated = 0;
    let skipped = 0;
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');

    for (const assignment of assignments) {
      const sub = assignment.submissionId || assignment.submission;
      if (!sub) { skipped++; continue; }
      const subId = sub._id || sub;

      // Skip if already has a final score
      const existing = await Score.findOne({
        $and: [
          { $or: [{ judge: userId }, { judgeId: userId }] },
          { $or: [{ submission: subId }, { submissionId: subId }] },
          { isFinal: true },
        ],
      });
      if (existing) { skipped++; continue; }

      // Build criteria score payload
      const criteriaScores = rubricCriteria.map((crit) => ({
        key: crit.key || crit.name,
        criteriaName: crit.name,
        rawScore: AUTO_SCORE,
        score: AUTO_SCORE,
        weight: crit.weight,
      }));

      // Compute composite
      let totalWeightedScore = 0;
      let totalWeight = 0;
      criteriaScores.forEach((c) => {
        totalWeightedScore += c.rawScore * c.weight;
        totalWeight += c.weight;
      });
      const rawCompositeScore = Number(
        (Math.abs(totalWeight - 1.0) < 1e-5
          ? totalWeightedScore
          : totalWeightedScore / (totalWeight || 1)
        ).toFixed(3)
      );

      // Upsert score
      await Score.findOneAndUpdate(
        { $and: [{ $or: [{ judge: userId }, { judgeId: userId }] }, { $or: [{ submission: subId }, { submissionId: subId }] }] },
        {
          judge: userId,
          judgeId: userId,
          submission: subId,
          submissionId: subId,
          criteriaScores,
          rawCompositeScore,
          totalRawScore: rawCompositeScore,
          privateNotes: '[Auto-evaluated by judging engine]',
          isFinal: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Mark assignment completed
      await JudgeAssignment.findByIdAndUpdate(assignment._id, { status: 'completed' });

      // Audit log
      await AuditLog.create({
        actorId: userId,
        actorRole: req.user.role,
        action: 'AUTO_SCORE_SUBMITTED',
        targetResource: 'Score',
        resourceId: subId,
        payload: { submissionId: subId, rawCompositeScore, autoEvaluated: true },
        ipHash,
      });

      evaluated++;
    }

    return res.status(200).json({
      success: true,
      message: `Auto-evaluation complete: ${evaluated} submission(s) scored, ${skipped} skipped.`,
      data: { evaluated, skipped },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record a head-to-head pairwise comparison between two projects (A > B or B > A).
 * POST /api/v1/judging/pairwise
 */
exports.recordPairwiseComparison = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required.',
      });
    }

    const {
      submissionA,
      submissionB,
      submission_a,
      submission_b,
      projectA,
      projectB,
      winner,
      notes,
      eventId,
    } = req.body;

    const subA = submissionA || submission_a || projectA;
    const subB = submissionB || submission_b || projectB;

    if (!subA || !subB) {
      return res.status(400).json({
        success: false,
        error: 'Both submissionA and submissionB are required.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(subA) || !mongoose.Types.ObjectId.isValid(subB)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission ID format.',
      });
    }

    if (subA.toString() === subB.toString()) {
      return res.status(400).json({
        success: false,
        error: 'submissionA and submissionB must be distinct projects.',
      });
    }

    if (!winner) {
      return res.status(400).json({
        success: false,
        error: 'Winner is required.',
      });
    }

    let resolvedWinner = winner;
    const winnerStr = winner.toString().toLowerCase();
    if (
      winnerStr === 'submission_a' ||
      winnerStr === 'submissiona' ||
      winnerStr === 'projecta' ||
      winnerStr === 'a'
    ) {
      resolvedWinner = subA;
    } else if (
      winnerStr === 'submission_b' ||
      winnerStr === 'submissionb' ||
      winnerStr === 'projectb' ||
      winnerStr === 'b'
    ) {
      resolvedWinner = subB;
    }

    if (
      resolvedWinner.toString() !== subA.toString() &&
      resolvedWinner.toString() !== subB.toString()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Winner must be either submissionA or submissionB.',
      });
    }

    // Verify both submissions exist in the database
    const [docA, docB] = await Promise.all([
      Submission.findById(subA),
      Submission.findById(subB),
    ]);

    if (!docA || !docB) {
      return res.status(404).json({
        success: false,
        error: 'One or both target submissions could not be found.',
      });
    }

    const resolvedEventId = eventId || docA.eventId || docA.event || null;

    const comparison = await PairwiseComparison.create({
      judge: userId,
      submissionA: subA,
      submissionB: subB,
      winner: resolvedWinner,
      notes: notes || '',
      eventId: resolvedEventId,
    });

    return res.status(201).json({
      success: true,
      message: 'Pairwise comparison successfully recorded.',
      data: { comparison },
      comparison,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pairwise comparisons for an event or judge.
 * GET /api/v1/judging/pairwise
 */
exports.getPairwiseComparisons = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user?.role === 'judge') {
      filter.judge = req.user._id || req.user.id;
    }
    if (req.query.eventId) {
      filter.eventId = req.query.eventId;
    }

    const comparisons = await PairwiseComparison.find(filter)
      .populate('judge', 'name email role')
      .populate('submissionA', 'title track')
      .populate('submissionB', 'title track')
      .populate('winner', 'title track')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: { comparisons },
      comparisons,
    });
  } catch (error) {
    next(error);
  }
};

