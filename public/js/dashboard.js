// ─────────────────────────────────────────────────────────
//  MeetMod — Analytics Dashboard
//  Controls the slide-in analytics panel with real-time
//  speaking charts, participant cards, and equity scoring.
// ─────────────────────────────────────────────────────────

class Dashboard {
  /**
   * @param {SpeakingTimer} speakingTimer
   * @param {AnalyticsCharts} charts
   */
  constructor(speakingTimer, charts) {
    this.speakingTimer = speakingTimer;
    this.charts = charts;
    this.isOpen = false;
    this._autoUpdateInterval = null;
    this._activeTab = 'overview';

    // DOM elements
    this.panel = document.getElementById('dashboard-panel');
    this.backdrop = document.getElementById('dashboard-backdrop');
  }

  /**
   * Toggle the dashboard panel open/closed.
   */
  toggle() {
    this.isOpen = !this.isOpen;

    if (this.panel) {
      this.panel.classList.toggle('open', this.isOpen);
    }
    if (this.backdrop) {
      this.backdrop.classList.toggle('visible', this.isOpen);
    }

    if (this.isOpen) {
      this.update();
    }

    // Update dashboard button state
    const btn = document.getElementById('btn-dashboard');
    if (btn) {
      btn.classList.toggle('active', this.isOpen);
    }
  }

  /**
   * Close the dashboard.
   */
  close() {
    this.isOpen = false;
    if (this.panel) this.panel.classList.remove('open');
    if (this.backdrop) this.backdrop.classList.remove('visible');

    const btn = document.getElementById('btn-dashboard');
    if (btn) btn.classList.remove('active');
  }

  /**
   * Update all dashboard data and visuals.
   */
  update() {
    if (!this.isOpen) return;

    try {
      const participants = this.speakingTimer.getAll();

      // Update charts
      if (this.charts) {
        this.charts.updateCharts(participants);
      }

      // Update participant cards
      this.renderParticipantCards(participants);

      // Update equity score
      const equityScore = this.calculateEquityScore(participants);
      this.renderEquityScore(equityScore);

      // Check for quiet participants
      this.renderQuietAlerts(participants);

      // Update total meeting time display
      this._updateMeetingTimeDisplay();
    } catch (err) {
      console.error('[Dashboard] Update error:', err);
    }
  }

  /**
   * Start auto-updating the dashboard.
   * @param {number} intervalMs – update interval (default 3000)
   */
  startAutoUpdate(intervalMs = 3000) {
    this.stopAutoUpdate();
    this._autoUpdateInterval = setInterval(() => {
      this.update();
    }, intervalMs);
  }

  /**
   * Stop auto-updating.
   */
  stopAutoUpdate() {
    if (this._autoUpdateInterval) {
      clearInterval(this._autoUpdateInterval);
      this._autoUpdateInterval = null;
    }
  }

  /**
   * Render participant cards in the dashboard.
   * @param {object[]} participants
   */
  renderParticipantCards(participants) {
    const container = document.getElementById('participant-list');
    if (!container) return;

    // Update participant count badge
    const countEl = document.getElementById('dash-participant-count');
    if (countEl) countEl.textContent = participants.length;

    // Sort by speaking time (descending)
    const sorted = [...participants].sort(
      (a, b) => b.totalTime - a.totalTime
    );

    container.innerHTML = sorted
      .map(
        (p, index) => `
      <div class="participant-card ${p.isSpeaking ? 'speaking' : ''}" style="animation-delay: ${index * 50}ms;">
        <div class="participant-card-header">
          <div class="participant-avatar" style="background: ${p.color}20; border-color: ${p.color};">
            <span style="color: ${p.color}; font-weight: 700; font-size: 14px;">
              ${p.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div class="participant-info">
            <div class="participant-name">
              ${p.name}
              ${p.isSpeaking ? '<span class="speaking-badge">SPEAKING</span>' : ''}
            </div>
            <div class="participant-stats">
              ${p.totalTimeFormatted} · ${p.speakCount} turn${p.speakCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div class="participant-percentage" style="color: ${p.color};">
            ${p.percentage.toFixed(1)}%
          </div>
        </div>
        <div class="speaking-bar-container">
          <div class="speaking-bar" style="width: ${Math.min(p.percentage, 100)}%; background: linear-gradient(90deg, ${p.color}, ${p.color}88);"></div>
        </div>
      </div>
    `
      )
      .join('');
  }

  /**
   * Highlight quiet participants in the dashboard.
   * @param {object[]} participants
   */
  renderQuietAlerts(participants) {
    const section = document.getElementById('quiet-alerts');
    const container = document.getElementById('quiet-alerts-list');
    if (!container || !section) return;

    if (participants.length < 2) {
      section.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    section.style.display = 'block';
    const fairShare = 100 / participants.length;
    const quiet = participants.filter(
      (p) => p.percentage < fairShare / 3
    );

    if (quiet.length === 0) {
      container.innerHTML = `
        <div class="quiet-alert success">
          <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
          Everyone is participating well!
        </div>
      `;
    } else {
      container.innerHTML = quiet
        .map(
          (p) => `
        <div class="quiet-alert warning">
          <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
          <strong>${p.name}</strong> has only spoken ${p.percentage.toFixed(1)}% of the time
        </div>
      `
        )
        .join('');
    }

    // Reinitialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons({ nodes: [container] });
    }
  }

  /**
   * Calculate equity score (0-100) based on speaking distribution.
   * Uses coefficient of variation — lower CV = higher equity.
   * @param {object[]} participants
   * @returns {number}
   */
  calculateEquityScore(participants) {
    if (participants.length <= 1) return 100;

    const percentages = participants.map((p) => p.percentage);

    // Filter out participants who haven't spoken at all (just joined)
    const active = percentages.filter((p) => p > 0);
    if (active.length <= 1) return 100;

    const mean = active.reduce((a, b) => a + b, 0) / active.length;
    if (mean === 0) return 100;

    const variance =
      active.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) /
      active.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // Coefficient of variation

    // Map CV to 0-100 score (CV of 0 = 100 score, CV of 1+ = 0 score)
    return Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
  }

  /**
   * Render the circular equity score indicator.
   * @param {number} score – 0-100
   */
  renderEquityScore(score) {
    const scoreEl = document.getElementById('equity-score');
    const circleEl = document.getElementById('equity-ring-fill');

    if (scoreEl) {
      scoreEl.textContent = score;
    }

    if (circleEl) {
      // SVG circle: circumference = 2πr, r=50 → C ≈ 314
      const circumference = 2 * Math.PI * 50;
      const offset = circumference - (score / 100) * circumference;
      circleEl.style.strokeDasharray = circumference;
      circleEl.style.strokeDashoffset = offset;
    }
  }

  /**
   * Switch between dashboard tabs.
   * @param {string} tabName – 'overview' | 'participants' | 'timeline'
   */
  switchTab(tabName) {
    this._activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.dashboard-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.dashboard-tab-content').forEach((content) => {
      content.classList.toggle('active', content.dataset.tab === tabName);
    });

    // Trigger chart resize when switching to overview tab
    if (tabName === 'overview' && this.charts) {
      setTimeout(() => {
        if (this.charts.pieChart) this.charts.pieChart.resize();
        if (this.charts.barChart) this.charts.barChart.resize();
      }, 100);
    }

    this.update();
  }

  /**
   * Update the meeting time display in the dashboard header.
   */
  _updateMeetingTimeDisplay() {
    const el = document.getElementById('dashboard-meeting-time');
    if (el && this.speakingTimer) {
      el.textContent = this.speakingTimer.formatTimeLong(
        this.speakingTimer.getMeetingDuration()
      );
    }
  }

  /**
   * Update dashboard from server-pushed speaking data.
   * @param {object[]} serverParticipants – data from server
   */
  updateFromServer(serverParticipants) {
    if (!this.isOpen || !serverParticipants) return;
    // Server data supplements client-side tracking
    // We primarily use client-side speakingTimer for accuracy
    this.update();
  }

  /**
   * Destroy and cleanup.
   */
  destroy() {
    this.stopAutoUpdate();
    this.close();
    console.log('[Dashboard] Destroyed');
  }
}

// Export to global scope
window.Dashboard = Dashboard;
