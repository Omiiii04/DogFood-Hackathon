const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Score = require('../models/Score');
const Team = require('../models/Team');
const Event = require('../models/Event');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');

const resolveUserTeam = async (reqUser) => {
  if (!reqUser) return null;
  const userId = (reqUser._id || reqUser.id)?.toString();
  const teamId = reqUser.teamId?._id || reqUser.teamId || reqUser.team;
  let team = null;

  if (teamId) {
    team = await Team.findById(teamId);
  }

  if (!team && userId) {
    team = await Team.findOne({
      $or: [{ members: userId }, { captain: userId }],
    });
    if (team) {
      reqUser.teamId = team._id;
      if (typeof reqUser.save === 'function') {
        try {
          await reqUser.save();
        } catch (_) { }
      }
    }
  }

  return team;
};

exports.upsertSubmission = async (req, res, next) => {
  try {
    const team = await resolveUserTeam(req.user);
    if (!team) {
      return res.status(400).json({
        success: false,
        error: 'You must form or join a team before creating a submission.',
      });
    }

    const {
      title,
      tagline,
      pitch,
      track,
      repoUrl,
      githubUrl,
      demoUrl,
      demoVideoUrl,
      descriptionMarkdown,
      description,
      thumbnailPath,
      thumbnailUrl,
    } = req.body;

    const gitUrl = githubUrl !== undefined ? githubUrl : repoUrl;
    const videoUrl = demoVideoUrl !== undefined ? demoVideoUrl : demoUrl;
    const desc = description !== undefined ? description : descriptionMarkdown;
    const thumb = thumbnailUrl !== undefined ? thumbnailUrl : thumbnailPath;
    const pitchText = pitch !== undefined ? pitch : tagline;

    let submission = await Submission.findOne({ team: team._id });

    if (submission && (submission.status === 'submitted' || submission.status === 'locked')) {
      return res.status(423).json({
        success: false,
        error: 'This submission is locked and can no longer be edited.',
      });
    }

    let isNew = false;
    if (!submission) {
      isNew = true;
      submission = await Submission.create({
        team: team._id,
        title: title || `${team.name}'s Project`,
        tagline: pitchText || 'Work in progress',
        track: track || team.track,
        githubUrl: gitUrl || 'https://github.com',
        demoVideoUrl: videoUrl || '',
        description: desc || '# Project Overview\nDescribe your project here.',
        thumbnailUrl: thumb || '/uploads/default-thumbnail.webp',
        status: 'draft',
      });
    } else {
      if (title !== undefined) submission.title = title;
      if (pitchText !== undefined) submission.tagline = pitchText;
      if (track !== undefined) submission.track = track;
      if (gitUrl !== undefined) submission.githubUrl = gitUrl;
      if (videoUrl !== undefined) submission.demoVideoUrl = videoUrl;
      if (desc !== undefined) submission.description = desc;
      if (thumb !== undefined) submission.thumbnailUrl = thumb;
      await submission.save();
    }

    return res.status(200).json({
      success: true,
      message: isNew ? 'Submission draft created successfully.' : 'Submission successfully saved.',
      data: { submission },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
};

exports.getMySubmission = async (req, res, next) => {
  try {
    const team = await resolveUserTeam(req.user);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'User does not belong to a team.',
      });
    }

    const submission = await Submission.findOne({ team: team._id })
      .populate('team', 'name members track')
      .populate('teamId', 'name members track');

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'No submission found for this team.',
      });
    }

    const { buildEvaluationData } = require('./teamController');
    const subId = submission._id;
    let scores = [];
    const canQueryScores = (mongoose.connection && mongoose.connection.readyState === 1) || (Score.find && (Score.find.mock || Score.find._isMockFunction));
    if (canQueryScores) {
      try {
        scores = await Score.find({
          $or: [{ submission: subId }, { submissionId: subId }],
          isFinal: true,
        })
          .populate('judge', 'name fullName email role')
          .lean();
      } catch (_) { }
    }

    let evaluation = null;
    let submissionObj = submission;

    if (scores && scores.length > 0) {
      evaluation = buildEvaluationData(scores);
      submissionObj = typeof submission.toObject === 'function' ? submission.toObject({ virtuals: true }) : { ...submission };
      submissionObj.evaluation = evaluation;
      submissionObj.isEvaluated = true;
    }

    const responseData = { submission: submissionObj };
    if (evaluation) {
      responseData.evaluation = evaluation;
    }

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
};

exports.getPublicLeaderboard = async (req, res, next) => {
  try {
    const adminController = require('./adminController');
    return adminController.getLeaderboard(req, res, next);
  } catch (error) {
    next(error);
  }
};

exports.uploadThumbnail = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an image file.',
      });
    }

    const filePath = `/uploads/thumbnails/${req.file.filename}`;
    return res.status(200).json({
      success: true,
      message: 'Thumbnail uploaded successfully.',
      data: { filePath },
    });
  } catch (error) {
    next(error);
  }
};

exports.finalizeSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    let submission = null;
    let team = null;

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({
          success: false,
          error: 'Project submission not found.',
        });
      }

      submission = await Submission.findById(id);
      if (!submission) {
        return res.status(404).json({
          success: false,
          error: 'No submission found to finalize.',
        });
      }

      // Authorization check for participant role
      const userTeamId = (req.user?.teamId?._id || req.user?.teamId || req.user?.team)?.toString();
      const subTeamId = (submission.team?._id || submission.team)?.toString();

      if (req.user?.role === 'participant') {
        if (!userTeamId || userTeamId !== subTeamId) {
          team = await resolveUserTeam(req.user);
          if (!team || team._id?.toString() !== subTeamId) {
            return res.status(403).json({
              success: false,
              error: 'You are not authorized to finalize this submission.',
            });
          }
        }
      }
    } else {
      team = await resolveUserTeam(req.user);
      if (!team) {
        return res.status(400).json({
          success: false,
          error: 'User does not belong to a team.',
        });
      }

      submission = await Submission.findOne({ team: team._id });
      if (!submission) {
        return res.status(404).json({
          success: false,
          error: 'No submission found to finalize.',
        });
      }
    }

    if (submission && (submission.status === 'submitted' || submission.status === 'locked')) {
      return res.status(423).json({
        success: false,
        error: 'This submission is locked and can no longer be edited.',
      });
    }

    let event = null;
    if (submission.event) {
      event = await Event.findById(submission.event);
    }
    if (!event) {
      event = await Event.findOne({
        status: 'active',
        $or: [
          { submissionDeadline: { $gt: new Date() } },
          { submissionDeadline: null },
          { submissionDeadline: { $exists: false } },
        ],
      });
    }
    if (!event) {
      event = await Event.findOne({ status: 'active' });
    }
    if (!event) {
      const q = Event.findOne();
      event = typeof q?.sort === 'function' ? await q.sort({ createdAt: -1 }) : await q;
    }

    if (event && !submission.event) {
      submission.event = event._id;
    }

    if (event && event.submissionDeadline) {
      const deadline = new Date(event.submissionDeadline);
      if (new Date() > deadline) {
        return res.status(423).json({
          success: false,
          message: 'Submission window has closed',
          error: 'Submission window has closed',
        });
      }
    }

    if (req.body) {
      if (req.body.title !== undefined) submission.title = req.body.title;
      if (req.body.pitch !== undefined) {
        submission.tagline = req.body.pitch;
        submission.pitch = req.body.pitch;
      } else if (req.body.tagline !== undefined) {
        submission.tagline = req.body.tagline;
      }
      if (req.body.track !== undefined) submission.track = req.body.track;
      if (req.body.description !== undefined) {
        submission.description = req.body.description;
      } else if (req.body.descriptionMarkdown !== undefined) {
        submission.description = req.body.descriptionMarkdown;
      }
      if (req.body.githubUrl !== undefined) submission.githubUrl = req.body.githubUrl;
      else if (req.body.repoUrl !== undefined) submission.githubUrl = req.body.repoUrl;
      if (req.body.demoVideoUrl !== undefined) submission.demoVideoUrl = req.body.demoVideoUrl;
      else if (req.body.demoUrl !== undefined) submission.demoVideoUrl = req.body.demoUrl;
      if (req.body.thumbnailUrl !== undefined) submission.thumbnailUrl = req.body.thumbnailUrl;
      else if (req.body.thumbnailPath !== undefined) submission.thumbnailUrl = req.body.thumbnailPath;
    }

    const title = (submission.title || '').trim();
    const pitch = (submission.pitch || submission.tagline || '').trim();
    const track = (submission.track || '').trim();
    const description = (submission.description || submission.descriptionMarkdown || '').trim();

    const missing = [];
    if (!title) missing.push('Title');
    if (!pitch) missing.push('Pitch');
    if (!track) missing.push('Track');
    if (!description || description.length < 100) {
      missing.push('Description (must be at least 100 characters)');
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Required fields missing or invalid: ${missing.join(', ')}.`,
        message: `Required fields missing or invalid: ${missing.join(', ')}.`,
        errors: missing,
      });
    }

    submission.status = 'submitted';
    submission.submittedAt = new Date();
    await submission.save();

    const teamIdToUpdate = submission.team?._id || submission.team;
    if (teamIdToUpdate) {
      const teamDoc = (team && team._id?.toString() === teamIdToUpdate.toString())
        ? team
        : await Team.findById(teamIdToUpdate);
      if (teamDoc) {
        teamDoc.hasSubmitted = true;
        if (typeof teamDoc.save === 'function') {
          await teamDoc.save();
        }
      }
    }

    // Auto-assign judges immediately so project is visible in Judge Console and Organiser Console
    try {
      const { autoAssignSubmission } = require('../services/assignmentSolver');
      await autoAssignSubmission(submission);
    } catch (assignErr) {
      console.error('Auto-assignment on submission lock error:', assignErr);
    }

    try {
      const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
      await AuditLog.create({
        actorId: req.user?._id,
        actorRole: req.user?.role,
        action: 'SUBMISSION_LOCKED',
        targetResource: 'Submission',
        resourceId: submission._id,
        payload: { submissionId: submission._id, title: submission.title },
        ipHash,
      });
    } catch (_) { }

    return res.status(200).json({
      success: true,
      message: 'Submission successfully submitted and locked for judging evaluation.',
      data: { submission },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPublicSubmissions = async (req, res, next) => {
  try {
    const { track, search, q, sort } = req.query;
    const filter = { status: { $in: ['submitted', 'locked'] } };

    if (track && track !== 'All') {
      filter.track = track;
    }

    const searchTerm = (search || q || '').trim();
    if (searchTerm) {
      filter.$text = { $search: searchTerm };
    }

    let sortObj = { createdAt: -1 };
    if (sort === 'upvotes') {
      sortObj = { publicVoteCount: -1, createdAt: -1 };
    } else if (sort === 'newest') {
      sortObj = { createdAt: -1 };
    } else {
      sortObj = { publicVoteCount: -1, createdAt: -1 };
    }

    const submissions = await Submission.find(filter)
      .populate('team', 'name track members')
      .populate('teamId', 'name track members')
      .sort(sortObj);

    return res.status(200).json({
      success: true,
      data: { submissions, total: submissions.length },
    });
  } catch (error) {
    next(error);
  }
};

exports.getGallery = exports.getPublicSubmissions;

exports.getSubmissionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Project submission not found.' });
    }

    const submission = await Submission.findById(id)
      .populate('team', 'name track members')
      .populate('teamId', 'name track members');

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Project submission not found.' });
    }

    return res.status(200).json({
      success: true,
      data: { submission },
    });
  } catch (error) {
    next(error);
  }
};
