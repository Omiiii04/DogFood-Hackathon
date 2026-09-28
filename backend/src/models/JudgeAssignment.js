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
      enum: ['assigned', 'in_progress', 'completed', 'pending', 'auto_evaluated'],
      default: 'assigned',
      index: true,
    },
    autoEvaluated: {
      type: Boolean,
      default: false,
      index: true,
      alias: 'isAutoEvaluated',
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
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteMany', 'countDocuments', 'updateMany', 'updateOne'],
  function () {
    const filter = this.getQuery ? this.getQuery() : null;
    if (filter) {
      const normalizeClause = (clause) => {
        if (!clause || typeof clause !== 'object') return clause;
        if (clause.judge !== undefined && clause.judgeId === undefined) {
          clause.judgeId = clause.judge;
          delete clause.judge;
        }
        if (clause.submission !== undefined && clause.submissionId === undefined) {
          clause.submissionId = clause.submission;
          delete clause.submission;
        }
        if (Array.isArray(clause.$or)) {
          clause.$or = clause.$or.map(normalizeClause);
          if (
            clause.$or.length === 2 &&
            JSON.stringify(clause.$or[0]) === JSON.stringify(clause.$or[1])
          ) {
            const first = clause.$or[0];
            delete clause.$or;
            Object.assign(clause, first);
          }
        }
        if (Array.isArray(clause.$and)) {
          clause.$and = clause.$and.map(normalizeClause);
          const canFlatten = clause.$and.every((c) => !c.$or && !c.$and);
          if (canFlatten) {
            clause.$and.forEach((c) => Object.assign(clause, c));
            delete clause.$and;
          }
        }
        return clause;
      };

      normalizeClause(filter);
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
