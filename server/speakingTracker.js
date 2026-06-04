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
  addParticipant(roomId, socketId, name) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.has(socketId)) return;

    room.set(socketId, {
      name: name || 'Unknown',
      totalTime: 0,          // Total speaking time in ms
      currentStart: null,     // Timestamp when current speech started
      isSpeaking: false,
      longestMonologue: 0,    // Longest continuous speech in ms
      speakCount: 0,          // Number of times they started speaking
      history: [],            // Array of { start, end } timestamps
      interruptionsGiven: 0,
      interruptionsReceived: 0,
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
    // We do NOT delete the participant data so it remains
    // in the final report even if they leave before the meeting ends.
  }

  /**
   * Record that a participant started speaking.
   * @param {string} roomId
   * @param {string} socketId
   */
  startSpeaking(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const data = room.get(socketId);
    if (!data || data.isSpeaking) return null;

    let interruptionEvent = null;

    // Check if someone else is currently speaking (speech overlap detection)
    for (const [otherId, otherData] of room) {
      if (otherId !== socketId && otherData.isSpeaking) {
        data.interruptionsGiven = (data.interruptionsGiven || 0) + 1;
        otherData.interruptionsReceived = (otherData.interruptionsReceived || 0) + 1;

        interruptionEvent = {
          interrupterId: socketId,
          interrupterName: data.name,
          interruptedId: otherId,
          interruptedName: otherData.name,
          timestamp: Date.now()
        };
        break;
      }
    }

    data.isSpeaking = true;
    data.currentStart = Date.now();
    data.speakCount++;

    return interruptionEvent;
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
        interruptionsGiven: data.interruptionsGiven || 0,
        interruptionsReceived: data.interruptionsReceived || 0,
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

    // Calculate Gini Coefficient
    let giniIndex = 0;
    let equityScore = 100;
    if (speakingData.length > 1) {
      const times = speakingData.map((p) => p.totalTime);
      giniIndex = this._calculateGini(times);
      equityScore = Math.max(0, Math.min(100, Math.round((1 - giniIndex) * 100)));
    }

    return {
      roomId,
      totalMeetingTime,
      participantCount: speakingData.length,
      equityScore,
      giniIndex,
      participants: speakingData.map((p) => {
        const trackerData = room.get(p.socketId);
        return {
          ...p,
          name: trackerData ? trackerData.name : 'Unknown',
          totalTimeFormatted: this._formatMs(p.totalTime),
          longestMonologueFormatted: this._formatMs(p.longestMonologue),
          interruptionsGiven: p.interruptionsGiven,
          interruptionsReceived: p.interruptionsReceived,
        };
      }),
    };
  }

  /**
   * Calculate Gini Coefficient for an array of values.
   * @param {number[]} values
   * @returns {number} gini index between 0 and 1
   */
  _calculateGini(values) {
    const n = values.length;
    if (n < 2) return 0;

    let absoluteDifferenceSum = 0;
    let sum = 0;

    for (let i = 0; i < n; i++) {
      sum += values[i];
      for (let j = 0; j < n; j++) {
        absoluteDifferenceSum += Math.abs(values[i] - values[j]);
      }
    }

    if (sum === 0) return 0;
    return absoluteDifferenceSum / (2 * n * sum);
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
