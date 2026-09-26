const mongoose = require('mongoose');
const Submission = require('../src/models/Submission');

describe('Submission Model Schema and Validation Unit Tests', () => {
  const dummyTeamId = new mongoose.Types.ObjectId();

  it('should validate a valid Submission document with canonical fields', () => {
    const submission = new Submission({
      team: dummyTeamId,
      title: 'Decentralized Identity Hub',
      tagline: 'Self-sovereign identity protocol for air-gapped systems',
      track: 'Security',
      description: '# Decentralized Identity\n\nFull architecture details here.',
      githubUrl: 'https://github.com/example/identity-hub',
      demoVideoUrl: 'https://youtu.be/demo123',
      thumbnailUrl: '/uploads/custom-thumb.png',
      status: 'draft',
    });

    const err = submission.validateSync();
    expect(err).toBeUndefined();
    expect(submission.team).toEqual(dummyTeamId);
    expect(submission.title).toBe('Decentralized Identity Hub');
    expect(submission.tagline).toBe('Self-sovereign identity protocol for air-gapped systems');
    expect(submission.track).toBe('Security');
    expect(submission.description).toBe('# Decentralized Identity\n\nFull architecture details here.');
    expect(submission.githubUrl).toBe('https://github.com/example/identity-hub');
    expect(submission.demoVideoUrl).toBe('https://youtu.be/demo123');
    expect(submission.thumbnailUrl).toBe('/uploads/custom-thumb.png');
    expect(submission.status).toBe('draft');
    expect(submission.submittedAt).toBeNull();
  });

  it('should support legacy aliases (teamId, repoUrl, demoUrl, descriptionMarkdown, thumbnailPath)', () => {
    const submission = new Submission({
      teamId: dummyTeamId,
      title: 'Smart Health Monitoring',
      tagline: 'Edge AI health vitals tracker',
      track: 'HealthTech',
      descriptionMarkdown: '## HealthTech Solution\nMarkdown notes',
      repoUrl: 'https://github.com/example/health-tracker',
      demoUrl: 'https://example.com/demo.mp4',
      thumbnailPath: '/uploads/health.jpg',
    });

    const err = submission.validateSync();
    expect(err).toBeUndefined();

    // Check canonical property access
    expect(submission.team).toEqual(dummyTeamId);
    expect(submission.githubUrl).toBe('https://github.com/example/health-tracker');
    expect(submission.demoVideoUrl).toBe('https://example.com/demo.mp4');
    expect(submission.description).toBe('## HealthTech Solution\nMarkdown notes');
    expect(submission.thumbnailUrl).toBe('/uploads/health.jpg');

    // Check alias property access
    expect(submission.teamId).toEqual(dummyTeamId);
    expect(submission.repoUrl).toBe('https://github.com/example/health-tracker');
    expect(submission.demoUrl).toBe('https://example.com/demo.mp4');
    expect(submission.descriptionMarkdown).toBe('## HealthTech Solution\nMarkdown notes');
    expect(submission.thumbnailPath).toBe('/uploads/health.jpg');
  });

  it('should enforce required fields', () => {
    const emptySubmission = new Submission({});
    const err = emptySubmission.validateSync();

    expect(err).toBeDefined();
    expect(err.errors.team).toBeDefined();
    expect(err.errors.title).toBeDefined();
    expect(err.errors.tagline).toBeDefined();
    expect(err.errors.track).toBeDefined();
    expect(err.errors.description).toBeDefined();
    expect(err.errors.githubUrl).toBeDefined();
  });

  it('should enforce status enum values strictly to draft and submitted', () => {
    const validDraft = new Submission({
      team: dummyTeamId,
      title: 'Valid Project',
      tagline: 'A valid project tagline',
      track: 'AI',
      description: 'Project details',
      githubUrl: 'https://github.com/valid/project',
      status: 'draft',
    });
    expect(validDraft.validateSync()).toBeUndefined();

    const validSubmitted = new Submission({
      team: dummyTeamId,
      title: 'Valid Project',
      tagline: 'A valid project tagline',
      track: 'AI',
      description: 'Project details',
      githubUrl: 'https://github.com/valid/project',
      status: 'submitted',
    });
    expect(validSubmitted.validateSync()).toBeUndefined();

    const invalidStatus = new Submission({
      team: dummyTeamId,
      title: 'Invalid Status Project',
      tagline: 'Tagline',
      track: 'AI',
      description: 'Project details',
      githubUrl: 'https://github.com/valid/project',
      status: 'locked', // Not in ['draft', 'submitted']
    });
    const err = invalidStatus.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.status).toBeDefined();
  });

  it('should set default values for optional fields (status, demoVideoUrl, thumbnailUrl, submittedAt, publicVoteCount)', () => {
    const minimalSub = new Submission({
      team: dummyTeamId,
      title: 'Minimal Project',
      tagline: 'Tagline for minimal project',
      track: 'FinTech',
      description: '# Minimal\nOverview',
      githubUrl: 'https://github.com/example/fintech',
    });

    expect(minimalSub.status).toBe('draft');
    expect(minimalSub.demoVideoUrl).toBe('');
    expect(minimalSub.thumbnailUrl).toBe('/uploads/default-thumbnail.webp');
    expect(minimalSub.submittedAt).toBeNull();
    expect(minimalSub.publicVoteCount).toBe(0);
  });

  it('should trim string fields', () => {
    const sub = new Submission({
      team: dummyTeamId,
      title: '   Untrimmed Title   ',
      tagline: '   Untrimmed Tagline   ',
      track: '   AI/ML   ',
      description: 'Markdown description',
      githubUrl: '   https://github.com/test/repo   ',
      demoVideoUrl: '   https://youtube.com/watch   ',
    });

    expect(sub.title).toBe('Untrimmed Title');
    expect(sub.tagline).toBe('Untrimmed Tagline');
    expect(sub.track).toBe('AI/ML');
    expect(sub.githubUrl).toBe('https://github.com/test/repo');
    expect(sub.demoVideoUrl).toBe('https://youtube.com/watch');
  });

  it('should enforce maxlength constraints on title (120) and tagline (250)', () => {
    const sub = new Submission({
      team: dummyTeamId,
      title: 'A'.repeat(121),
      tagline: 'B'.repeat(251),
      track: 'AI',
      description: 'Valid description',
      githubUrl: 'https://github.com/test/repo',
    });

    const err = sub.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.title).toBeDefined();
    expect(err.errors.tagline).toBeDefined();
  });

  it('should verify schema indexes include unique index on team', () => {
    const teamPath = Submission.schema.path('team');
    expect(teamPath.options.unique).toBe(true);
    expect(teamPath.options.ref).toBe('Team');
  });

  it('should verify schema indexes include compound text index on title, tagline, and track', () => {
    const indexes = Submission.schema.indexes();
    const textIndex = indexes.find(([fields]) => fields.title === 'text');
    expect(textIndex).toBeDefined();
    expect(textIndex[0]).toEqual({ title: 'text', tagline: 'text', track: 'text' });
  });

  it('should automatically set submittedAt in pre-save hook when transitioning to submitted status', async () => {
    const sub = new Submission({
      team: dummyTeamId,
      title: 'Submission Hook Test',
      tagline: 'Tagline',
      track: 'AI',
      description: 'Description',
      githubUrl: 'https://github.com/test/repo',
      status: 'submitted',
    });

    // Mock save or execute pre hooks
    await new Promise((resolve, reject) => {
      Submission.schema.s.hooks.execPre('save', sub, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    expect(sub.submittedAt).toBeInstanceOf(Date);
  });

  it('should translate teamId to team in query middleware', () => {
    const query = Submission.findOne({ teamId: dummyTeamId });
    Submission.schema.s.hooks.execPre('findOne', query, () => {});
    expect(query.getQuery()).toEqual({ team: dummyTeamId });
  });
});
