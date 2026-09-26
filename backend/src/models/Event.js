const mongoose = require('mongoose');

const RubricCriterionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    weight: { type: Number, required: true, min: 0, max: 1 },
    scaleMin: { type: Number, default: 1 },
    scaleMax: { type: Number, default: 10 },
  },
  { _id: false }
);

const EventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      alias: 'name',
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    tracks: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ['upcoming', 'active', 'judging', 'closed'],
        message: '{VALUE} is not a valid event status',
      },
      default: 'active',
      index: true,
    },
    submissionDeadline: {
      type: Date,
      required: [true, 'Submission deadline is required'],
    },
    rubricLocked: {
      type: Boolean,
      default: false,
    },
    rubric: {
      type: [RubricCriterionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

module.exports = mongoose.model('Event', EventSchema);

