const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/index');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Submission = require('../src/models/Submission');
const Score = require('../src/models/Score');
const LeaderboardCache = require('../src/models/LeaderboardCache');
const adminController = require('../src/controllers/adminController');
const {
  HEADERS,
  escapeRFC4180,
  formatStandingRow,
  generateStandingsCSV,
  createStandingsCSVStream,
} = require('../src/services/csvExporter');

describe('CSV Exporter Service & Admin Export Endpoints', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026';
  const dummyAdminId = new mongoose.Types.ObjectId();
  const dummyJudgeId = new mongoose.Types.ObjectId();
  const dummyParticipantId = new mongoose.Types.ObjectId();
  const dummySubId = new mongoose.Types.ObjectId();
  const dummyTeamId = new mongoose.Types.ObjectId();

  const adminToken = jwt.sign({ userId: dummyAdminId.toString(), role: 'admin' }, JWT_SECRET);
  const participantToken = jwt.sign({ userId: dummyParticipantId.toString(), role: 'participant' }, JWT_SECRET);

  beforeEach(() => {
    jest.restoreAllMocks();

    // Mock User.findById for authMiddleware
    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === dummyAdminId.toString()) {
        return {
          select: jest.fn().mockResolvedValue({
            _id: dummyAdminId,
            role: 'admin',
            fullName: 'Admin Organizer',
            email: 'admin@test.local',
          }),
        };
      }
      if (idStr === dummyParticipantId.toString()) {
        return {
          select: jest.fn().mockResolvedValue({
            _id: dummyParticipantId,
            role: 'participant',
            fullName: 'Alice Developer',
            email: 'alice@test.local',
          }),
        };
      }
      return { select: jest.fn().mockResolvedValue(null) };
    });
  });

  describe('csvExporter Service Unit Tests', () => {
    it('should define exact 10 RFC 4180 headers in order', () => {
      expect(HEADERS).toEqual([
        'Rank',
        'Project Title',
        'Track',
        'Team Name',
        'Team Members',
        'Raw Average',
        'Normalized Score',
        'Z-Score Mean',
        'Ballot Count',
        'Judge Comments',
      ]);
    });

    it('escapeRFC4180 should correctly escape commas, quotes, and newlines', () => {
      expect(escapeRFC4180('Simple')).toBe('Simple');
      expect(escapeRFC4180(42)).toBe('42');
      expect(escapeRFC4180(null)).toBe('');
      expect(escapeRFC4180(undefined)).toBe('');

      // Commas
      expect(escapeRFC4180('Alice, Bob')).toBe('"Alice, Bob"');

      // Quotes
      expect(escapeRFC4180('He said "Hello"')).toBe('"He said ""Hello"""');

      // Multiline with newlines and quotes
      const multiline = 'Line 1\nLine 2 with "quotes" and, commas';
      expect(escapeRFC4180(multiline)).toBe('"Line 1\nLine 2 with ""quotes"" and, commas"');

      // Whitespace preservation
      expect(escapeRFC4180('  padded  ')).toBe('"  padded  "');
    });

    it('formatStandingRow should cleanly map standing data into 10 columns', () => {
      const item = {
        rank: 1,
        title: 'Project Alpha',
        track: 'Developer Tools',
        teamName: 'Alpha Team',
        teamMembers: ['Alice', 'Bob'],
        rawAverage: 8.75,
        normalizedScore: 89.2,
        zScoreMean: 1.2543,
        ballotCount: 3,
        judgeComments: 'Good project.\nGreat UI.',
      };

      const row = formatStandingRow(item);
      expect(row).toEqual([
        1,
        'Project Alpha',
        'Developer Tools',
        'Alpha Team',
        'Alice, Bob',
        '8.75',
        '89.20',
        '1.2543',
        3,
        'Good project.\nGreat UI.',
      ]);
    });

    it('generateStandingsCSV should generate valid RFC 4180 CSV with BOM and CRLF', () => {
      const items = [
        {
          rank: 1,
          title: 'Project "Super", v1',
          track: 'AI',
          teamName: 'Team One',
          teamMembers: 'Alice, Bob',
          rawAverage: 9.0,
          normalizedScore: 95.0,
          zScoreMean: 1.5,
          ballotCount: 2,
          judgeComments: 'First line\nSecond line with "quotes"',
        },
      ];

      const csv = generateStandingsCSV(items);

      // Must start with UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // Must have CRLF
      expect(csv.includes('\r\n')).toBe(true);

      // Header row
      const headerLine = 'Rank,Project Title,Track,Team Name,Team Members,Raw Average,Normalized Score,Z-Score Mean,Ballot Count,Judge Comments\r\n';
      expect(csv).toContain(headerLine);

      // Contains properly escaped content
      expect(csv).toContain('"Project ""Super"", v1"');
      expect(csv).toContain('"Alice, Bob"');
      expect(csv).toContain('"First line\nSecond line with ""quotes"""');
    });

    it('createStandingsCSVStream should stream CSV in chunks', async () => {
      const items = [
        {
          rank: 1,
          title: 'Streamed Project',
          track: 'Cloud',
          teamName: 'Stream Team',
          teamMembers: 'Carol',
          rawAverage: 8.5,
          normalizedScore: 85.0,
          zScoreMean: 0.5,
          ballotCount: 1,
          judgeComments: 'Nice work!',
        },
      ];

      const stream = createStandingsCSVStream(items);
      let output = '';

      for await (const chunk of stream) {
        output += chunk;
      }

      expect(output.startsWith('\uFEFFRank,Project Title')).toBe(true);
      expect(output).toContain('Streamed Project');
      expect(output).toContain('Stream Team');
    });
  });

  describe('Integration Route Tests: /api/v1/admin/export/*', () => {
    const mockSubmission = {
      _id: dummySubId,
      title: 'Agentic AI "Dogfooder", v2',
      tagline: 'Automating developer workflows',
      track: 'AI / Machine Learning',
      description: 'Markdown description for project',
      repoUrl: 'https://github.com/dogfood/dogfooder',
      demoUrl: 'https://youtube.com/watch?v=12345',
      publicVoteCount: 15,
      team: {
        _id: dummyTeamId,
        name: 'DogFood Innovators',
        captain: { _id: dummyParticipantId, name: 'Alice Developer', email: 'alice@test.local' },
        members: [
          { _id: dummyParticipantId, name: 'Alice Developer', email: 'alice@test.local' },
          { _id: new mongoose.Types.ObjectId(), name: 'Bob Coder', email: 'bob@test.local' },
        ],
      },
      status: 'submitted',
    };

    const mockScore = {
      _id: new mongoose.Types.ObjectId(),
      judge: {
        _id: dummyJudgeId,
        name: 'Judge Judy',
        email: 'judy@judges.local',
      },
      submission: dummySubId,
      rawCompositeScore: 9.25,
      totalRawScore: 9.25,
      normalizedScore: 92.5,
      zScore: 1.4523,
      privateNotes: 'Excellent work!\nLoved the "innovative" UI, and clean API design.\nHighly recommended.',
      criteriaScores: [
        { key: 'Innovation', score: 9.5, weight: 0.5 },
        { key: 'Technical', score: 9.0, weight: 0.5 },
      ],
      isFinal: true,
    };

    const mockLeaderboardCache = {
      eventId: 'default-event',
      standings: [
        {
          submissionId: dummySubId,
          rank: 1,
          normalizedScore: 92.5,
          rawMean: 9.25,
          zScoreMean: 1.4523,
          ballotCount: 1,
          teamName: 'DogFood Innovators',
          title: 'Agentic AI "Dogfooder", v2',
          track: 'AI / Machine Learning',
        },
      ],
      judgeCalibrations: [
        {
          judgeId: dummyJudgeId,
          sampleSize: 1,
          rawMean: 9.25,
          rawStd: 0.5,
          bias: 0.15,
        },
      ],
      algorithm: 'z_score_bayesian_shrinkage',
      isFallback: false,
    };

    beforeEach(() => {
      // Mock Submission.find().populate().lean()
      jest.spyOn(Submission, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockSubmission]),
        }),
      });

      // Mock Score.find().populate().lean()
      jest.spyOn(Score, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockScore]),
        }),
      });

      // Mock LeaderboardCache.getLatest
      jest.spyOn(LeaderboardCache, 'getLatest').mockResolvedValue(mockLeaderboardCache);
    });

    describe('GET /api/v1/admin/export/csv', () => {
      it('should reject unauthorized request with 401', async () => {
        const res = await request(app).get('/api/v1/admin/export/csv');
        expect(res.status).toBe(401);
      });

      it('should reject non-admin/organizer request with 403', async () => {
        const res = await request(app)
          .get('/api/v1/admin/export/csv')
          .set('Authorization', `Bearer ${participantToken}`);
        expect(res.status).toBe(403);
      });

      it('should stream RFC 4180 CSV with correct headers and Content-Disposition', async () => {
        const res = await request(app)
          .get('/api/v1/admin/export/csv')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(res.headers['content-disposition']).toBe(
          'attachment; filename="dogfood-2026-standings.csv"'
        );

        const text = res.text;
        // Verify header row
        expect(text.startsWith('\uFEFFRank,Project Title,Track,Team Name,Team Members,Raw Average,Normalized Score,Z-Score Mean,Ballot Count,Judge Comments')).toBe(true);

        // Verify data content with multiline, quotes, commas
        expect(text).toContain('Agentic AI ""Dogfooder"", v2');
        expect(text).toContain('AI / Machine Learning');
        expect(text).toContain('DogFood Innovators');
        expect(text).toContain('"Alice Developer, Bob Coder"');
        expect(text).toContain('9.25');
        expect(text).toContain('92.50');
        expect(text).toContain('1.4523');
        expect(text).toContain('Judge Judy: Excellent work!');
        expect(text).toContain('Loved the ""innovative"" UI, and clean API design.');
      });
    });

    describe('GET /api/v1/admin/export/json', () => {
      it('should reject unauthorized request with 401', async () => {
        const res = await request(app).get('/api/v1/admin/export/json');
        expect(res.status).toBe(401);
      });

      it('should reject non-admin/organizer request with 403', async () => {
        const res = await request(app)
          .get('/api/v1/admin/export/json')
          .set('Authorization', `Bearer ${participantToken}`);
        expect(res.status).toBe(403);
      });

      it('should return structured JSON export for archiving with metadata and calibrations', async () => {
        const res = await request(app)
          .get('/api/v1/admin/export/json')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.headers['content-disposition']).toBe(
          'attachment; filename="dogfood-2026-standings.json"'
        );

        const data = JSON.parse(res.text);

        // Verify archiving metadata
        expect(data).toHaveProperty('metadata');
        expect(data.metadata).toMatchObject({
          title: expect.stringMatching(/standings & judging archive/i),
          version: '2026.1',
          algorithm: 'z_score_bayesian_shrinkage',
          totalSubmissions: 1,
          totalScoresProcessed: 1,
        });

        // Verify summary
        expect(data).toHaveProperty('summary');
        expect(data.summary).toMatchObject({
          totalSubmissions: 1,
          evaluatedSubmissions: 1,
          tracks: ['AI / Machine Learning'],
          averageRawScore: 9.25,
        });

        // Verify structured standings array
        expect(Array.isArray(data.standings)).toBe(true);
        expect(data.standings.length).toBe(1);

        const entry = data.standings[0];
        expect(entry.rank).toBe(1);
        expect(entry.projectTitle).toBe('Agentic AI "Dogfooder", v2');
        expect(entry.track).toBe('AI / Machine Learning');
        expect(entry.team).toMatchObject({
          name: 'DogFood Innovators',
          members: expect.arrayContaining([
            expect.objectContaining({ name: 'Alice Developer' }),
            expect.objectContaining({ name: 'Bob Coder' }),
          ]),
        });
        expect(entry.scores).toMatchObject({
          rawAverage: 9.25,
          normalizedScore: 92.5,
          zScoreMean: 1.4523,
          ballotCount: 1,
          publicVotes: 15,
        });
        expect(entry.judgeComments.length).toBe(1);
        expect(entry.judgeComments[0]).toContain('Judge Judy: Excellent work!');
        expect(entry.ballots.length).toBe(1);
        expect(entry.ballots[0].judgeName).toBe('Judge Judy');

        // Verify calibrations
        expect(Array.isArray(data.judgeCalibrations)).toBe(true);
        expect(data.judgeCalibrations.length).toBe(1);
        expect(data.judgeCalibrations[0].judgeId).toBe(dummyJudgeId.toString());
      });

      it('should handle multiple submissions including projects with no scores and multiple judge comments', async () => {
        const dummySub2Id = new mongoose.Types.ObjectId();
        const dummyJudge2Id = new mongoose.Types.ObjectId();

        const subWithScores = {
          _id: dummySubId,
          title: 'Project Alpha 🚀',
          track: 'AI / Machine Learning',
          team: {
            name: 'Alpha Team',
            members: [{ name: 'Alice' }, { name: 'Bob' }],
          },
          status: 'submitted',
        };

        const subWithoutScores = {
          _id: dummySub2Id,
          title: 'Project Beta, "Unscored"',
          track: 'Web3',
          team: {
            name: 'Beta Squad',
            members: [{ name: 'Charlie' }],
          },
          status: 'submitted',
        };

        const score1 = {
          submissionId: dummySubId,
          judge: { name: 'Judge One' },
          totalRawScore: 9.0,
          normalizedScore: 90.0,
          zScore: 1.2,
          privateNotes: 'First judge comment.\nLooks great!',
          isFinal: true,
        };

        const score2 = {
          submissionId: dummySubId,
          judge: { name: 'Judge Two' },
          totalRawScore: 8.0,
          normalizedScore: 90.0,
          zScore: 1.2,
          privateNotes: 'Second judge comment with "quotes" and, commas.',
          isFinal: true,
        };

        jest.spyOn(Submission, 'find').mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([subWithScores, subWithoutScores]),
          }),
        });

        jest.spyOn(Score, 'find').mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([score1, score2]),
          }),
        });

        jest.spyOn(LeaderboardCache, 'getLatest').mockResolvedValue(null);

        // Test CSV export with multiple submissions and multiple comments
        const csvRes = await request(app)
          .get('/api/v1/admin/export/csv')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(csvRes.status).toBe(200);
        expect(csvRes.text).toContain('Project Alpha 🚀');
        expect(csvRes.text).toContain('Judge One: First judge comment.');
        expect(csvRes.text).toContain('Judge Two: Second judge comment with ""quotes"" and, commas.');
        expect(csvRes.text).toContain('"Project Beta, ""Unscored"""');
        expect(csvRes.text).toContain('N/A');

        // Test JSON export
        const jsonRes = await request(app)
          .get('/api/v1/admin/export/json')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(jsonRes.status).toBe(200);
        const jsonData = JSON.parse(jsonRes.text);
        expect(jsonData.standings.length).toBe(2);

        const alpha = jsonData.standings.find((s) => s.projectTitle.includes('Alpha'));
        expect(alpha.rank).toBe(1);
        expect(alpha.scores.rawAverage).toBe(8.5);
        expect(alpha.judgeComments.length).toBe(2);

        const beta = jsonData.standings.find((s) => s.projectTitle.includes('Beta'));
        expect(beta.rank).toBe(2);
        expect(beta.scores.rawAverage).toBeNull();
        expect(beta.scores.ballotCount).toBe(0);
      });
    });
  });
});

