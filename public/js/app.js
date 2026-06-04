/* ============================================================
   MeetMod — Landing Page Logic (app.js)
   Room creation, joining, validation, and UI interactions
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // --- DOM Elements ---
  const nameInput     = document.getElementById('user-name');
  const roomCodeInput = document.getElementById('room-code');
  const btnCreate     = document.getElementById('btn-create');
  const btnJoin       = document.getElementById('btn-join');
  const nameError     = document.getElementById('name-error');
  const roomError     = document.getElementById('room-error');

  // --- Validation Helpers ---
  function validateName() {
    const name = nameInput.value.trim();
    if (name.length < 2) {
      showError(nameError, 'Please enter your name (at least 2 characters)');
      nameInput.style.borderColor = 'var(--danger)';
      return false;
    }
    hideError(nameError);
    nameInput.style.borderColor = '';
    return true;
  }

  function validateRoomCode() {
    const code = roomCodeInput.value.trim();
    if (!code || code.length < 3) {
      showError(roomError, 'Please enter a valid room code');
      roomCodeInput.style.borderColor = 'var(--danger)';
      return false;
    }
    hideError(roomError);
    roomCodeInput.style.borderColor = '';
    return true;
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
    // Shake animation
    el.parentElement.style.animation = 'none';
    el.parentElement.offsetHeight; // trigger reflow
    el.parentElement.style.animation = 'shake 0.4s ease-out';
  }

  function hideError(el) {
    el.classList.remove('visible');
  }

  // --- Toast Notifications ---
  function showToast(type, title, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      info:    '💡',
      success: '✅',
      warning: '⚠️',
      danger:  '❌'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || '💡'}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <div class="toast-close" onclick="this.parentElement.remove()">✕</div>
      <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    container.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- Create Room ---
  async function createRoom() {
    if (!validateName()) return;

    const name = nameInput.value.trim();
    btnCreate.disabled = true;
    btnCreate.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;margin-right:8px"></span> Creating...';

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: name })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create room');
      }

      const data = await res.json();
      const roomId = data.roomId || data.room?.id || data.id;

      if (!roomId) {
        throw new Error('No room ID received');
      }

      showToast('success', 'Room Created!', 'Redirecting to your meeting room...');

      // Short delay for visual feedback
      setTimeout(() => {
        window.location.href = `/room.html?roomId=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}`;
      }, 600);

    } catch (err) {
      console.error('Create room error:', err);
      showToast('danger', 'Error', err.message || 'Could not create room. Please try again.');
      resetCreateButton();
    }
  }

  function resetCreateButton() {
    btnCreate.disabled = false;
    btnCreate.innerHTML = '<i data-lucide="plus-circle" style="width:20px;height:20px;margin-right:8px"></i> Create New Room';
    if (window.lucide) lucide.createIcons();
  }

  // --- Join Room ---
  function joinRoom() {
    const nameValid = validateName();
    const codeValid = validateRoomCode();
    if (!nameValid || !codeValid) return;

    const name = nameInput.value.trim();
    const roomId = roomCodeInput.value.trim();

    showToast('info', 'Joining Room', `Connecting to room ${roomId}...`);

    setTimeout(() => {
      window.location.href = `/room.html?roomId=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}`;
    }, 400);
  }

  // --- Event Listeners ---
  btnCreate.addEventListener('click', createRoom);
  btnJoin.addEventListener('click', joinRoom);

  // Clear errors on input
  nameInput.addEventListener('input', () => {
    hideError(nameError);
    nameInput.style.borderColor = '';
  });

  roomCodeInput.addEventListener('input', () => {
    hideError(roomError);
    roomCodeInput.style.borderColor = '';
  });

  // Enter key support
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If room code is filled, join; otherwise create
      if (roomCodeInput.value.trim()) {
        joinRoom();
      } else {
        createRoom();
      }
    }
  });

  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      joinRoom();
    }
  });

  // --- Shake Keyframe (injected) ---
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);

  // --- Feature card hover particles (subtle) ---
  document.querySelectorAll('.feature-card').forEach((card, i) => {
    card.style.animationDelay = `${i * 0.1}s`;
  });

  console.log(
    '%c🎤 MeetMod %c— AI-Powered Meeting Moderation',
    'color: #6c5ce7; font-weight: bold; font-size: 16px;',
    'color: #00cec9; font-size: 14px;'
  );
});
