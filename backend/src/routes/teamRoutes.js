const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const authMiddleware = require('../middleware/authMiddleware');
const roleGuard = require('../middleware/roleGuard');

router.use(authMiddleware);

router.post('/', roleGuard('participant', 'organizer', 'admin'), teamController.createTeam);
router.post('/join', roleGuard('participant', 'organizer', 'admin'), teamController.joinTeam);
router.post('/members', roleGuard('participant', 'organizer', 'admin'), teamController.addMemberByEmail);
router.get('/my-team', teamController.getMyTeam);
router.delete('/members/:userId', roleGuard('participant', 'organizer', 'admin'), teamController.removeMember);

module.exports = router;
