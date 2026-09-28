/**
 * Constraint-Satisfied Judge Assignment Engine
 * 
 * Satisfies:
 * - Constraint 1: Conflict Exclusion — Never assign Judge J to Submission S if S.team is in J.conflictsOfInterest or J mentored team.
 * - Constraint 2: Track Competency — Prioritize judges whose trackPreferences match S.track.
 * - Constraint 3: Workload Balance — Uniform distribution enforcing max(load) - min(load) <= 1.
 * - Constraint 4: Target Quorum — Assign exact target judges per project (K = 3 judges/project default).
 */

class FlowEdge {
  constructor(to, revIndex, cap, cost) {
    this.to = to;
    this.revIndex = revIndex;
    this.cap = cap;
    this.flow = 0;
    this.cost = cost;
  }
}

class MinCostMaxFlowNetwork {
  constructor(vertexCount) {
    this.n = vertexCount;
    this.graph = Array.from({ length: vertexCount }, () => []);
  }

  addEdge(from, to, cap, cost) {
    const forward = new FlowEdge(to, this.graph[to].length, cap, cost);
    const backward = new FlowEdge(from, this.graph[from].length, 0, -cost);
    this.graph[from].push(forward);
    this.graph[to].push(backward);
  }

  findMinCostFlow(src, sink, maxDesiredFlow) {
    let totalFlow = 0;
    let totalCost = 0;

    while (totalFlow < maxDesiredFlow) {
      const dist = new Array(this.n).fill(Infinity);
      const parentNode = new Array(this.n).fill(-1);
      const parentEdgeIndex = new Array(this.n).fill(-1);
      const inQueue = new Array(this.n).fill(false);
      const queue = [];

      dist[src] = 0;
      queue.push(src);
      inQueue[src] = true;

      while (queue.length > 0) {
        const u = queue.shift();
        inQueue[u] = false;

        const edges = this.graph[u];
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const residualCapacity = edge.cap - edge.flow;
          if (residualCapacity > 0 && dist[edge.to] > dist[u] + edge.cost) {
            dist[edge.to] = dist[u] + edge.cost;
            parentNode[edge.to] = u;
            parentEdgeIndex[edge.to] = i;

            if (!inQueue[edge.to]) {
              queue.push(edge.to);
              inQueue[edge.to] = true;
            }
          }
        }
      }

      if (dist[sink] === Infinity) {
        // No augmenting path found
        break;
      }

      // Determine bottleneck capacity along path
      let push = maxDesiredFlow - totalFlow;
      let curr = sink;
      while (curr !== src) {
        const p = parentNode[curr];
        const idx = parentEdgeIndex[curr];
        const edge = this.graph[p][idx];
        push = Math.min(push, edge.cap - edge.flow);
        curr = p;
      }

      if (push <= 0) break;

      // Augment flow
      curr = sink;
      while (curr !== src) {
        const p = parentNode[curr];
        const idx = parentEdgeIndex[curr];
        const edge = this.graph[p][idx];
        edge.flow += push;
        this.graph[curr][edge.revIndex].flow -= push;
        totalCost += push * edge.cost;
        curr = p;
      }

      totalFlow += push;
    }

    return { totalFlow, totalCost };
  }
}

/**
 * Extracts all team identifier strings representing a submission's team.
 */
function extractTeamIds(submission) {
  const ids = new Set();
  if (!submission) return ids;

  const checkAndAdd = (val) => {
    if (!val) return;
    if (typeof val === 'object') {
      if (val._id) ids.add(val._id.toString());
      if (val.id) ids.add(val.id.toString());
    } else {
      ids.add(val.toString());
    }
  };

  checkAndAdd(submission.team);
  checkAndAdd(submission.teamId);

  return ids;
}

/**
 * Extracts all team identifier strings that conflict with a judge.
 * Includes declared conflictsOfInterest, mentored teams, and judge's own team.
 */
function extractJudgeConflictIds(judge) {
  const conflicts = new Set();
  if (!judge) return conflicts;

  const addId = (item) => {
    if (!item) return;
    if (typeof item === 'object') {
      if (item._id) conflicts.add(item._id.toString());
      else if (item.id) conflicts.add(item.id.toString());
      else if (item.teamId) conflicts.add(item.teamId.toString());
    } else {
      conflicts.add(item.toString());
    }
  };

  // 1. Declared conflicts of interest
  if (Array.isArray(judge.conflictsOfInterest)) {
    judge.conflictsOfInterest.forEach(addId);
  } else if (judge.conflictsOfInterest) {
    addId(judge.conflictsOfInterest);
  }

  // 2. Mentored teams (Constraint 1: or J mentored team)
  const mentored =
    judge.mentoredTeams ||
    judge.mentoredTeam ||
    judge.mentoredTeamId ||
    judge.mentorOf ||
    judge.mentored;

  if (Array.isArray(mentored)) {
    mentored.forEach(addId);
  } else if (mentored) {
    addId(mentored);
  }

  // 3. Own team (if judge is a team member or captain)
  if (judge.teamId) addId(judge.teamId);
  if (judge.team) addId(judge.team);

  return conflicts;
}

/**
 * Constraint 1: Conflict Exclusion
 * Returns true if judge has a conflict with the submission's team.
 */
function hasConflict(judge, submission) {
  const submissionTeamIds = extractTeamIds(submission);
  if (submissionTeamIds.size === 0) return false;

  const judgeConflictIds = extractJudgeConflictIds(judge);
  for (const teamId of submissionTeamIds) {
    if (judgeConflictIds.has(teamId)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts declared track preferences for a judge.
 */
function getJudgeTracks(judge) {
  if (!judge) return [];
  const tracks = judge.trackPreferences || judge.judgeTracks || [];
  return Array.isArray(tracks) ? tracks : [tracks];
}

/**
 * Constraint 2: Track Competency Cost
 * Prioritizes judges matching submission track:
 * - Match declared track preference: cost 0 (highest priority)
 * - Track-neutral judge (no preferences declared): cost 10
 * - Non-matching track preference: cost 100
 */
function getTrackCost(judge, submissionTrack) {
  const tracks = getJudgeTracks(judge);
  if (tracks.includes(submissionTrack)) {
    return 0;
  }
  if (tracks.length === 0) {
    return 10;
  }
  return 100;
}

/**
 * Solves judge assignments meeting all 4 constraints.
 * 
 * @param {Array} submissions - Active submissions requiring evaluation
 * @param {Array} judges - Registered judges available for assignment
 * @param {number} targetPerProject - Target evaluations per project (default K = 3)
 * @returns {Object} { assignments, judgeLoad, totalAssigned }
 */
function solveJudgeAssignments(submissions = [], judges = [], targetPerProject = 3) {
  const N = submissions ? submissions.length : 0;
  const M = judges ? judges.length : 0;
  const K = Number(targetPerProject);

  const judgeLoad = {};
  if (judges && Array.isArray(judges)) {
    judges.forEach((j) => {
      const id = j && j._id ? j._id.toString() : String(j);
      judgeLoad[id] = 0;
    });
  }

  // Empty submissions or target 0: early return
  if (N === 0 || K <= 0) {
    return {
      assignments: [],
      judgeLoad,
      totalAssigned: 0,
    };
  }

  if (M === 0) {
    throw new Error('No registered judges found in the system.');
  }

  // Constraint 4: Exact quorum requires at least K distinct judges
  if (M < K) {
    throw new Error(
      `Insufficient judges available to satisfy target quorum: required ${K} judges per project, but only ${M} judges are registered.`
    );
  }

  // Constraint 1: Check if any submission has fewer than K non-conflicted judges
  for (const submission of submissions) {
    const eligibleCount = judges.filter((j) => !hasConflict(j, submission)).length;
    if (eligibleCount < K) {
      throw new Error(
        `Insufficient non-conflicted judges available for submission "${
          submission.title || submission._id
        }": requires ${K} judges, but only ${eligibleCount} non-conflicted judges are available.`
      );
    }
  }

  const totalSlots = N * K;
  const minLoad = Math.floor(totalSlots / M);
  const remainder = totalSlots % M;

  // Node indices in flow network
  const SRC = 0;
  const judgeNode = (j) => 1 + j;
  const subNode = (i) => 1 + M + i;
  const SNK = 1 + M + N;
  const vertexCount = SNK + 1;

  const network = new MinCostMaxFlowNetwork(vertexCount);

  // High cost for assignments exceeding minLoad to enforce uniform balance
  const BALANCE_PENALTY = 100000;

  // Source -> Judge edges
  for (let j = 0; j < M; j++) {
    if (remainder === 0) {
      // Exactly minLoad assignments per judge
      if (minLoad > 0) {
        network.addEdge(SRC, judgeNode(j), minLoad, 0);
      }
    } else {
      // Base load edge
      if (minLoad > 0) {
        network.addEdge(SRC, judgeNode(j), minLoad, 0);
      }
      // Extra 1-unit load edge for judges receiving (minLoad + 1)
      const extraCost = minLoad > 0 ? BALANCE_PENALTY : 0;
      network.addEdge(SRC, judgeNode(j), 1, extraCost);
    }
  }

  // Judge -> Submission edges (respecting Conflict Exclusion and Track Competency)
  for (let j = 0; j < M; j++) {
    const judge = judges[j];
    for (let i = 0; i < N; i++) {
      const submission = submissions[i];

      // Constraint 1: Conflict Exclusion
      if (!hasConflict(judge, submission)) {
        // Constraint 2: Track Competency
        const cost = getTrackCost(judge, submission.track);
        network.addEdge(judgeNode(j), subNode(i), 1, cost);
      }
    }
  }

  // Submission -> Sink edges (Constraint 4: Target Quorum K per project)
  for (let i = 0; i < N; i++) {
    network.addEdge(subNode(i), SNK, K, 0);
  }

  // Compute Min-Cost Max Flow
  const { totalFlow } = network.findMinCostFlow(SRC, SNK, totalSlots);

  if (totalFlow < totalSlots) {
    throw new Error(
      `Unable to satisfy assignment constraints: required ${totalSlots} judge evaluations, but only ${totalFlow} could be validly assigned while enforcing conflict exclusion and uniform workload balance.`
    );
  }

  // Reconstruct assignments from flow network
  const assignments = [];

  for (let j = 0; j < M; j++) {
    const judge = judges[j];
    const jId = judge._id.toString();
    const edges = network.graph[judgeNode(j)];

    for (const edge of edges) {
      if (edge.to >= subNode(0) && edge.to <= subNode(N - 1) && edge.flow === 1) {
        const subIndex = edge.to - (1 + M);
        const sub = submissions[subIndex];

        assignments.push({
          judgeId: judge._id,
          submissionId: sub._id,
          track: sub.track,
          status: 'assigned',
        });

        judgeLoad[jId] = (judgeLoad[jId] || 0) + 1;
      }
    }
  }

  // Constraint 3: Verify uniform workload balance max(load) - min(load) <= 1
  const loads = Object.values(judgeLoad);
  const observedMax = Math.max(...loads);
  const observedMin = Math.min(...loads);

  if (observedMax - observedMin > 1) {
    throw new Error(
      `Uniform workload balance violation: max load (${observedMax}) - min load (${observedMin}) > 1.`
    );
  }

  // Constraint 4: Verify exact target quorum per project
  const subAssignmentsCount = {};
  for (const a of assignments) {
    const sId = a.submissionId.toString();
    subAssignmentsCount[sId] = (subAssignmentsCount[sId] || 0) + 1;
  }

  for (const sub of submissions) {
    const count = subAssignmentsCount[sub._id.toString()] || 0;
    if (count !== K) {
      throw new Error(
        `Target quorum violation: submission "${sub.title || sub._id}" received ${count} judges, expected ${K}.`
      );
    }
  }

  return {
    assignments,
    judgeLoad,
    totalAssigned: assignments.length,
  };
}

/**
 * Auto-assigns up to target judges for a single newly submitted or unassigned submission.
 */
async function autoAssignSubmission(submission, preloadedJudges = null) {
  if (!submission || !submission._id) return [];
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) return [];

  const User = require('../models/User');
  const JudgeAssignment = require('../models/JudgeAssignment');

  const judges = preloadedJudges || (await User.find({ role: 'judge' }));
  if (!judges || judges.length === 0) return [];

  const available = judges.filter((j) => !hasConflict(j, submission));
  if (!available.length) return [];

  const judgeLoads = await Promise.all(
    available.map(async (j) => {
      const count = await JudgeAssignment.countDocuments({
        $or: [{ judgeId: j._id }, { judge: j._id }],
      });
      const cost = getTrackCost(j, submission.track);
      return { judge: j, count, cost };
    })
  );

  // Prioritize matching track first, then least loaded judge
  judgeLoads.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.count - b.count;
  });

  const target = Math.min(3, judgeLoads.length);
  const selected = judgeLoads.slice(0, target).map((x) => x.judge);

  const results = [];
  for (const j of selected) {
    const existing = await JudgeAssignment.findOne({
      $or: [
        { judgeId: j._id, submissionId: submission._id },
        { judge: j._id, submission: submission._id },
      ],
    });
    if (existing && existing.status === 'completed') {
      results.push(existing);
      continue;
    }

    const assignment = await JudgeAssignment.findOneAndUpdate(
      {
        judgeId: j._id,
        submissionId: submission._id,
      },
      {
        $set: {
          judgeId: j._id,
          submissionId: submission._id,
          track: submission.track,
        },
        $setOnInsert: {
          status: 'assigned',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(assignment);
  }
  return results;
}

/**
 * Ensures all submitted/locked submissions have at least 1 judge assignment.
 */
async function ensureSubmissionsAssigned() {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) return [];

  const Submission = require('../models/Submission');
  const JudgeAssignment = require('../models/JudgeAssignment');
  const User = require('../models/User');

  const submissions = await Submission.find({
    status: { $in: ['submitted', 'locked'] },
  });
  if (!submissions.length) return [];

  const judges = await User.find({ role: 'judge' });
  if (!judges.length) return [];

  // Count existing assignments per submission
  const existingAssignments = await JudgeAssignment.find().select('submissionId submission judgeId judge');
  const assignmentCountMap = {};
  const assignedJudgesMap = {}; // submissionId -> Set of judgeIds already assigned

  existingAssignments.forEach((a) => {
    const subId = (a.submissionId?._id || a.submission?._id || a.submissionId || a.submission)?.toString();
    const jId = (a.judgeId?._id || a.judge?._id || a.judgeId || a.judge)?.toString();
    if (subId) {
      assignmentCountMap[subId] = (assignmentCountMap[subId] || 0) + 1;
      if (!assignedJudgesMap[subId]) assignedJudgesMap[subId] = new Set();
      if (jId) assignedJudgesMap[subId].add(jId);
    }
  });

  // Find submissions with fewer than 3 judge assignments (target quorum)
  const TARGET_QUORUM = 3;
  const needsAssignment = submissions.filter(
    (s) => (assignmentCountMap[s._id.toString()] || 0) < TARGET_QUORUM
  );
  if (!needsAssignment.length) return [];

  const created = [];
  for (const sub of needsAssignment) {
    const res = await autoAssignSubmission(sub, judges);
    created.push(...res);
  }
  return created;
}

module.exports = {
  solveJudgeAssignments,
  hasConflict,
  getTrackCost,
  autoAssignSubmission,
  ensureSubmissionsAssigned,
};
