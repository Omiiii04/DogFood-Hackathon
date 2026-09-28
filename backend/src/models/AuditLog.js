const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      alias: 'actorId',
    },
    actorRole: {
      type: String,
      default: 'system',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetResource: {
      type: String,
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      alias: 'resourceId',
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: function () {
        if (this.previousState || this.newState) {
          return {
            previousState: this.previousState || {},
            newState: this.newState || {},
          };
        }
        return {};
      },
    },
    ipAddress: {
      type: String,
      alias: 'ipHash',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

AuditLogSchema.pre('validate', function () {
  if ((!this.payload || Object.keys(this.payload).length === 0) && (this.previousState || this.newState)) {
    this.payload = { previousState: this.previousState || {}, newState: this.newState || {} };
  }
  if ((!this.previousState || Object.keys(this.previousState).length === 0) && this.payload?.previousState) {
    this.previousState = this.payload.previousState;
  }
  if ((!this.newState || Object.keys(this.newState).length === 0) && this.payload?.newState) {
    this.newState = this.payload.newState;
  }
});

AuditLogSchema.pre('save', function (next) {
  if ((!this.payload || Object.keys(this.payload).length === 0) && (this.previousState || this.newState)) {
    this.payload = { previousState: this.previousState || {}, newState: this.newState || {} };
  }
  if (typeof next === 'function') next();
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
