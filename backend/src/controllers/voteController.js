const crypto = require('crypto');
const Vote = require('../models/Vote');
const Submission = require('../models/Submission');
const AuditLog = require('../models/AuditLog');

exports.castVote = async (req, res, next) => {
  try {
    const { submissionId } = req.body;

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submissionId is required.',
      });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found.',
      });
    }

    // Generate cryptographic fingerprint from IP + User Agent
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const secretKey = process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026';

    const fingerprintHash = crypto
      .createHmac('sha256', secretKey)
      .update(`${clientIp}-${userAgent}`)
      .digest('hex');

    // Attempt to register vote
    try {
      await Vote.create({
        submissionId: submission._id,
        fingerprintHash,
        ipAddress: clientIp,
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

    // Atomically increment publicVoteCount
    submission.publicVoteCount = (submission.publicVoteCount || 0) + 1;
    await submission.save();

    // Anomaly detector: Flag bursts (e.g. > 10 votes in last minute)
    const recentVotes = await Vote.countDocuments({
      submissionId: submission._id,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
    });

    if (recentVotes >= 10) {
      await AuditLog.create({
        actorRole: 'system',
        action: 'VOTE_ANOMALY_DETECTED',
        targetResource: 'Submission',
        resourceId: submission._id,
        payload: { message: 'Velocity spike detected', recentVotes, submissionId: submission._id }
      }).catch(() => {}); // silent fail if audit log errors
    }

    return res.status(200).json({
      success: true,
      message: 'Vote successfully recorded!',
      data: {
        submissionId: submission._id,
        newVoteCount: submission.publicVoteCount,
      },
    });
  } catch (error) {
    next(error);
  }
};
