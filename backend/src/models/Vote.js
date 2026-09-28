const mongoose = require('mongoose');
const crypto = require('crypto');

const VoteSchema = new mongoose.Schema(
  {
    submission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission',
      required: [true, 'Submission reference is required'],
      index: true,
      alias: 'submissionId',
    },
    voterHash: {
      type: String,
      required: [true, 'voterHash is required'],
      index: true,
      alias: 'fingerprintHash',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      alias: 'userId',
    },
    votedAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // TTL Index: Automatic expiration after 24 hours (86,400 seconds)
      alias: 'createdAt',
    },
    ipAddress: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique compound index: [submission, voterHash] preventing duplicate votes in 24h
VoteSchema.index({ submission: 1, voterHash: 1 }, { unique: true });

// Transparent query mapping for legacy aliases
VoteSchema.pre(
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteMany', 'countDocuments'],
  function () {
    const filter = this.getQuery();
    if (filter) {
      if (filter.submissionId && !filter.submission) {
        filter.submission = filter.submissionId;
        delete filter.submissionId;
      }
      if (filter.fingerprintHash && !filter.voterHash) {
        filter.voterHash = filter.fingerprintHash;
        delete filter.fingerprintHash;
      }
      if (filter.createdAt && !filter.votedAt) {
        filter.votedAt = filter.createdAt;
        delete filter.createdAt;
      }
    }
  }
);

/**
 * Generate SHA-256 voterHash from clientIP + userAgent + secretSalt
 */
VoteSchema.statics.generateVoterHash = function (clientIp, userAgent, secretSalt) {
  const salt =
    secretSalt ||
    process.env.VOTE_SECRET_SALT ||
    process.env.JWT_SECRET ||
    'raptors-offline-cryptographic-master-key-2026';
  const ip = clientIp || '127.0.0.1';
  const ua = userAgent || 'unknown';
  return crypto
    .createHash('sha256')
    .update(`${ip}${ua}${salt}`)
    .digest('hex');
};

module.exports = mongoose.model('Vote', VoteSchema);
