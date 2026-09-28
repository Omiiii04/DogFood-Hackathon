# DogFood 2026 — Judging System Specification

This specification documents the operational architecture, mathematical models, authorization boundaries, data structures, and failure modes of the judging subsystem in DogFood 2026. Every mechanism described herein reflects the actual implementation in the current codebase (`backend/src/`, `judging-service/app/`, `seed/init-mongo.js`, and `.dogfood.toml`).

---

## 1. Judging System Overview

The DogFood 2026 platform implements a multi-tier evaluation system designed for air-gapped, offline hackathon tournaments. The evaluation workflow comprises a core tournament pipeline alongside three decoupled algorithmic modules.

### Core Tournament Evaluation Pipeline

```
Project Submission (Locked)
  ↓
Judge Assignment (Global Min-Cost Max-Flow or Incremental Auto-Assignment)
  ↓
Judge Queue (Assigned Queue Isolation)
  ↓
Rubric Evaluation (1.0–10.0 scale, 0.5 increments, 4 weighted criteria)
  ↓
Score Ballot (Draft PUT or Final POST with assignment completion)
  ↓
Score Isolation (IsolationGuard & verifyScoreOwnership route enforcement)
  ↓
Statistical Normalization (FastAPI Bayesian Z-Score or Node.js Fallback)
  ↓
LeaderboardCache Persistence (Rankings, calibrations, backfilled Score records)
  ↓
Leaderboard / Export (Organizer Console & Streaming RFC 4180 CSV / JSON)
```

1. **Submission**: Teams finalize their project submission via `POST /api/v1/submissions/finalize`, transitioning the project status to `submitted` and locking it against further participant modification.
2. **Judge Assignment**: Either the organizer triggers tournament-wide assignment via `POST /api/v1/admin/assign-judges` or the system triggers incremental auto-assignment upon submission lock.
3. **Rubric Evaluation**: Judges retrieve their isolated evaluation queues via `GET /api/v1/judging/assigned` and grade projects against criteria defined in the active event rubric.
4. **Score Ballot**: Judges save work-in-progress drafts via `PUT /api/v1/judging/scores/draft` or submit immutable final scores via `POST /api/v1/judging/scores`.
5. **Score Isolation**: Middleware guards strictly isolate ballots so judges cannot inspect competitors' ballots, unassigned projects, or scores from other judges.
6. **Normalization**: The organizer initiates statistical score normalization via `POST /api/v1/admin/normalize-scores`, dispatching score matrices to the internal Python FastAPI service (`POST /api/v1/normalize`).
7. **LeaderboardCache**: Normalized standings, judge calibrations, and latent statistics are atomically persisted in MongoDB (`LeaderboardCache`), and `Score` documents are backfilled with normalized scores and Z-scores.
8. **Leaderboard / Export**: Standings are exposed through organizer endpoints (`GET /api/v1/admin/leaderboard`), public endpoints (`GET /api/v1/submissions/leaderboard`), and streaming export utilities (`GET /api/v1/admin/export/csv`, `GET /api/v1/admin/export/json`).

### Auxiliary Judging & Integrity Modules

In addition to the primary scoring pipeline, the system incorporates three distinct analytical components:
- **Judge Diagnostics**: Statistical profiling of grader severity (Strict, Balanced, Lenient Grader), sample size, sample standard deviation ($ddof=1$), standard error of the mean (SEM), and Bayesian shrunk mean via `POST /api/v1/judge-diagnostics`.
- **Voting Anomaly Analysis**: Dual-layer detection identifying review-worthy velocity spikes (3-sigma rule or threshold bursts) and low User-Agent Shannon entropy across community votes.
- **Bradley-Terry Pairwise Ranking**: Paired comparison engine estimating latent quality scores $\theta_i$ via Minorize-Maximization (MM) updates over connected comparison graphs via `POST /api/v1/pairwise-rank`.

### Terminology Standard

To maintain precision and technical objectivity, this specification avoids imprecise marketing terms such as "unbiased", "impartial", or "fraud-proof". The system operates under documented, deterministic mechanisms:
- **Score isolation**: Route-level and database-level boundaries preventing unauthorized visibility across ballots.
- **Conflict exclusion**: Graph-level filtering eliminating judge assignment edges for declared conflicts, mentored teams, or shared team membership.
- **Deterministic normalization**: Pure mathematical transformation parameterized by an empirical Bayesian prior ($K = 3.0$).
- **Documented judging controls**: Explicit schema, route guard, and controller rules governing the evaluation lifecycle.
- **Audit trail**: Application-level chronological event logging to MongoDB recording state mutations and actor attribution.

---

## 2. Judge Roles and Authorization

Authentication and role-based access control are enforced through Express middleware:
- [authMiddleware.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/middleware/authMiddleware.js): Verifies signed JWT tokens extracted from HTTP-only cookies (`req.cookies.jwt`) or the HTTP authorization header (`Bearer <token>`). Populates `req.user` with the sanitized user record.
- [roleGuard.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/middleware/roleGuard.js): Enforces role membership against the `role` attribute defined in [User.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/User.js). Rejects unauthorized roles with HTTP 403 Forbidden.
- [isolationGuard.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/middleware/isolationGuard.js): Verifies active assignment between authenticated judge and target submission.

### System Roles

The system supports four distinct roles:
1. `participant`: Hackathon contestant; forms/joins teams, submits projects, casts community votes.
2. `judge`: Evaluator; inspects assigned project queue, submits drafts and final ballots, submits pairwise comparisons.
3. `organizer`: Tournament administrator; configures rubrics, triggers global judge assignment, executes normalization, accesses audit logs, views full leaderboard.
4. `admin`: Platform superuser; holds organizer capabilities plus system override controls.

### Route-Level Authorization Matrix

| Operation | HTTP Route | Allowed Roles | Middleware Chain | Unauthorized Response |
| :--- | :--- | :--- | :--- | :--- |
| **Get Event Rubric** | `GET /api/v1/judging/rubric` | Any Authenticated | `authMiddleware`, `isolationGuard` | `401 Unauthorized` |
| **Get Assigned Queue** | `GET /api/v1/judging/assigned` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard`, `roleGuard` | `401` / `403 Forbidden` |
| **Submit Final Score** | `POST /api/v1/judging/scores` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard`, `roleGuard` | `401` / `403 Forbidden` |
| **Save Draft Score** | `PUT /api/v1/judging/scores/draft` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard`, `roleGuard` | `401` / `403 Forbidden` |
| **Inspect Own Score** | `GET /api/v1/judging/scores/:submissionId` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard`, `roleGuard` | `401` / `403 Forbidden` |
| **Submit Pairwise Comparison** | `POST /api/v1/judging/pairwise` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard` (bypassed), `roleGuard` | `401` / `403 Forbidden` |
| **Get Pairwise Comparisons** | `GET /api/v1/judging/pairwise` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard` (bypassed), `roleGuard` | `401` / `403 Forbidden` |
| **Auto-Evaluate Queue** | `POST /api/v1/judging/auto-evaluate` | `judge`, `organizer`, `admin` | `authMiddleware`, `isolationGuard`, `roleGuard` | `401` / `403 Forbidden` |
| **Global Judge Assignment** | `POST /api/v1/admin/assign-judges` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Inspect All Assignments** | `GET /api/v1/admin/assignments` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Run Normalization** | `POST /api/v1/admin/normalize-scores` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Get Organizer Leaderboard** | `GET /api/v1/admin/leaderboard` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Export Standings CSV** | `GET /api/v1/admin/export/csv` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Export Standings JSON** | `GET /api/v1/admin/export/json` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Inspect Audit Logs** | `GET /api/v1/admin/audit-logs` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Configure Rubric** | `POST /api/v1/admin/rubrics` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Lock / Unlock Rubric** | `POST /api/v1/admin/lock-rubric` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Override Score** | `PUT /api/v1/admin/scores/:scoreId/override` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Elevate User Role** | `PUT /api/v1/admin/users/:userId/role` | `organizer`, `admin` | `authMiddleware`, `roleGuard('organizer', 'admin')` | `401` / `403 Forbidden` |
| **Public Leaderboard** | `GET /api/v1/submissions/leaderboard` | Public (Unauthenticated) | None (delegates to `adminController.getLeaderboard`) | None (Public) |

> [!NOTE]
> Authorization is enforced strictly at the network route level through Express middleware functions. The hide/show logic in frontend UI components is convenience-only and carries zero security trust.

---

## 3. Judge Assignment

The platform implements two distinct judge assignment pathways: global tournament-wide assignment via an exact network flow solver and incremental auto-assignment for incoming or unassigned projects.

### 3.1 Global Tournament Assignment

Implemented in [assignmentSolver.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/services/assignmentSolver.js) via `solveJudgeAssignments(submissions, judges, targetPerProject = 3)`. Triggered by organizers via `POST /api/v1/admin/assign-judges`.

#### Mathematical Formulation: Min-Cost Max-Flow

The global assignment solver formulates judge allocation as a **custom Min-Cost Max-Flow implementation using queue-based shortest-path relaxation over the residual network** (finding augmenting paths through relaxation, then augmenting flow along bottlenecks until max desired flow is reached).

The network graph $G = (V, E)$ is constructed with $V = \{ \text{SRC}, j_1 \dots j_M, s_1 \dots s_N, \text{SNK} \}$:
- **Source Node (`SRC`)**: Index `0`.
- **Judge Nodes**: Indices $1 \dots M$ (where $M = |\text{judges}|$).
- **Submission Nodes**: Indices $M+1 \dots M+N$ (where $N = |\text{submissions}|$).
- **Sink Node (`SNK`)**: Index $M+N+1$. Total vertices: $|V| = M + N + 2$.

```
           [Judge 1] ──── (cost: 0/10/100, cap: 1) ───→ [Submission 1]
         ↗ (cap: minLoad)                             ↘
        ╱                                               (cap: K, cost: 0)
     (SRC) ── [Judge 2] ──── (cost: 0/10/100, cap: 1) ───→ [Submission 2] ──→ (SNK)
        ╲                                               ↗
         ↘ (cap: 1, cost: 100000)                     ╱
           [Judge M] ──── (cost: 0/10/100, cap: 1) ───→ [Submission N]
```

#### Total Demand & Capacity Constraints
Let $K = \text{targetPerProject}$ (default $K = 3$). The total required flow is:
$$\text{totalSlots} = N \times K$$
The mean workload per judge is divided into base load and remainder:
$$\text{minLoad} = \lfloor \text{totalSlots} / M \rfloor, \quad \text{remainder} = \text{totalSlots} \pmod M$$

1. **Source $\rightarrow$ Judge Edges**:
   - If $\text{remainder} == 0$: For each judge $j$, add edge $\text{SRC} \rightarrow j$ with capacity $\text{minLoad}$ and cost $0$.
   - If $\text{remainder} > 0$: For each judge $j$, add base edge $\text{SRC} \rightarrow j$ with capacity $\text{minLoad}$ and cost $0$. In addition, add an extra 1-unit edge with capacity $1$ and cost:
     $$\text{cost} = \begin{cases} \text{BALANCE\_PENALTY} = 100000 & \text{if } \text{minLoad} > 0 \\ 0 & \text{if } \text{minLoad} == 0 \end{cases}$$
     This penalty forces the flow solver to exhaust the base capacity across all judges before allocating a $(\text{minLoad} + 1)$-th assignment to any judge.

2. **Judge $\rightarrow$ Submission Edges**:
   For every judge $j$ and submission $s$, if and only if $\neg \text{hasConflict}(j, s)$, an edge $j \rightarrow s$ is added with capacity $1$ and cost derived from track preferences:
   $$\text{cost}(j, s) = \begin{cases} 
   0 & \text{if } s.\text{track} \in j.\text{trackPreferences} \quad (\text{matching preference}) \\
   10 & \text{if } j.\text{trackPreferences} = \emptyset \quad (\text{neutral / undeclared preference}) \\
   100 & \text{if } s.\text{track} \notin j.\text{trackPreferences} \wedge j.\text{trackPreferences} \neq \emptyset \quad (\text{non-matching preference})
   \end{cases}$$

3. **Submission $\rightarrow$ Sink Edges**:
   For each submission $s$, add edge $s \rightarrow \text{SNK}$ with capacity $K$ and cost $0$.

#### Post-Solution Verification Checks
Once the augmenting loop finishes, the solver asserts four hard invariants:
1. **Flow Completeness**: $\text{totalFlow} == \text{totalSlots}$. If $\text{totalFlow} < \text{totalSlots}$, throws an error indicating capacity deficit.
2. **Workload Uniformity**: Evaluates judge loads $\{ l_j \}_{j=1}^M$. Asserts:
   $$\max(l) - \min(l) \le 1$$
   Throws error if the difference exceeds 1.
3. **Exact Target Quorum**: Verifies that every submission $s$ received exactly $K$ judge assignments. Throws error if any project received $\neq K$ assignments.
4. **Conflict Invariant**: Guarantees zero conflicting edges were constructed.

### 3.2 Incremental / Sweep Auto-Assignment

The platform provides a secondary, greedy auto-assignment engine:
- `autoAssignSubmission(submission, preloadedJudges)`: Invoked automatically by `submissionController.finalizeSubmission` whenever a project is submitted and locked.
- `ensureSubmissionsAssigned()`: Invoked as a safety sweep during `GET /api/v1/judging/assigned` and `GET /api/v1/admin/assignments` to ensure submitted projects never remain unassigned.

#### Selection and Quorum Behavior
Unlike `solveJudgeAssignments()`, which enforces an exact quorum $K = 3$ and global flow balancing:
1. Filters judges where $\neg \text{hasConflict}(j, \text{submission})$.
2. Computes the active workload count for each non-conflicted judge via `JudgeAssignment.countDocuments({ judgeId: j._id })`.
3. Evaluates track cost ($0, 10, 100$).
4. Sorts judges by primary key `cost` ascending, secondary key active assignment `count` ascending.
5. **Target Selection**: Selects `target = Math.min(2, candidateCount)` judges.
   > [!IMPORTANT]
   > Incremental auto-assignment targets **2 judges per project**, whereas global tournament assignment targets **3 judges per project** ($K = 3$). The two assignment mechanisms operate under different target quorums by design.
6. Upserts `JudgeAssignment` records with status `'assigned'` if no existing completed assignment exists.

### 3.3 Assignment Failure Modes

When assignment constraints cannot be satisfied, the API terminates execution and returns structured HTTP 400 Bad Request responses:

| Precondition Failure | Detection Point | HTTP Status & Error Message |
| :--- | :--- | :--- |
| **No Submitted Projects** | `adminController.assignJudges` | `400 Bad Request`: `"No submitted projects available to assign."` |
| **No Registered Judges** | `adminController.assignJudges` | `400 Bad Request`: `"No registered judges found in the system."` |
| **Insufficient Judges for Quorum** | `solveJudgeAssignments` ($M < K$) | `400 Bad Request`: `"Insufficient judges available to satisfy target quorum: required K judges per project, but only M judges are registered."` |
| **Submission-Level Conflict Deadlock** | `solveJudgeAssignments` ($|\text{eligible}| < K$) | `400 Bad Request`: `"Insufficient non-conflicted judges available for submission \"<title>\": requires K judges, but only X non-conflicted judges are available."` |
| **Infeasible Flow Network** | `solveJudgeAssignments` ($\text{flow} < \text{slots}$) | `400 Bad Request`: `"Unable to satisfy assignment constraints: required X judge evaluations, but only Y could be validly assigned while enforcing conflict exclusion and uniform workload balance."` |
| **Workload Imbalance** | `solveJudgeAssignments` ($\max - \min > 1$) | `400 Bad Request`: `"Uniform workload balance violation: max load (X) - min load (Y) > 1."` |

---

## 4. Conflict-of-Interest Controls

Conflict-of-interest exclusion is enforced prior to graph construction and assignment creation.

### Conflict Sources

The function `extractJudgeConflictIds(judge)` in [assignmentSolver.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/services/assignmentSolver.js) extracts all associated team identifiers across three sources:
1. **Declared Conflicts of Interest**: Strings or ObjectIds declared in `judge.conflictsOfInterest` (array or single identifier).
2. **Mentored Teams**: Teams associated through mentoring relationships declared on `judge.mentoredTeams`, `judge.mentoredTeam`, `judge.mentoredTeamId`, `judge.mentorOf`, or `judge.mentored`.
3. **Judge's Own Team**: Teams where the judge is a participant, member, or captain, identified by `judge.teamId` or `judge.team`.

```
Judge Document
  ├── conflictsOfInterest: ["team_id_1", "team_id_2"]
  ├── mentoredTeams: [ObjectId("team_id_3")]
  └── teamId: ObjectId("team_id_4")
           ↓
  extractJudgeConflictIds() ──→ Set {"team_id_1", "team_id_2", "team_id_3", "team_id_4"}
                                         ↓
                               hasConflict(judge, submission)?
                                         ↑
  extractTeamIds() ───────────→ Set {submission.team, submission.teamId}
Submission Document
```

### Conflict Resolution Mechanism

The function `hasConflict(judge, submission)` inspects `extractTeamIds(submission)` (checking both `submission.team` and `submission.teamId`). If any intersection exists between the submission's team IDs and the judge's conflict set, `hasConflict()` returns `true`.

- In **Global Assignment**: Conflicted judge-submission pairs are excluded before residual edges are added to the network. No edge is ever instantiated between a judge and a project where a conflict exists.
- In **Incremental Auto-Assignment**: Conflicted judges are filtered out of the candidate pool before workload sorting.

> [!NOTE]
> Conflict detection is strictly internal to the application database. The platform relies on declared relationships (`conflictsOfInterest`, `mentoredTeams`, `teamId`) and does not integrate external identity databases or automated background conflict scrapers.

---

## 5. Rubric Configuration

The tournament evaluation rubric defines the scoring criteria, relative weighting, scale boundaries, and precision increments.

### Dual Rubric Storage Architecture

The repository maintains two synchronized rubric representations:
1. **Standalone `Rubric` Document**: Modeled in [Rubric.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/Rubric.js). Associated with `eventId`. Contains rich criteria definitions:
   - `key`: String, required, trimmed (unique identifier).
   - `label`: String, required, trimmed (display name).
   - `description`: String, default `''` (evaluation guidance).
   - `weight`: Number, required, bounded $[0.0, 1.0]$.
   - `minScore`: Number, default `0` (controller enforces scale minimum $1.0$).
   - `maxScore`: Number, default `10`.
   - `step`: Number, default `1` (controller enforces step $0.5$).
2. **Embedded `Event.rubric` Array**: Modeled in [Event.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/Event.js). Simplified structure stored directly on the `Event` document:
   - `name`: String, required.
   - `weight`: Number, required, bounded $[0.0, 1.0]$.
   - `scaleMin`: Number, default `1`.
   - `scaleMax`: Number, default `10`.

When organizers configure a rubric via `POST /api/v1/admin/rubrics`, the controller updates the standalone `Rubric` document and synchronizes `Event.rubric` via `Event.updateOne({ _id: event._id }, { $set: { rubric: event.rubric } })`.

### Weight Sum Validation

Both Mongoose schema hooks and controller routines validate that criterion weights sum to exactly $1.0$ within a floating-point tolerance $\text{DELTA} = 10^{-5}$:
$$|\sum_{c} w_c - 1.0| \le 10^{-5}$$
- `Rubric.js`: Pre-validation and pre-save hooks invalidate the document if $\sum w_c$ deviates from $1.0$ by $> 10^{-5}$.
- `adminController.upsertRubric`: Computes `totalWeight = formattedCriteria.reduce((sum, c) => sum + c.weight, 0)` and returns `400 Bad Request` if $|totalWeight - 1.0| > 10^{-5}$.

### Rubric Locking Controls

Rubrics can be frozen by organizers to prevent in-flight modification during active scoring:
- `Event.rubricLocked`: Boolean attribute on the `Event` model (default `false`).
- `POST /api/v1/admin/lock-rubric`: Toggles `event.rubricLocked` to `true` (or `false` if `locked: false` is supplied). Emits a `RUBRIC_LOCKED` or `RUBRIC_UNLOCKED` audit record.
- **Enforcement**: In `adminController.upsertRubric`, the controller inspects `event.rubricLocked`:
  ```javascript
  if (event.rubricLocked) {
    return res.status(400).json({
      success: false,
      error: 'Rubric is locked against further modification once scoring begins.',
    });
  }
  ```
  Modifications are permanently blocked until an organizer explicitly unlocks the rubric.

---

## 6. Score Ballot Structure

Score ballots record judge evaluations and intermediate calculations. Modeled in [Score.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/Score.js).

### Data Schema

```
Score Document
├── judge: ObjectId (ref: 'User', required, indexed, alias: 'judgeId')
├── submission: ObjectId (ref: 'Submission', required, indexed, alias: 'submissionId')
├── criteriaScores: [
│     {
│       key: String (required, default: criteriaName),
│       score: Number (required, default: rawScore),
│       criteriaName: String,
│       weight: Number,
│       rawScore: Number
│     }
│   ]
├── rawCompositeScore: Number (required, alias: 'totalRawScore')
├── privateNotes: String (maxlength: 2000, default: '')
├── normalizedScore: Number (default: null, backfilled post-normalization)
├── zScore: Number (default: null, backfilled post-normalization)
└── isFinal: Boolean (default: true)
```

### Schema Rules vs. Controller Validation

A critical design distinction exists between database schema rules and controller-level business validation:

| Attribute / Constraint | Mongoose Schema Rule (`Score.js`) | Controller-Level Validation (`judgingController.js`) |
| :--- | :--- | :--- |
| **Score Range** | No numerical range constraint in schema | Strictly enforced: $1.0 \le \text{score} \le 10.0$ via `isValidScore` |
| **Score Step** | No step constraint in schema | Strictly enforced: $0.5$ step increments via `isValidScore` |
| **Submission ID** | Required ObjectId | Required parameter; verified against `JudgeAssignment` |
| **Criteria Array** | Array of subdocuments | Must be non-empty array; each item must have key/criteriaName |
| **Compound Uniqueness** | `{ judge: 1, submission: 1 }` Unique index | Enforced by MongoDB index code `11000` & controller upsert |
| **Notes Length** | `maxlength: 2000` | Truncated / validated to 2000 characters |
| **Weight Resolution** | Stored as provided | Resolved from rubric if omitted or invalid |

#### The `isValidScore` Function
Controller validation enforces scoring boundaries via:
```javascript
const isValidScore = (score) => {
  if (typeof score !== 'number' || isNaN(score) || !Number.isFinite(score)) return false;
  if (score < 1.0 || score > 10.0) return false;
  const doubled = Math.round(score * 1000) / 1000 * 2;
  return Math.abs(doubled - Math.round(doubled)) < 1e-6;
};
```
This guarantees only scores in $\{ 1.0, 1.5, 2.0, 2.5, \dots, 9.5, 10.0 \}$ are accepted.

---

## 7. Score Calculation

When a judge submits a ballot, the server calculates the composite raw score in [judgingController.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/controllers/judgingController.js).

### Composite Score Formula

$$\text{rawCompositeScore} = \begin{cases}
\sum_{c} (w_c \times s_c) & \text{if } |\sum_c w_c - 1.0| < 10^{-5} \\
\frac{\sum_{c} (w_c \times s_c)}{\sum_c w_c} & \text{if } |\sum_c w_c - 1.0| \ge 10^{-5}
\end{cases}$$

All final composite values are rounded to 3 decimal places:
```javascript
if (Math.abs(totalWeight - 1.0) < 1e-5) {
  rawCompositeScore = Number(totalWeightedScore.toFixed(3));
} else {
  rawCompositeScore = Number((totalWeightedScore / (totalWeight || 1)).toFixed(3));
}
```

### Weight Resolution Fallback Hierarchy

If incoming criteria payloads omit weights:
1. **Client-Provided Weights**: If every item in `criteriaScores` supplies a numeric `weight`, those weights are used directly.
2. **Standalone Rubric Lookup**: If any weight is missing, the system queries the active `Event` and corresponding standalone `Rubric` document, matching by `c.key` or `c.label`.
3. **Embedded Event Rubric Lookup**: If no standalone `Rubric` exists, weights are resolved from `Event.rubric`, matching by `c.name` or `c.key`.
4. **Equal Weight Fallback**: If no rubric mapping is found for a criterion key, the system assigns equal weighting:
   $$w_c = \frac{1.0}{|\text{criteriaScores}|}$$

---

## 8. Draft vs. Final Ballots

Evaluation ballots progress through formal lifecycle states:

```
[Unassigned]
     │ (Admin assignment or auto-assign)
     ▼
[assigned] ────────── PUT /scores/draft ──────────→ [in_progress]
     │                                                     │
     │                                                     │ POST /scores
     └─────────────── POST /scores ────────────────────────┘ (Final submission)
                            │
                            ▼
                       [completed] (Ballot locked, isFinal = true)
                            │
                            ▼
              PUT /scores/draft (Rejected: 400 Bad Request)
```

### Draft Storage: `PUT /api/v1/judging/scores/draft`
- Intended for auto-save during active judging sessions.
- Sets `isFinal: false` on the `Score` document.
- Updates the corresponding `JudgeAssignment` status to `in_progress` (if not already completed).
- **Completed Ballot Protection**: If the judge's assignment has status `'completed'`, the controller rejects the request:
  ```javascript
  if (existingAssignment && existingAssignment.status === 'completed') {
    return res.status(400).json({
      success: false,
      error: 'Cannot update draft for an evaluation ballot that has already been submitted.',
    });
  }
  ```
- Permits partial scoring: does not reject ballots if some criteria are omitted, storing available scores.

### Final Submission: `POST /api/v1/judging/scores`
- Records official evaluation ballot.
- Sets `isFinal: true` on the `Score` document.
- Transitions `JudgeAssignment.status` to `'completed'`.
- Requires complete scoring across all criteria with valid `isValidScore` scores.
- Emits a `SCORE_SUBMITTED` record to `AuditLog`.

---

## 9. Score Isolation / Ballot Privacy

Ballot privacy prevents score leakage, collusion, and anchoring bias.

### IsolationGuard Architecture

The middleware [isolationGuard.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/middleware/isolationGuard.js) intercepts requests to `/api/v1/judging/*`:

1. **Role Bypass**: Organizers and Admins bypass queue isolation checks to permit administrative auditing:
   ```javascript
   if (['organizer', 'admin'].includes(req.user?.role)) return next();
   ```
2. **Pairwise Route Bypass**: Single-submission assignment checking is explicitly bypassed for the pairwise comparison route:
   ```javascript
   if (req.path === '/pairwise' || req.originalUrl?.includes('/pairwise')) return next();
   ```
   > [!IMPORTANT]
   > Pairwise comparisons evaluate relative preferences between two projects ($A$ and $B$) without requiring prior single-project queue assignments. Pairwise routes remain strictly protected by `authMiddleware` and `roleGuard('judge', 'organizer', 'admin')`.
3. **Target Submission Resolution**: Resolves `submissionId` hierarchically from `req.body`, `req.params`, `req.query`, URL regex patterns (`/scores/:id`, `/submissions/:id`), or indirect lookup via `Score.findById(scoreId)`.
4. **Assignment Verification**: Queries `JudgeAssignment`:
   ```javascript
   const assignment = await JudgeAssignment.findOne({
     $or: [
       { judgeId: userId, submissionId: submissionId },
       { judge: userId, submission: submissionId },
     ],
     status: { $in: ['assigned', 'in_progress', 'completed'] },
   });
   if (!assignment) {
     return res.status(403).json({
       success: false,
       error: 'Access Denied: You are not assigned to evaluate this project',
     });
   }
   ```
   An unassigned judge receives HTTP 403 Forbidden.

### Score Ownership Enforcement

The function `verifyScoreOwnership` in `isolationGuard.js` and controller routines in `judgingController.js:getScoreBySubmissionId` enforce score ballot privacy:
- When a judge requests `GET /api/v1/judging/scores/:submissionId`:
  - If the requested ID matches a `Score` document directly, ownership is checked: `if (isJudge && ownerId !== userId) return res.status(403)`.
  - The query strictly binds `{ judge: userId }`, ensuring a judge only receives their own submitted ballot.
  - Scores submitted by other judges on the same project are stripped from the response payload.
- Response codes:
  - Unauthenticated request: `401 Unauthorized`.
  - Unassigned judge accessing project: `403 Forbidden` (`"Access Denied: You are not assigned to evaluate this project"`).
  - Judge attempting to inspect another judge's score: `403 Forbidden` (`"Security Violation: You are strictly prohibited from inspecting other judges' scores."`).
  - Score ballot not found: `404 Not Found` (`"Score ballot not found."`).

---

## 10. Pairwise Judging

The platform includes a Bradley-Terry pairwise preference ranking model for head-to-head project comparisons.

### Pairwise Data Model

Modeled in [PairwiseComparison.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/PairwiseComparison.js):
- `judge`: ObjectId (ref: `User`, required, indexed).
- `submissionA`: ObjectId (ref: `Submission`, required, indexed).
- `submissionB`: ObjectId (ref: `Submission`, required, indexed).
- `winner`: ObjectId (ref: `Submission`, required, indexed). Validated: must equal `submissionA` or `submissionB`.
- `notes`: String (maxlength 2000, default `''`).
- `eventId`: ObjectId (ref: `Event`, default `null`).
- Compound index: `{ judge: 1, submissionA: 1, submissionB: 1 }`.
- Validation: Schema asserts `submissionA.toString() !== submissionB.toString()`.

### API Separation

- **Node.js Gateway**: `POST /api/v1/judging/pairwise` (and `GET /api/v1/judging/pairwise`) in `judgingRoutes.js`. Validates submission existence, authenticates judge role, records comparison in MongoDB.
- **FastAPI Analytical Engine**: `POST /api/v1/pairwise-rank` in `judging-service/app/routes/pairwise.py`. Accepts comparison lists and executes the iterative Bradley-Terry solver.

> [!NOTE]
> Pairwise preference ranking is an analytical engine and stretch capability. It is **not** the primary tournament leaderboard algorithm. Primary tournament standings are produced exclusively by Bayesian Z-score normalization.

### Bradley-Terry Algorithm Implementation

Implemented in [pairwise.py](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/judging-service/app/algorithms/pairwise.py) via `run_bradley_terry()`:

1. **Probability Formulation**:
   For two projects with latent positive skill ratings $\theta_i, \theta_j > 0$:
   $$P(i \succ j) = \frac{\theta_i}{\theta_i + \theta_j}$$
2. **Graph Connectivity Requirement**:
   The comparison graph where projects are vertices and comparisons are undirected edges **must be fully connected**. The function `_validate_and_index()` runs a reachability traversal (BFS/DFS). If the reached set does not span all projects:
   $$\text{len}(\text{visited}) \neq \text{len}(\text{ids}) \implies \text{raise ValueError("comparison graph must be connected")}$$
   FastAPI returns HTTP 422 Unprocessable Entity.
3. **Minorize-Maximization (MM) Iterative Update**:
   Initial skills: $\theta_i^{(0)} = \frac{1}{|V|}$. In iteration $t+1$:
   $$\theta_i^{(t+1)} = \max \left( \frac{W_i}{\sum_{j \neq i} \frac{N_{ij}}{\theta_i^{(t)} + \theta_j^{(t)}}}, \text{positive\_floor} \right)$$
   where $W_i$ is total wins for project $i$, $N_{ij}$ is total head-to-head matches between $i$ and $j$, and $\text{positive\_floor} = \text{math.nextafter}(0.0, 1.0)$.
4. **Scale Normalization**:
   After each update step, skills are normalized to sum to 1:
   $$\theta_i \leftarrow \frac{\theta_i}{\sum_{k} \theta_k}$$
5. **Convergence Criterion**:
   Terminates when $\max_i |\theta_i^{(t+1)} - \theta_i^{(t)}| \le \text{tolerance}$ (default $10^{-6}$) or iterations reach `max_iterations` (default 100).
6. **Log-Likelihood History**:
   $$\ln L(\theta) = \sum_{(i \succ j)} \left[ \ln \theta_i - \ln(\theta_i + \theta_j) \right]$$
7. **Deterministic Standings Ordering**:
   Projects are sorted descending by skill rating with lexicographical ID tie-breaking:
   `sorted(items_list, key=lambda project_id: (-skills[project_id], project_id))`

---

## 11. Statistical Score Normalization

Primary tournament normalization is performed by the FastAPI microservice in [normalization.py](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/judging-service/app/algorithms/normalization.py) via `run_normalization(scores, bayesian_prior_k = 3.0)`.

```
Raw Scores {s_ij}
       │
       ├── Global Statistics: μ_global, σ_global^2 (ddof=1)
       │
       ├── Per-Judge Statistics: n_j, μ_j, s_j^2 (ddof=1)
       │
       ├── Empirical Bayesian Shrinkage (K = 3.0):
       │     μ_shrunk = (n_j μ_j + K μ_global) / (n_j + K)
       │     s_shrunk^2 = (n_j s_j^2 + K σ_global^2) / (n_j + K)
       │
       ├── Calibrated Z-Score:
       │     z_ij = (raw_score_ij - μ_shrunk) / (s_shrunk + 1e-6)
       │
       ├── Project Aggregation:
       │     z_mean = mean(z_ij for project)
       │
       └── Min-Max Rescaling to 0–100:
             final_score = 100 * (z_mean - z_min) / (z_max - z_min)
             (Fallback: 50.0 if z_range < 1e-6)
```

### Stage 1: Global Statistics
Given $N_{\text{total}}$ score records across all judges and submissions:
$$\mu_{\text{global}} = \frac{1}{N_{\text{total}}} \sum_{k=1}^{N_{\text{total}}} \text{raw\_score}_k$$
$$\sigma_{\text{global}}^2 = \begin{cases}
\frac{1}{N_{\text{total}} - 1} \sum_{k=1}^{N_{\text{total}}} (\text{raw\_score}_k - \mu_{\text{global}})^2 & \text{if } N_{\text{total}} > 1 \\
0.0 & \text{if } N_{\text{total}} \le 1
\end{cases}$$

### Stage 2: Judge-Level Statistics
For each judge $j$ with sample size $n_j = |\{ \text{scores by } j \}|$:
$$\mu_j = \frac{1}{n_j} \sum_{i \in \text{judge}_j} \text{raw\_score}_i$$
$$s_j^2 = \begin{cases}
\frac{1}{n_j - 1} \sum_{i \in \text{judge}_j} (\text{raw\_score}_i - \mu_j)^2 & \text{if } n_j > 1 \\
0.0 & \text{if } n_j \le 1
\end{cases}$$

### Stage 3: Empirical Bayesian Shrinkage
To prevent small-sample judges from distorting project ratings, judge means and variances are shrunk toward the global priors using $K = \text{bayesian\_prior\_k}$ pseudo-observations (default $K = 3.0$):
$$\mu_{\text{shrunk}} = \frac{n_j \cdot \mu_j + K \cdot \mu_{\text{global}}}{n_j + K}$$
$$w_{\text{empirical}} = \frac{n_j}{n_j + K}, \quad w_{\text{prior}} = \frac{K}{n_j + K}$$
$$s_{\text{shrunk}}^2 = w_{\text{empirical}} \cdot s_j^2 + w_{\text{prior}} \cdot \sigma_{\text{global}}^2$$
$$s_{\text{shrunk}} = \sqrt{s_{\text{shrunk}}^2}$$

### Stage 4: Judge-Adjusted Z-Score
For each score $X_{ij}$ awarded by judge $j$ to submission $i$, the calibrated Z-score incorporates a stabilization epsilon $\epsilon = 10^{-6}$ (`Z_SCORE_EPSILON = 1e-6`):
$$z_{ij} = \frac{X_{ij} - \mu_{\text{shrunk}}}{s_{\text{shrunk}} + 10^{-6}}$$

### Stage 5: Submission Aggregation
For each submission $s$ evaluated by a set of ballots $B_s$:
$$z_{\text{mean}}(s) = \frac{1}{|B_s|} \sum_{b \in B_s} z_{b}$$
$$\text{raw\_mean}(s) = \frac{1}{|B_s|} \sum_{b \in B_s} X_{b}$$

### Stage 6: Min-Max Rescaling (0–100)
Let $z_{\min} = \min_{s} z_{\text{mean}}(s)$ and $z_{\max} = \max_{s} z_{\text{mean}}(s)$. Let $z_{\text{range}} = z_{\max} - z_{\min}$.
$$\text{normalized\_score}(s) = \begin{cases}
50.0 & \text{if } z_{\text{range}} < 10^{-6} \\
100.0 \times \left( \frac{z_{\text{mean}}(s) - z_{\min}}{z_{\text{range}}} \right) & \text{if } z_{\text{range}} \ge 10^{-6}
\end{cases}$$

### Stage 7: Rounding and Rank Assignment
- `raw_mean`: Rounded to 2 decimal places (`round(p["raw_mean"], 2)`).
- `normalized_score`: Rounded to 2 decimal places (`round(float(normalized_score), 2)`).
- `z_score_mean`: Rounded to 4 decimal places (`round(float(p["z_mean"]), 4)`).
- Standings are sorted in descending order of `normalized_score`. Ranks are assigned sequentially ($1, 2, \dots, N$).

### Mathematical Edge-Case Behavior

1. **Empty Input**: Returns empty standings, empty calibrations, total counts 0, status `"success"`.
2. **Single Submission**: $z_{\text{range}} = 0 < 10^{-6}$, resulting in `normalized_score = 50.0`.
3. **Single Judge**: Prior shrinkage pulls variance toward $\sigma_{\text{global}}^2$; if only 1 score exists globally, $\sigma_{\text{global}}^2 = 0$, $s_{\text{shrunk}} = 0$, and Z-scores divide by $\epsilon = 10^{-6}$.
4. **Zero Variance Across Projects**: If all projects receive identical Z-means, $z_{\text{range}} < 10^{-6}$, resulting in all projects receiving $50.0$.
5. **Low-Sample Judge ($n_j = 1$)**: Sample standard deviation is undefined ($ddof=1$ yields 0.0 variance in pipeline); shrinkage substitutes prior variance:
   $$s_{\text{shrunk}}^2 = \frac{3.0}{1 + 3.0} \sigma_{\text{global}}^2 = 0.75 \, \sigma_{\text{global}}^2$$

---

## 12. Primary Normalization vs. Fallback

The backend provides high-availability failover in [fastApiClient.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/services/fastApiClient.js) if the Python microservice is unreachable.

### Comparative Characteristics

| Dimension | Primary Normalization | In-Process Fallback |
| :--- | :--- | :--- |
| **Execution Environment** | Python 3.11 / FastAPI microservice | Node.js Express process |
| **Algorithm Identifier** | `z_score_bayesian_shrinkage` | `raw_weighted_average_fallback` |
| **Trigger Mechanism** | Normal operation via HTTP bridge | Network timeout, ECONNREFUSED, 5xx from FastAPI |
| **Variance Equalization** | Yes (Bayesian shrunk standard deviation) | None (Raw arithmetic mean) |
| **Harsh/Lenient Correction** | Yes (Bayesian shrunk judge mean) | None (Raw arithmetic mean) |
| **Rescaling Formula** | Min-Max of $z_{\text{mean}}$ mapped to $0 \dots 100$ | Raw mean $\times 10$, clamped: $\min(100, \max(0, \bar{X} \times 10))$ |
| **Z-Score Output** | Computed Z-scores (4 decimals) | Hardcoded `z_mean = 0`, `z_score_mean = 0` |
| **Leaderboard Flag** | `isFallback: false` | `isFallback: true` |

> [!WARNING]
> Fallback standings are **not mathematically equivalent** to primary normalization. The fallback calculates an unadjusted weighted average and scales it linearly by 10. Standings computed under fallback mode do not correct for judge leniency or variance differences and are explicitly flagged in `LeaderboardCache` via `isFallback: true`.

---

## 13. Leaderboard Persistence

Leaderboard results are cached in MongoDB in [LeaderboardCache.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/LeaderboardCache.js) to avoid recomputing statistical pipelines on every client request.

### Persistence Lifecycle

```
Organizer triggers POST /api/v1/admin/normalize-scores
  │
  ├── 1. Query all completed Score documents: { isFinal: { $ne: false } }
  ├── 2. Dispatch payload to FastAPI: fastApiClient.normalizeScores(eventId, scores)
  ├── 3. Receive NormalizationResponse { standings, judge_calibrations, algorithm }
  ├── 4. Upsert LeaderboardCache { eventId, standings, judgeCalibrations, algorithm, isFallback }
  ├── 5. Backfill Score documents:
  │        Score.updateMany(
  │          { submission: standing.submissionId },
  │          { normalizedScore: standing.normalizedScore, zScore: standing.zScore }
  │        )
  └── 6. Return HTTP 200 with formatted standings to organizer console
```

### Route-Level Exposure

- **Organizer Leaderboard**: `GET /api/v1/admin/leaderboard`
  - Requires `authMiddleware` and `roleGuard('organizer', 'admin')`.
  - Queries active submissions and groups scores by `submissionId`.
  - Extracts cached `normalizedScore` and `zScore` from scores, defaulting to raw mean if unnormalized.
  - Sorts descending by `normalizedScore` (if available), then by `rawMean`.
- **Public Tournament Leaderboard**: `GET /api/v1/submissions/leaderboard`
  - Completely unauthenticated public endpoint.
  - Defined in `backend/src/routes/submissionRoutes.js`:
    ```javascript
    router.get('/leaderboard', submissionController.getPublicLeaderboard);
    ```
  - Implemented in `backend/src/controllers/submissionController.js`:
    ```javascript
    exports.getPublicLeaderboard = async (req, res, next) => {
      try {
        const adminController = require('./adminController');
        return adminController.getLeaderboard(req, res, next);
      } catch (error) { next(error); }
    };
    ```
  - Delegates execution directly to `adminController.getLeaderboard`, returning identical standings without requiring administrative authentication.

---

## 14. Judge Diagnostics

The diagnostics engine in [diagnostics.py](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/judging-service/app/algorithms/diagnostics.py) provides statistical profiling of judge grading behavior. Exposed via `POST /api/v1/judge-diagnostics`.

### Measured Metrics

For each judge with at least one evaluation:
- `sample_size` ($n_j$): Number of evaluations submitted.
- `raw_mean` ($\mu_j$): Arithmetic mean of raw composite scores.
- `raw_std` ($s_j$): Sample standard deviation with Bessel's correction ($ddof=1$). Returns `null` if $n_j < 2$.
- `global_mean` ($\mu_{\text{global}}$): Mean across all evaluations in the event.
- `global_std` ($\sigma_{\text{global}}$): Sample standard deviation across all evaluations. Returns `null` if $N_{\text{total}} < 2$.
- `bayesian_shrunk_mean`: Shrunk mean under prior $K = 3.0$.
- `standard_error` (SEM): Standard error of the judge mean:
  $$\text{SEM}_j = \frac{s_j}{\sqrt{n_j}} \quad (\text{returns null if } n_j < 2)$$

### Severity Classification Rules

Judge severity is classified by strict inequality checks at the global $1\sigma$ boundaries:
$$\text{severity} = \begin{cases}
\text{"Strict Grader"} & \text{if } \mu_j < \mu_{\text{global}} - \sigma_{\text{global}} \\
\text{"Lenient Grader"} & \text{if } \mu_j > \mu_{\text{global}} + \sigma_{\text{global}} \\
\text{"Balanced Grader"} & \text{otherwise (or if } \sigma_{\text{global}} \text{ is undefined)}
\end{cases}$$

> [!NOTE]
> Judge diagnostics represent descriptive statistical signals. A classification of "Strict Grader" or "Lenient Grader" indicates calibration tendencies across the score distribution; it does **not** prove bias, incompetence, or malicious intent.

---

## 15. Voting Anomaly Detection

The repository contains **two distinct voting anomaly algorithms** addressing different operational scopes.

### 15.1 Tournament-Wide Anomaly Analyzer (`analyze_voting_anomalies`)

Implemented in [anomaly_detector.py](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/judging-service/app/algorithms/anomaly_detector.py) and exposed via `POST /api/v1/voting-anomalies`:

1. **Observation Window**: Fixed sliding window of $\Delta t = 60.0$ seconds (`OBSERVATION_WINDOW_SECONDS = 60.0`).
2. **Velocity Calculation**:
   $$\text{peak\_votes}(s) = \max_{t} |\{ \text{votes for } s \text{ within } [t, t + 60s] \}|$$
   $$\text{velocity}(s) = \frac{\text{peak\_votes}(s)}{60.0} \quad (\text{votes per second})$$
3. **Tournament 3-Sigma Velocity Rule**:
   Calculates tournament mean velocity $\mu_v$ and sample standard deviation $\sigma_v$ across all submissions. A submission is flagged for a velocity spike if:
   $$\sigma_v > 0 \wedge \text{velocity}(s) > \mu_v + 3.0 \times \sigma_v$$
   The velocity Z-score is recorded as $z_v = (\text{velocity} - \mu_v) / \sigma_v$.
4. **User-Agent Shannon Entropy**:
   Calculates the natural-log Shannon entropy of User-Agent strings for submission $s$:
   $$H(s) = -\sum_{u} p_u \ln p_u, \quad H_{\text{norm}}(s) = \begin{cases} \frac{H(s)}{\ln |U|} & \text{if } |U| > 1 \\ 0.0 & \text{if } |U| \le 1 \end{cases}$$
   where $p_u$ is the proportion of votes from User-Agent $u$, and $|U|$ is the number of distinct User-Agents.
5. **Low Entropy Flag**:
   Flagged if the submission has $\ge 2$ observed User-Agent votes (`MIN_ENTROPY_VOTES = 2`) and:
   $$H_{\text{norm}}(s) \le 0.2 \quad (\text{LOW\_ENTROPY\_THRESHOLD} = 0.2)$$
6. **Risk Score & Reason Codes**:
   $$\text{reasons} \subseteq \{ \text{"velocity\_spike"}, \text{"low\_user\_agent\_entropy"} \}$$
   $$\text{risk\_score} = \min(1.0, 0.5 \times |\text{reasons}|)$$

### 15.2 Single-Submission Anomaly Detector (`detect_voting_anomalies`)

Implemented in [anomaly_detector.py](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/judging-service/app/algorithms/anomaly_detector.py) and routed internally via `POST /api/v1/detect-anomaly`:

1. **Fixed Velocity Threshold**: Evaluates whether peak votes in a 60-second window reach or exceed `velocity_threshold` (default $15$ votes):
   $$\text{is\_velocity\_anomalous} = (\text{peak\_velocity} \ge 15)$$
2. **Inter-Arrival Time Periodicity**:
   Sorts timestamps and computes consecutive intervals $\Delta t_k = t_{k+1} - t_k$. Discretizes intervals into a histogram with $\min(10, \max(2, |\Delta t|))$ bins and computes base-2 Shannon entropy:
   $$H_2 = -\sum_{b} p_b \log_2 p_b$$
   Flagged if the submission has $> 10$ intervals and $H_2 < 0.2$ (indicating unnatural periodic timestamp spacing typical of automated bot loops).

> [!IMPORTANT]
> Voting anomaly flags provide review signals for tournament organizers. An anomaly flag is **not** definitive proof of vote tampering.

---

## 16. Community Voting vs. Judge Scoring

The platform maintains strict architectural segregation between community voting and judge scoring:

```
                    ┌─────────────────────────┐
                    │ Community Public Client │
                    └────────────┬────────────┘
                                 │ POST /api/v1/votes/:submissionId
                                 ▼
                    ┌─────────────────────────┐
                    │   Vote Document (DB)    │
                    │   - submissionId        │
                    │   - voterHash           │
                    │   - 24h TTL Expiration  │
                    └────────────┬────────────┘
                                 │ Increments
                                 ▼
                    ┌─────────────────────────┐
                    │  Submission Document    │
                    │  - publicVoteCount      │
                    └─────────────────────────┘
                                 ▲
                     Separate    │ Does NOT affect
                     Pipelines   │ normalized score
                                 ▼
                    ┌─────────────────────────┐
                    │   Score Document (DB)   │
                    │   - judgeId             │
                    │   - rawCompositeScore   │
                    │   - criteriaScores      │
                    └────────────┬────────────┘
                                 │ Normalization
                                 ▼
                    ┌─────────────────────────┐
                    │    LeaderboardCache     │
                    │    - normalizedScore    │
                    │    - rank               │
                    └─────────────────────────┘
```

1. **Independent Collections**: Community votes reside in `votes` ([Vote.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/Vote.js)); judge evaluations reside in `scores` ([Score.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/Score.js)).
2. **Tournament Standings Isolation**: Normalization algorithms process **only** final `Score` documents. Community `publicVoteCount` values are excluded from the normalization pipeline and do not alter project ranks.
3. **Sybil Resistance Mechanisms**:
   - **Voter Fingerprinting**: SHA-256 hash derived from `clientIp + userAgent + secretSalt`.
   - **24-Hour Expiration**: MongoDB TTL index on `votedAt` automatically purges votes after 86,400 seconds (24 hours).
   - **Unique Index**: Compound unique index `{ submission: 1, voterHash: 1 }` prevents duplicate voting within the 24-hour TTL window (returns HTTP 409 Conflict).
   - **Rate Limiting**: Sliding token-bucket rate limiter enforces a maximum of 5 vote requests per minute per IP.

---

## 17. Audit Trail

System mutations and judging operations are tracked in MongoDB via [AuditLog.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/models/AuditLog.js).

### Tracked Audit Operations

| Action Code | Triggering Endpoint / Hook | Logged State Payload |
| :--- | :--- | :--- |
| `SCORE_SUBMITTED` | `POST /api/v1/judging/scores` | `submissionId`, `rawCompositeScore`, `totalRawScore` |
| `AUTO_SCORE_SUBMITTED` | `POST /api/v1/judging/auto-evaluate` | `submissionId`, `rawCompositeScore`, `autoEvaluated: true` |
| `SCORE_OVERRIDE` | `PUT /api/v1/admin/scores/:id/override` | Full `previousState` and `newState` of `Score` document |
| `ROLE_ELEVATION` | `PUT /api/v1/admin/users/:id/role` | Full `previousState` and `newState` of `User` document |
| `ADMIN_USER_OVERRIDE` | `User` save / update hook | Previous and updated user attributes |
| `RUBRIC_CONFIGURED` | `POST /api/v1/admin/rubrics` | `eventId`, `criteriaCount` |
| `RUBRIC_LOCKED` | `POST /api/v1/admin/lock-rubric` | `eventId`, `rubricLocked: true` |
| `RUBRIC_UNLOCKED` | `POST /api/v1/admin/lock-rubric` | `eventId`, `rubricLocked: false` |
| `JUDGES_ASSIGNED` | `POST /api/v1/admin/assign-judges` | `totalAssigned`, `judgeLoad`, `targetPerProject` |
| `NORMALIZATION_EXECUTED` | `POST /api/v1/admin/normalize-scores` | `totalProcessed`, `totalSubmissions`, `eventId` |
| `SUBMISSION_LOCKED` | `POST /api/v1/submissions/finalize` | `submissionId`, `title` |
| `VOTE_ANOMALY_DETECTED` | `voteController.castVote` | `recentVotes`, `submissionId`, velocity warning |

### Audit Record Schema
- `actorId` / `actor`: User ObjectId initiating the action.
- `actorRole`: Authenticated role (`participant`, `judge`, `organizer`, `admin`, `system`).
- `action`: Audit action string.
- `targetResource`: Target entity (`Score`, `User`, `Event`, `Rubric`, `Submission`, `JudgeAssignment`).
- `targetId` / `resourceId`: ObjectId of modified document.
- `previousState` & `newState`: Document snapshots before and after mutation.
- `payload`: Context-specific event metadata.
- `ipAddress` / `ipHash`: SHA-256 hash or raw IP of calling client.
- `timestamp`: UTC timestamp of event generation.

> [!NOTE]
> The audit log is an application-level MongoDB collection. It provides operational accountability and administrative traceability; it is **not** a cryptographically signed append-only ledger, blockchain, or hardware WORM (Write Once, Read Many) storage system.

---

## 18. Data Integrity Controls

System integrity is enforced through complementary database constraints and application-layer validation rules:

| Domain | Database / Schema Constraint | Application / Controller Validation |
| :--- | :--- | :--- |
| **Score Uniqueness** | Unique index: `{ judge: 1, submission: 1 }` | Controller checks existing completed assignment |
| **Assignment Uniqueness** | Unique index: `{ judgeId: 1, submissionId: 1 }` | Global solver clears uncompleted; upsert handles races |
| **Community Vote Uniqueness** | Unique index: `{ submission: 1, voterHash: 1 }` | Controller returns HTTP 409 on duplicate within 24h |
| **Vote TTL** | TTL index on `votedAt`: `expireAfterSeconds: 86400` | None required (MongoDB automatic purge) |
| **Rubric Total Weight** | Pre-validate / pre-save hook: $|\sum w - 1.0| \le 10^{-5}$ | `adminController.upsertRubric` enforces delta before save |
| **Score Range** | None in Mongoose schema | `isValidScore` enforces $1.0 \le \text{score} \le 10.0$ |
| **Score Step** | None in Mongoose schema | `isValidScore` enforces $0.5$ step increments |
| **Pairwise Validity** | Mongoose schema validator: $A \neq B$, winner $\in \{A, B\}$ | Controller asserts $A$ and $B$ exist in database |
| **Role Authorization** | Enum: `['participant', 'judge', 'organizer', 'admin']` | `roleGuard` enforces route-level access rules |
| **Queue Isolation** | None in MongoDB schema | `isolationGuard` enforces active `JudgeAssignment` |

---

## 19. Failure Modes and Degraded Operation

The platform handles infrastructure interruptions and input anomalies through documented failure behaviors:

### 19.1 MongoDB Failure Modes
- **Startup Connection Failure**: During boot, `backend/src/config/db.js` attempts up to 5 connection attempts with a 2-second retry delay (`serverSelectionTimeoutMS: 5000`). If all 5 attempts fail, the process logs an error and terminates via `process.exit(1)` (unless running in test mode, where it throws the error).
- **Runtime Connection Loss**: Mongoose connection event listeners log warnings (`"MongoDB disconnected. Auto-reconnect initiated..."`). Mongoose automatically manages internal socket reconnection.
- **Request-Time Database Failures**: If a query encounters a disconnected database or query timeout, Mongoose throws an error that is captured by Express error handling in `backend/src/middleware/errorMiddleware.js`, returning `HTTP 500 Internal Server Error` with JSON `{ success: false, error: err.message, statusCode: 500 }`.

### 19.2 FastAPI Judging Service Failure Modes
- **Judging Service Unavailable**: If the Python service at `http://judging-service:8000` is down or unreachable, `fastApiClient.js` catches the network error and automatically triggers in-process fallback:
  - Generates standings using `computeFallbackStandings()`.
  - Sets `algorithm: 'raw_weighted_average_fallback'`.
  - Sets `is_fallback: true`.
  - Sets `z_mean = 0`, `z_score_mean = 0`.
  - Persists fallback standings into `LeaderboardCache` without raising an unhandled exception.
- **Invalid Payload to Normalization**: If the Python service receives empty scores or malformed payloads, Pydantic validation returns HTTP 422 Unprocessable Entity, which `fastApiClient.js` catches, logging the incident and executing the in-process fallback.

### 19.3 Authorization and Assignment Failures
- **Unauthenticated Client**: Returns `HTTP 401 Unauthorized` (`"Unauthorized: Authentication token required."`).
- **Unassigned Judge Scoring Attempt**: Returns `HTTP 403 Forbidden` (`"Access Denied: You are not assigned to evaluate this project"`).
- **Cross-Judge Score Inspection**: Returns `HTTP 403 Forbidden` (`"Security Violation: You are strictly prohibited from inspecting other judges' scores."`).
- **Assignment Constraint Infeasibility**: If judge conflicts or lack of judges make quorum impossible, `adminController.assignJudges` returns `HTTP 400 Bad Request` with the specific solver error message.
- **Disconnected Bradley-Terry Graph**: If pairwise comparisons do not form a single connected component, the Python solver raises `ValueError("comparison graph must be connected")`, returning `HTTP 422 Unprocessable Entity`.

---

## 20. Verification Evidence

The mathematical accuracy, determinism, and integration contracts of the judging system are verified by test suites across the repository.

### Verification History and Current Status

According to [acceptance-report.txt](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/acceptance-report.txt):

1. **WBS-44 Historical Verification (September 2026)**:
   - 12 focused verification tests passed.
   - Core mathematical reference verified: 5 projects, 4 judges, 16 ballots, 3 rubric criteria evaluated against an independent mathematical calculator.
   - Max absolute difference between reference calculator and production output: $2.22 \times 10^{-16}$; calibrated Z-score difference: $0.0$ (within tolerance $10^{-12}$).
   - Variance reduction benchmark (WBS-38): Raw metric $4.2946 \rightarrow$ Normalized metric $0.0914$, achieving **97.87% variance reduction** (exceeding $>65\%$ threshold).
   - 10-run determinism test: 100% reproducible through $\ge 6$ decimal places.
   - Suite status at WBS-44: 125 passed, 1 warning.

2. **WBS-53 Historical Verification**:
   - Expanded test suite: **169 passed, 1 warning in 1.52s**.
   - Warning noted: `PytestCacheWarning` caused by Windows workspace permissions on `.pytest_cache`; zero code defects.
   - In that historical run, Docker container health checks encountered a startup timing block.

3. **WBS-56 Final Verification & Rehearsal (Latest State)**:
   - Full stack verified: `docker compose up -d --build` completed successfully.
   - `docker compose ps` showed all four services healthy:
     - `dogfood-mongodb` (MongoDB 7.0)
     - `dogfood-judging` (Python 3.11 FastAPI)
     - `dogfood-api` (Node 20 Express)
     - `dogfood-frontend` (React 18 / Nginx)
   - Final status across all subsystems:
     - `ALGORITHMS: PASS`
     - `APIS: PASS`
     - `NODE INTEGRATION: PASS`
     - `DOCKER: PASS`
     - `PERSISTENCE: PASS`
     - `OFFLINE: PASS`
     - `SECURITY: PASS`
     - `DEMO REHEARSAL: PASS`

---

## 21. Known Limitations

The current implementation operates with the following verified architectural limitations:

1. **Hardcoded Cryptographic Secrets in Development Configuration**: Default secrets exist in `.env.example`, `docker-compose.yml`, and `seed/init-mongo.js` (`JWT_SECRET = 'raptors-offline-cryptographic-master-key-2026'`). Production deployments require external secret injection.
2. **In-Memory Rate Limiting**: The voting rate limiter (`TokenBucketSlidingWindowLimiter` in [rateLimiter.js](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/backend/src/middleware/rateLimiter.js)) stores token buckets in a local JavaScript `Map()`. Memory is local to a single Node process and does not persist across container restarts or distribute across clustered API replicas.
3. **Standard Docker Bridge Network**: The `dogfood-net` network in [docker-compose.yml](file:///c:/Users/Admin/Documents/GitHub/DogFood-Hackathon/docker-compose.yml) uses standard bridge mode rather than `internal: true`. Host egress blocking is verified through container test rules (`nc -zv -w 2 8.8.8.8 53`).
4. **Standalone MongoDB Architecture**: Persistence relies on a single MongoDB 7.0 container with a local Docker volume (`mongo_data`). It does not run a multi-node replica set.
5. **Fallback Normalization Divergence**: The in-process fallback algorithm (`raw_weighted_average_fallback`) computes a linear raw mean $\times 10$ and does not perform Bayesian shrinkage or variance normalization. Standings computed under fallback mode diverge from FastAPI results.
6. **Application-Level Audit Trail**: Audit logging uses a standard MongoDB collection (`auditlogs`). It lacks cryptographic sealing, Merkle tree verification, or write-once hardware guarantees.
7. **Pairwise Graph Connectivity**: Bradley-Terry ranking fails with HTTP 422 if pairwise comparisons do not form a single connected component across all projects.
8. **Dual Rubric Representations**: The system synchronizes both a standalone `Rubric` document and an embedded `Event.rubric` array. While synchronized during `upsertRubric`, concurrent manual database edits could cause discrepancies.

---

## 22. Judge Quickstart

This walkthrough provides the exact command sequence and seeded credentials to verify the judging system end-to-end.

### Seeded Credentials

All pre-seeded accounts share the password: **`Raptor2026!`**

| Account Role | Email | Track / Notes |
| :--- | :--- | :--- |
| **Organizer** | `organizer@dogfood.local` | Tournament administrator |
| **Judge (AI/ML)** | `judge.ai@dogfood.local` | Track preference: `AI/ML` |
| **Judge (Web3)** | `judge.web3@dogfood.local` | Track preference: `Web3 & Blockchain` |
| **Judge (FinTech)** | `judge.fintech@dogfood.local` | Track preference: `FinTech` |
| **Judge (HealthTech)** | `judge.health@dogfood.local` | Track preference: `HealthTech` |
| **Participant (Captain)** | `alex@dogfood.local` | Team `CyberDinos` (AI/ML) |
| **Participant (Captain)** | `maria@dogfood.local` | Team `BioPulse` (HealthTech) |

---

### Step-by-Step Verification Procedure

#### Step 1: Start the Air-Gapped Stack
```bash
docker compose up --build -d
docker compose ps
```
Ensure all four containers (`dogfood-mongodb`, `dogfood-judging`, `dogfood-api`, `dogfood-frontend`) report healthy status.

#### Step 2: Verify Service Health
```bash
# Check Node Express API health
curl -s http://localhost:5000/api/v1/health

# Check Python FastAPI judging microservice health
curl -s http://localhost:8000/health
```

#### Step 3: Login as Tournament Organizer
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"organizer@dogfood.local","password":"Raptor2026!"}' \
  -c organizer_cookie.txt
```

#### Step 4: Execute Global Judge Assignment
```bash
curl -s -X POST http://localhost:5000/api/v1/admin/assign-judges \
  -b organizer_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{"targetPerProject": 2}'
```
Inspect returned JSON to verify assignments were constructed and balanced across judges.

#### Step 5: Login as Track Judge (AI/ML)
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"judge.ai@dogfood.local","password":"Raptor2026!"}' \
  -c judge_cookie.txt
```

#### Step 6: Retrieve Assigned Queue
```bash
curl -s http://localhost:5000/api/v1/judging/assigned \
  -b judge_cookie.txt
```
Extract `submissionId` for the assigned `Neural Raptor` project.

#### Step 7: Save a Score Draft
```bash
curl -s -X PUT http://localhost:5000/api/v1/judging/scores/draft \
  -b judge_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "submissionId": "<SUBMISSION_ID>",
    "criteriaScores": [
      {"key": "technical_execution", "score": 8.5},
      {"key": "innovation_originality", "score": 9.0}
    ],
    "privateNotes": "Strong architecture, evaluation in progress."
  }'
```

#### Step 8: Submit Final Evaluation Ballot
```bash
curl -s -X POST http://localhost:5000/api/v1/judging/scores \
  -b judge_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{
    "submissionId": "<SUBMISSION_ID>",
    "criteriaScores": [
      {"key": "technical_execution", "score": 8.5},
      {"key": "innovation_originality", "score": 9.0},
      {"key": "practical_impact", "score": 8.0},
      {"key": "polish_presentation", "score": 7.5}
    ],
    "privateNotes": "Final evaluation complete. Outstanding implementation."
  }'
```

#### Step 9: Verify Ballot Isolation (Unauthorized Access Attempt)
Log in with a different judge account (`judge.web3@dogfood.local`) and attempt to inspect the submitted score:
```bash
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"judge.web3@dogfood.local","password":"Raptor2026!"}' \
  -c judge2_cookie.txt

# Attempt to inspect another judge's score ballot
curl -s http://localhost:5000/api/v1/judging/scores/<SUBMISSION_ID> \
  -b judge2_cookie.txt
```
**Expected Response**: `HTTP 403 Forbidden` (`"Access Denied: You are not assigned to evaluate this project"` or `"Security Violation: You are strictly prohibited from inspecting other judges' scores."`).

#### Step 10: Auto-Evaluate Remaining Queue Items
Log back in as `judge.ai@dogfood.local` and complete any remaining assigned evaluations using median scores:
```bash
curl -s -X POST http://localhost:5000/api/v1/judging/auto-evaluate \
  -b judge_cookie.txt
```

#### Step 11: Execute Statistical Score Normalization (Organizer)
```bash
curl -s -X POST http://localhost:5000/api/v1/admin/normalize-scores \
  -b organizer_cookie.txt \
  -H "Content-Type: application/json" \
  -d '{}'
```
Inspect returned standings, Bayesian shrunk parameters, and judge calibrations.

#### Step 12: Inspect Official Leaderboard
```bash
# Authenticated organizer leaderboard
curl -s http://localhost:5000/api/v1/admin/leaderboard \
  -b organizer_cookie.txt

# Unauthenticated public leaderboard
curl -s http://localhost:5000/api/v1/submissions/leaderboard
```

#### Step 13: Export Standings
```bash
# Download RFC 4180 CSV spreadsheet
curl -s http://localhost:5000/api/v1/admin/export/csv \
  -b organizer_cookie.txt -o standings.csv

# Download JSON judging archive
curl -s http://localhost:5000/api/v1/admin/export/json \
  -b organizer_cookie.txt -o standings.json
```

#### Step 14: Inspect System Audit Trail
```bash
curl -s "http://localhost:5000/api/v1/admin/audit-logs?limit=10" \
  -b organizer_cookie.txt
```

---

## 23. Architecture / Judging Flow Diagram

The following diagram illustrates the relationship between data models, authorization boundaries, backend controllers, and the statistical microservice:

```mermaid
flowchart TD
    subgraph ClientLayer["Client Interaction Layer"]
        PClient["Participant Client"]
        JClient["Judge Client"]
        OClient["Organizer / Admin Console"]
        PubClient["Public Showcase Client"]
    end

    subgraph AuthLayer["Authorization & Route Guards"]
        JWT["authMiddleware\n(Cookie or Bearer JWT)"]
        RG_J["roleGuard\n('judge', 'organizer', 'admin')"]
        RG_O["roleGuard\n('organizer', 'admin')"]
        IG["isolationGuard\n(Checks active JudgeAssignment)"]
        SO["verifyScoreOwnership\n(Prevents cross-judge inspection)"]
    end

    subgraph BackendAPI["Node.js Express API (Port 5000)"]
        SubCtrl["submissionController\n(finalizeSubmission)"]
        JudgeCtrl["judgingController\n(submitScore / saveDraftScore)"]
        AdminCtrl["adminController\n(assignJudges / runNormalization)"]
        VoteCtrl["voteController\n(castVote / unvote)"]
        Solver["assignmentSolver.js\n(Min-Cost Max-Flow Engine)"]
        FastClient["fastApiClient.js\n(HTTP Bridge & Fallback)"]
    end

    subgraph FastAPI["Python Judging Microservice (Port 8000)"]
        NormPy["/api/v1/normalize\n(Empirical Bayesian Z-Score)"]
        DiagPy["/api/v1/judge-diagnostics\n(Severity & SEM Profiler)"]
        PairPy["/api/v1/pairwise-rank\n(Bradley-Terry MM Solver)"]
        AnomPy["/api/v1/voting-anomalies\n(3σ Velocity & Entropy)"]
    end

    subgraph MongoStorage["MongoDB Database (Port 27017)"]
        M_User[("users")]
        M_Sub[("submissions")]
        M_Assign[("judgeassignments")]
        M_Score[("scores")]
        M_Rubric[("rubrics / events")]
        M_Cache[("leaderboardcaches")]
        M_Vote[("votes\n(24h TTL)")]
        M_Audit[("auditlogs")]
    end

    %% Submission flow
    PClient -->|POST /submissions/finalize| JWT
    JWT --> SubCtrl
    SubCtrl -->|Locks project| M_Sub
    SubCtrl -.->|Auto-assigns up to 2 judges| Solver
    Solver --> M_Assign

    %% Global Assignment flow
    OClient -->|POST /admin/assign-judges| JWT
    JWT --> RG_O --> AdminCtrl
    AdminCtrl -->|Solves K=3 Min-Cost Max-Flow| Solver
    Solver --> M_Assign
    AdminCtrl -->|Logs JUDGES_ASSIGNED| M_Audit

    %% Judging Flow
    JClient -->|GET /judging/assigned| JWT --> RG_J --> JudgeCtrl
    JudgeCtrl -->|Queries isolated queue| M_Assign

    JClient -->|POST /judging/scores| JWT --> RG_J --> IG
    IG -->|Checks assignment exists| JudgeCtrl
    JudgeCtrl -->|Computes rawCompositeScore| JudgeCtrl
    JudgeCtrl -->|Saves completed ballot| M_Score
    JudgeCtrl -->|Sets status: completed| M_Assign
    JudgeCtrl -->|Logs SCORE_SUBMITTED| M_Audit

    JClient -->|GET /judging/scores/:id| JWT --> RG_J --> SO
    SO -->|Strips competitor scores| JudgeCtrl
    JudgeCtrl --> M_Score

    %% Normalization & Leaderboard Flow
    OClient -->|POST /admin/normalize-scores| JWT --> RG_O --> AdminCtrl
    AdminCtrl -->|Fetches completed scores| M_Score
    AdminCtrl --> FastClient
    FastClient -->|POST /api/v1/normalize| NormPy
    NormPy -->|Returns Z-score standings| FastClient
    FastClient -.->|If microservice down:\nraw_weighted_average_fallback| AdminCtrl
    AdminCtrl -->|Persists standings & calibrations| M_Cache
    AdminCtrl -->|Backfills normalizedScore & zScore| M_Score
    AdminCtrl -->|Logs NORMALIZATION_EXECUTED| M_Audit

    %% Leaderboard queries
    OClient -->|GET /admin/leaderboard| JWT --> RG_O --> AdminCtrl
    PubClient -->|GET /submissions/leaderboard| SubCtrl
    SubCtrl -->|Delegates directly| AdminCtrl
    AdminCtrl -->|Reads standings| M_Cache

    %% Pairwise Flow
    JClient -->|POST /judging/pairwise\n(Bypasses IG)| JWT --> RG_J --> JudgeCtrl
    JudgeCtrl -->|Stores comparison| MongoStorage
    OClient -->|POST /pairwise-rank| FastClient --> PairPy

    %% Community Voting Flow
    PubClient -->|POST /votes/:id\n(Token Bucket 5 req/min)| VoteCtrl
    VoteCtrl -->|Checks 24h voterHash| M_Vote
    VoteCtrl -->|Increments publicVoteCount| M_Sub
    OClient -->|POST /voting-anomalies| FastClient --> AnomPy
```
