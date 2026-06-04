// ─────────────────────────────────────────────────────────
//  MeetMod — WebRTC Manager
//  PeerJS-based WebRTC connection manager for
//  peer-to-peer video/audio streams.
// ─────────────────────────────────────────────────────────

class WebRTCManager {
  /**
   * @param {object} options
   * @param {Function} options.onRemoteStream      – (socketId, stream, userName) callback
   * @param {Function} options.onRemoteStreamRemoved – (socketId) callback
   */
  constructor(options = {}) {
    this.peer = null;
    this.localStream = null;

    /** @type {Map<string, { peerId: string, call: object, stream: MediaStream }>} */
    this.peers = new Map();

    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onRemoteStreamRemoved = options.onRemoteStreamRemoved || (() => {});

    this._peerIdResolve = null;
    this._peerReady = new Promise((resolve) => {
      this._peerIdResolve = resolve;
    });
  }

  /**
   * Initialize: create PeerJS instance and get user media.
   * @param {object} mediaConstraints – getUserMedia constraints
   * @returns {Promise<MediaStream>} localStream
   */
  async init(mediaConstraints = { video: true, audio: true }) {
    // Get local media stream
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(
        mediaConstraints
      );
    } catch (err) {
      console.error('[WebRTC] Failed to get user media:', err);
      // Fall back to audio only
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
      } catch (audioErr) {
        console.error('[WebRTC] Failed to get any media:', audioErr);
        throw new Error(
          'Could not access camera or microphone. Please check permissions.'
        );
      }
    }

    // Create PeerJS instance
    this.peer = new Peer(undefined, {
      host: '0.peerjs.com',
      secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      },
    });

    // Wait for peer to be ready
    this.peer.on('open', (id) => {
      console.log(`[WebRTC] Peer connected with ID: ${id}`);
      if (this._peerIdResolve) {
        this._peerIdResolve(id);
      }
    });

    // Handle incoming calls
    this.peer.on('call', (call) => {
      console.log('[WebRTC] Incoming call from:', call.peer);
      this.handleIncomingCall(call);
    });

    this.peer.on('error', (err) => {
      console.error('[WebRTC] Peer error:', err);
    });

    this.peer.on('disconnected', () => {
      console.warn('[WebRTC] Peer disconnected, attempting reconnect...');
      if (this.peer && !this.peer.destroyed) {
        this.peer.reconnect();
      }
    });

    return this.localStream;
  }

  /**
   * Get the PeerJS peer ID (waits until peer is ready).
   * @returns {Promise<string>}
   */
  async getPeerId() {
    await this._peerReady;
    return this.peer.id;
  }

  /**
   * Call a remote peer.
   * @param {string} remotePeerId – PeerJS ID of the remote peer
   * @param {string} remoteSocketId – Socket.io ID of the remote peer
   * @param {object} metadata – { userName, socketId } metadata to send
   * @returns {Promise<void>}
   */
  async callPeer(remotePeerId, remoteSocketId, metadata = {}) {
    if (!this.localStream) {
      console.error('[WebRTC] No local stream available');
      return;
    }

    if (this.peers.has(remoteSocketId)) {
      console.warn(`[WebRTC] Already connected to ${remoteSocketId}`);
      return;
    }

    try {
      await this._peerReady;

      console.log(
        `[WebRTC] Calling peer: ${remotePeerId} (socket: ${remoteSocketId})`
      );

      const call = this.peer.call(remotePeerId, this.localStream, {
        metadata: {
          socketId: this.peer.id,
          ...metadata,
        },
      });

      this._setupCallHandlers(call, remoteSocketId);
    } catch (err) {
      console.error(`[WebRTC] Error calling peer ${remotePeerId}:`, err);
    }
  }

  /**
   * Handle an incoming call: answer with localStream.
   * @param {object} call – PeerJS call object
   * @param {string} remoteSocketId – socket ID (if known)
   */
  handleIncomingCall(call, remoteSocketId = null) {
    if (!this.localStream) {
      console.error('[WebRTC] No local stream to answer with');
      return;
    }

    call.answer(this.localStream);

    const socketId =
      remoteSocketId ||
      (call.metadata && call.metadata.socketId) ||
      call.peer;
    this._setupCallHandlers(call, socketId);
  }

  /**
   * Set up event handlers for a PeerJS call.
   * @param {object} call
   * @param {string} remoteSocketId
   */
  _setupCallHandlers(call, remoteSocketId) {
    call.on('stream', (remoteStream) => {
      // Avoid duplicate stream events
      const existing = this.peers.get(remoteSocketId);
      if (existing && existing.stream) {
        console.log(
          `[WebRTC] Duplicate stream from ${remoteSocketId}, skipping`
        );
        return;
      }

      console.log(`[WebRTC] Received stream from ${remoteSocketId}`);

      this.peers.set(remoteSocketId, {
        peerId: call.peer,
        call,
        stream: remoteStream,
      });

      this.onRemoteStream(remoteSocketId, remoteStream);
    });

    call.on('close', () => {
      console.log(`[WebRTC] Call closed with ${remoteSocketId}`);
      this.peers.delete(remoteSocketId);
      this.onRemoteStreamRemoved(remoteSocketId);
    });

    call.on('error', (err) => {
      console.error(`[WebRTC] Call error with ${remoteSocketId}:`, err);
    });
  }

  /**
   * Remove a peer and close their connection.
   * @param {string} socketId
   */
  removePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (peer) {
      if (peer.call) {
        try {
          peer.call.close();
        } catch (e) {
          /* ignore */
        }
      }
      this.peers.delete(socketId);
      this.onRemoteStreamRemoved(socketId);
      console.log(`[WebRTC] Removed peer: ${socketId}`);
    }
  }

  /**
   * Toggle local audio.
   * @param {boolean} muted – true to mute
   */
  toggleAudio(muted) {
    if (!this.localStream) return;
    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !muted;
    });
    console.log(`[WebRTC] Audio ${muted ? 'muted' : 'unmuted'}`);
  }

  /**
   * Toggle local video.
   * @param {boolean} videoOff – true to turn off video
   */
  toggleVideo(videoOff) {
    if (!this.localStream) return;
    const videoTracks = this.localStream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = !videoOff;
    });
    console.log(`[WebRTC] Video ${videoOff ? 'off' : 'on'}`);
  }

  /**
   * Get the local media stream.
   * @returns {MediaStream|null}
   */
  getLocalStream() {
    return this.localStream;
  }

  /**
   * Destroy all connections and cleanup.
   */
  destroy() {
    // Close all peer connections
    for (const [socketId, peer] of this.peers) {
      if (peer.call) {
        try {
          peer.call.close();
        } catch (e) {
          /* ignore */
        }
      }
    }
    this.peers.clear();

    // Stop local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Destroy PeerJS
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        /* ignore */
      }
      this.peer = null;
    }

    console.log('[WebRTC] Destroyed all connections');
  }
}

// Export to global scope
window.WebRTCManager = WebRTCManager;
