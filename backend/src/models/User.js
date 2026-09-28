const mongoose = require('mongoose');
const AuditLog = require('./AuditLog');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      alias: 'fullName',
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Never exposed in default projections
    },
    role: {
      type: String,
      enum: ['participant', 'judge', 'organizer', 'admin'],
      default: 'participant',
      index: true,
    },
    trackPreferences: {
      type: [String],
      default: [],
      alias: 'judgeTracks',
    },
    conflictsOfInterest: {
      type: [String],
      default: [],
    },
    mentoredTeams: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Team',
      default: [],
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware hooks automatically recording administrative overrides to AuditLog
UserSchema.post('init', function () {
  this._original = this.toObject();
});

UserSchema.pre('save', function (next) {
  if (!this.isNew) {
    const originalRole = this._original?.role;
    const newRole = this.role;
    if (this.isModified('role') || (originalRole && originalRole !== newRole)) {
      this._shouldAudit = true;
      this._auditAction = 'ROLE_ELEVATION';
      this._previousState = this._original ? { ...this._original } : {};
    } else if (this.isModified()) {
      this._shouldAudit = true;
      this._auditAction = 'ADMIN_USER_OVERRIDE';
      this._previousState = this._original ? { ...this._original } : {};
    }
  }
  if (typeof next === 'function') next();
});

UserSchema.post('save', async function (doc) {
  if (doc._shouldAudit) {
    const action = doc._auditAction || (doc.isModified && doc.isModified('role') ? 'ROLE_ELEVATION' : 'ADMIN_USER_OVERRIDE');
    const prev = doc._previousState || {};
    doc._shouldAudit = false;
    try {
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.create({
        actor: doc._actor || doc._actorId || null,
        actorId: doc._actor || doc._actorId || null,
        actorRole: doc._actorRole || 'admin',
        action,
        targetResource: 'User',
        targetId: doc._id,
        resourceId: doc._id,
        previousState: prev,
        newState: doc.toObject(),
        ipAddress: doc._ipAddress || null,
        ipHash: doc._ipAddress || 'system',
        timestamp: new Date(),
      });
    } catch (err) {
      console.warn('User audit log recording notice:', err.message);
    }
  }
});

UserSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate();
    const updateRole = update?.role || update?.$set?.role;
    const options = this.getOptions();
    if (updateRole || options?.isOverride || options?.audit) {
      this._docToUpdate = await this.model.findOne(this.getQuery()).lean();
    }
  } catch (_) {}
  if (typeof next === 'function') next();
});

UserSchema.post('findOneAndUpdate', async function (res) {
  if (this._docToUpdate && res) {
    try {
      const roleChanged = this._docToUpdate.role !== res.role;
      const action = roleChanged ? 'ROLE_ELEVATION' : 'ADMIN_USER_OVERRIDE';
      const options = this.getOptions() || {};
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.create({
        actor: options?.actor || options?.actorId || null,
        actorId: options?.actor || options?.actorId || null,
        actorRole: options?.actorRole || 'admin',
        action: options?.action || action,
        targetResource: 'User',
        targetId: res._id,
        resourceId: res._id,
        previousState: this._docToUpdate,
        newState: res.toObject ? res.toObject() : res,
        ipAddress: options?.ipAddress || null,
        ipHash: options?.ipAddress || 'system',
        timestamp: new Date(),
      });
    } catch (_) {}
  }
});

module.exports = mongoose.model('User', UserSchema);
