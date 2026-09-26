// seed/init-mongo.js - Dogfood 2026 Tournament Seed Data
const db = db.getSiblingDB('dogfood');

print("=== [SEED] Initializing Dogfood 2026 Tournament Fixtures ===");

// 1. Seed Event Configuration
const eventDoc = db.events.insertOne({
  title: "Hackathon Raptors 2026",
  name: "Hackathon Raptors 2026",
  description: "The premier offline-first engineering tournament.",
  status: "active",
  submissionDeadline: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours from boot
  tracks: ["AI/ML", "Web3 & Blockchain", "FinTech", "HealthTech"],
  rubricLocked: false,
  rubric: [
    { name: "Technical Execution", weight: 0.30, scaleMin: 1, scaleMax: 10 },
    { name: "Innovation & Originality", weight: 0.25, scaleMin: 1, scaleMax: 10 },
    { name: "Practical Impact", weight: 0.25, scaleMin: 1, scaleMax: 10 },
    { name: "Polish & Presentation", weight: 0.20, scaleMin: 1, scaleMax: 10 }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
});

// 2. Seed Default Accounts
// Password for all seeded accounts is: "Raptor2026!" (Bcrypt hashed)
const defaultHash = "$2a$10$LisA82BEO4zOdIb2ym0Y6O7XHXT9lrgIDV4f.ZUIvgrZFBSr5lo8K";

// 2.1 Organizer (1 Organizer)
const organizerId = db.users.insertOne({
  name: "Tournament Organizer",
  fullName: "Tournament Organizer",
  email: "organizer@dogfood.local",
  passwordHash: defaultHash,
  role: "organizer",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// 2.2 Track Judges (4 Track Judges)
const judgeAi = db.users.insertOne({
  name: "Dr. Elena Rostova (AI Lead)",
  fullName: "Dr. Elena Rostova (AI Lead)",
  email: "judge.ai@dogfood.local",
  passwordHash: defaultHash,
  role: "judge",
  trackPreferences: ["AI/ML"],
  judgeTracks: ["AI/ML"],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const judgeWeb3 = db.users.insertOne({
  name: "Satoshi Vance (Web3 Architect)",
  fullName: "Satoshi Vance (Web3 Architect)",
  email: "judge.web3@dogfood.local",
  passwordHash: defaultHash,
  role: "judge",
  trackPreferences: ["Web3 & Blockchain"],
  judgeTracks: ["Web3 & Blockchain"],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const judgeFintech = db.users.insertOne({
  name: "Marcus Sterling (FinTech Director)",
  fullName: "Marcus Sterling (FinTech Director)",
  email: "judge.fintech@dogfood.local",
  passwordHash: defaultHash,
  role: "judge",
  trackPreferences: ["FinTech"],
  judgeTracks: ["FinTech"],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const judgeHealth = db.users.insertOne({
  name: "Dr. Clara Chen (HealthTech Lead)",
  fullName: "Dr. Clara Chen (HealthTech Lead)",
  email: "judge.health@dogfood.local",
  passwordHash: defaultHash,
  role: "judge",
  trackPreferences: ["HealthTech"],
  judgeTracks: ["HealthTech"],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// 2.3 Sample Participants (6 Sample Participants)
// Team 1 Participants (AI/ML track)
const participant1 = db.users.insertOne({
  name: "Alex Rivera",
  fullName: "Alex Rivera",
  email: "alex@dogfood.local",
  passwordHash: defaultHash,
  role: "participant",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const participant2 = db.users.insertOne({
  name: "Sarah Connor",
  fullName: "Sarah Connor",
  email: "sarah@dogfood.local",
  passwordHash: defaultHash,
  role: "participant",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const participant3 = db.users.insertOne({
  name: "David Kim",
  fullName: "David Kim",
  email: "david@dogfood.local",
  passwordHash: defaultHash,
  role: "participant",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// Team 2 Participants (HealthTech track)
const participant4 = db.users.insertOne({
  name: "Maria Garcia",
  fullName: "Maria Garcia",
  email: "maria@dogfood.local",
  passwordHash: defaultHash,
  role: "participant",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const participant5 = db.users.insertOne({
  name: "James Wilson",
  fullName: "James Wilson",
  email: "james@dogfood.local",
  passwordHash: defaultHash,
  role: "participant",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const participant6 = db.users.insertOne({
  name: "Priya Patel",
  fullName: "Priya Patel",
  email: "priya@dogfood.local",
  passwordHash: defaultHash,
  role: "participant",
  trackPreferences: [],
  judgeTracks: [],
  conflictsOfInterest: [],
  teamId: null,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// 3. Pre-Seeded Teams Across Distinct Tracks (2 Teams)
// Team 1: Track "AI/ML"
const team1 = db.teams.insertOne({
  name: "CyberDinos",
  joinCode: "RAPTOR",
  captain: participant1,
  captainId: participant1,
  members: [participant1, participant2, participant3],
  track: "AI/ML",
  hasSubmitted: true,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// Team 2: Track "HealthTech" (Distinct track)
const team2 = db.teams.insertOne({
  name: "BioPulse",
  joinCode: "PULSE1",
  captain: participant4,
  captainId: participant4,
  members: [participant4, participant5, participant6],
  track: "HealthTech",
  hasSubmitted: true,
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// Associate participants with their respective teams
db.users.updateMany({ _id: { $in: [participant1, participant2, participant3] } }, { $set: { teamId: team1 } });
db.users.updateMany({ _id: { $in: [participant4, participant5, participant6] } }, { $set: { teamId: team2 } });

// 4. Create Project Submissions
const submission1 = db.submissions.insertOne({
  teamId: team1,
  title: "Neural Raptor",
  tagline: "Autonomous air-gapped machine learning submission evaluator",
  track: "AI/ML",
  repoUrl: "https://github.com/dogfood/neural-raptor",
  demoUrl: "http://localhost:3000/demo",
  descriptionMarkdown: "### Neural Raptor\nAn enterprise-grade offline submission evaluation system.",
  thumbnailPath: "/uploads/default-thumbnail.webp",
  status: "submitted",
  publicVoteCount: 12,
  submittedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

const submission2 = db.submissions.insertOne({
  teamId: team2,
  title: "HealthSync Pulse",
  tagline: "Air-gapped clinical telemetry and edge diagnostics monitor",
  track: "HealthTech",
  repoUrl: "https://github.com/dogfood/healthsync-pulse",
  demoUrl: "http://localhost:3000/healthsync",
  descriptionMarkdown: "### HealthSync Pulse\nOffline edge telemetry monitoring system for air-gapped medical facilities.",
  thumbnailPath: "/uploads/default-thumbnail.webp",
  status: "submitted",
  publicVoteCount: 8,
  submittedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
}).insertedId;

// Text search index on title, tagline, and track
db.submissions.createIndex({ title: "text", tagline: "text", track: "text" });

// 5. Create Initial Judge Assignments
db.judgeassignments.insertOne({
  judgeId: judgeAi,
  submissionId: submission1,
  track: "AI/ML",
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date()
});

db.judgeassignments.insertOne({
  judgeId: judgeHealth,
  submissionId: submission2,
  track: "HealthTech",
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date()
});

print("=== [SEED] Successfully populated 1 organizer, 4 judges, 6 participants, 2 teams across distinct tracks, and submissions! ===");
