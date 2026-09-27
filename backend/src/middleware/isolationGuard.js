const mongoose = require('mongoose');
const Score = require('../models/Score');
const JudgeAssignment = require('../models/JudgeAssignment');

/**
 * Intercepts requests to /api/v1/judging/*
 * Verifies that authenticated req.user.id has an active JudgeAssignment for the target submissionId.
 * Returns 403 Forbidden ("Access Denied: You are not assigned to evaluate this project") if unassigned.
 */
const isolationGuard = async (req, res, next) => {
  try {
    // Organizers and Admins have global audit / bypass access
    if (['organizer', 'admin'].includes(req.user?.role)) {
      return next();
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required.',
        message: 'Unauthorized: Authentication required.',
        statusCode: 401,
        timestamp: new Date().toISOString(),
      });
    }

    // Resolve target submissionId from body, params, query, or scoreId
    let submissionId =
      req.body?.submissionId ||
      req.body?.submission ||
      req.params?.submissionId ||
      req.query?.submissionId ||
      req.query?.submission;

    // If param is :id and matches an identifier
    if (!submissionId && req.params?.id) {
      submissionId = req.params.id;
    }

    // If not found in body/params/query, parse from URL path (e.g. /scores/:submissionId or /submissions/:submissionId)
    if (!submissionId) {
      const urlPath = req.path || req.originalUrl || '';
      const scoreMatch = urlPath.match(/\/scores\/([a-f0-9]{24}|[a-zA-Z0-9_-]+)/i);
      const subMatch = urlPath.match(/\/submissions\/([a-f0-9]{24}|[a-zA-Z0-9_-]+)/i);
      if (scoreMatch && scoreMatch[1].toLowerCase() !== 'draft') {
        submissionId = scoreMatch[1];
      } else if (subMatch) {
        submissionId = subMatch[1];
      }
    }

    // If route targets a score by scoreId, resolve target submission from Score
    if (!submissionId && req.params?.scoreId) {
      const score = await Score.findById(req.params.scoreId);
      if (score) {
        submissionId = (score.submission || score.submissionId)?.toString();
      }
    }

    // If the request does not target a specific project evaluation (e.g. /rubric or /assigned queue)
    if (!submissionId) {
      if (
        ['POST', 'PUT'].includes(req.method) &&
        (req.path === '/scores' || req.path === '/scores/draft' || req.originalUrl?.includes('/scores'))
      ) {
        return res.status(400).json({
          success: false,
          error: 'submissionId is required.',
          message: 'submissionId is required.',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        });
      }
      return next();
    }

    // Verify active JudgeAssignment for this judge and submission
    const assignment = await JudgeAssignment.findOne({
      $or: [
        { judgeId: userId, submissionId: submissionId },
        { judge: userId, submission: submissionId },
      ],
      status: { $in: ['assigned', 'in_progress', 'completed'] },
    });

    if (!assignment) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: You are not assigned to evaluate this project',
        message: 'Access Denied: You are not assigned to evaluate this project',
        statusCode: 403,
        timestamp: new Date().toISOString(),
      });
    }

    req.assignment = assignment;
    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: error.message,
      statusCode: 500,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Ensures judges can only inspect their own submitted scores.
 * Organizers and Admins have global audit access.
 */
const verifyScoreOwnership = async (req, res, next) => {
  try {
    const { scoreId } = req.params;
    const score = await Score.findById(scoreId);

    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'Score ballot not found.',
        message: 'Score ballot not found.',
        statusCode: 404,
        timestamp: new Date().toISOString(),
      });
    }

    // Organizers and Admins have global audit access
    if (['organizer', 'admin'].includes(req.user?.role)) {
      req.score = score;
      return next();
    }

    // Judges can ONLY view their own submitted score ballots
    const judgeOwnerId = (score.judge || score.judgeId)?.toString();
    const currentUserId = (req.user?._id || req.user?.id)?.toString();

    if (req.user?.role === 'judge') {
      if (judgeOwnerId !== currentUserId) {
        return res.status(403).json({
          success: false,
          error: "Security Violation: You are strictly prohibited from inspecting other judges' scores.",
          message: "Security Violation: You are strictly prohibited from inspecting other judges' scores.",
          statusCode: 403,
          timestamp: new Date().toISOString(),
        });
      }
      req.score = score;
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Unauthorized access.',
      message: 'Unauthorized access.',
      statusCode: 403,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      message: error.message,
      statusCode: 500,
      timestamp: new Date().toISOString(),
    });
  }
};

isolationGuard.isolationGuard = isolationGuard;
isolationGuard.verifyJudgeQueueAssignment = isolationGuard;
isolationGuard.verifyScoreOwnership = verifyScoreOwnership;

module.exports = isolationGuard;
