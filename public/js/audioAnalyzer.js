// ─────────────────────────────────────────────────────────
//  MeetMod — Audio Analyzer
//  Voice activity detection for local and remote streams
//  using hark.js and Web Audio API.
// ─────────────────────────────────────────────────────────

/**
 * AudioAnalyzer — Local stream VAD using hark.js.
 * Detects when the local user starts/stops speaking.
 */
class AudioAnalyzer {
  /**
   * @param {MediaStream} stream – local audio stream
   * @param {Function} onSpeakingChange – callback(isSpeaking: boolean)
   * @param {object} options
   */
  constructor(stream, onSpeakingChange, options = {}) {
    this.stream = stream;
    this.onSpeakingChange = onSpeakingChange;
    this.isSpeaking = false;
    this.harkInstance = null;

    const harkOptions = {
      threshold: options.threshold || -50,
      interval: options.interval || 100,
    };

    try {
      // hark is loaded from CDN as a global
      if (typeof hark === 'function') {
        this.harkInstance = hark(stream, harkOptions);

        this.harkInstance.on('speaking', () => {
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            this.onSpeakingChange(true);
          }
        });

        this.harkInstance.on('stopped_speaking', () => {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.onSpeakingChange(false);
          }
        });

        console.log('[AudioAnalyzer] hark.js VAD initialized');
      } else {
        console.warn(
          '[AudioAnalyzer] hark.js not loaded, falling back to Web Audio API'
        );
        this._initFallback(stream, harkOptions);
      }
    } catch (err) {
      console.error('[AudioAnalyzer] Error initializing hark:', err);
      this._initFallback(stream, harkOptions);
    }
  }

  /**
   * Fallback VAD using Web Audio API when hark.js is unavailable.
   */
  _initFallback(stream, options) {
    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      this.dataArray = new Float32Array(this.analyser.fftSize);
      this.rmsThreshold = 0.02;
      this.consecutiveAbove = 0;
      this.consecutiveBelow = 0;
      this.requiredConsecutive = 3;

      this._pollInterval = setInterval(() => {
        this.analyser.getFloatTimeDomainData(this.dataArray);

        let sumSquares = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          sumSquares += this.dataArray[i] * this.dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / this.dataArray.length);

        if (rms > this.rmsThreshold) {
          this.consecutiveAbove++;
          this.consecutiveBelow = 0;
          if (
            this.consecutiveAbove >= this.requiredConsecutive &&
            !this.isSpeaking
          ) {
            this.isSpeaking = true;
            this.onSpeakingChange(true);
          }
        } else {
          this.consecutiveBelow++;
          this.consecutiveAbove = 0;
          if (
            this.consecutiveBelow >= this.requiredConsecutive * 2 &&
            this.isSpeaking
          ) {
            this.isSpeaking = false;
            this.onSpeakingChange(false);
          }
        }
      }, options.interval || 100);

      console.log('[AudioAnalyzer] Fallback Web Audio VAD initialized');
    } catch (err) {
      console.error('[AudioAnalyzer] Fallback init failed:', err);
    }
  }

  /**
   * Update the hark threshold.
   * @param {number} threshold – dB threshold (e.g. -50)
   */
  setThreshold(threshold) {
    if (this.harkInstance && this.harkInstance.setThreshold) {
      this.harkInstance.setThreshold(threshold);
    } else if (this.rmsThreshold !== undefined) {
      // Convert dB-ish to RMS-ish
      this.rmsThreshold = Math.pow(10, threshold / 50);
    }
  }

  /**
   * Destroy the analyzer and free resources.
   */
  destroy() {
    if (this.harkInstance) {
      try {
        this.harkInstance.stop();
      } catch (e) {
        /* ignore */
      }
      this.harkInstance = null;
    }

    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        /* ignore */
      }
      this.audioContext = null;
    }

    this.isSpeaking = false;
    console.log('[AudioAnalyzer] Destroyed');
  }
}

/**
 * RemoteAudioAnalyzer — VAD for remote participant streams
 * using Web Audio API AnalyserNode (since hark may conflict
 * with multiple instances for remote streams).
 */
class RemoteAudioAnalyzer {
  /**
   * @param {MediaStream} stream – remote audio stream
   * @param {Function} onSpeakingChange – callback(isSpeaking: boolean)
   * @param {object} options
   */
  constructor(stream, onSpeakingChange, options = {}) {
    this.stream = stream;
    this.onSpeakingChange = onSpeakingChange;
    this.isSpeaking = false;
    this._pollInterval = null;

    const threshold = options.threshold || 0.05;
    const interval = options.interval || 100;

    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      this.dataArray = new Float32Array(this.analyser.fftSize);
      this.consecutiveAbove = 0;
      this.consecutiveBelow = 0;

      this._pollInterval = setInterval(() => {
        this.analyser.getFloatTimeDomainData(this.dataArray);

        let sumSquares = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          sumSquares += this.dataArray[i] * this.dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / this.dataArray.length);

        if (rms > threshold) {
          this.consecutiveAbove++;
          this.consecutiveBelow = 0;
          if (this.consecutiveAbove >= 3 && !this.isSpeaking) {
            this.isSpeaking = true;
            this.onSpeakingChange(true);
          }
        } else {
          this.consecutiveBelow++;
          this.consecutiveAbove = 0;
          if (this.consecutiveBelow >= 6 && this.isSpeaking) {
            this.isSpeaking = false;
            this.onSpeakingChange(false);
          }
        }
      }, interval);

      console.log('[RemoteAudioAnalyzer] Initialized');
    } catch (err) {
      console.error('[RemoteAudioAnalyzer] Init failed:', err);
    }
  }

  /**
   * Destroy the analyzer and free resources.
   */
  destroy() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        /* ignore */
      }
      this.audioContext = null;
    }

    this.isSpeaking = false;
    console.log('[RemoteAudioAnalyzer] Destroyed');
  }
}

// Export to global scope
window.AudioAnalyzer = AudioAnalyzer;
window.RemoteAudioAnalyzer = RemoteAudioAnalyzer;
