const mongoose = require('mongoose');
const AuditLog = require('./AuditLog');

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
    zScore: {
      type: Number,
      default: null,
    },
    isFinal: {
      type: Boolean,
      default: true,
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
ScoreSchema.virtual('judgeId', {
  ref: 'User',
  localField: 'judge',
  foreignField: '_id',
  justOne: true,
});

ScoreSchema.virtual('submissionId', {
  ref: 'Submission',
  localField: 'submission',
  foreignField: '_id',
  justOne: true,
});

// Transparent query and update mapping for legacy aliases
ScoreSchema.pre(
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteMany', 'countDocuments', 'updateMany', 'updateOne'],
  function () {
    const filter = this.getQuery ? this.getQuery() : null;
    if (filter) {
      const normalizeClause = (clause) => {
        if (!clause || typeof clause !== 'object') return clause;
        if (clause.submissionId !== undefined && clause.submission === undefined) {
          clause.submission = clause.submissionId;
          delete clause.submissionId;
        }
        if (clause.judgeId !== undefined && clause.judge === undefined) {
          clause.judge = clause.judgeId;
          delete clause.judgeId;
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

    const update = this.getUpdate ? this.getUpdate() : null;
    if (update) {
      if (update.submissionId && !update.submission) {
        update.submission = update.submissionId;
      }
      if (update.judgeId && !update.judge) {
        update.judge = update.judgeId;
      }
      if (update.totalRawScore != null && update.rawCompositeScore == null) {
        update.rawCompositeScore = update.totalRawScore;
      }
      const options = this.getOptions ? this.getOptions() : null;
      if (options && options.upsert) {
        delete update.submissionId;
        delete update.judgeId;
        delete update.totalRawScore;
      }
    }
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

// Middleware hooks automatically recording administrative overrides to AuditLog
ScoreSchema.post('init', function () {
  this._original = this.toObject();
});

ScoreSchema.pre('save', function (next) {
  if (!this.isNew) {
    this._isOverride = true;
    this._previousState = this._original ? { ...this._original } : {};
  }
  if (typeof next === 'function') next();
});

ScoreSchema.post('save', async function (doc) {
  if (doc._isOverride) {
    doc._isOverride = false;
    try {
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.create({
        actor: doc._actor || doc._actorId || null,
        actorId: doc._actor || doc._actorId || null,
        actorRole: doc._actorRole || 'organizer',
        action: doc._auditAction || 'SCORE_OVERRIDE',
        targetResource: 'Score',
        targetId: doc._id,
        resourceId: doc._id,
        previousState: doc._previousState || {},
        newState: doc.toObject(),
        ipAddress: doc._ipAddress || null,
        ipHash: doc._ipAddress || 'system',
        timestamp: new Date(),
      });
    } catch (err) {
      console.warn('Score audit log recording notice:', err.message);
    }
  }
});

ScoreSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const options = this.getOptions();
    if (options && (options.isOverride || options.audit)) {
      this._docToUpdate = await this.model.findOne(this.getQuery()).lean();
    }
  } catch (_) {}
  if (typeof next === 'function') next();
});

ScoreSchema.post('findOneAndUpdate', async function (res) {
  if (this._docToUpdate && res) {
    try {
      const AuditLog = mongoose.model('AuditLog');
      const options = this.getOptions() || {};
      await AuditLog.create({
        actor: options.actor || options.actorId || null,
        actorId: options.actor || options.actorId || null,
        actorRole: options.actorRole || 'organizer',
        action: options.action || 'SCORE_OVERRIDE',
        targetResource: 'Score',
        targetId: res._id,
        resourceId: res._id,
        previousState: this._docToUpdate,
        newState: res.toObject ? res.toObject() : res,
        ipAddress: options.ipAddress || null,
        ipHash: options.ipAddress || 'system',
        timestamp: new Date(),
      });
    } catch (_) {}
  }
});

// Unique compound index: [judge, submission]
ScoreSchema.index({ judge: 1, submission: 1 }, { unique: true });

module.exports = mongoose.model('Score', ScoreSchema);
