const express = require('express');
const router = express.Router();
const judgingController = require('../controllers/judgingController');
const authMiddleware = require('../middleware/authMiddleware');
const roleGuard = require('../middleware/roleGuard');
const isolationGuard = require('../middleware/isolationGuard');
const { verifyScoreOwnership } = require('../middleware/isolationGuard');

router.use(authMiddleware);
router.use(isolationGuard);

// Get event rubric & tracks
router.get('/rubric', judgingController.getEventRubric);

// Judge assigned queue
router.get(
  '/assigned',
  roleGuard('judge', 'organizer', 'admin'),
  judgingController.getAssignedQueue
);

// Submit score (enforced by queue assignment verification isolation guard)
router.post(
  '/scores',
  roleGuard('judge', 'organizer', 'admin'),
  judgingController.submitScore
);

// Draft auto-save (in-progress evaluations)
router.put(
  '/scores/draft',
  roleGuard('judge', 'organizer', 'admin'),
  judgingController.saveDraftScore
);

// Inspect score (returns only authenticated judge's own ballot; strips all competitor scores)
router.get(
  '/scores/:submissionId',
  roleGuard('judge', 'organizer', 'admin'),
  judgingController.getScoreBySubmissionId
);

module.exports = router;
