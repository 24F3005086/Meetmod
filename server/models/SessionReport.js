// ─────────────────────────────────────────────────────────
//  MeetMod — Session Report Model
//  Mongoose schema for persisting meeting analytics.
// ─────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const ParticipantReportSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  name: { type: String, required: true },
  totalTime: { type: Number, default: 0 },          // in milliseconds
  longestMonologue: { type: Number, default: 0 },   // in milliseconds
  speakCount: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  totalTimeFormatted: { type: String, default: '0:00' },
  longestMonologueFormatted: { type: String, default: '0:00' }
});

const SessionReportSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  roomName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  totalMeetingTime: { type: Number, default: 0 },   // in milliseconds
  participantCount: { type: Number, default: 0 },
  equityScore: { type: Number, default: 100 },
  participants: [ParticipantReportSchema]
});

module.exports = mongoose.model('SessionReport', SessionReportSchema);
