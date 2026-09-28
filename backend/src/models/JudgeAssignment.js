const mongoose = require('mongoose');

const JudgeAssignmentSchema = new mongoose.Schema(
  {
    judgeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      alias: 'judge',
    },
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: true,
      index: true,
      alias: 'submission',
    },
    track: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['assigned', 'in_progress', 'completed', 'pending'],
      default: 'assigned',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual populate options for alias paths
JudgeAssignmentSchema.virtual('judge', {
  ref: 'User',
  localField: 'judgeId',
  foreignField: '_id',
  justOne: true,
});

JudgeAssignmentSchema.virtual('submission', {
  ref: 'Submission',
  localField: 'submissionId',
  foreignField: '_id',
  justOne: true,
});

JudgeAssignmentSchema.pre('validate', function (next) {
  if (this.judge && !this.judgeId) this.judgeId = this.judge;
  if (this.submission && !this.submissionId) this.submissionId = this.submission;
  next();
});

JudgeAssignmentSchema.index({ judgeId: 1, submissionId: 1 }, { unique: true });

module.exports = mongoose.model('JudgeAssignment', JudgeAssignmentSchema);
