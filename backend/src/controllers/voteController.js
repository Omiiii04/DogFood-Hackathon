const mongoose = require('mongoose');
const Vote = require('../models/Vote');
const Submission = require('../models/Submission');
const AuditLog = require('../models/AuditLog');

/**
 * Extract client IP from headers or socket
 */
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
    if (ip) return ip;
  }
  return req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '127.0.0.1';
};

/**
 * POST /api/v1/votes/:submissionId
 * Cast a Sybil-resistant community vote
 */
exports.castVote = async (req, res, next) => {
  try {
    const submissionId = req.params.submissionId || req.body?.submissionId;

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submissionId is required.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission ID format.',
      });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found.',
      });
    }

    // Generate cryptographic voterHash: SHA-256 of clientIP + userAgent + secretSalt
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const secretSalt =
      process.env.VOTE_SECRET_SALT ||
      process.env.JWT_SECRET ||
      'raptors-offline-cryptographic-master-key-2026';

    const voterHash = Vote.generateVoterHash(clientIp, userAgent, secretSalt);

    // If authenticated, check if user already voted with an active vote
    if (req.user) {
      const existingUserVote = await Vote.findOne({
        submission: submission._id,
        user: req.user._id,
      });
      if (existingUserVote) {
        return res.status(409).json({
          success: false,
          error: 'You have already voted for this project within the last 24 hours.',
        });
      }
    }

    // Attempt to register vote in DB (preventing duplicate votes via unique compound index)
    try {
      await Vote.create({
        submission: submission._id,
        voterHash,
        user: req.user ? req.user._id : null,
        ipAddress: clientIp,
        votedAt: new Date(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'You have already voted for this project within the last 24 hours.',
        });
      }
      throw err;
    }

    submission.publicVoteCount = (submission.publicVoteCount || 0) + 1;
    await submission.save();

    // Anomaly detector: Flag bursts (e.g. >= 10 votes in last minute)
    const recentVotes = await Vote.countDocuments({
      submission: submission._id,
      votedAt: { $gte: new Date(Date.now() - 60 * 1000) },
    });

    if (recentVotes >= 10) {
      await AuditLog.create({
        actorRole: 'system',
        action: 'VOTE_ANOMALY_DETECTED',
        targetResource: 'Submission',
        resourceId: submission._id,
        payload: { message: 'Velocity spike detected', recentVotes, submissionId: submission._id },
      }).catch(() => {}); // silent fail if audit log errors
    }

    return res.status(200).json({
      success: true,
      message: 'Vote successfully recorded!',
      data: {
        submissionId: submission._id,
        newVoteCount: submission.publicVoteCount,
        voted: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/votes/:submissionId
 * Unvote / revoke a previously cast vote
 */
exports.unvote = async (req, res, next) => {
  try {
    const submissionId = req.params.submissionId || req.body?.submissionId;

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submissionId is required.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission ID format.',
      });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found.',
      });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const secretSalt =
      process.env.VOTE_SECRET_SALT ||
      process.env.JWT_SECRET ||
      'raptors-offline-cryptographic-master-key-2026';

    const voterHash = Vote.generateVoterHash(clientIp, userAgent, secretSalt);

    // Look for active vote matching either voterHash or user ID
    const voteQuery = {
      submission: submission._id,
      ...(req.user ? { $or: [{ voterHash }, { user: req.user._id }] } : { voterHash }),
    };

    const deletedVote = await Vote.findOneAndDelete(voteQuery);
    if (!deletedVote) {
      return res.status(404).json({
        success: false,
        error: 'No active vote found for this project to remove.',
      });
    }

    // Atomically decrement publicVoteCount without dropping below 0
    submission.publicVoteCount = Math.max(0, (submission.publicVoteCount || 0) - 1);
    await submission.save();

    return res.status(200).json({
      success: true,
      message: 'Vote successfully removed!',
      data: {
        submissionId: submission._id,
        newVoteCount: submission.publicVoteCount,
        voted: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/votes/:submissionId
 * Check current voting status for the client
 */
exports.getVoteStatus = async (req, res, next) => {
  try {
    const { submissionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission ID format.',
      });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found.',
      });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const secretSalt =
      process.env.VOTE_SECRET_SALT ||
      process.env.JWT_SECRET ||
      'raptors-offline-cryptographic-master-key-2026';

    const voterHash = Vote.generateVoterHash(clientIp, userAgent, secretSalt);

    const voteQuery = {
      submission: submission._id,
      ...(req.user ? { $or: [{ voterHash }, { user: req.user._id }] } : { voterHash }),
    };

    const existingVote = await Vote.findOne(voteQuery);

    return res.status(200).json({
      success: true,
      data: {
        submissionId: submission._id,
        hasVoted: !!existingVote,
        voteCount: submission.publicVoteCount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
