const mongoose = require('mongoose');
const { solveJudgeAssignments, hasConflict } = require('../src/services/assignmentSolver');
const JudgeAssignment = require('../src/models/JudgeAssignment');
const Score = require('../src/models/Score');

describe('Judge Assignment Engine & Model Unit Tests', () => {
  describe('JudgeAssignment Model', () => {
    it('should validate status enum values: assigned, in_progress, completed', async () => {
      const validStatuses = ['assigned', 'in_progress', 'completed'];

      for (const status of validStatuses) {
        const assignment = new JudgeAssignment({
          judgeId: new mongoose.Types.ObjectId(),
          submissionId: new mongoose.Types.ObjectId(),
          track: 'AI/ML',
          status,
        });
        const err = assignment.validateSync();
        expect(err).toBeUndefined();
      }

      // Default status should be 'assigned'
      const defaultAssignment = new JudgeAssignment({
        judgeId: new mongoose.Types.ObjectId(),
        submissionId: new mongoose.Types.ObjectId(),
        track: 'AI/ML',
      });
      expect(defaultAssignment.status).toBe('assigned');

      // Invalid status should fail validation
      const invalidAssignment = new JudgeAssignment({
        judgeId: new mongoose.Types.ObjectId(),
        submissionId: new mongoose.Types.ObjectId(),
        track: 'AI/ML',
        status: 'invalid_status',
      });
      const validationError = invalidAssignment.validateSync();
      expect(validationError.errors.status).toBeDefined();
    });

    it('should configure virtual populate options for submission and judge aliases', () => {
      const submissionVirtual = JudgeAssignment.schema.virtuals.submission;
      expect(submissionVirtual).toBeDefined();
      expect(submissionVirtual.options.ref).toBe('Submission');
      expect(submissionVirtual.options.localField).toBe('submissionId');
      expect(submissionVirtual.options.foreignField).toBe('_id');

      const judgeVirtual = JudgeAssignment.schema.virtuals.judge;
      expect(judgeVirtual).toBeDefined();
      expect(judgeVirtual.options.ref).toBe('User');
      expect(judgeVirtual.options.localField).toBe('judgeId');
      expect(judgeVirtual.options.foreignField).toBe('_id');
    });
  });

  describe('Constraint-Satisfied Assignment Engine (assignmentSolver)', () => {
    it('should distribute projects to track-qualified judges while balancing load', () => {
      const submissions = [
        { _id: 'sub1', teamId: 'team1', track: 'AI/ML', title: 'AI Proj 1' },
        { _id: 'sub2', teamId: 'team2', track: 'AI/ML', title: 'AI Proj 2' },
        { _id: 'sub3', teamId: 'team3', track: 'AI/ML', title: 'AI Proj 3' },
      ];

      const judges = [
        { _id: 'judge1', judgeTracks: ['AI/ML'], conflictsOfInterest: [] },
        { _id: 'judge2', judgeTracks: ['AI/ML'], conflictsOfInterest: [] },
      ];

      const result = solveJudgeAssignments(submissions, judges, 2);

      expect(result.totalAssigned).toBe(6);
      expect(result.judgeLoad['judge1']).toBe(3);
      expect(result.judgeLoad['judge2']).toBe(3);
      result.assignments.forEach((a) => {
        expect(a.status).toBe('assigned');
      });
    });

    it('Constraint 1: Conflict Exclusion — avoids assigning judge in conflictsOfInterest', () => {
      const submissions = [
        { _id: 'sub1', teamId: 'teamConflict', track: 'AI/ML', title: 'Conflicted Proj' },
      ];

      const judges = [
        { _id: 'judgeConflict', judgeTracks: ['AI/ML'], conflictsOfInterest: ['teamConflict'] },
        { _id: 'judgeClean', judgeTracks: ['AI/ML'], conflictsOfInterest: [] },
      ];

      const result = solveJudgeAssignments(submissions, judges, 1);

      expect(result.totalAssigned).toBe(1);
      expect(result.assignments[0].judgeId).toBe('judgeClean');
    });

    it('Constraint 1: Conflict Exclusion — avoids assigning judge to a mentored team', () => {
      const submissions = [
        { _id: 'sub1', team: 'teamMentored', track: 'Web3', title: 'Mentored Proj' },
      ];

      const judges = [
        { _id: 'judgeMentor', trackPreferences: ['Web3'], mentoredTeams: ['teamMentored'] },
        { _id: 'judgeClean', trackPreferences: ['Web3'], mentoredTeams: [] },
      ];

      expect(hasConflict(judges[0], submissions[0])).toBe(true);
      expect(hasConflict(judges[1], submissions[0])).toBe(false);

      const result = solveJudgeAssignments(submissions, judges, 1);

      expect(result.totalAssigned).toBe(1);
      expect(result.assignments[0].judgeId).toBe('judgeClean');
    });

    it('Constraint 2: Track Competency — prioritizes judges whose trackPreferences match S.track', () => {
      const submissions = [
        { _id: 'subAI', teamId: 'team1', track: 'AI/ML', title: 'AI Proj' },
      ];

      const judges = [
        { _id: 'judgeAI', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
        { _id: 'judgeWeb3', trackPreferences: ['Web3'], conflictsOfInterest: [] },
      ];

      const result = solveJudgeAssignments(submissions, judges, 1);

      expect(result.totalAssigned).toBe(1);
      expect(result.assignments[0].judgeId).toBe('judgeAI');
    });

    it('Constraint 3: Workload Balance — enforces uniform distribution with max(load) - min(load) <= 1', () => {
      // 4 submissions * 2 target = 8 total assignments across 3 judges
      // 8 / 3 => loads must be [3, 3, 2], max - min = 1
      const submissions = [
        { _id: 's1', teamId: 't1', track: 'FinTech', title: 'Proj 1' },
        { _id: 's2', teamId: 't2', track: 'FinTech', title: 'Proj 2' },
        { _id: 's3', teamId: 't3', track: 'FinTech', title: 'Proj 3' },
        { _id: 's4', teamId: 't4', track: 'FinTech', title: 'Proj 4' },
      ];

      const judges = [
        { _id: 'j1', trackPreferences: ['FinTech'], conflictsOfInterest: [] },
        { _id: 'j2', trackPreferences: ['FinTech'], conflictsOfInterest: [] },
        { _id: 'j3', trackPreferences: ['FinTech'], conflictsOfInterest: [] },
      ];

      const result = solveJudgeAssignments(submissions, judges, 2);

      expect(result.totalAssigned).toBe(8);

      const loads = Object.values(result.judgeLoad);
      const maxLoad = Math.max(...loads);
      const minLoad = Math.min(...loads);

      expect(maxLoad - minLoad).toBeLessThanOrEqual(1);
      expect(loads.reduce((a, b) => a + b, 0)).toBe(8);
      expect(loads.sort()).toEqual([2, 3, 3]);
    });

    it('Constraint 4: Target Quorum — assigns exact target judges per project (default K = 3)', () => {
      const submissions = [
        { _id: 'sub1', teamId: 'team1', track: 'HealthTech', title: 'Health App 1' },
        { _id: 'sub2', teamId: 'team2', track: 'HealthTech', title: 'Health App 2' },
      ];

      const judges = [
        { _id: 'j1', trackPreferences: ['HealthTech'], conflictsOfInterest: [] },
        { _id: 'j2', trackPreferences: ['HealthTech'], conflictsOfInterest: [] },
        { _id: 'j3', trackPreferences: ['HealthTech'], conflictsOfInterest: [] },
        { _id: 'j4', trackPreferences: ['HealthTech'], conflictsOfInterest: [] },
      ];

      // Default targetPerProject = 3
      const result = solveJudgeAssignments(submissions, judges);

      expect(result.totalAssigned).toBe(6); // 2 projects * 3 judges = 6

      // Each submission must have exactly 3 distinct judges
      const sub1Judges = result.assignments.filter((a) => a.submissionId === 'sub1');
      const sub2Judges = result.assignments.filter((a) => a.submissionId === 'sub2');

      expect(sub1Judges.length).toBe(3);
      expect(sub2Judges.length).toBe(3);

      const sub1JudgeIds = new Set(sub1Judges.map((a) => a.judgeId));
      expect(sub1JudgeIds.size).toBe(3);

      const sub2JudgeIds = new Set(sub2Judges.map((a) => a.judgeId));
      expect(sub2JudgeIds.size).toBe(3);

      // Workload balance max - min <= 1
      const loads = Object.values(result.judgeLoad);
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    });

    it('should throw an error if available judges are fewer than target quorum K', () => {
      const submissions = [
        { _id: 'sub1', teamId: 'team1', track: 'AI/ML', title: 'AI Proj 1' },
      ];

      // Only 2 judges, but target quorum is 3
      const judges = [
        { _id: 'j1', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
        { _id: 'j2', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      expect(() => solveJudgeAssignments(submissions, judges, 3)).toThrow(
        /Insufficient judges available to satisfy target quorum/
      );
    });

    it('should throw an error if a submission cannot meet quorum due to conflicts of interest', () => {
      const submissions = [
        { _id: 'sub1', teamId: 'teamConflict', track: 'AI/ML', title: 'AI Proj 1' },
      ];

      // 3 judges total, but 1 has a conflict, leaving only 2 for a target quorum of 3
      const judges = [
        { _id: 'j1', trackPreferences: ['AI/ML'], conflictsOfInterest: ['teamConflict'] },
        { _id: 'j2', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
        { _id: 'j3', trackPreferences: ['AI/ML'], conflictsOfInterest: [] },
      ];

      expect(() => solveJudgeAssignments(submissions, judges, 3)).toThrow(
        /Insufficient non-conflicted judges available for submission/
      );
    });
  });

  describe('Score Model & Upsert Query Resolution', () => {
    it('should configure virtual populate options for submissionId and judgeId aliases', () => {
      const submissionVirtual = Score.schema.virtuals.submissionId;
      expect(submissionVirtual).toBeDefined();
      expect(submissionVirtual.options.ref).toBe('Submission');
      expect(submissionVirtual.options.localField).toBe('submission');
      expect(submissionVirtual.options.foreignField).toBe('_id');

      const judgeVirtual = Score.schema.virtuals.judgeId;
      expect(judgeVirtual).toBeDefined();
      expect(judgeVirtual.options.ref).toBe('User');
      expect(judgeVirtual.options.localField).toBe('judge');
      expect(judgeVirtual.options.foreignField).toBe('_id');
    });

    it('should allow findOneAndUpdate with upsert and canonical fields without strict mode errors', () => {
      const judgeId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();

      const query = Score.findOneAndUpdate(
        {
          judge: judgeId,
          submission: submissionId,
        },
        {
          judge: judgeId,
          submission: submissionId,
          criteriaScores: [{ key: 'innovation', score: 9.0, weight: 1.0 }],
          rawCompositeScore: 9.0,
          totalRawScore: 9.0,
          privateNotes: 'Pairwise Winner',
          isFinal: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      expect(() => query.cast()).not.toThrow();
    });

    it('should normalize $or queries with legacy aliases in pre hooks without throwing strict mode errors', () => {
      const judgeId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();

      const query = Score.findOneAndUpdate(
        {
          $or: [
            { judge: judgeId, submission: submissionId },
            { judgeId: judgeId, submissionId: submissionId },
          ],
        },
        {
          judge: judgeId,
          submission: submissionId,
          judgeId: judgeId,
          submissionId: submissionId,
          rawCompositeScore: 9.0,
          totalRawScore: 9.0,
          isFinal: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Pre-hook executes when query is compiled / executed
      // We manually invoke pre-hook logic to ensure filter normalization
      const preHooks = Score.schema.s.hooks._pres.get('findOneAndUpdate') || [];
      for (const hook of preHooks) {
        hook.fn.call(query, () => {});
      }

      expect(() => query.cast()).not.toThrow();
    });

    it('should validate autoEvaluated schema field and alias isAutoEvaluated on Score', () => {
      const score = new Score({
        judge: new mongoose.Types.ObjectId(),
        submission: new mongoose.Types.ObjectId(),
        rawCompositeScore: 5.0,
        autoEvaluated: true,
      });
      expect(score.autoEvaluated).toBe(true);
      expect(score.isAutoEvaluated).toBe(true);
    });

    it('should normalize nested $and and $or filters in pre hooks during auto-evaluate upserts', () => {
      const judgeId = new mongoose.Types.ObjectId();
      const submissionId = new mongoose.Types.ObjectId();

      const query = Score.findOneAndUpdate(
        {
          $and: [
            { $or: [{ judge: judgeId }, { judgeId: judgeId }] },
            { $or: [{ submission: submissionId }, { submissionId: submissionId }] },
          ],
        },
        {
          judge: judgeId,
          submission: submissionId,
          rawCompositeScore: 5.0,
          totalRawScore: 5.0,
          autoEvaluated: true,
          isFinal: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const preHooks = Score.schema.s.hooks._pres.get('findOneAndUpdate') || [];
      for (const hook of preHooks) {
        hook.fn.call(query, () => {});
      }

      expect(() => query.cast()).not.toThrow();
    });
  });

  describe('JudgeAssignment autoEvaluated field', () => {
    it('should support autoEvaluated boolean on JudgeAssignment model with default false', () => {
      const assignment = new JudgeAssignment({
        judgeId: new mongoose.Types.ObjectId(),
        submissionId: new mongoose.Types.ObjectId(),
        track: 'AI/ML',
      });
      expect(assignment.autoEvaluated).toBe(false);

      const autoAssignment = new JudgeAssignment({
        judgeId: new mongoose.Types.ObjectId(),
        submissionId: new mongoose.Types.ObjectId(),
        track: 'AI/ML',
        autoEvaluated: true,
        status: 'auto_evaluated',
      });
      expect(autoAssignment.autoEvaluated).toBe(true);
      expect(autoAssignment.status).toBe('auto_evaluated');
      const err = autoAssignment.validateSync();
      expect(err).toBeUndefined();
    });
  });
});

