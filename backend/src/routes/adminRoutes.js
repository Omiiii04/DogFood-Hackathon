const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const roleGuard = require('../middleware/roleGuard');

router.use(authMiddleware);
router.use(roleGuard('organizer', 'admin'));

router.post('/assign-judges', adminController.assignJudges);
router.get('/assignments', adminController.getAssignments);
router.post('/normalize-scores', adminController.runNormalization);
router.get('/leaderboard', adminController.getLeaderboard);
router.get('/export/csv', adminController.exportCSV);
router.get('/export/json', adminController.exportJSON);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/stats', adminController.getSystemStats);
router.get('/analytics', adminController.getAnalytics);

// Rubrics configuration & locking
router.post('/rubrics', adminController.upsertRubric);
router.get('/rubrics', adminController.getRubric);
router.post('/rubric', adminController.upsertRubric);
router.get('/rubric', adminController.getRubric);
router.post('/events/lock-rubric', adminController.lockRubric);
router.post('/lock-rubric', adminController.lockRubric);

// Administrative overrides
router.put('/scores/:scoreId/override', adminController.overrideScore);
router.put('/users/:userId/role', adminController.elevateUserRole);

module.exports = router;
