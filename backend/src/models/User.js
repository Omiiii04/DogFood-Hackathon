const mongoose = require('mongoose');

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

module.exports = mongoose.model('User', UserSchema);
