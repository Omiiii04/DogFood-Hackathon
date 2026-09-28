const mongoose = require('mongoose');

const PairwiseComparisonSchema = new mongoose.Schema(
  {
    judge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Judge is required'],
      index: true,
      alias: 'judgeId',
    },
    submissionA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: [true, 'Submission A is required'],
      index: true,
      alias: 'submission_a',
    },
    submissionB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: [true, 'Submission B is required'],
      index: true,
      alias: 'submission_b',
      validate: {
        validator: function (v) {
          const subA = this.submissionA || this.submission_a;
          if (!subA || !v) return true;
          return subA.toString() !== v.toString();
        },
        message: 'submissionA and submissionB must be distinct submissions.',
      },
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: [true, 'Winner is required'],
      index: true,
      validate: {
        validator: function (v) {
          const subA = this.submissionA || this.submission_a;
          const subB = this.submissionB || this.submission_b;
          if (!v || !subA || !subB) return true;
          const vStr = v.toString();
          return vStr === subA.toString() || vStr === subB.toString();
        },
        message: 'Winner must be either submissionA or submissionB.',
      },
    },
    notes: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      index: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

PairwiseComparisonSchema.pre('validate', function () {
  if (this.submissionA && !this.submission_a) this.submission_a = this.submissionA;
  if (this.submission_a && !this.submissionA) this.submissionA = this.submission_a;
  if (this.submissionB && !this.submission_b) this.submission_b = this.submissionB;
  if (this.submission_b && !this.submissionB) this.submissionB = this.submission_b;
  if (this.judge && !this.judgeId) this.judgeId = this.judge;
  if (this.judgeId && !this.judge) this.judge = this.judgeId;
});

// Index for efficient querying of comparisons by judge and submissions
PairwiseComparisonSchema.index({ judge: 1, submissionA: 1, submissionB: 1 });

module.exports = mongoose.model('PairwiseComparison', PairwiseComparisonSchema);
