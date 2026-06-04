// ─────────────────────────────────────────────────────────
//  MeetMod — Main Server
//  Express + Socket.io server with WebRTC signaling,
//  speaking-time tracking, and AI moderation.
// ─────────────────────────────────────────────────────────

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const { RoomManager } = require('./roomManager');
const { SpeakingTracker } = require('./speakingTracker');
const { ModerationEngine } = require('./moderationEngine');
const SessionReport = require('./models/SessionReport');

// ─── App Setup ───────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Database Setup (MongoDB) ─────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/meetmod';
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('📁 Connected to MongoDB database successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ─── Core Instances ──────────────────────────────────────
const roomManager = new RoomManager();
const speakingTracker = new SpeakingTracker();
const moderationEngines = new Map(); // roomId → ModerationEngine

// Track socket → room mapping for disconnect cleanup
const socketRooms = new Map(); // socketId → roomId

// ─── REST API Routes ─────────────────────────────────────

/**
 * POST /api/rooms
 * Create a new room. Body: { roomName: string }
 */
app.post('/api/rooms', (req, res) => {
  try {
    const { roomName } = req.body;
    const roomId = roomManager.createRoom(roomName);

    // Initialize tracking and moderation for this room
    speakingTracker.initRoom(roomId);
    moderationEngines.set(roomId, new ModerationEngine());

    const room = roomManager.getRoomInfo(roomId);
    res.status(201).json({
      success: true,
      roomId: room.id,
      roomName: room.name,
    });
  } catch (err) {
    console.error('[API] Error creating room:', err);
    res.status(500).json({ success: false, error: 'Failed to create room' });
  }
});

/**
 * GET /api/rooms/:roomId
 * Check if a room exists, return room info.
 */
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomManager.roomExists(roomId)) {
      return res
        .status(404)
        .json({ success: false, error: 'Room not found' });
    }

    const room = roomManager.getRoomInfo(roomId);
    res.json({ success: true, room });
  } catch (err) {
    console.error('[API] Error fetching room:', err);
    res
      .status(500)
      .json({ success: false, error: 'Failed to fetch room info' });
  }
});

/**
 * GET /api/rooms/:roomId/report
 * Get meeting speaking report.
 */
app.get('/api/rooms/:roomId/report', (req, res) => {
  try {
    const { roomId } = req.params;
    const report = speakingTracker.getMeetingReport(roomId);
    if (!report) {
      return res
        .status(404)
        .json({ success: false, error: 'Room not found' });
    }
    res.json({ success: true, report });
  } catch (err) {
    console.error('[API] Error fetching report:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

/**
 * GET /api/reports/:roomId
 * Get persistent meeting report from MongoDB database.
 */
app.get('/api/reports/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const report = await SessionReport.findOne({ roomId });
    if (!report) {
      return res
        .status(404)
        .json({ success: false, error: 'Report not found for this room' });
    }
    res.json({ success: true, report });
  } catch (err) {
    console.error('[API] Error fetching DB report:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch report from database' });
  }
});

// ─── SPA Catch-all ───────────────────────────────────────
// Only catch routes that don't have a file extension (SPA routes)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Only serve index.html for paths without file extensions
  if (!req.path.includes('.')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  next();
});

// ─── Socket.io Connection Handling ───────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Join Room ──────────────────────────────────────────
  socket.on('join-room', ({ roomId, userName, peerId }) => {
    try {
      if (!roomManager.roomExists(roomId)) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
      }

      // Join socket.io room
      socket.join(roomId);
      socketRooms.set(socket.id, roomId);

      // Add participant
      const participant = roomManager.addParticipant(
        roomId,
        socket.id,
        userName
      );
      speakingTracker.addParticipant(roomId, socket.id, userName);

      const isHost = roomManager.isHost(roomId, socket.id);

      // Send room state to the joiner
      const roomInfo = roomManager.getRoomInfo(roomId);
      const modEngine = moderationEngines.get(roomId);
      socket.emit('room-state', {
        participants: roomInfo.participants,
        hostSocketId: roomInfo.hostSocketId,
        isHost,
        moderationConfig: modEngine ? modEngine.getConfig() : null,
      });

      // Broadcast to others in room
      socket.to(roomId).emit('user-connected', {
        socketId: socket.id,
        userName,
        peerId,
        isHost,
      });

      console.log(
        `[Socket] ${userName} joined room ${roomId} (host: ${isHost})`
      );
    } catch (err) {
      console.error('[Socket] Error joining room:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // ── WebRTC Signaling ───────────────────────────────────
  socket.on('offer', ({ to, offer }) => {
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // ── Speaking Events ────────────────────────────────────
  socket.on('speaking-start', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    speakingTracker.startSpeaking(roomId, socket.id);
    socket.to(roomId).emit('peer-speaking-start', {
      socketId: socket.id,
    });
  });

  socket.on('speaking-stop', ({ duration } = {}) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    speakingTracker.stopSpeaking(roomId, socket.id);

    // Reset moderation warnings for this user
    const modEngine = moderationEngines.get(roomId);
    if (modEngine) {
      modEngine.resetUserWarnings(socket.id);
    }

    socket.to(roomId).emit('peer-speaking-stop', {
      socketId: socket.id,
      duration,
    });
  });

  // ── Mute / Video Toggle ────────────────────────────────
  socket.on('mute-changed', ({ isMuted }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    roomManager.updateParticipant(roomId, socket.id, { isMuted });

    // If unmuted, notify moderation engine
    const modEngine = moderationEngines.get(roomId);
    if (modEngine) {
      if (isMuted) {
        modEngine.onMuted(socket.id);
      } else {
        modEngine.onUnmuted(socket.id);
      }
    }

    socket.to(roomId).emit('peer-mute-changed', {
      socketId: socket.id,
      isMuted,
    });
  });

  socket.on('video-changed', ({ isVideoOff }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    roomManager.updateParticipant(roomId, socket.id, { isVideoOff });
    socket.to(roomId).emit('peer-video-changed', {
      socketId: socket.id,
      isVideoOff,
    });
  });

  // ── Chat Messages ──────────────────────────────────────
  socket.on('chat-message', ({ message }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = roomManager.getRoomInfo(roomId);
    const participant = room.participants.find((p) => p.id === socket.id);
    const senderName = participant ? participant.name : 'Unknown';

    io.to(roomId).emit('chat-message', {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      sender: senderName,
      senderId: socket.id,
      message,
      timestamp: Date.now(),
    });
  });

  // ── Moderation Settings (Host only) ────────────────────
  socket.on('update-moderation-settings', ({ settings }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    // Only the host can update moderation settings
    if (!roomManager.isHost(roomId, socket.id)) {
      socket.emit('error', { message: 'Only the host can change moderation settings' });
      return;
    }

    const modEngine = moderationEngines.get(roomId);
    if (modEngine) {
      modEngine.updateConfig(settings);

      // Broadcast updated settings to all room members
      io.to(roomId).emit('moderation-settings-updated', {
        config: modEngine.getConfig(),
      });
    }
  });

  // ── Exempt / Unexempt participant (Host only) ──────────
  socket.on('set-exempt', ({ targetSocketId, exempt }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    if (!roomManager.isHost(roomId, socket.id)) return;

    const modEngine = moderationEngines.get(roomId);
    if (modEngine) {
      modEngine.setExempt(targetSocketId, exempt);
    }
  });

  // ── Admin manual mute / kick (Host only) ───────────────
  socket.on('admin-mute-user', ({ targetSocketId }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    if (!roomManager.isHost(roomId, socket.id)) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('moderation-mute', { reason: 'Muted by Host' });

      // Stop their active speaking tracking
      speakingTracker.stopSpeaking(roomId, targetSocketId);

      // Broadcast mute status to the room
      io.to(roomId).emit('peer-mute-changed', {
        socketId: targetSocketId,
        isMuted: true,
      });
      roomManager.updateParticipant(roomId, targetSocketId, {
        isMuted: true,
      });

      // Update moderation engine cooldown/state
      const modEngine = moderationEngines.get(roomId);
      if (modEngine) {
        modEngine.onMuted(targetSocketId);
      }
    }
  });

  socket.on('admin-kick-user', ({ targetSocketId }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    if (!roomManager.isHost(roomId, socket.id)) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('admin-kicked');
      targetSocket.disconnect();
    }
  });

  // ── Disconnect ─────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const roomId = socketRooms.get(socket.id);
      if (!roomId) return;

      // Stop speaking if they were
      speakingTracker.stopSpeaking(roomId, socket.id);
      speakingTracker.removeParticipant(roomId, socket.id);

      // Cleanup moderation state
      const modEngine = moderationEngines.get(roomId);
      if (modEngine) {
        modEngine.removeUser(socket.id);
      }

      // Remove from room
      const remaining = roomManager.removeParticipant(roomId, socket.id);

      // Broadcast to remaining participants
      socket.to(roomId).emit('user-disconnected', {
        socketId: socket.id,
      });

      // If host changed, notify remaining
      if (remaining > 0) {
        const roomInfo = roomManager.getRoomInfo(roomId);
        io.to(roomId).emit('host-changed', {
          hostSocketId: roomInfo.hostSocketId,
        });
      }

      // Cleanup empty rooms
      if (remaining === 0) {
        console.log(`[Socket] Room ${roomId} is empty, compiling and saving report...`);
        try {
          const roomInfo = roomManager.getRoomInfo(roomId);
          const roomName = roomInfo ? roomInfo.name : `Room ${roomId}`;
          const reportData = speakingTracker.getMeetingReport(roomId);

          if (reportData && reportData.participants && reportData.participants.length > 0) {
            const finalReport = new SessionReport({
              roomId: reportData.roomId,
              roomName: roomName,
              totalMeetingTime: reportData.totalMeetingTime,
              participantCount: reportData.participantCount,
              equityScore: reportData.equityScore,
              participants: reportData.participants
            });
            await finalReport.save();
            console.log(`[Database] Session report for ${roomId} saved successfully!`);
          } else {
            console.log(`[Database] Room ${roomId} has no participant logs, skipping report save.`);
          }
        } catch (dbErr) {
          console.error('[Database] Failed to save session report:', dbErr);
        }

        roomManager.deleteRoom(roomId);
        speakingTracker.deleteRoom(roomId);
        moderationEngines.delete(roomId);
      }

      socketRooms.delete(socket.id);
      console.log(`[Socket] Disconnected: ${socket.id}`);
    } catch (err) {
      console.error('[Socket] Error handling disconnect:', err);
    }
  });
});

// ─── Moderation Check Loop ───────────────────────────────
// Runs every second, checks all rooms for moderation actions
setInterval(() => {
  for (const [roomId, modEngine] of moderationEngines) {
    if (!modEngine.enabled) continue;

    const room = roomManager.getRoomInfo(roomId);
    if (!room || room.participantCount < 2) continue;

    // Check each participant
    for (const participant of room.participants) {
      const continuousSec = speakingTracker.getContinuousSpeakingTime(
        roomId,
        participant.id
      );
      if (continuousSec <= 0) continue;

      const action = modEngine.check(roomId, participant.id, continuousSec);
      if (!action) continue;

      const targetSocket = io.sockets.sockets.get(action.participantId);
      if (!targetSocket) continue;

      switch (action.action) {
        case 'WARNING':
          targetSocket.emit('moderation-warning', {
            message: action.message,
          });
          break;

        case 'COUNTDOWN':
          targetSocket.emit('moderation-countdown', {
            remainingSec: action.remainingSec,
          });
          break;

        case 'MUTE':
          targetSocket.emit('moderation-mute', {
            reason: action.reason,
          });
          modEngine.onMuted(action.participantId);

          // Stop their speaking tracking
          speakingTracker.stopSpeaking(roomId, action.participantId);

          // Broadcast mute change to room
          io.to(roomId).emit('peer-mute-changed', {
            socketId: action.participantId,
            isMuted: true,
          });
          roomManager.updateParticipant(roomId, action.participantId, {
            isMuted: true,
          });
          break;
      }
    }

    // Nudge the quietest participant (every 60 seconds, only if room has been going 5+ min)
    const speakingData = speakingTracker.getSpeakingData(roomId);
    if (speakingData.length >= 3) {
      const quietest = speakingData.find(
        (p) =>
          p.percentage < 100 / speakingData.length / 3 &&
          !p.isSpeaking &&
          p.totalTime > 0
      );
      if (quietest) {
        const targetSocket = io.sockets.sockets.get(quietest.socketId);
        if (targetSocket && Math.random() < 0.016) {
          // ~once per 60s
          targetSocket.emit('moderation-nudge', {
            message:
              "You've been quiet — feel free to jump in and share your thoughts!",
          });
        }
      }
    }
  }
}, 1000);

// ─── Periodic Speaking Data Broadcast ────────────────────
// Send updated speaking data to all rooms every 3 seconds
setInterval(() => {
  for (const [roomId] of moderationEngines) {
    const speakingData = speakingTracker.getSpeakingData(roomId);
    if (speakingData.length > 0) {
      io.to(roomId).emit('speaking-data-update', { participants: speakingData });
    }
  }
}, 3000);

// ─── Start Server ────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🎙️  MeetMod Server Running                ║
║   📡  http://localhost:${PORT}                  ║
║   🔌  Socket.io ready                        ║
║   🛡️  Moderation engine active               ║
║                                              ║
╚══════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
