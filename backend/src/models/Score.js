const mongoose = require('mongoose');

const CriterionScoreSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      default: function () {
        return this.criteriaName;
      },
    },
    score: {
      type: Number,
      required: true,
      default: function () {
        return this.rawScore;
      },
    },
    criteriaName: {
      type: String,
    },
    weight: {
      type: Number,
    },
    rawScore: {
      type: Number,
    },
  },
  { _id: false }
);

const ScoreSchema = new mongoose.Schema(
  {
    judge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      alias: 'judgeId',
    },
    submission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: true,
      index: true,
      alias: 'submissionId',
    },
    criteriaScores: [CriterionScoreSchema],
    rawCompositeScore: {
      type: Number,
      required: true,
      alias: 'totalRawScore',
    },
    privateNotes: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    normalizedScore: {
      type: Number,
      default: null,
    },
    isFinal: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ScoreSchema.pre('validate', function () {
  if (this.judge && !this.judgeId) {
    this.judgeId = this.judge;
  } else if (this.judgeId && !this.judge) {
    this.judge = this.judgeId;
  }

  if (this.submission && !this.submissionId) {
    this.submissionId = this.submission;
  } else if (this.submissionId && !this.submission) {
    this.submission = this.submissionId;
  }

  if (this.rawCompositeScore != null && this.totalRawScore == null) {
    this.totalRawScore = this.rawCompositeScore;
  } else if (this.totalRawScore != null && this.rawCompositeScore == null) {
    this.rawCompositeScore = this.totalRawScore;
  }

  if (Array.isArray(this.criteriaScores)) {
    this.criteriaScores.forEach((item) => {
      if (!item.key && item.criteriaName) item.key = item.criteriaName;
      if (item.score == null && item.rawScore != null) item.score = item.rawScore;
      if (!item.criteriaName && item.key) item.criteriaName = item.key;
      if (item.rawScore == null && item.score != null) item.rawScore = item.score;
    });
  }
});

// Unique compound index: [judge, submission]
ScoreSchema.index({ judge: 1, submission: 1 }, { unique: true });

module.exports = mongoose.model('Score', ScoreSchema);
