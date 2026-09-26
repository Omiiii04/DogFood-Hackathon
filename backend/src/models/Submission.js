const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team reference is required'],
      unique: true,
      index: true,
      alias: 'teamId',
    },
    title: {
      type: String,
      required: [true, 'Submission title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    tagline: {
      type: String,
      required: [true, 'Submission tagline is required'],
      trim: true,
      maxlength: [250, 'Tagline cannot exceed 250 characters'],
      alias: 'pitch',
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
    },
    track: {
      type: String,
      required: [true, 'Hackathon track is required'],
      index: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Project description in markdown format is required'],
      alias: 'descriptionMarkdown',
    },
    githubUrl: {
      type: String,
      required: [true, 'GitHub repository URL is required'],
      trim: true,
      alias: 'repoUrl',
    },
    demoVideoUrl: {
      type: String,
      default: '',
      trim: true,
      alias: 'demoUrl',
    },
    thumbnailUrl: {
      type: String,
      default: '/uploads/default-thumbnail.webp',
      trim: true,
      alias: 'thumbnailPath',
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'submitted'],
        message: '{VALUE} is not a valid submission status (must be draft or submitted)',
      },
      default: 'draft',
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    publicVoteCount: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Full-text search index for public gallery
SubmissionSchema.index({ title: 'text', tagline: 'text', track: 'text' });

// Query middleware to transparently map legacy teamId queries to team
SubmissionSchema.pre(
  ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteMany', 'countDocuments'],
  function () {
    const filter = this.getQuery();
    if (filter && filter.teamId && !filter.team) {
      filter.team = filter.teamId;
      delete filter.teamId;
    }
  }
);

// Pre-save hook ensuring submittedAt is recorded when submitted
SubmissionSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'submitted' && !this.submittedAt) {
    this.submittedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Submission', SubmissionSchema);
