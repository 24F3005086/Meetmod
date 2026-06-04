// ─────────────────────────────────────────────────────────
//  MeetMod — Room Manager
//  Manages rooms, participants, and host assignments.
// ─────────────────────────────────────────────────────────

const { v4: uuidv4 } = require('uuid');

class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} roomId → Room */
    this.rooms = new Map();
  }

  /**
   * Create a new room and return its ID.
   * @param {string} name - Human-readable room name
   * @returns {string} roomId (UUID)
   */
  createRoom(name) {
    const roomId = uuidv4().slice(0, 8); // Short 8-char ID for easy sharing
    const room = {
      id: roomId,
      name: name || `Room ${roomId}`,
      createdAt: Date.now(),
      hostSocketId: null,
      participants: new Map(),
    };
    this.rooms.set(roomId, room);
    console.log(`[RoomManager] Room created: ${roomId} — "${room.name}"`);
    return roomId;
  }

  /**
   * Check whether a room exists.
   * @param {string} roomId
   * @returns {boolean}
   */
  roomExists(roomId) {
    return this.rooms.has(roomId);
  }

  /**
   * Get room info (safe copy for API responses).
   * @param {string} roomId
   * @returns {object|null}
   */
  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt,
      hostSocketId: room.hostSocketId,
      participantCount: room.participants.size,
      participants: this.getParticipants(roomId),
    };
  }

  /**
   * Add a participant to a room. First joiner becomes host.
   * @param {string} roomId
   * @param {string} socketId
   * @param {string} name
   * @returns {object} participant data
   */
  addParticipant(roomId, socketId, name) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = {
      id: socketId,
      name: name || 'Anonymous',
      isMuted: false,
      isVideoOff: false,
      joinedAt: Date.now(),
    };

    room.participants.set(socketId, participant);

    // First participant becomes host
    if (!room.hostSocketId || !room.participants.has(room.hostSocketId)) {
      room.hostSocketId = socketId;
      console.log(`[RoomManager] ${name} is now host of room ${roomId}`);
    }

    console.log(
      `[RoomManager] ${name} joined room ${roomId} (${room.participants.size} participants)`
    );
    return participant;
  }

  /**
   * Remove a participant from a room.
   * @param {string} roomId
   * @param {string} socketId
   * @returns {number} remaining participant count
   */
  removeParticipant(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    const participant = room.participants.get(socketId);
    const name = participant ? participant.name : 'Unknown';
    room.participants.delete(socketId);

    // If host left, reassign
    if (room.hostSocketId === socketId) {
      const remaining = Array.from(room.participants.keys());
      room.hostSocketId = remaining.length > 0 ? remaining[0] : null;
      if (room.hostSocketId) {
        const newHost = room.participants.get(room.hostSocketId);
        console.log(
          `[RoomManager] Host reassigned to ${newHost.name} in room ${roomId}`
        );
      }
    }

    console.log(
      `[RoomManager] ${name} left room ${roomId} (${room.participants.size} remaining)`
    );
    return room.participants.size;
  }

  /**
   * Get all participants as an array.
   * @param {string} roomId
   * @returns {object[]}
   */
  getParticipants(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  /**
   * Partially update a participant's state (mute, video, etc.).
   * @param {string} roomId
   * @param {string} socketId
   * @param {object} updates
   */
  updateParticipant(roomId, socketId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(socketId);
    if (!participant) return;

    Object.assign(participant, updates);
  }

  /**
   * Check if a given socket is the host of a room.
   * @param {string} roomId
   * @param {string} socketId
   * @returns {boolean}
   */
  isHost(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.hostSocketId === socketId;
  }

  /**
   * Delete a room and all its data.
   * @param {string} roomId
   */
  deleteRoom(roomId) {
    if (this.rooms.has(roomId)) {
      console.log(`[RoomManager] Room deleted: ${roomId}`);
      this.rooms.delete(roomId);
    }
  }
}

module.exports = { RoomManager };
