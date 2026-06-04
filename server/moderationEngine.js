// ─────────────────────────────────────────────────────────
//  MeetMod — Moderation Engine
//  Enforces speaking-time thresholds with warnings,
//  countdowns, force-mute, and cooldown periods.
// ─────────────────────────────────────────────────────────

class ModerationEngine {
  /**
   * @param {object} config
   * @param {number} config.warningThresholdSec  – seconds before warning (default 120)
   * @param {number} config.countdownThresholdSec – seconds before countdown starts (default 180)
   * @param {number} config.muteThresholdSec      – seconds before force-mute (default 200)
   * @param {number} config.cooldownSec           – cooldown after mute before tracking again (default 60)
   * @param {boolean} config.enabled
   */
  constructor(config = {}) {
    this.warningThresholdSec = config.warningThresholdSec ?? 120;
    this.countdownThresholdSec = config.countdownThresholdSec ?? 180;
    this.muteThresholdSec = config.muteThresholdSec ?? 200;
    this.cooldownSec = config.cooldownSec ?? 60;
    this.enabled = config.enabled ?? true;

    /** @type {Set<string>} Users exempt from moderation */
    this.exemptUsers = new Set();

    /** @type {Map<string, number>} socketId → timestamp when muted */
    this.mutedUsers = new Map();

    /** @type {Set<string>} socketIds already warned this speaking session */
    this.warningsSent = new Set();

    /** @type {Map<string, boolean>} socketId → countdown active */
    this.countdownActive = new Map();
  }

  /**
   * Check if moderation action is needed for a speaking participant.
   * @param {string} roomId   – room identifier (for logging)
   * @param {string} socketId – participant socket ID
   * @param {number} continuousSpeakingSec – how long they've been talking (seconds)
   * @returns {object|null} – null if no action, otherwise { action, participantId, ... }
   */
  check(roomId, socketId, continuousSpeakingSec) {
    // Skip if moderation disabled
    if (!this.enabled) return null;

    // Skip exempt users
    if (this.exemptUsers.has(socketId)) return null;

    // Skip users in cooldown
    if (this.isInCooldown(socketId)) return null;

    // Force mute
    if (continuousSpeakingSec >= this.muteThresholdSec) {
      console.log(
        `[Moderation] MUTE: ${socketId} in room ${roomId} (${continuousSpeakingSec.toFixed(0)}s)`
      );
      this.countdownActive.delete(socketId);
      this.warningsSent.delete(socketId);
      return {
        action: 'MUTE',
        participantId: socketId,
        reason: `Speaking for ${Math.floor(continuousSpeakingSec)} seconds — auto-muted to allow others to participate.`,
      };
    }

    // Countdown
    if (continuousSpeakingSec >= this.countdownThresholdSec) {
      const remainingSec = Math.ceil(
        this.muteThresholdSec - continuousSpeakingSec
      );
      this.countdownActive.set(socketId, true);
      return {
        action: 'COUNTDOWN',
        participantId: socketId,
        remainingSec: Math.max(0, remainingSec),
      };
    }

    // Warning (only send once per speaking session)
    if (
      continuousSpeakingSec >= this.warningThresholdSec &&
      !this.warningsSent.has(socketId)
    ) {
      this.warningsSent.add(socketId);
      console.log(
        `[Moderation] WARNING: ${socketId} in room ${roomId} (${continuousSpeakingSec.toFixed(0)}s)`
      );
      return {
        action: 'WARNING',
        participantId: socketId,
        message: `You've been speaking for ${Math.floor(continuousSpeakingSec)} seconds. Consider wrapping up to let others participate.`,
      };
    }

    return null;
  }

  /**
   * Record that a user has been force-muted.
   * @param {string} socketId
   */
  onMuted(socketId) {
    this.mutedUsers.set(socketId, Date.now());
    this.countdownActive.delete(socketId);
    this.warningsSent.delete(socketId);
    console.log(`[Moderation] ${socketId} muted, cooldown started`);
  }

  /**
   * Record that a user has been unmuted.
   * @param {string} socketId
   */
  onUnmuted(socketId) {
    // Warnings will be re-evaluated fresh on their next speaking session
    this.warningsSent.delete(socketId);
    this.countdownActive.delete(socketId);
  }

  /**
   * Check if a user is still in cooldown after being force-muted.
   * @param {string} socketId
   * @returns {boolean}
   */
  isInCooldown(socketId) {
    const mutedAt = this.mutedUsers.get(socketId);
    if (!mutedAt) return false;

    const elapsed = (Date.now() - mutedAt) / 1000;
    if (elapsed >= this.cooldownSec) {
      this.mutedUsers.delete(socketId);
      return false;
    }
    return true;
  }

  /**
   * Set or remove exemption for a participant.
   * @param {string} socketId
   * @param {boolean} exempt
   */
  setExempt(socketId, exempt) {
    if (exempt) {
      this.exemptUsers.add(socketId);
      console.log(`[Moderation] ${socketId} exempted from moderation`);
    } else {
      this.exemptUsers.delete(socketId);
      console.log(`[Moderation] ${socketId} no longer exempt`);
    }
  }

  /**
   * Update moderation thresholds.
   * @param {object} newConfig
   */
  updateConfig(newConfig) {
    if (newConfig.warningThresholdSec !== undefined) {
      this.warningThresholdSec = newConfig.warningThresholdSec;
    }
    if (newConfig.countdownThresholdSec !== undefined) {
      this.countdownThresholdSec = newConfig.countdownThresholdSec;
    }
    if (newConfig.muteThresholdSec !== undefined) {
      this.muteThresholdSec = newConfig.muteThresholdSec;
    }
    if (newConfig.cooldownSec !== undefined) {
      this.cooldownSec = newConfig.cooldownSec;
    }
    if (newConfig.enabled !== undefined) {
      this.enabled = newConfig.enabled;
    }
    console.log('[Moderation] Config updated:', this.getConfig());
  }

  /**
   * Get current configuration.
   * @returns {object}
   */
  getConfig() {
    return {
      warningThresholdSec: this.warningThresholdSec,
      countdownThresholdSec: this.countdownThresholdSec,
      muteThresholdSec: this.muteThresholdSec,
      cooldownSec: this.cooldownSec,
      enabled: this.enabled,
    };
  }

  /**
   * Reset all warnings (useful when a participant stops and starts again).
   */
  resetWarnings() {
    this.warningsSent.clear();
    this.countdownActive.clear();
  }

  /**
   * Reset warning state for a specific user (when they stop speaking).
   * @param {string} socketId
   */
  resetUserWarnings(socketId) {
    this.warningsSent.delete(socketId);
    this.countdownActive.delete(socketId);
  }

  /**
   * Cleanup all state for a specific user.
   * @param {string} socketId
   */
  removeUser(socketId) {
    this.exemptUsers.delete(socketId);
    this.mutedUsers.delete(socketId);
    this.warningsSent.delete(socketId);
    this.countdownActive.delete(socketId);
  }
}

module.exports = { ModerationEngine };
