// ─────────────────────────────────────────────────────────
//  MeetMod — Speaking Timer
//  Client-side speaking-time tracker with percentage
//  calculations and formatted output.
// ─────────────────────────────────────────────────────────

class SpeakingTimer {
  constructor() {
    /** @type {Map<string, ParticipantTiming>} socketId → timing data */
    this.participants = new Map();
    this._meetingStartTime = Date.now();
  }

  /**
   * Add a participant to track.
   * @param {string} socketId
   * @param {string} name
   */
  addParticipant(socketId, name) {
    if (this.participants.has(socketId)) return;

    this.participants.set(socketId, {
      name: name || 'Unknown',
      totalTimeMs: 0,
      currentStartMs: null,
      isSpeaking: false,
      speakCount: 0,
    });
  }

  /**
   * Remove a participant from tracking.
   * @param {string} socketId
   */
  removeParticipant(socketId) {
    const data = this.participants.get(socketId);
    if (data && data.isSpeaking) {
      data.totalTimeMs += Date.now() - data.currentStartMs;
      data.isSpeaking = false;
    }
    this.participants.delete(socketId);
  }

  /**
   * Mark a participant as speaking.
   * @param {string} socketId
   */
  startSpeaking(socketId) {
    const data = this.participants.get(socketId);
    if (!data || data.isSpeaking) return;

    data.isSpeaking = true;
    data.currentStartMs = Date.now();
    data.speakCount++;
  }

  /**
   * Mark a participant as stopped speaking.
   * @param {string} socketId
   */
  stopSpeaking(socketId) {
    const data = this.participants.get(socketId);
    if (!data || !data.isSpeaking) return;

    data.totalTimeMs += Date.now() - data.currentStartMs;
    data.isSpeaking = false;
    data.currentStartMs = null;
  }

  /**
   * Get effective total speaking time (including current if active).
   * @param {string} socketId
   * @returns {number} milliseconds
   */
  getTotalTime(socketId) {
    const data = this.participants.get(socketId);
    if (!data) return 0;

    let total = data.totalTimeMs;
    if (data.isSpeaking && data.currentStartMs) {
      total += Date.now() - data.currentStartMs;
    }
    return total;
  }

  /**
   * Get all participants with computed percentages and colors.
   * @returns {object[]}
   */
  getAll() {
    const colors = [
      '#6c5ce7', // Purple
      '#00cec9', // Teal
      '#fd79a8', // Pink
      '#fdcb6e', // Yellow
      '#55efc4', // Mint
      '#74b9ff', // Blue
      '#e17055', // Coral
      '#a29bfe', // Lavender
      '#ffeaa7', // Light yellow
      '#dfe6e9', // Light gray
    ];

    let totalAll = 0;
    const entries = [];

    // First pass: calculate totals
    for (const [socketId, data] of this.participants) {
      const effectiveTotal = this.getTotalTime(socketId);
      totalAll += effectiveTotal;
      entries.push({
        socketId,
        name: data.name,
        totalTime: effectiveTotal,
        speakCount: data.speakCount,
        isSpeaking: data.isSpeaking,
      });
    }

    // Second pass: add percentages and colors
    return entries.map((entry, index) => ({
      ...entry,
      percentage: totalAll > 0 ? (entry.totalTime / totalAll) * 100 : 0,
      color: colors[index % colors.length],
      totalTimeFormatted: this.formatTime(entry.totalTime),
    }));
  }

  /**
   * Get total meeting speaking time (sum of all participants).
   * @returns {number} milliseconds
   */
  getTotalMeetingTime() {
    let total = 0;
    for (const [socketId] of this.participants) {
      total += this.getTotalTime(socketId);
    }
    return total;
  }

  /**
   * Get the elapsed meeting duration (wall-clock time since start).
   * @returns {number} milliseconds
   */
  getMeetingDuration() {
    return Date.now() - this._meetingStartTime;
  }

  /**
   * Format milliseconds to M:SS string.
   * @param {number} ms
   * @returns {string}
   */
  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Format milliseconds to H:MM:SS string.
   * @param {number} ms
   * @returns {string}
   */
  formatTimeLong(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}

// Export to global scope
window.SpeakingTimer = SpeakingTimer;
