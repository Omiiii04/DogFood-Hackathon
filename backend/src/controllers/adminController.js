const mongoose = require('mongoose');
const User = require('../models/User');
const Team = require('../models/Team');
const Submission = require('../models/Submission');
const Score = require('../models/Score');
const JudgeAssignment = require('../models/JudgeAssignment');
const Event = require('../models/Event');
const Rubric = require('../models/Rubric');
const AuditLog = require('../models/AuditLog');
const LeaderboardCache = require('../models/LeaderboardCache');
const crypto = require('crypto');
const { solveJudgeAssignments } = require('../services/assignmentSolver');
const fastApiClient = require('../services/fastApiClient');
const { normalizeScores } = fastApiClient;
const {
  generateStandingsCSV,
  createStandingsCSVStream,
  formatStandingRow,
} = require('../services/csvExporter');

exports.assignJudges = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer or Admin permissions required.',
      });
    }

    const target = req.body && req.body.targetPerProject !== undefined
      ? Number(req.body.targetPerProject)
      : 3;

    if (isNaN(target) || target <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid targetPerProject: must be a positive integer.',
      });
    }

    const submissionFilter = { status: { $in: ['submitted', 'locked'] } };
    if (req.body && req.body.eventId) {
      submissionFilter.event = req.body.eventId;
    }

    const submissions = await Submission.find(submissionFilter);
    const judges = await User.find({ role: 'judge' });

    if (!submissions || submissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No submitted projects available to assign.',
      });
    }

    if (!judges || judges.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No registered judges found in the system.',
      });
    }

    // Execute constraint-satisfied assignment engine
    let solution;
    try {
      solution = solveJudgeAssignments(submissions, judges, target);
    } catch (solverError) {
      return res.status(400).json({
        success: false,
        error: solverError.message || 'Unable to satisfy judge assignment constraints.',
      });
    }

    const { assignments, judgeLoad, totalAssigned } = solution;

    // Clear existing uncompleted assignments to prevent duplicates
    await JudgeAssignment.deleteMany({ status: { $in: ['assigned', 'pending'] } });

    // Batch-insert new assignments into MongoDB
    let insertedAssignments = [];
    if (assignments && assignments.length > 0) {
      try {
        insertedAssignments = await JudgeAssignment.insertMany(assignments, { ordered: false });
      } catch (insertError) {
        if (insertError.insertedDocs && insertError.insertedDocs.length > 0) {
          insertedAssignments = insertError.insertedDocs;
        } else if (insertError.code === 11000 || insertError.writeErrors) {
          insertedAssignments = await JudgeAssignment.find({
            submissionId: { $in: submissions.map((s) => s._id) },
          });
        } else {
          throw insertError;
        }
      }
    }

    // Audit log
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
    await AuditLog.create({
      actorId: req.user?._id,
      actorRole: req.user?.role || 'organizer',
      action: 'JUDGES_ASSIGNED',
      targetResource: 'JudgeAssignment',
      resourceId: req.user?._id,
      payload: { totalAssigned, judgeLoad, targetPerProject: target },
      ipHash,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully assigned ${totalAssigned} judge evaluations.`,
      data: {
        totalAssigned,
        judgeLoad,
        assignments: insertedAssignments.length > 0 ? insertedAssignments : assignments,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.runNormalization = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer or Admin permissions required.',
      });
    }

    let eventId = req.body?.eventId || req.query?.eventId;
    if (!eventId) {
      const activeEvent = await Event.findOne({ status: 'active' });
      if (activeEvent) {
        eventId = activeEvent._id.toString();
      }
    }
    if (!eventId) {
      eventId = 'hackathon-2026';
    }

    // 1. Queries all completed scores (excluding in-progress drafts)
    const scoreFilter = { isFinal: { $ne: false } };
    if (req.body?.eventId) {
      const eventSubmissions = await Submission.find({ event: req.body.eventId }).select('_id');
      if (eventSubmissions && eventSubmissions.length > 0) {
        scoreFilter.submission = { $in: eventSubmissions.map((s) => s._id) };
      }
    }

    const scores = await Score.find(scoreFilter);
    if (!scores || scores.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No completed scores found to normalize.',
      });
    }

    // 2. Calls fastApiClient.normalizeScores(scores)
    const result = await fastApiClient.normalizeScores(scores);

    // Format standings and judge calibrations
    const formattedStandings = (result.standings || []).map((s) => ({
      submissionId: s.submission_id || s.submissionId,
      submission_id: s.submission_id || s.submissionId,
      rank: s.rank,
      normalizedScore: s.normalized_score ?? s.normalizedScore,
      normalized_score: s.normalized_score ?? s.normalizedScore,
      rawMean: s.raw_mean ?? s.rawMean,
      raw_mean: s.raw_mean ?? s.rawMean,
      zScore: s.z_mean ?? s.z_score_mean ?? s.zScore,
      z_score_mean: s.z_score_mean ?? s.z_mean ?? s.zScore,
      z_mean: s.z_mean ?? s.z_score_mean ?? s.zScore,
      ballotCount: s.ballot_count ?? s.ballotCount,
      ballot_count: s.ballot_count ?? s.ballotCount,
    }));

    const formattedCalibrations = (result.judge_calibrations || result.judgeCalibrations || []).map((c) => ({
      judgeId: c.judge_id || c.judgeId,
      judge_id: c.judge_id || c.judgeId,
      sampleSize: c.sample_size ?? c.sampleSize,
      sample_size: c.sample_size ?? c.sampleSize,
      rawMean: c.raw_mean ?? c.rawMean,
      raw_mean: c.raw_mean ?? c.rawMean,
      rawStd: c.raw_std ?? c.rawStd,
      raw_std: c.raw_std ?? c.rawStd,
      bias: c.bias,
    }));

    // 3. Stores normalized scores, ranks, and judge calibrations in backend/src/models/LeaderboardCache.js
    await LeaderboardCache.findOneAndUpdate(
      { eventId: eventId.toString() },
      {
        eventId: eventId.toString(),
        standings: formattedStandings,
        judgeCalibrations: formattedCalibrations,
        judge_calibrations: formattedCalibrations,
        algorithm: result.algorithm || 'z_score_bayesian_shrinkage',
        totalSubmissions: result.total_submissions ?? formattedStandings.length,
        total_submissions: result.total_submissions ?? formattedStandings.length,
        totalScoresProcessed: result.total_scores_processed ?? scores.length,
        total_scores_processed: result.total_scores_processed ?? scores.length,
        isFallback: !!result.is_fallback,
        is_fallback: !!result.is_fallback,
        cachedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Save normalized score back to each score document
    for (const standing of formattedStandings) {
      const subId = standing.submissionId;
      if (subId) {
        await Score.updateMany(
          { $or: [{ submission: subId }, { submissionId: subId }] },
          {
            normalizedScore: standing.normalizedScore,
            zScore: standing.zScore,
          }
        );
      }
    }

    // Audit log
    const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
    if (req.user) {
      await AuditLog.create({
        actorId: req.user._id,
        actorRole: req.user.role || 'admin',
        action: 'NORMALIZATION_EXECUTED',
        targetResource: 'Score',
        resourceId: req.user._id,
        payload: {
          totalProcessed: result.total_scores_processed ?? scores.length,
          totalSubmissions: result.total_submissions ?? formattedStandings.length,
          eventId: eventId.toString(),
        },
        ipHash,
      });
    }

    // 4. Returns computed standings to caller
    return res.status(200).json({
      success: true,
      message: 'Score normalization successfully computed.',
      standings: formattedStandings,
      data: {
        ...result,
        eventId: eventId.toString(),
        standings: formattedStandings,
        judge_calibrations: formattedCalibrations,
        judgeCalibrations: formattedCalibrations,
        total_scores_processed: result.total_scores_processed ?? scores.length,
        total_submissions: result.total_submissions ?? formattedStandings.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.normalizeScores = exports.runNormalization;

exports.getLeaderboard = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ status: { $in: ['submitted', 'locked'] } })
      .populate('teamId', 'name')
      .lean();

    const scores = await Score.find().lean();

    // Group scores by submissionId
    const scoresBySub = {};
    scores.forEach((s) => {
      const subId = s.submissionId.toString();
      if (!scoresBySub[subId]) scoresBySub[subId] = [];
      scoresBySub[subId].push(s);
    });

    const leaderboard = submissions.map((sub) => {
      const subId = sub._id.toString();
      const subScores = scoresBySub[subId] || [];

      const ballotCount = subScores.length;
      const rawMean =
        ballotCount > 0
          ? subScores.reduce((sum, s) => sum + s.totalRawScore, 0) / ballotCount
          : 0;

      const normalizedScore =
        ballotCount > 0 && subScores[0].normalizedScore != null
          ? subScores[0].normalizedScore
          : null;

      const zScore =
        ballotCount > 0 && subScores[0].zScore != null
          ? subScores[0].zScore
          : null;

      return {
        id: sub._id,
        title: sub.title,
        tagline: sub.tagline,
        track: sub.track,
        teamName: sub.teamId?.name || 'Unknown Team',
        repoUrl: sub.repoUrl,
        demoUrl: sub.demoUrl,
        thumbnailPath: sub.thumbnailPath,
        publicVoteCount: sub.publicVoteCount || 0,
        ballotCount,
        rawMean: Number(rawMean.toFixed(2)),
        normalizedScore: normalizedScore != null ? Number(normalizedScore.toFixed(2)) : null,
        zScore: zScore != null ? Number(zScore.toFixed(4)) : null,
      };
    });

    // Default sort: if normalizedScore exists sort by normalizedScore desc, else rawMean desc
    leaderboard.sort((a, b) => {
      if (a.normalizedScore != null && b.normalizedScore != null) {
        return b.normalizedScore - a.normalizedScore;
      }
      return b.rawMean - a.rawMean;
    });

    // Assign rank
    leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });

    return res.status(200).json({
      success: true,
      data: { leaderboard },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to build comprehensive standings and score export data for CSV / JSON archiving.
 */
const buildExportStandingsData = async (eventId) => {
  const submissionFilter = { status: { $in: ['submitted', 'locked'] } };
  if (eventId && eventId !== 'all') {
    submissionFilter.$or = [{ event: eventId }, { eventId: eventId }];
  }

  // Populate team with nested members and captain
  let subQuery = Submission.find(submissionFilter);
  if (typeof subQuery.populate === 'function') {
    subQuery = subQuery.populate({
      path: 'team',
      populate: [
        { path: 'members', select: 'name fullName email role' },
        { path: 'captain', select: 'name fullName email role' },
      ],
    });
  }
  if (typeof subQuery.lean === 'function') {
    subQuery = subQuery.lean();
  }
  const submissions = (await subQuery) || [];

  // Identify any missing / unpopulated teams
  const missingTeamIds = [];
  submissions.forEach((sub) => {
    const t = sub.team || sub.teamId;
    if (t && (typeof t === 'string' || (mongoose.isValidObjectId(t) && !t.name))) {
      missingTeamIds.push(t.toString());
    }
  });

  const teamsMap = new Map();
  if (missingTeamIds.length > 0) {
    const fetchedTeams = await Team.find({ _id: { $in: missingTeamIds } })
      .populate('members captain', 'name fullName email role')
      .lean();
    fetchedTeams.forEach((t) => teamsMap.set(t._id.toString(), t));
  }

  // Query completed scores
  let scoreQuery = Score.find({ isFinal: { $ne: false } });
  if (typeof scoreQuery.populate === 'function') {
    scoreQuery = scoreQuery.populate('judge', 'name fullName email role');
  }
  if (typeof scoreQuery.lean === 'function') {
    scoreQuery = scoreQuery.lean();
  }
  const scores = (await scoreQuery) || [];

  const scoresBySub = new Map();
  scores.forEach((s) => {
    const subId = (s.submission || s.submissionId || s.submission_id)?.toString();
    if (subId) {
      if (!scoresBySub.has(subId)) scoresBySub.set(subId, []);
      scoresBySub.get(subId).push(s);
    }
  });

  // Query latest LeaderboardCache if available
  let latestCache = null;
  try {
    if (LeaderboardCache && typeof LeaderboardCache.getLatest === 'function') {
      latestCache = await LeaderboardCache.getLatest(eventId);
      if (latestCache && typeof latestCache.toObject === 'function') {
        latestCache = latestCache.toObject();
      }
    } else if (LeaderboardCache) {
      const q = eventId && eventId !== 'all' ? { eventId: eventId.toString() } : {};
      latestCache = await LeaderboardCache.findOne(q).sort({ updatedAt: -1 }).lean();
    }
  } catch (_) { }

  const cacheMap = new Map();
  if (latestCache && Array.isArray(latestCache.standings)) {
    latestCache.standings.forEach((cs) => {
      const id = (cs.submissionId || cs.submission_id || cs.id)?._id?.toString() ||
                 (cs.submissionId || cs.submission_id || cs.id)?.toString();
      if (id) cacheMap.set(id, cs);
    });
  }

  const standings = submissions.map((sub) => {
    const subId = sub._id.toString();
    const teamDoc = (sub.team && typeof sub.team === 'object' && sub.team.name)
      ? sub.team
      : (sub.teamId && typeof sub.teamId === 'object' && sub.teamId.name)
        ? sub.teamId
        : teamsMap.get((sub.team || sub.teamId)?.toString());

    // Extract team members
    const membersList = [];
    const seenMemberIds = new Set();

    const addMember = (m) => {
      if (!m) return;
      const mId = m._id ? m._id.toString() : (typeof m === 'string' ? m : null);
      const name = m.name || m.fullName || (m.email ? m.email.split('@')[0] : (typeof m === 'string' ? m : ''));
      if (name && (!mId || !seenMemberIds.has(mId))) {
        if (mId) seenMemberIds.add(mId);
        membersList.push({
          id: mId,
          name,
          email: m.email || '',
        });
      }
    };

    if (teamDoc) {
      if (teamDoc.captain) addMember(teamDoc.captain);
      if (Array.isArray(teamDoc.members)) teamDoc.members.forEach(addMember);
    }

    const subScores = scoresBySub.get(subId) || [];
    const cached = cacheMap.get(subId);

    const ballotCount = cached?.ballotCount ?? cached?.ballot_count ?? subScores.length;

    // Raw Average
    let rawAverage = null;
    if (cached?.rawMean != null) {
      rawAverage = cached.rawMean;
    } else if (cached?.raw_mean != null) {
      rawAverage = cached.raw_mean;
    } else if (subScores.length > 0) {
      const totalRaw = subScores.reduce((acc, s) => {
        const val = s.rawCompositeScore ?? s.totalRawScore ?? s.raw_composite_score ?? 0;
        return acc + val;
      }, 0);
      rawAverage = Number((totalRaw / subScores.length).toFixed(2));
    }

    // Normalized Score
    let normalizedScore = cached?.normalizedScore ?? cached?.normalized_score ?? null;
    if (normalizedScore == null && subScores.length > 0) {
      const sWithNorm = subScores.find((s) => s.normalizedScore != null);
      if (sWithNorm) normalizedScore = sWithNorm.normalizedScore;
    }
    if (normalizedScore != null) normalizedScore = Number(Number(normalizedScore).toFixed(2));

    // Z-Score Mean
    let zScoreMean = cached?.zScoreMean ?? cached?.z_score_mean ?? cached?.zScore ?? cached?.z_mean ?? null;
    if (zScoreMean == null && subScores.length > 0) {
      const sWithZ = subScores.find((s) => s.zScore != null);
      if (sWithZ) zScoreMean = sWithZ.zScore;
    }
    if (zScoreMean != null) zScoreMean = Number(Number(zScoreMean).toFixed(4));

    // Judge Comments & Ballots
    const judgeCommentsList = [];
    const ballots = [];

    for (const s of subScores) {
      const judgeObj = s.judge || s.judgeId;
      const judgeName = judgeObj?.name || judgeObj?.fullName || (judgeObj?.email ? judgeObj.email.split('@')[0] : 'Judge');
      const judgeId = judgeObj?._id?.toString() || (typeof judgeObj === 'string' ? judgeObj : null);
      const notes = (s.privateNotes || s.comments || s.notes || s.feedback || '').trim();

      if (notes) {
        judgeCommentsList.push(`${judgeName}: ${notes}`);
      }

      ballots.push({
        ballotId: s._id?.toString(),
        judgeId,
        judgeName,
        totalRawScore: s.rawCompositeScore ?? s.totalRawScore ?? null,
        normalizedScore: s.normalizedScore ?? null,
        zScore: s.zScore ?? null,
        criteriaScores: s.criteriaScores || [],
        privateNotes: notes,
      });
    }

    return {
      id: sub._id,
      submissionId: sub._id,
      title: sub.title,
      projectTitle: sub.title,
      track: sub.track,
      tagline: sub.tagline,
      description: sub.description,
      team: {
        id: teamDoc?._id || null,
        name: teamDoc?.name || sub.teamName || 'Unknown Team',
        captain: teamDoc?.captain?.name || teamDoc?.captain?.fullName || null,
        members: membersList,
      },
      teamName: teamDoc?.name || sub.teamName || 'Unknown Team',
      teamMembers: membersList.map((m) => m.name).join(', '),
      teamMembersList: membersList,
      rawAverage,
      rawMean: rawAverage,
      normalizedScore,
      zScoreMean,
      zScore: zScoreMean,
      ballotCount,
      publicVoteCount: sub.publicVoteCount || 0,
      judgeComments: judgeCommentsList.join('\n---\n'),
      judgeCommentsList,
      ballots,
      repoUrl: sub.repoUrl || sub.githubUrl || '',
      demoUrl: sub.demoUrl || sub.demoVideoUrl || '',
      thumbnailPath: sub.thumbnailPath || sub.thumbnailUrl || '',
      submittedAt: sub.submittedAt || sub.createdAt || null,
      cachedRank: cached?.rank ?? null,
    };
  });

  // Sort standings: preserve cache rank if present on all items, else normalized score -> raw average -> title
  const allCached = standings.length > 0 && standings.every((s) => s.cachedRank != null);
  if (allCached) {
    standings.sort((a, b) => a.cachedRank - b.cachedRank);
  } else {
    standings.sort((a, b) => {
      if (a.normalizedScore != null && b.normalizedScore != null) {
        return b.normalizedScore - a.normalizedScore;
      }
      if (a.normalizedScore != null) return -1;
      if (b.normalizedScore != null) return 1;
      if (a.rawAverage != null && b.rawAverage != null) {
        return b.rawAverage - a.rawAverage;
      }
      if (a.rawAverage != null) return -1;
      if (b.rawAverage != null) return 1;
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  // Assign ranks
  standings.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  return {
    standings,
    latestCache,
    scoresCount: scores.length,
    eventId: eventId || 'default-event',
  };
};

exports.buildExportStandingsData = buildExportStandingsData;

exports.exportCSV = async (req, res, next) => {
  try {
    const eventId = req.query?.eventId || req.params?.eventId || 'default-event';
    const { standings } = await buildExportStandingsData(eventId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dogfood-2026-standings.csv"');

    const csvStream = createStandingsCSVStream(standings);
    csvStream.on('error', (err) => {
      if (!res.headersSent) {
        next(err);
      }
    });
    csvStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

exports.exportJSON = async (req, res, next) => {
  try {
    const eventId = req.query?.eventId || req.params?.eventId || 'default-event';
    const { standings, latestCache, scoresCount } = await buildExportStandingsData(eventId);

    const archiveData = {
      metadata: {
        title: 'DogFood Hackathon 2026 - Standings & Judging Archive',
        version: '2026.1',
        exportedAt: new Date().toISOString(),
        eventId: eventId.toString(),
        totalSubmissions: standings.length,
        totalScoresProcessed: scoresCount,
        algorithm: latestCache?.algorithm || 'z_score_bayesian_shrinkage',
        isFallback: latestCache?.isFallback || false,
      },
      summary: {
        totalSubmissions: standings.length,
        evaluatedSubmissions: standings.filter((s) => s.ballotCount > 0).length,
        tracks: [...new Set(standings.map((s) => s.track).filter(Boolean))],
        averageRawScore:
          standings.filter((s) => s.rawAverage != null).length > 0
            ? Number(
                (
                  standings.reduce((sum, s) => sum + (s.rawAverage || 0), 0) /
                  (standings.filter((s) => s.rawAverage != null).length || 1)
                ).toFixed(2)
              )
            : null,
      },
      standings: standings.map((item) => ({
        rank: item.rank,
        submissionId: item.submissionId,
        projectTitle: item.title,
        track: item.track,
        tagline: item.tagline,
        description: item.description,
        team: item.team,
        scores: {
          rawAverage: item.rawAverage,
          normalizedScore: item.normalizedScore,
          zScoreMean: item.zScoreMean,
          ballotCount: item.ballotCount,
          publicVotes: item.publicVoteCount,
        },
        judgeComments: item.judgeCommentsList,
        ballots: item.ballots,
        links: {
          repoUrl: item.repoUrl,
          demoUrl: item.demoUrl,
          thumbnailPath: item.thumbnailPath,
        },
        submittedAt: item.submittedAt,
      })),
      judgeCalibrations: latestCache?.judgeCalibrations || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="dogfood-2026-standings.json"');
    return res.status(200).send(JSON.stringify(archiveData, null, 2));
  } catch (error) {
    next(error);
  }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .populate('actorId', 'fullName email role')
      .sort({ timestamp: -1 })
      .limit(100);

    return res.status(200).json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    next(error);
  }
};

exports.getSystemStats = async (req, res, next) => {
  try {
    const [totalUsers, totalTeams, totalSubmissions, totalJudges, totalScores, totalAssignments, scoresList] =
      await Promise.all([
        User.countDocuments(),
        Team.countDocuments(),
        Submission.countDocuments({ status: { $in: ['submitted', 'locked'] } }),
        User.countDocuments({ role: 'judge' }),
        Score.countDocuments(),
        JudgeAssignment.countDocuments(),
        Score.find().populate('judge', 'fullName'),
      ]);

    const judgeGroups = {};
    scoresList.forEach(s => {
      const jId = (s.judgeId || s.judge?._id || 'unknown').toString();
      if (!judgeGroups[jId]) {
        judgeGroups[jId] = { name: s.judge?.fullName || `Judge ${jId.slice(-4)}`, scores: [] };
      }
      judgeGroups[jId].scores.push(s.totalRawScore || s.rawCompositeScore || 0);
    });

    const judgeStats = Object.values(judgeGroups).map(g => {
      const mean = g.scores.length ? g.scores.reduce((a, b) => a + b, 0) / g.scores.length : 0;
      const variance = g.scores.length > 1 
        ? g.scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (g.scores.length - 1)
        : 0;
      return { name: g.name, mean, variance, count: g.scores.length };
    });

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalTeams,
        totalSubmissions,
        totalJudges,
        totalScores,
        totalAssignments,
        judgeStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.upsertRubric = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer permissions required.',
      });
    }

    let event = null;
    if (req.body.eventId) {
      event = await Event.findById(req.body.eventId);
    } else {
      event = await Event.findOne({ status: 'active' });
      if (!event) {
        event = await Event.findOne().sort({ createdAt: -1 });
      }
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Active event not found.',
      });
    }

    if (event.rubricLocked) {
      return res.status(400).json({
        success: false,
        error: 'Rubric is locked against further modification once scoring begins.',
      });
    }

    const rawCriteria =
      req.body.criteria || req.body.rubric || (Array.isArray(req.body) ? req.body : null);

    if (!rawCriteria || !Array.isArray(rawCriteria) || rawCriteria.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Criteria array is required and cannot be empty.',
      });
    }

    const formattedCriteria = rawCriteria.map((item, index) => {
      const key =
        item.key ||
        (item.name
          ? item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
          : `criterion_${index + 1}`);
      const label = item.label || item.name || key;
      const description = item.description || '';
      const weight = typeof item.weight === 'number' ? item.weight : parseFloat(item.weight);
      const minScore =
        item.minScore !== undefined
          ? item.minScore
          : item.scaleMin !== undefined
          ? item.scaleMin
          : 0;
      const maxScore =
        item.maxScore !== undefined
          ? item.maxScore
          : item.scaleMax !== undefined
          ? item.scaleMax
          : 10;
      const step = item.step !== undefined ? item.step : 1;

      return {
        key,
        label,
        description,
        weight,
        minScore,
        maxScore,
        step,
      };
    });

    for (const c of formattedCriteria) {
      if (isNaN(c.weight) || c.weight < 0 || c.weight > 1) {
        return res.status(400).json({
          success: false,
          error: 'Each criterion weight must be a valid number between 0 and 1.',
        });
      }
    }

    const totalWeight = formattedCriteria.reduce((sum, c) => sum + c.weight, 0);
    const DELTA = 1e-5;
    if (Math.abs(totalWeight - 1.0) > DELTA) {
      return res.status(400).json({
        success: false,
        error: `Total criteria weight must sum to 1.0 (within delta ${DELTA}). Current sum: ${totalWeight}`,
      });
    }

    let rubricDoc = await Rubric.findOne({ eventId: event._id });
    if (rubricDoc) {
      rubricDoc.criteria = formattedCriteria;
      await rubricDoc.save();
    } else {
      rubricDoc = await Rubric.create({
        eventId: event._id,
        criteria: formattedCriteria,
      });
    }

    // Synchronize event.rubric
    event.rubric = formattedCriteria.map((c) => ({
      name: c.label,
      weight: c.weight,
      scaleMin: c.minScore >= 1 ? c.minScore : 1,
      scaleMax: c.maxScore || 10,
    }));
    await Event.updateOne({ _id: event._id }, { $set: { rubric: event.rubric } });

    // Audit log
    try {
      const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
      await AuditLog.create({
        actorId: req.user?._id,
        actorRole: req.user?.role,
        action: 'RUBRIC_CONFIGURED',
        targetResource: 'Rubric',
        resourceId: rubricDoc._id,
        payload: { eventId: event._id, criteriaCount: formattedCriteria.length },
        ipHash,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation failed:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Event rubric criteria successfully updated.',
      data: {
        rubric: rubricDoc,
        criteria: rubricDoc.criteria,
        eventId: event._id,
      },
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
exports.createOrUpdateRubric = exports.upsertRubric;

exports.getRubric = async (req, res, next) => {
  try {
    let event = null;
    if (req.query.eventId) {
      event = await Event.findById(req.query.eventId);
    } else {
      event = await Event.findOne({ status: 'active' });
      if (!event) {
        event = await Event.findOne().sort({ createdAt: -1 });
      }
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Active event not found.',
      });
    }

    let rubric = await Rubric.findOne({ eventId: event._id }).lean();

    if (!rubric && event.rubric && event.rubric.length > 0) {
      const criteria = event.rubric.map((item) => ({
        key: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        label: item.name,
        description: '',
        weight: item.weight,
        minScore: item.scaleMin !== undefined ? item.scaleMin : 1,
        maxScore: item.scaleMax !== undefined ? item.scaleMax : 10,
        step: 1,
      }));
      rubric = {
        eventId: event._id,
        criteria,
      };
    } else if (!rubric) {
      const defaultCriteria = [
        {
          key: 'technical_execution',
          label: 'Technical Execution',
          description: 'Code quality, architecture, and engineering complexity',
          weight: 0.3,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
        {
          key: 'innovation',
          label: 'Innovation & Originality',
          description: 'Novelty of approach and creativity',
          weight: 0.25,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
        {
          key: 'practical_impact',
          label: 'Practical Impact',
          description: 'Real-world utility and viability',
          weight: 0.25,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
        {
          key: 'presentation',
          label: 'Polish & Presentation',
          description: 'Pitch clarity and UI polish',
          weight: 0.2,
          minScore: 1,
          maxScore: 10,
          step: 1,
        },
      ];
      rubric = {
        eventId: event._id,
        criteria: defaultCriteria,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        rubric,
        criteria: rubric.criteria,
        eventId: event._id,
        rubricLocked: Boolean(event.rubricLocked),
        tracks: event.tracks || [],
      },
    });
  } catch (error) {
    next(error);
  }
};
exports.getRubrics = exports.getRubric;

exports.lockRubric = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer permissions required.',
      });
    }

    let event = null;
    if (req.body.eventId) {
      event = await Event.findById(req.body.eventId);
    } else {
      event = await Event.findOne({ status: 'active' });
      if (!event) {
        event = await Event.findOne().sort({ createdAt: -1 });
      }
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Active event not found.',
      });
    }

    const locked = req.body.locked !== undefined ? Boolean(req.body.locked) : true;
    event.rubricLocked = locked;
    await event.save();

    // Audit log
    try {
      const ipHash = crypto.createHash('sha256').update(req.ip || '127.0.0.1').digest('hex');
      await AuditLog.create({
        actorId: req.user?._id,
        actorRole: req.user?.role,
        action: locked ? 'RUBRIC_LOCKED' : 'RUBRIC_UNLOCKED',
        targetResource: 'Event',
        resourceId: event._id,
        payload: { eventId: event._id, rubricLocked: locked },
        ipHash,
      });
    } catch (auditErr) {
      console.warn('AuditLog creation failed:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: locked
        ? 'Rubric has been successfully locked against further modification.'
        : 'Rubric has been unlocked.',
      data: {
        eventId: event._id,
        rubricLocked: event.rubricLocked,
      },
    });
  } catch (error) {
    next(error);
  }
};
exports.freezeRubric = exports.lockRubric;

exports.getAnalytics = async (req, res, next) => {
  try {
    if (req.user && req.user.role !== 'organizer' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Organizer or Admin permissions required.',
      });
    }

    const eventId = req.query?.eventId || req.body?.eventId;
    const submissionFilter = {};
    if (eventId) {
      submissionFilter.event = eventId;
    }

    // 1. Fetch Submissions
    const submissions = await Submission.find(submissionFilter).lean();
    const totalSubmissions = submissions.length;
    const finalizedCount = submissions.filter(
      (s) => s.status === 'submitted' || s.status === 'locked'
    ).length;
    const draftCount = submissions.filter((s) => s.status === 'draft').length;

    const trackBreakdown = {};
    submissions.forEach((s) => {
      const track = s.track || 'General';
      trackBreakdown[track] = (trackBreakdown[track] || 0) + 1;
    });

    const submissionMetrics = {
      totalSubmissions,
      total: totalSubmissions,
      finalizedCount,
      finalized: finalizedCount,
      draftCount,
      draft: draftCount,
      trackBreakdown,
      tracks: Object.entries(trackBreakdown).map(([track, count]) => ({ track, count })),
    };

    // 2. Fetch Assignments, Scores, & Judges
    let assignmentFilter = {};
    let scoreFilter = { isFinal: { $ne: false } };

    if (eventId) {
      const subIds = submissions.map((s) => s._id);
      assignmentFilter.submissionId = { $in: subIds };
      scoreFilter.submission = { $in: subIds };
    }

    const [assignments, scores, judgeUsers] = await Promise.all([
      JudgeAssignment.find(assignmentFilter).lean(),
      Score.find(scoreFilter).populate('judge', 'fullName email role').lean(),
      User.find({ role: 'judge' }).select('fullName email role').lean(),
    ]);

    // Track completed score pairs (judge_submission)
    const completedScoreSet = new Set();
    const allRawScores = [];
    const judgeScoresMap = {};

    scores.forEach((s) => {
      const jId = (s.judgeId || s.judge?._id || s.judge || '').toString();
      const subId = (s.submissionId || s.submission?._id || s.submission || '').toString();
      if (jId && subId) {
        completedScoreSet.add(`${jId}_${subId}`);
      }

      let rawVal = null;
      if (s.rawCompositeScore != null && !isNaN(Number(s.rawCompositeScore))) {
        rawVal = Number(s.rawCompositeScore);
      } else if (s.totalRawScore != null && !isNaN(Number(s.totalRawScore))) {
        rawVal = Number(s.totalRawScore);
      } else if (Array.isArray(s.criteriaScores) && s.criteriaScores.length > 0) {
        let weightedSum = 0;
        let weightSum = 0;
        for (const c of s.criteriaScores) {
          const sc = Number(c.score ?? c.rawScore ?? 0);
          const wt = Number(c.weight ?? 1.0);
          weightedSum += sc * wt;
          weightSum += wt;
        }
        rawVal = weightSum > 0 ? weightedSum / weightSum : 0;
      }

      if (rawVal != null && !isNaN(rawVal)) {
        allRawScores.push(rawVal);
        if (jId) {
          if (!judgeScoresMap[jId]) judgeScoresMap[jId] = [];
          judgeScoresMap[jId].push(rawVal);
        }
      }
    });

    // Compute judging metrics
    let totalBallotsAssigned = assignments.length;
    let completedBallots = 0;

    assignments.forEach((a) => {
      const jId = (a.judgeId || a.judge?._id || a.judge || '').toString();
      const subId = (a.submissionId || a.submission?._id || a.submission || '').toString();
      if (a.status === 'completed' || completedScoreSet.has(`${jId}_${subId}`)) {
        completedBallots++;
      }
    });

    // Fallback if assignments collection is empty but scores were submitted directly
    if (totalBallotsAssigned === 0 && scores.length > 0) {
      totalBallotsAssigned = scores.length;
      completedBallots = scores.length;
    }

    const completionPercentage = totalBallotsAssigned > 0
      ? Number(((completedBallots / totalBallotsAssigned) * 100).toFixed(2))
      : 0;
    const completionRate = totalBallotsAssigned > 0
      ? Number((completedBallots / totalBallotsAssigned).toFixed(4))
      : 0;

    const judgingMetrics = {
      totalBallotsAssigned,
      totalAssigned: totalBallotsAssigned,
      completedBallots,
      completed: completedBallots,
      pendingBallots: Math.max(0, totalBallotsAssigned - completedBallots),
      completionPercentage,
      completionRate,
    };

    // 3. Compute Global Statistics
    const totalScoreCount = allRawScores.length;
    const globalMean = totalScoreCount > 0
      ? allRawScores.reduce((sum, v) => sum + v, 0) / totalScoreCount
      : 0;
    const globalVariance = totalScoreCount > 1
      ? allRawScores.reduce((sum, v) => sum + Math.pow(v - globalMean, 2), 0) / (totalScoreCount - 1)
      : 0;
    const globalStd = Math.sqrt(globalVariance);

    // 4. Map Judge Assignments per judge
    const judgeAssignmentsMap = {};
    assignments.forEach((a) => {
      const jId = (a.judgeId || a.judge?._id || a.judge || '').toString();
      if (!jId) return;
      if (!judgeAssignmentsMap[jId]) {
        judgeAssignmentsMap[jId] = { assigned: 0, completed: 0 };
      }
      judgeAssignmentsMap[jId].assigned++;
      const subId = (a.submissionId || a.submission?._id || a.submission || '').toString();
      if (a.status === 'completed' || completedScoreSet.has(`${jId}_${subId}`)) {
        judgeAssignmentsMap[jId].completed++;
      }
    });

    // User lookup map
    const judgeUserMap = {};
    judgeUsers.forEach((u) => {
      judgeUserMap[u._id.toString()] = u;
    });

    // All relevant judges
    const allJudgeIdSet = new Set([
      ...judgeUsers.map((u) => u._id.toString()),
      ...Object.keys(judgeScoresMap),
      ...Object.keys(judgeAssignmentsMap),
    ]);

    const priorK = Number(req.query?.priorK || req.body?.priorK || 3.0);
    const judgeVarianceMetrics = [];
    const flaggedAnomalies = [];

    allJudgeIdSet.forEach((jId) => {
      const judgeDoc = judgeUserMap[jId];
      const judgeName = judgeDoc?.fullName || `Judge ${jId.slice(-4)}`;
      const email = judgeDoc?.email || '';

      const scoresList = judgeScoresMap[jId] || [];
      const n = scoresList.length;

      const assignInfo = judgeAssignmentsMap[jId] || { assigned: 0, completed: 0 };
      let assignedCount = assignInfo.assigned;
      let judgeCompletedCount = Math.max(assignInfo.completed, n);
      if (assignedCount === 0 && judgeCompletedCount > 0) {
        assignedCount = judgeCompletedCount;
      }

      const judgeCompletionRate = assignedCount > 0
        ? Number(((judgeCompletedCount / assignedCount) * 100).toFixed(2))
        : (judgeCompletedCount > 0 ? 100 : 0);

      // Mean
      const rawMean = n > 0 ? scoresList.reduce((sum, v) => sum + v, 0) / n : 0;

      // Sample variance & standard deviation
      const variance = n > 1
        ? scoresList.reduce((sum, v) => sum + Math.pow(v - rawMean, 2), 0) / (n - 1)
        : 0;
      const std = Math.sqrt(variance);

      // Bayesian delta: \delta_j = \hat{\mu}_j - \mu_{global}
      // \hat{\mu}_j = (n * rawMean + priorK * globalMean) / (n + priorK)
      const shrunkMean = (n * rawMean + priorK * globalMean) / (n + priorK);
      const bayesianDelta = shrunkMean - globalMean;

      const metricEntry = {
        judgeId: jId,
        judgeName,
        name: judgeName,
        email,
        sampleSize: n,
        count: n,
        mean: Number(rawMean.toFixed(2)),
        rawMean: Number(rawMean.toFixed(4)),
        standardDeviation: Number(std.toFixed(4)),
        std: Number(std.toFixed(4)),
        variance: Number(variance.toFixed(4)),
        shrunkMean: Number(shrunkMean.toFixed(4)),
        bayesianShrunkMean: Number(shrunkMean.toFixed(4)),
        bayesianDelta: Number(bayesianDelta.toFixed(4)),
        delta: Number(bayesianDelta.toFixed(4)),
        assignedBallots: assignedCount,
        totalAssigned: assignedCount,
        completedBallots: judgeCompletedCount,
        completed: judgeCompletedCount,
        completionPercentage: judgeCompletionRate,
        completionRate: judgeCompletionRate,
        isAnomalous: false,
        anomalyReasons: [],
      };

      // Anomaly detection rules:
      // 1. Zero variance: completed >= 2 evaluations and variance === 0
      const isZeroVariance = n >= 2 && variance === 0;

      // 2. Low completion: assigned > 0 and completion rate < 50%
      const isLowCompletion = assignedCount > 0 && judgeCompletionRate < 50.0;

      if (isZeroVariance || isLowCompletion) {
        const reasons = [];
        const descriptions = [];

        if (isZeroVariance) {
          reasons.push('zero_variance');
          descriptions.push('Zero score variance across completed evaluations (potential straight-line scoring)');
        }
        if (isLowCompletion) {
          reasons.push('low_completion_rate');
          descriptions.push(
            `Completion rate of ${judgeCompletionRate}% is below the 50% threshold (${judgeCompletedCount}/${assignedCount} completed)`
          );
        }

        metricEntry.isAnomalous = true;
        metricEntry.anomalyReasons = reasons;

        flaggedAnomalies.push({
          judgeId: jId,
          judgeName,
          email,
          reasons,
          issue: reasons.join(', '),
          type: reasons[0],
          message: descriptions.join('; '),
          descriptions,
          variance: Number(variance.toFixed(4)),
          standardDeviation: Number(std.toFixed(4)),
          mean: Number(rawMean.toFixed(4)),
          bayesianDelta: Number(bayesianDelta.toFixed(4)),
          sampleSize: n,
          completionRate: judgeCompletionRate,
          completionPercentage: judgeCompletionRate,
          assignedBallots: assignedCount,
          totalAssigned: assignedCount,
          completedBallots: judgeCompletedCount,
          completed: judgeCompletedCount,
          hasZeroVariance: isZeroVariance,
          hasLowCompletion: isLowCompletion,
          zeroVariance: isZeroVariance,
          lowCompletion: isLowCompletion,
        });
      }

      judgeVarianceMetrics.push(metricEntry);
    });

    const analyticsData = {
      submissionMetrics,
      judgingMetrics,
      judgeVarianceMetrics,
      flaggedAnomalies,
      globalMetrics: {
        globalMean: Number(globalMean.toFixed(4)),
        globalStd: Number(globalStd.toFixed(4)),
        totalScores: totalScoreCount,
        totalScoresEvaluated: totalScoreCount,
      },
    };

    return res.status(200).json({
      success: true,
      message: 'Organizer analytics successfully retrieved.',
      data: analyticsData,
      ...analyticsData,
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizerAnalytics = exports.getAnalytics;
