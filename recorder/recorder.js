/**
 * Recording Engine for Auto Cursor Replay Extension
 * Listens for mouse events on webpage and records timestamped movement, clicks, double-clicks, and scrolls.
 */

class CursorRecorder {
  constructor(options = {}) {
    this.isRecording = false;
    this.startTime = 0;
    this.events = [];
    this.lastMoveTime = 0;
    this.moveThrottleMs = 25; // ~40fps coordinate sampling for silky smooth paths
    this.onRecordingComplete = options.onRecordingComplete || (() => {});
    this.onRecordingCancel = options.onRecordingCancel || (() => {});
    this.hudElement = null;
  }

  start() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.events = [];
    this.startTime = performance.now();
    this.lastMoveTime = 0;

    this.attachListeners();
    this.createHud();
  }

  stop() {
    if (!this.isRecording) return [];
    this.isRecording = false;
    this.detachListeners();
    this.removeHud();

    // Finalize duration and pause if needed
    if (this.events.length > 0) {
      const lastEvent = this.events[this.events.length - 1];
      this.events.push({
        type: 'pause',
        time: lastEvent.time + 300
      });
    }

    const recordedEvents = [...this.events];
    this.onRecordingComplete(recordedEvents);
    return recordedEvents;
  }

  cancel() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.detachListeners();
    this.removeHud();
    this.events = [];
    this.onRecordingCancel();
  }

  getElapsedTime() {
    return this.isRecording ? performance.now() - this.startTime : 0;
  }

  attachListeners() {
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('dblclick', this.handleDblClick, true);
    window.addEventListener('wheel', this.handleWheel, { capture: true, passive: true });
  }

  detachListeners() {
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('dblclick', this.handleDblClick, true);
    window.removeEventListener('wheel', this.handleWheel, true);
  }

  handleMouseMove = (e) => {
    if (!this.isRecording) return;
    const now = performance.now();
    if (now - this.lastMoveTime < this.moveThrottleMs) return;

    this.lastMoveTime = now;
    const elapsed = Math.round(now - this.startTime);

    this.events.push({
      type: 'move',
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      time: elapsed
    });

    this.updateHudCounter();
  };

  handleClick = (e) => {
    if (!this.isRecording) return;
    const elapsed = Math.round(performance.now() - this.startTime);
    this.events.push({
      type: 'click',
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      time: elapsed
    });
    this.updateHudCounter();
  };

  handleDblClick = (e) => {
    if (!this.isRecording) return;
    const elapsed = Math.round(performance.now() - this.startTime);
    this.events.push({
      type: 'dblclick',
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
      time: elapsed
    });
    this.updateHudCounter();
  };

  handleWheel = (e) => {
    if (!this.isRecording) return;
    const elapsed = Math.round(performance.now() - this.startTime);
    this.events.push({
      type: 'scroll',
      deltaY: Math.round(e.deltaY),
      time: elapsed
    });
  };

  createHud() {
    this.removeHud();
    const hud = document.createElement('div');
    hud.id = 'acr-recorder-hud-container';
    hud.innerHTML = `
      <style>
        #acr-recorder-hud-container {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          pointer-events: auto;
        }
        .acr-rec-card {
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(239, 68, 68, 0.2);
          border-radius: 30px;
          padding: 8px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          color: #f8fafc;
          font-size: 13px;
          font-weight: 500;
        }
        .acr-rec-dot {
          width: 10px;
          height: 10px;
          background-color: #ef4444;
          border-radius: 50%;
          box-shadow: 0 0 10px #ef4444;
          animation: acrPulse 1.2s infinite alternate;
        }
        @keyframes acrPulse {
          0% { opacity: 0.3; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1.2); }
        }
        .acr-rec-btn {
          border: none;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .acr-rec-btn-save {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .acr-rec-btn-save:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }
        .acr-rec-btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
        }
        .acr-rec-btn-cancel:hover {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
      </style>
      <div class="acr-rec-card">
        <div class="acr-rec-dot"></div>
        <span>Recording Movement... (<span id="acr-rec-count">0</span> events)</span>
        <button id="acr-save-rec-btn" class="acr-rec-btn acr-rec-btn-save">Stop & Save</button>
        <button id="acr-cancel-rec-btn" class="acr-rec-btn acr-rec-btn-cancel">Cancel</button>
      </div>
    `;

    document.documentElement.appendChild(hud);
    this.hudElement = hud;

    document.getElementById('acr-save-rec-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stop();
    });

    document.getElementById('acr-cancel-rec-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel();
    });
  }

  updateHudCounter() {
    const el = document.getElementById('acr-rec-count');
    if (el) {
      el.textContent = `${this.events.length}`;
    }
  }

  removeHud() {
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    this.hudElement = null;
  }
}

if (typeof window !== 'undefined') {
  window.CursorRecorder = CursorRecorder;
}
