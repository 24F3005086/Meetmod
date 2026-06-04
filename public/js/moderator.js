// ─────────────────────────────────────────────────────────
//  MeetMod — Client-Side Moderator
//  Handles moderation events from the server and
//  triggers UI updates + force-mute.
// ─────────────────────────────────────────────────────────

class Moderator {
  /**
   * @param {object} socket – Socket.io client instance
   * @param {SpeakingTimer} speakingTimer
   * @param {NotificationManager} notificationManager
   * @param {WebRTCManager} webrtcManager
   */
  constructor(socket, speakingTimer, notificationManager, webrtcManager) {
    this.socket = socket;
    this.speakingTimer = speakingTimer;
    this.notifications = notificationManager;
    this.webrtc = webrtcManager;

    this._onForceMuted = null;
    this._isCountdownActive = false;

    this._bindSocketEvents();
  }

  /**
   * Bind all moderation-related socket events.
   */
  _bindSocketEvents() {
    // ── Warning ───────────────────────────────────────────
    this.socket.on('moderation-warning', ({ message }) => {
      console.log('[Moderator] Warning received:', message);
      this.notifications.showWarning(message);
    });

    // ── Countdown ─────────────────────────────────────────
    this.socket.on('moderation-countdown', ({ remainingSec }) => {
      console.log('[Moderator] Countdown:', remainingSec, 'seconds');
      this._isCountdownActive = true;
      this.notifications.showCountdown(remainingSec);

      // Auto-dismiss countdown when it reaches 0
      if (remainingSec <= 0) {
        this._isCountdownActive = false;
        this.notifications.hideCountdown();
      }
    });

    // ── Force Mute ────────────────────────────────────────
    this.socket.on('moderation-mute', ({ reason }) => {
      console.log('[Moderator] Force muted:', reason);

      // Force mute the local stream
      if (this.webrtc) {
        this.webrtc.toggleAudio(true);
      }

      // Dismiss countdown if active
      this._isCountdownActive = false;
      this.notifications.hideCountdown();

      // Show muted notification
      this.notifications.showMuted(reason);

      // Notify the server
      this.socket.emit('mute-changed', { isMuted: true });

      // Trigger callback for UI updates
      if (this._onForceMuted) {
        this._onForceMuted();
      }
    });

    // ── Nudge ─────────────────────────────────────────────
    this.socket.on('moderation-nudge', ({ message }) => {
      console.log('[Moderator] Nudge received:', message);
      this.notifications.showNudge(message);
    });

    // ── Moderation Settings Updated ──────────────────────
    this.socket.on('moderation-settings-updated', ({ config }) => {
      console.log('[Moderator] Settings updated:', config);
      this.notifications.show(
        'Moderation settings have been updated by the host.',
        'info',
        4000
      );
    });
  }

  /**
   * Set callback for when user is force-muted (for UI updates).
   * @param {Function} callback
   */
  onForceMuted(callback) {
    this._onForceMuted = callback;
  }

  /**
   * Check if countdown is currently active.
   * @returns {boolean}
   */
  isCountdownActive() {
    return this._isCountdownActive;
  }

  /**
   * Destroy and cleanup event listeners.
   */
  destroy() {
    this.socket.off('moderation-warning');
    this.socket.off('moderation-countdown');
    this.socket.off('moderation-mute');
    this.socket.off('moderation-nudge');
    this.socket.off('moderation-settings-updated');
    console.log('[Moderator] Destroyed');
  }
}

// Export to global scope
window.Moderator = Moderator;
