// ─────────────────────────────────────────────────────────
//  MeetMod — Speaking Tracker
//  Tracks per-participant speaking time, monologues,
//  and generates analytics data for the dashboard.
// ─────────────────────────────────────────────────────────

class SpeakingTracker {
  constructor() {
    /** @type {Map<string, Map<string, SpeakingData>>} roomId → socketId → data */
    this.rooms = new Map();
  }

  /**
   * Initialize tracking structures for a room.
   * @param {string} roomId
   */
  initRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
      console.log(`[SpeakingTracker] Initialized tracking for room ${roomId}`);
    }
  }

  /**
   * Initialize tracking for a participant.
   * @param {string} roomId
   * @param {string} socketId
   */
  addParticipant(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.set(socketId, {
      totalTime: 0,          // Total speaking time in ms
      currentStart: null,     // Timestamp when current speech started
      isSpeaking: false,
      longestMonologue: 0,    // Longest continuous speech in ms
      speakCount: 0,          // Number of times they started speaking
      history: [],            // Array of { start, end } timestamps
    });
  }

  /**
   * Remove tracking for a participant.
   * @param {string} roomId
   * @param {string} socketId
   */
  removeParticipant(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // If they're speaking, stop them first
    if (room.has(socketId)) {
      const data = room.get(socketId);
      if (data.isSpeaking && data.currentStart) {
        this._finishSpeaking(data);
      }
    }

    room.delete(socketId);
  }

  /**
   * Record that a participant started speaking.
   * @param {string} roomId
   * @param {string} socketId
   */
  startSpeaking(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const data = room.get(socketId);
    if (!data || data.isSpeaking) return;

    data.isSpeaking = true;
    data.currentStart = Date.now();
    data.speakCount++;
  }

  /**
   * Record that a participant stopped speaking.
   * @param {string} roomId
   * @param {string} socketId
   * @returns {number} duration of this speech segment in ms
   */
  stopSpeaking(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    const data = room.get(socketId);
    if (!data || !data.isSpeaking) return 0;

    return this._finishSpeaking(data);
  }

  /**
   * Internal: finish a speaking segment.
   * @param {object} data
   * @returns {number} duration in ms
   */
  _finishSpeaking(data) {
    const end = Date.now();
    const duration = end - data.currentStart;

    data.totalTime += duration;
    data.isSpeaking = false;

    // Track longest monologue
    if (duration > data.longestMonologue) {
      data.longestMonologue = duration;
    }

    // Record history
    data.history.push({
      start: data.currentStart,
      end: end,
    });

    data.currentStart = null;
    return duration;
  }

  /**
   * Get speaking data for all participants in a room, with percentages.
   * @param {string} roomId
   * @returns {object[]}
   */
  getSpeakingData(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const participants = [];
    let totalAll = 0;

    // First pass: compute effective total times
    for (const [socketId, data] of room) {
      let effectiveTotal = data.totalTime;
      if (data.isSpeaking && data.currentStart) {
        effectiveTotal += Date.now() - data.currentStart;
      }
      totalAll += effectiveTotal;
      participants.push({
        socketId,
        totalTime: effectiveTotal,
        longestMonologue: data.longestMonologue,
        speakCount: data.speakCount,
        isSpeaking: data.isSpeaking,
      });
    }

    // Second pass: compute percentages
    for (const p of participants) {
      p.percentage = totalAll > 0 ? (p.totalTime / totalAll) * 100 : 0;
    }

    return participants;
  }

  /**
   * Get how long a participant has been continuously speaking (in seconds).
   * @param {string} roomId
   * @param {string} socketId
   * @returns {number} seconds
   */
  getContinuousSpeakingTime(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    const data = room.get(socketId);
    if (!data || !data.isSpeaking || !data.currentStart) return 0;

    return (Date.now() - data.currentStart) / 1000;
  }

  /**
   * Return the socketId of the least-speaking participant.
   * @param {string} roomId
   * @returns {string|null}
   */
  getQuietestParticipant(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.size === 0) return null;

    let quietest = null;
    let minTime = Infinity;

    for (const [socketId, data] of room) {
      let effectiveTotal = data.totalTime;
      if (data.isSpeaking && data.currentStart) {
        effectiveTotal += Date.now() - data.currentStart;
      }
      if (effectiveTotal < minTime) {
        minTime = effectiveTotal;
        quietest = socketId;
      }
    }

    return quietest;
  }

  /**
   * Generate a full meeting report for a room.
   * @param {string} roomId
   * @returns {object}
   */
  getMeetingReport(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const speakingData = this.getSpeakingData(roomId);
    const totalMeetingTime = speakingData.reduce(
      (sum, p) => sum + p.totalTime,
      0
    );

    // Calculate equity score (coefficient of variation based)
    let equityScore = 100;
    if (speakingData.length > 1) {
      const percentages = speakingData.map((p) => p.percentage);
      const mean =
        percentages.reduce((a, b) => a + b, 0) / percentages.length;
      if (mean > 0) {
        const variance =
          percentages.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) /
          percentages.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean; // Coefficient of variation
        equityScore = Math.max(0, Math.round(100 - cv * 100));
      }
    }

    return {
      roomId,
      totalMeetingTime,
      participantCount: speakingData.length,
      equityScore,
      participants: speakingData.map((p) => ({
        ...p,
        totalTimeFormatted: this._formatMs(p.totalTime),
        longestMonologueFormatted: this._formatMs(p.longestMonologue),
      })),
    };
  }

  /**
   * Delete all tracking data for a room.
   * @param {string} roomId
   */
  deleteRoom(roomId) {
    if (this.rooms.has(roomId)) {
      console.log(
        `[SpeakingTracker] Deleted tracking data for room ${roomId}`
      );
      this.rooms.delete(roomId);
    }
  }

  /**
   * Format milliseconds to M:SS.
   * @param {number} ms
   * @returns {string}
   */
  _formatMs(ms) {
    const totalSec = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}

module.exports = { SpeakingTracker };
