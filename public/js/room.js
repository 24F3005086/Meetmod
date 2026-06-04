// ─────────────────────────────────────────────────────────
//  MeetMod — Room Controller
//  Main entry point for the meeting room.
// ─────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ─── Parse URL Parameters ────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('roomId');
  const userName = params.get('name') || 'Guest';

  if (!roomId) {
    alert('No room ID provided. Redirecting to home.');
    window.location.href = '/';
    return;
  }

  // ─── State ───────────────────────────────────────────
  let isMuted = false;
  let isVideoOff = false;
  let isHost = false;
  let mySocketId = null;
  let localStream = null;
  let localAnalyzer = null;
  let webrtc = null;
  let moderator = null;
  const participantNames = new Map();
  const remoteAnalyzers = new Map();
  let isChatOpen = false;

  // ─── Initialize Managers (safe) ──────────────────────
  const notifications = new NotificationManager();
  const speakingTimer = new SpeakingTimer();
  const charts = new AnalyticsCharts();
  const dashboard = new Dashboard(speakingTimer, charts);

  // ─── Display room code ───────────────────────────────
  const codeDisplay = document.getElementById('room-code-display');
  if (codeDisplay) codeDisplay.textContent = roomId.slice(0, 8);

  // ─── Init Lucide Icons ───────────────────────────────
  if (window.lucide) lucide.createIcons();

  // ─── Socket.io ───────────────────────────────────────
  const socket = io(window.location.origin);

  socket.on('connect', () => {
    console.log('[Room] Socket connected:', socket.id);
    mySocketId = socket.id;
  });

  socket.on('connect_error', (err) => {
    console.error('[Room] Socket connection error:', err);
    notifications.show('Connection error. Please refresh.', 'danger', 10000);
  });

  // ─── Verify Room & Start ─────────────────────────────
  fetch(`/api/rooms/${roomId}`)
    .then((res) => {
      if (!res.ok) throw new Error('Room not found');
      return res.json();
    })
    .then((data) => {
      if (data.room && data.room.name) {
        document.getElementById('room-name').textContent = data.room.name;
      }
      initMedia();
    })
    .catch((err) => {
      console.error('[Room] Room verification failed:', err);
      alert('Room not found. It may have expired.');
      window.location.href = '/';
    });

  // ─── Initialize Media ────────────────────────────────
  async function initMedia() {
    // Create WebRTC manager
    webrtc = new WebRTCManager({
      onRemoteStream: (socketId, stream) => {
        const name = participantNames.get(socketId) || 'Participant';
        addVideoTile(socketId, name, stream);
        try {
          const analyzer = new RemoteAudioAnalyzer(stream, (speaking) => {
            if (speaking) {
              speakingTimer.startSpeaking(socketId);
              updateSpeakingIndicator(socketId, true);
            } else {
              speakingTimer.stopSpeaking(socketId);
              updateSpeakingIndicator(socketId, false);
            }
          });
          remoteAnalyzers.set(socketId, analyzer);
        } catch (e) {
          console.warn('[Room] Remote audio analyzer failed:', e);
        }
      },
      onRemoteStreamRemoved: (socketId) => {
        removeVideoTile(socketId);
        const analyzer = remoteAnalyzers.get(socketId);
        if (analyzer) { analyzer.destroy(); remoteAnalyzers.delete(socketId); }
      },
    });

    // Create moderator
    moderator = new Moderator(socket, speakingTimer, notifications, webrtc);
    moderator.onForceMuted(() => {
      isMuted = true;
      updateMuteButton();
      updateMuteIcon('local', true);
    });

    // Get camera/mic
    try {
      localStream = await webrtc.init();
      addVideoTile('local', `${userName} (You)`, localStream, true);
    } catch (err) {
      console.error('[Room] Camera/mic failed:', err);
      notifications.show(
        'Could not access camera/microphone. You can still join to listen.',
        'warning',
        8000
      );
      // Create a silent dummy stream so room still works
      try {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        oscillator.connect(dest);
        localStream = dest.stream;
      } catch (e) {
        // Last resort: empty stream
        localStream = new MediaStream();
      }
      addVideoTile('local', `${userName} (You)`, localStream, true);
    }

    // Local audio analysis
    try {
      if (localStream && localStream.getAudioTracks().length > 0) {
        localAnalyzer = new AudioAnalyzer(localStream, (speaking) => {
          if (isMuted) return;
          if (speaking) {
            socket.emit('speaking-start');
            speakingTimer.startSpeaking('local');
            updateSpeakingIndicator('local', true);
          } else {
            socket.emit('speaking-stop', { duration: 0 });
            speakingTimer.stopSpeaking('local');
            updateSpeakingIndicator('local', false);
          }
        });
      }
    } catch (e) {
      console.warn('[Room] Local audio analyzer failed:', e);
    }

    // Add self to speaking timer
    speakingTimer.addParticipant('local', userName);

    // Join room via Socket.io
    try {
      const peerId = await webrtc.getPeerId();
      socket.emit('join-room', { roomId, userName, peerId });
    } catch (e) {
      console.warn('[Room] PeerJS ID not ready, joining without peerId');
      socket.emit('join-room', { roomId, userName, peerId: null });
    }

    // Init charts
    try {
      charts.initPieChart('chart-distribution');
      charts.initBarChart('chart-timeline');
    } catch (e) {
      console.warn('[Room] Charts init failed:', e);
    }

    // Start dashboard auto-update
    dashboard.startAutoUpdate(3000);

    // Start meeting timer
    startMeetingTimer();

    // Start speaking time update loop
    startSpeakingTimeLoop();

    console.log(`[Room] Initialized — User: ${userName}, Room: ${roomId}`);
  }

  // ─── Socket.io Event Handlers ────────────────────────

  socket.on('room-state', (state) => {
    isHost = state.isHost;

    if (state.participants) {
      const participants = Array.isArray(state.participants)
        ? state.participants
        : Object.values(state.participants);

      document.getElementById('participant-count').textContent = participants.length;

      participants.forEach((p) => {
        if (p.id !== socket.id) {
          participantNames.set(p.id, p.name);
          speakingTimer.addParticipant(p.id, p.name);
        }
      });
    }

    if (state.moderationConfig) applyModerationConfig(state.moderationConfig);

    notifications.show(
      `Joined as ${userName}${isHost ? ' (Host)' : ''}`,
      'success',
      3000
    );
  });

  socket.on('user-connected', async ({ socketId, userName: remoteName, peerId: remotePeerId }) => {
    console.log(`[Room] User connected: ${remoteName}`);
    participantNames.set(socketId, remoteName);
    speakingTimer.addParticipant(socketId, remoteName);

    if (remotePeerId && webrtc) {
      try {
        await webrtc.callPeer(remotePeerId, socketId, { userName, socketId: socket.id });
      } catch (e) {
        console.error('[Room] Failed to call peer:', e);
      }
    }

    updateParticipantCount();
    notifications.show(`${remoteName} joined the meeting`, 'info', 3000);
  });

  socket.on('user-disconnected', ({ socketId }) => {
    const name = participantNames.get(socketId) || 'Participant';
    if (webrtc) webrtc.removePeer(socketId);
    removeVideoTile(socketId);
    speakingTimer.removeParticipant(socketId);
    participantNames.delete(socketId);
    const analyzer = remoteAnalyzers.get(socketId);
    if (analyzer) { analyzer.destroy(); remoteAnalyzers.delete(socketId); }
    updateParticipantCount();
    notifications.show(`${name} left the meeting`, 'warning', 3000);
  });

  socket.on('peer-speaking-start', ({ socketId }) => {
    speakingTimer.startSpeaking(socketId);
    updateSpeakingIndicator(socketId, true);
  });

  socket.on('peer-speaking-stop', ({ socketId }) => {
    speakingTimer.stopSpeaking(socketId);
    updateSpeakingIndicator(socketId, false);
  });

  socket.on('peer-mute-changed', ({ socketId, isMuted: muted }) => {
    updateMuteIcon(socketId, muted);
  });

  socket.on('peer-video-changed', ({ socketId, isVideoOff: off }) => {
    const tile = document.getElementById(`tile-${socketId}`);
    if (tile) {
      const video = tile.querySelector('video');
      const avatar = tile.querySelector('.tile-avatar');
      if (video) video.style.display = off ? 'none' : 'block';
      if (avatar) avatar.style.display = off ? 'flex' : 'none';
    }
  });

  socket.on('speaking-data-update', ({ participants }) => {
    if (dashboard) dashboard.updateFromServer(participants);
  });

  socket.on('host-changed', ({ hostSocketId }) => {
    isHost = hostSocketId === socket.id;
    if (isHost) notifications.show('You are now the host', 'info', 4000);
  });

  socket.on('moderation-settings-updated', ({ config }) => {
    applyModerationConfig(config);
  });

  // Chat message receiver
  socket.on('chat-message', (data) => {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // Remove empty state
    const empty = chatMessages.querySelector('.empty-state');
    if (empty) empty.remove();

    const isSelf = data.senderId === socket.id;
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgItem = document.createElement('div');
    msgItem.className = `chat-message-item ${isSelf ? 'self' : 'other'}`;
    msgItem.innerHTML = `
      ${!isSelf ? `<span class="chat-message-sender">${data.sender}</span>` : ''}
      <div class="chat-message-bubble">${escapeHtml(data.message)}</div>
      <span class="chat-message-time">${time}</span>
    `;

    chatMessages.appendChild(msgItem);
    scrollToChatBottom();

    // Show unread badge if closed
    if (!isChatOpen) {
      const badge = document.getElementById('chat-badge');
      if (badge) badge.style.display = 'block';
      notifications.show(`New message from ${data.sender}`, 'info', 2000);
    }
  });

  // ─── UI Event Handlers ───────────────────────────────

  // Mute
  document.getElementById('btn-mic').addEventListener('click', () => {
    isMuted = !isMuted;
    if (webrtc) webrtc.toggleAudio(isMuted);
    socket.emit('mute-changed', { isMuted });
    updateMuteButton();
    updateMuteIcon('local', isMuted);
    if (isMuted) {
      speakingTimer.stopSpeaking('local');
      updateSpeakingIndicator('local', false);
    }
  });

  // Camera
  document.getElementById('btn-camera').addEventListener('click', () => {
    isVideoOff = !isVideoOff;
    if (webrtc) webrtc.toggleVideo(isVideoOff);
    socket.emit('video-changed', { isVideoOff });
    updateVideoButton();
    const localTile = document.getElementById('tile-local');
    if (localTile) {
      const video = localTile.querySelector('video');
      const avatar = localTile.querySelector('.tile-avatar');
      if (video) video.style.display = isVideoOff ? 'none' : 'block';
      if (avatar) avatar.style.display = isVideoOff ? 'flex' : 'none';
    }
  });

  // Analytics
  document.getElementById('btn-analytics').addEventListener('click', () => {
    dashboard.toggle();
    document.getElementById('btn-analytics').classList.toggle('active');
    if (dashboard.isOpen && isChatOpen) {
      toggleChat();
    }
  });

  const dashClose = document.getElementById('dashboard-close');
  if (dashClose) dashClose.addEventListener('click', () => {
    dashboard.toggle();
    document.getElementById('btn-analytics').classList.remove('active');
  });

  const backdrop = document.getElementById('dashboard-backdrop');
  if (backdrop) backdrop.addEventListener('click', () => {
    dashboard.toggle();
    document.getElementById('btn-analytics').classList.remove('active');
  });

  // Chat Panel togglers
  const btnChat = document.getElementById('btn-chat');
  if (btnChat) btnChat.addEventListener('click', toggleChat);

  const chatClose = document.getElementById('chat-close');
  if (chatClose) chatClose.addEventListener('click', toggleChat);

  // Chat Form submission
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      socket.emit('chat-message', { message: text });
      chatInput.value = '';
    });
  }

  // Dashboard tabs
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dashboard-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById(`tab-${tab.dataset.tab}`);
      if (content) content.classList.add('active');
    });
  });

  // Leave
  document.getElementById('btn-leave').addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the meeting?')) {
      cleanup();
      window.location.href = `/report.html?roomId=${encodeURIComponent(roomId)}`;
    }
  });

  // Settings modal
  const settingsModal = document.getElementById('settings-modal');
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.add('active');
  });

  const modalClose = document.getElementById('modal-settings-close');
  if (modalClose) modalClose.addEventListener('click', () => settingsModal.classList.remove('active'));

  const modalCancel = document.getElementById('modal-settings-cancel');
  if (modalCancel) modalCancel.addEventListener('click', () => settingsModal.classList.remove('active'));

  const modalSave = document.getElementById('modal-settings-save');
  if (modalSave) modalSave.addEventListener('click', () => {
    const settings = {
      enabled: document.getElementById('modal-auto-mute')?.checked ?? true,
      warningThresholdSec: parseInt(document.getElementById('modal-threshold')?.value || '120', 10),
      nudgeEnabled: document.getElementById('modal-nudge')?.checked ?? true,
    };
    socket.emit('update-moderation-settings', { settings });
    settingsModal.classList.remove('active');
    notifications.show('Moderation settings updated', 'success', 3000);
  });

  if (settingsModal) settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
  });

  // Copy room code
  const roomCodeBadge = document.getElementById('room-code-badge');
  if (roomCodeBadge) {
    roomCodeBadge.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(roomId);
        notifications.show('Room code copied to clipboard!', 'success', 2000);
      } catch {
        notifications.show(`Room code: ${roomId}`, 'info', 5000);
      }
    });
  }

  // Screen share
  const btnScreen = document.getElementById('btn-screen');
  if (btnScreen) btnScreen.addEventListener('click', async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const localVideo = document.querySelector('#tile-local video');
      if (localVideo) localVideo.srcObject = screenStream;
      screenStream.getVideoTracks()[0].onended = () => {
        if (localVideo && localStream) localVideo.srcObject = localStream;
        btnScreen.classList.remove('active');
      };
      btnScreen.classList.add('active');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        notifications.show('Failed to share screen', 'danger', 3000);
      }
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key.toLowerCase()) {
      case 'm': document.getElementById('btn-mic').click(); break;
      case 'v': document.getElementById('btn-camera').click(); break;
      case 'd': document.getElementById('btn-analytics').click(); break;
    }
  });

  // ─── Video Grid Functions ────────────────────────────

  function addVideoTile(socketId, name, stream, isLocal) {
    const grid = document.getElementById('video-grid');
    if (!grid || document.getElementById(`tile-${socketId}`)) return;

    const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    const colors = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#e17055', '#0984e3', '#00b894'];
    const color = colors[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];

    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = `tile-${socketId}`;
    tile.innerHTML = `
      <video autoplay ${isLocal ? 'muted' : ''} playsinline></video>
      <div class="tile-avatar" style="display:none;background:${color}">
        <span>${initials}</span>
      </div>
      <div class="tile-overlay">
        <div class="tile-info">
          <span class="tile-name">${name}</span>
          <span class="tile-time" id="time-${socketId}">0:00</span>
        </div>
        <div class="tile-indicators">
          <span class="tile-mute-icon" id="mute-icon-${socketId}" style="display:none">
            <i data-lucide="mic-off" style="width:14px;height:14px;color:#ff7675"></i>
          </span>
        </div>
      </div>
    `;

    const video = tile.querySelector('video');
    if (stream) {
      video.srcObject = stream;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }

    grid.appendChild(tile);
    updateGridLayout();
    if (window.lucide) lucide.createIcons({ nodes: [tile] });
  }

  function removeVideoTile(socketId) {
    const tile = document.getElementById(`tile-${socketId}`);
    if (tile) { tile.remove(); updateGridLayout(); }
  }

  function updateGridLayout() {
    const grid = document.getElementById('video-grid');
    if (!grid) return;
    const count = grid.children.length;
    grid.setAttribute('data-count', count);
    document.getElementById('participant-count').textContent = count;
  }

  function updateSpeakingIndicator(socketId, speaking) {
    const tile = document.getElementById(`tile-${socketId}`);
    if (tile) tile.classList.toggle('speaking', speaking);
  }

  function updateMuteIcon(socketId, muted) {
    const icon = document.getElementById(`mute-icon-${socketId}`);
    if (icon) icon.style.display = muted ? 'inline-flex' : 'none';
  }

  function updateMuteButton() {
    const btn = document.getElementById('btn-mic');
    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isMuted ? 'mic-off' : 'mic');
      if (window.lucide) lucide.createIcons({ nodes: [btn] });
    }
    btn.classList.toggle('muted', isMuted);
    btn.classList.toggle('active', isMuted);
  }

  function updateVideoButton() {
    const btn = document.getElementById('btn-camera');
    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isVideoOff ? 'video-off' : 'video');
      if (window.lucide) lucide.createIcons({ nodes: [btn] });
    }
    btn.classList.toggle('active', isVideoOff);
  }

  function updateParticipantCount() {
    const grid = document.getElementById('video-grid');
    const count = grid ? grid.children.length : 1;
    document.getElementById('participant-count').textContent = count;
  }

  function applyModerationConfig(config) {
    if (!config) return;
    const fields = {
      'setting-auto-mod': config.enabled !== false,
      'modal-auto-mute': config.enabled !== false,
      'setting-nudge': config.nudgeEnabled !== false,
      'modal-nudge': config.nudgeEnabled !== false,
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.checked = val;
    });
    if (config.warningThresholdSec) {
      ['setting-threshold', 'modal-threshold'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = config.warningThresholdSec;
      });
    }
  }

  // ─── Timers ──────────────────────────────────────────

  function startMeetingTimer() {
    const start = Date.now();
    setInterval(() => {
      const elapsed = Date.now() - start;
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      const el = document.getElementById('meeting-timer');
      if (el) el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
  }

  function startSpeakingTimeLoop() {
    setInterval(() => {
      speakingTimer.getAll().forEach((p) => {
        const el = document.getElementById(`time-${p.socketId}`);
        if (el) el.textContent = speakingTimer.formatTime(speakingTimer.getTotalTime(p.socketId));
      });
    }, 1000);
  }

  // ─── Cleanup ─────────────────────────────────────────

  function cleanup() {
    if (localAnalyzer) localAnalyzer.destroy();
    remoteAnalyzers.forEach((a) => a.destroy());
    if (webrtc) webrtc.destroy();
    socket.disconnect();
    if (dashboard) dashboard.stopAutoUpdate();
  }

  // ─── Helper Functions ────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToChatBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function toggleChat() {
    isChatOpen = !isChatOpen;
    const chatPanel = document.getElementById('chat-panel');
    const btnChat = document.getElementById('btn-chat');
    const chatBadge = document.getElementById('chat-badge');
    const chatInput = document.getElementById('chat-input');

    if (chatPanel) chatPanel.classList.toggle('open', isChatOpen);
    if (btnChat) btnChat.classList.toggle('active', isChatOpen);

    if (isChatOpen) {
      if (chatBadge) chatBadge.style.display = 'none';
      scrollToChatBottom();
      if (chatInput) chatInput.focus();

      // Close dashboard to avoid overlap
      if (dashboard && dashboard.isOpen) {
        dashboard.toggle();
        const btnAnalytics = document.getElementById('btn-analytics');
        if (btnAnalytics) btnAnalytics.classList.remove('active');
      }
    }
  }

  window.addEventListener('beforeunload', cleanup);
})();
