const mongoose = require('mongoose');

const StandingEntrySchema = new mongoose.Schema(
  {
    submissionId: {
      type: mongoose.Schema.Types.Mixed,
      alias: 'submission_id',
    },
    rank: {
      type: Number,
      required: true,
    },
    normalizedScore: {
      type: Number,
      required: true,
      alias: 'normalized_score',
    },
    rawMean: {
      type: Number,
      alias: 'raw_mean',
    },
    zScore: {
      type: Number,
      alias: 'z_mean',
    },
    zScoreMean: {
      type: Number,
      alias: 'z_score_mean',
    },
    ballotCount: {
      type: Number,
      alias: 'ballot_count',
    },
    teamName: {
      type: String,
    },
    title: {
      type: String,
    },
    track: {
      type: String,
    },
  },
  { _id: false, strict: false }
);

const JudgeCalibrationSchema = new mongoose.Schema(
  {
    judgeId: {
      type: mongoose.Schema.Types.Mixed,
      alias: 'judge_id',
    },
    sampleSize: {
      type: Number,
      alias: 'sample_size',
    },
    rawMean: {
      type: Number,
      alias: 'raw_mean',
    },
    rawStd: {
      type: Number,
      alias: 'raw_std',
    },
    bias: {
      type: Number,
    },
  },
  { _id: false, strict: false }
);

const LeaderboardCacheSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      default: 'default-event',
      index: true,
    },
    standings: {
      type: [StandingEntrySchema],
      default: [],
    },
    judgeCalibrations: {
      type: [JudgeCalibrationSchema],
      default: [],
      alias: 'judge_calibrations',
    },
    // Top-level fields for convenience when querying individual submission cache
    submissionId: {
      type: mongoose.Schema.Types.Mixed,
      alias: 'submission_id',
    },
    rank: {
      type: Number,
    },
    normalizedScore: {
      type: Number,
      alias: 'normalized_score',
    },
    rawMean: {
      type: Number,
      alias: 'raw_mean',
    },
    zScore: {
      type: Number,
      alias: 'z_score',
    },
    ballotCount: {
      type: Number,
      alias: 'ballot_count',
    },
    algorithm: {
      type: String,
      default: 'z_score_bayesian_shrinkage',
    },
    totalSubmissions: {
      type: Number,
      alias: 'total_submissions',
      default: 0,
    },
    totalScoresProcessed: {
      type: Number,
      alias: 'total_scores_processed',
      default: 0,
    },
    isFallback: {
      type: Boolean,
      alias: 'is_fallback',
      default: false,
    },
    cachedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

LeaderboardCacheSchema.virtual('normalizedScores').get(function () {
  if (Array.isArray(this.standings)) {
    return this.standings.map((s) => ({
      submissionId: s.submissionId || s.submission_id,
      rank: s.rank,
      normalizedScore: s.normalizedScore ?? s.normalized_score,
    }));
  }
  return [];
});

LeaderboardCacheSchema.virtual('ranks').get(function () {
  if (Array.isArray(this.standings)) {
    return this.standings.map((s) => ({
      submissionId: s.submissionId || s.submission_id,
      rank: s.rank,
    }));
  }
  return [];
});

LeaderboardCacheSchema.statics.getLatest = function (eventId) {
  const query = eventId ? { eventId: eventId.toString() } : {};
  return this.findOne(query).sort({ updatedAt: -1 });
};

module.exports = mongoose.model('LeaderboardCache', LeaderboardCacheSchema);
