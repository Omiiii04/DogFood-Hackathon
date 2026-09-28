const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const { voteRateLimiter } = require('../middleware/rateLimiter');
const optionalAuth = require('../middleware/optionalAuth');

// POST /api/v1/votes/:submissionId - Cast vote with rate limiting and optional auth
router.post('/:submissionId', voteRateLimiter, optionalAuth, voteController.castVote);

// DELETE /api/v1/votes/:submissionId - Unvote / revoke vote
router.delete('/:submissionId', voteRateLimiter, optionalAuth, voteController.unvote);

// GET /api/v1/votes/:submissionId - Check voting status for client
router.get('/:submissionId', optionalAuth, voteController.getVoteStatus);

// POST /api/v1/votes - Backward-compatible endpoint (submissionId in request body)
router.post('/', voteRateLimiter, optionalAuth, voteController.castVote);

module.exports = router;
