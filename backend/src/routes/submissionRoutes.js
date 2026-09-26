const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const authMiddleware = require('../middleware/authMiddleware');
const roleGuard = require('../middleware/roleGuard');
const upload = require('../config/multer');

// Public routes: gallery and public finalized submissions
router.get('/public', submissionController.getPublicSubmissions);
router.get('/gallery', submissionController.getGallery);

// Authenticated route: team's own submission (placed before /:id parameter match)
router.get(
  '/my-submission',
  authMiddleware,
  roleGuard('participant', 'organizer', 'admin'),
  submissionController.getMySubmission
);

// Public route: view submission by ID
router.get('/:id', submissionController.getSubmissionById);

// Participant authenticated mutation routes
router.use(authMiddleware);

router.post(
  '/',
  roleGuard('participant', 'organizer', 'admin'),
  submissionController.upsertSubmission
);

router.post(
  '/upload-thumbnail',
  roleGuard('participant', 'organizer', 'admin'),
  upload.single('thumbnail'),
  submissionController.uploadThumbnail
);

router.post(
  '/finalize',
  roleGuard('participant', 'organizer', 'admin'),
  submissionController.finalizeSubmission
);

router.post(
  '/:id/finalize',
  roleGuard('participant', 'organizer', 'admin'),
  submissionController.finalizeSubmission
);

module.exports = router;
