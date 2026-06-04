// ─────────────────────────────────────────────────────────
//  MeetMod — Notification Manager
//  Toast notification system with moderation overlays
//  and type-based styling.
// ─────────────────────────────────────────────────────────

class NotificationManager {
  constructor() {
    this.container = document.getElementById('toast-container');
    this.countdownOverlay = null;
    this._toastCount = 0;
    this._maxToasts = 5;

    // Create container if it doesn't exist
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 380px;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show a toast notification.
   * @param {string} message – notification text
   * @param {string} type – 'info' | 'warning' | 'danger' | 'success'
   * @param {number} duration – auto-dismiss in ms (default 5000)
   */
  show(message, type = 'info', duration = 5000) {
    // Limit max toasts
    if (this._toastCount >= this._maxToasts) {
      const oldest = this.container.firstElementChild;
      if (oldest) this._removeToast(oldest);
    }

    const typeConfig = {
      info: {
        color: '#74b9ff',
        bg: 'rgba(116, 185, 255, 0.12)',
        border: 'rgba(116, 185, 255, 0.3)',
        icon: 'info',
      },
      warning: {
        color: '#ffeaa7',
        bg: 'rgba(255, 234, 167, 0.12)',
        border: 'rgba(255, 234, 167, 0.3)',
        icon: 'alert-triangle',
      },
      danger: {
        color: '#ff7675',
        bg: 'rgba(255, 118, 117, 0.12)',
        border: 'rgba(255, 118, 117, 0.3)',
        icon: 'alert-circle',
      },
      success: {
        color: '#55efc4',
        bg: 'rgba(85, 239, 196, 0.12)',
        border: 'rgba(85, 239, 196, 0.3)',
        icon: 'check-circle',
      },
    };

    const config = typeConfig[type] || typeConfig.info;

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 18px;
      background: ${config.bg};
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid ${config.border};
      border-radius: 12px;
      color: #ffffff;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      transform: translateX(120%);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    `;

    toast.innerHTML = `
      <i data-lucide="${config.icon}" style="width: 18px; height: 18px; color: ${config.color}; flex-shrink: 0; margin-top: 1px;"></i>
      <div style="flex: 1;">
        <div style="color: ${config.color}; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">
          ${type.charAt(0).toUpperCase() + type.slice(1)}
        </div>
        <div style="color: rgba(255, 255, 255, 0.9);">${message}</div>
      </div>
      <button style="background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; padding: 0; font-size: 16px; line-height: 1;" onclick="this.parentElement.remove()">×</button>
    `;

    // Click to dismiss
    toast.addEventListener('click', () => this._removeToast(toast));

    this.container.appendChild(toast);
    this._toastCount++;

    // Initialize Lucide icons in the toast
    if (window.lucide) {
      window.lucide.createIcons({ nodes: [toast] });
    }

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      });
    });

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        this._removeToast(toast);
      }, duration);
    }

    // Play subtle sound
    this.playSound(type);

    return toast;
  }

  /**
   * Remove a toast with animation.
   * @param {HTMLElement} toast
   */
  _removeToast(toast) {
    if (!toast || !toast.parentElement) return;

    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
      this._toastCount = Math.max(0, this._toastCount - 1);
    }, 400);
  }

  /**
   * Show a persistent join request toast with Admit/Decline buttons.
   * @param {string} userName
   * @param {string} socketId - identify this specific request toast
   * @param {Function} onRespond - callback(approved: boolean)
   */
  showJoinRequest(userName, socketId, onRespond) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification join-request';
    toast.id = `join-request-${socketId}`;
    toast.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      background: rgba(108, 92, 231, 0.15);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(108, 92, 231, 0.4);
      border-radius: 12px;
      color: #ffffff;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      transform: translateX(120%);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
      <i data-lucide="user-check" style="width: 18px; height: 18px; color: #6c5ce7; flex-shrink: 0; margin-top: 1px;"></i>
      <div style="flex: 1;">
        <div style="color: #6c5ce7; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">
          Admission Request
        </div>
        <div style="color: rgba(255, 255, 255, 0.9); margin-bottom: 8px;"><strong>${userName}</strong> wants to join this room.</div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-admit" style="background: #55efc4; border: none; color: #0a0a0f; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; transition: 0.2s;">Admit</button>
          <button class="btn-decline" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px; transition: 0.2s;">Decline</button>
        </div>
      </div>
    `;

    // Button event listeners
    toast.querySelector('.btn-admit').addEventListener('click', (e) => {
      e.stopPropagation();
      onRespond(true);
      this._removeToast(toast);
    });

    toast.querySelector('.btn-decline').addEventListener('click', (e) => {
      e.stopPropagation();
      onRespond(false);
      this._removeToast(toast);
    });

    this.container.appendChild(toast);
    this._toastCount++;

    if (window.lucide) {
      window.lucide.createIcons({ nodes: [toast] });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
      });
    });

    this.playSound('info');
    return toast;
  }

  /**
   * Remove a specific join request notification by socketId.
   * @param {string} socketId
   */
  removeJoinRequest(socketId) {
    const toast = document.getElementById(`join-request-${socketId}`);
    if (toast) {
      this._removeToast(toast);
    }
  }

  /**
   * Show a speaking-time warning notification.
   * @param {string} message
   */
  showWarning(message) {
    this.show(
      message || "You've been speaking for a while. Consider wrapping up to let others participate.",
      'warning',
      8000
    );
  }

  /**
   * Show countdown overlay with big timer.
   * @param {number} seconds – remaining seconds before mute
   */
  showCountdown(seconds) {
    if (!this.countdownOverlay) {
      this.countdownOverlay = document.createElement('div');
      this.countdownOverlay.id = 'moderation-countdown-overlay';
      this.countdownOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        animation: fadeIn 0.3s ease;
        pointer-events: none;
      `;

      this.countdownOverlay.innerHTML = `
        <div style="
          text-align: center;
          padding: 40px 60px;
          background: rgba(255, 118, 117, 0.1);
          border: 2px solid rgba(255, 118, 117, 0.4);
          border-radius: 24px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        ">
          <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7); font-family: Inter; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            Auto-mute in
          </div>
          <div id="countdown-timer" style="
            font-size: 72px;
            font-weight: 800;
            color: #ff7675;
            font-family: Inter;
            line-height: 1;
            text-shadow: 0 0 40px rgba(255, 118, 117, 0.5);
          ">
            ${seconds}
          </div>
          <div style="font-size: 13px; color: rgba(255, 255, 255, 0.5); font-family: Inter; margin-top: 12px;">
            Please wrap up your point
          </div>
        </div>
      `;

      document.body.appendChild(this.countdownOverlay);
    } else {
      // Update timer
      const timerEl = document.getElementById('countdown-timer');
      if (timerEl) {
        timerEl.textContent = seconds;

        // Pulse animation on each second
        timerEl.style.transform = 'scale(1.1)';
        setTimeout(() => {
          timerEl.style.transform = 'scale(1)';
        }, 150);
      }
    }
  }

  /**
   * Show force-mute notification.
   * @param {string} message
   */
  showMuted(message) {
    this.hideCountdown();
    this.show(
      message || 'You have been auto-muted to allow others to participate. You can unmute after the cooldown period.',
      'danger',
      10000
    );
  }

  /**
   * Show a friendly nudge to speak.
   * @param {string} message
   */
  showNudge(message) {
    this.show(
      message || "You've been quiet — feel free to jump in and share your thoughts!",
      'info',
      7000
    );
  }

  /**
   * Hide the countdown overlay.
   */
  hideCountdown() {
    if (this.countdownOverlay) {
      this.countdownOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.countdownOverlay && this.countdownOverlay.parentElement) {
          this.countdownOverlay.parentElement.removeChild(
            this.countdownOverlay
          );
        }
        this.countdownOverlay = null;
      }, 300);
    }
  }

  /**
   * Play a notification sound (degrades gracefully).
   * @param {string} type
   */
  playSound(type) {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Different sounds per type
      const sounds = {
        info: { freq: 800, duration: 0.1 },
        warning: { freq: 600, duration: 0.15 },
        danger: { freq: 400, duration: 0.2 },
        success: { freq: 1000, duration: 0.1 },
      };

      const sound = sounds[type] || sounds.info;
      oscillator.frequency.value = sound.freq;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + sound.duration
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + sound.duration);

      // Cleanup
      setTimeout(() => {
        audioContext.close().catch(() => {});
      }, 500);
    } catch (e) {
      // Degrade gracefully — no sound
    }
  }
}

// Export to global scope
window.NotificationManager = NotificationManager;
