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

JudgeAssignmentSchema.pre(
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteMany', 'countDocuments'],
  function () {
    const filter = this.getQuery ? this.getQuery() : null;
    if (filter) {
      if (filter.judge !== undefined && filter.judgeId === undefined) {
        filter.judgeId = filter.judge;
        delete filter.judge;
      }
      if (filter.submission !== undefined && filter.submissionId === undefined) {
        filter.submissionId = filter.submission;
        delete filter.submission;
      }
      if (Array.isArray(filter.$or)) {
        filter.$or = filter.$or.map((clause) => {
          const mapped = { ...clause };
          if (mapped.judge !== undefined && mapped.judgeId === undefined) {
            mapped.judgeId = mapped.judge;
            delete mapped.judge;
          }
          if (mapped.submission !== undefined && mapped.submissionId === undefined) {
            mapped.submissionId = mapped.submission;
            delete mapped.submission;
          }
          return mapped;
        });
      }
    }
  }
);

JudgeAssignmentSchema.pre('validate', function (next) {
  if (this.judge && !this.judgeId) this.judgeId = this.judge;
  if (this.submission && !this.submissionId) this.submissionId = this.submission;
  next();
});

JudgeAssignmentSchema.index({ judgeId: 1, submissionId: 1 }, { unique: true });

module.exports = mongoose.model('JudgeAssignment', JudgeAssignmentSchema);
