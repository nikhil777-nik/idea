/**
 * Content Script for Auto Cursor Replay Extension
 * Manages the visible virtual cursor overlay, shadow DOM, message handling, and player/recorder integration.
 */

(function () {
  if (window.__ACR_CONTENT_INITIALIZED__) {
    return;
  }
  window.__ACR_CONTENT_INITIALIZED__ = true;

  class ContentController {
    constructor() {
      this.hostElement = null;
      this.shadowRoot = null;
      this.cursorElement = null;
      this.player = null;
      this.recorder = null;
      this.currentSettings = {
        speed: 1.0,
        loop: true,
        showClicks: true,
        visibleCursor: true,
        cursorStyle: 'default',
        cursorSize: 24,
        cursorOpacity: 0.95
      };
      this.activeProfile = null;
      this.currentStatus = 'idle'; // 'idle', 'playing', 'paused', 'recording'

      this.init();
    }

    async init() {
      this.createCursorDOM();
      this.initPlayer();
      this.initRecorder();
      this.attachMessageListeners();

      // Fetch initial settings & profile from storage if available
      if (window.StorageManager) {
        this.currentSettings = await window.StorageManager.getSettings();
        this.activeProfile = await window.StorageManager.getActiveProfile();
        this.applySettings(this.currentSettings);
      }
    }

    createCursorDOM() {
      if (document.getElementById('acr-virtual-cursor-host')) {
        return;
      }

      this.hostElement = document.createElement('div');
      this.hostElement.id = 'acr-virtual-cursor-host';

      // Create Shadow DOM to isolate styles from webpage CSS
      this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

      // Append cursor CSS into Shadow DOM
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 0;
          height: 0;
          pointer-events: none !important;
          z-index: 2147483647 !important;
        }
        .acr-cursor-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          pointer-events: none !important;
          z-index: 2147483647 !important;
          will-change: transform;
          display: none;
          align-items: center;
          justify-content: center;
          user-select: none;
          filter: drop-shadow(0px 4px 12px rgba(0, 0, 0, 0.45));
          transition: opacity 0.15s ease-out;
          transform: translate3d(-100px, -100px, 0);
        }
        .acr-cursor-wrapper.visible {
          display: flex;
        }

        /* Default SVG Arrow Pointer */
        .acr-cursor-default svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        /* Circle Pointer */
        .acr-cursor-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid #38bdf8;
          background: rgba(56, 189, 248, 0.25);
          box-shadow: 0 0 15px rgba(56, 189, 248, 0.8), inset 0 0 10px rgba(56, 189, 248, 0.5);
          position: relative;
        }
        .acr-cursor-circle::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 6px;
          height: 6px;
          background: #ffffff;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 8px #ffffff;
        }

        /* Highlight Pointer */
        .acr-cursor-highlight-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .acr-cursor-highlight-halo {
          position: absolute;
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(250, 204, 21, 0.5) 0%, rgba(250, 204, 21, 0.15) 60%, rgba(250, 204, 21, 0) 100%);
          box-shadow: 0 0 18px rgba(250, 204, 21, 0.4);
          pointer-events: none;
          animation: acrHaloPulse 1.8s ease-in-out infinite alternate;
        }
        @keyframes acrHaloPulse {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.15); opacity: 1; }
        }

        /* Click Ripple Effect */
        .acr-click-ripple {
          position: fixed;
          pointer-events: none !important;
          z-index: 2147483646 !important;
          width: 36px;
          height: 36px;
          margin-left: -18px;
          margin-top: -18px;
          border-radius: 50%;
          border: 3px solid #38bdf8;
          background: rgba(56, 189, 248, 0.2);
          box-shadow: 0 0 20px rgba(56, 189, 248, 0.9);
          animation: acrRippleExpand 0.5s ease-out forwards;
        }
        .acr-click-ripple-dbl {
          border-color: #f43f5e;
          background: rgba(244, 63, 94, 0.25);
          box-shadow: 0 0 24px rgba(244, 63, 94, 0.9);
        }
        @keyframes acrRippleExpand {
          0% { transform: scale(0.3); opacity: 1; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        /* Scroll Toast */
        .acr-scroll-toast {
          position: fixed;
          pointer-events: none !important;
          z-index: 2147483646 !important;
          padding: 4px 10px;
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 12px;
          color: #38bdf8;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 11px;
          font-weight: 600;
          animation: acrScrollToast 0.7s ease-out forwards;
        }
        @keyframes acrScrollToast {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-20px); }
        }
      `;
      this.shadowRoot.appendChild(styleEl);

      // Create cursor wrapper element
      this.cursorElement = document.createElement('div');
      this.cursorElement.className = 'acr-cursor-wrapper';
      this.renderCursorShape('default');

      this.shadowRoot.appendChild(this.cursorElement);
      document.documentElement.appendChild(this.hostElement);
    }

    renderCursorShape(style) {
      if (!this.cursorElement) return;
      this.cursorElement.innerHTML = '';

      if (style === 'circle') {
        const circle = document.createElement('div');
        circle.className = 'acr-cursor-circle';
        this.cursorElement.appendChild(circle);
      } else if (style === 'highlight') {
        const container = document.createElement('div');
        container.className = 'acr-cursor-highlight-container';

        const halo = document.createElement('div');
        halo.className = 'acr-cursor-highlight-halo';
        container.appendChild(halo);

        const svg = document.createElement('div');
        svg.className = 'acr-cursor-default';
        svg.innerHTML = this.getDefaultArrowSVG();
        container.appendChild(svg);

        this.cursorElement.appendChild(container);
      } else {
        // Default arrow
        const svg = document.createElement('div');
        svg.className = 'acr-cursor-default';
        svg.innerHTML = this.getDefaultArrowSVG();
        this.cursorElement.appendChild(svg);
      }
    }

    getDefaultArrowSVG() {
      return `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3L10.07 19.97L13.58 12.58L20.97 9.07L3 3Z" fill="#0f172a" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M3.8 4.6L9.8 19L12.8 12.6L19.2 9.6L3.8 4.6Z" fill="#38bdf8"/>
        </svg>
      `;
    }

    applySettings(settings) {
      this.currentSettings = { ...this.currentSettings, ...settings };
      if (!this.cursorElement) return;

      this.renderCursorShape(this.currentSettings.cursorStyle);

      const size = this.currentSettings.cursorSize || 24;
      this.cursorElement.style.width = `${size}px`;
      this.cursorElement.style.height = `${size}px`;
      this.cursorElement.style.opacity = `${this.currentSettings.cursorOpacity || 0.95}`;

      if (this.player) {
        this.player.setSpeed(this.currentSettings.speed);
        this.player.setLoop(this.currentSettings.loop);
        this.player.setShowClicks(this.currentSettings.showClicks);
      }
    }

    initPlayer() {
      this.player = new window.CursorPlayer({
        onMove: (x, y) => this.handleCursorMove(x, y),
        onClick: (x, y) => this.showClickRipple(x, y, false),
        onDblClick: (x, y) => this.showClickRipple(x, y, true),
        onScroll: (deltaY) => this.handleScrollEvent(deltaY),
        onStateChange: (status, progress) => {
          this.currentStatus = status;
          this.updateCursorVisibility();
        },
        onFinish: () => {
          this.currentStatus = 'idle';
          this.updateCursorVisibility();
        }
      });
    }

    initRecorder() {
      this.recorder = new window.CursorRecorder({
        onRecordingComplete: async (events) => {
          this.currentStatus = 'idle';
          if (events && events.length > 0 && this.activeProfile) {
            this.activeProfile.events = events;
            if (window.StorageManager) {
              await window.StorageManager.saveProfile(this.activeProfile);
            }
          }
        },
        onRecordingCancel: () => {
          this.currentStatus = 'idle';
        }
      });
    }

    handleCursorMove(x, y) {
      if (!this.cursorElement) return;
      this.cursorElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    updateCursorVisibility() {
      if (!this.cursorElement) return;
      const isVisible = (this.currentStatus === 'playing' || this.currentStatus === 'paused') && this.currentSettings.visibleCursor;
      if (isVisible) {
        this.cursorElement.classList.add('visible');
      } else {
        this.cursorElement.classList.remove('visible');
      }
    }

    showClickRipple(x, y, isDblClick = false) {
      if (!this.shadowRoot || !this.currentSettings.showClicks) return;

      const ripple = document.createElement('div');
      ripple.className = `acr-click-ripple ${isDblClick ? 'acr-click-ripple-dbl' : ''}`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      this.shadowRoot.appendChild(ripple);

      setTimeout(() => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      }, 550);
    }

    handleScrollEvent(deltaY) {
      if (!this.shadowRoot) return;

      // Smooth scroll the webpage
      window.scrollBy({
        top: deltaY,
        behavior: 'smooth'
      });

      // Show temporary scroll indicator toast near cursor
      const toast = document.createElement('div');
      toast.className = 'acr-scroll-toast';
      toast.textContent = deltaY > 0 ? '📜 Scroll Down' : '📜 Scroll Up';

      // Position toast at current cursor location
      if (this.player && this.cursorElement) {
        const rect = this.cursorElement.getBoundingClientRect();
        toast.style.left = `${rect.left + 20}px`;
        toast.style.top = `${rect.top}px`;
      } else {
        toast.style.left = '50%';
        toast.style.top = '50%';
      }

      this.shadowRoot.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 750);
    }

    attachMessageListeners() {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
        return;
      }

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true; // Keep channel open for async response
      });
    }

    async handleMessage(message, sendResponse) {
      const { command, payload } = message || {};

      switch (command) {
        case 'COMMAND_START_PLAY':
          if (payload.settings) this.applySettings(payload.settings);
          if (payload.profile) this.activeProfile = payload.profile;
          const eventsToPlay = payload.profile?.events || this.activeProfile?.events;

          if (eventsToPlay && eventsToPlay.length > 0) {
            this.player.start(eventsToPlay, this.currentSettings);
            this.currentStatus = 'playing';
            this.updateCursorVisibility();
            sendResponse({ success: true, status: 'playing' });
          } else {
            sendResponse({ success: false, error: 'No profile events found.' });
          }
          break;

        case 'COMMAND_PAUSE_PLAY':
          this.player.pause();
          this.currentStatus = 'paused';
          sendResponse({ success: true, status: 'paused' });
          break;

        case 'COMMAND_RESUME_PLAY':
          this.player.resume();
          this.currentStatus = 'playing';
          sendResponse({ success: true, status: 'playing' });
          break;

        case 'COMMAND_STOP_PLAY':
          this.player.stop();
          this.currentStatus = 'idle';
          this.updateCursorVisibility();
          sendResponse({ success: true, status: 'idle' });
          break;

        case 'COMMAND_START_RECORD':
          this.player.stop();
          this.currentStatus = 'recording';
          this.updateCursorVisibility();
          this.recorder.start();
          sendResponse({ success: true, status: 'recording' });
          break;

        case 'COMMAND_STOP_RECORD':
          const recordedEvents = this.recorder.stop();
          this.currentStatus = 'idle';
          sendResponse({ success: true, events: recordedEvents });
          break;

        case 'COMMAND_GET_STATUS':
          sendResponse({
            success: true,
            status: this.currentStatus,
            isRecording: this.recorder.isRecording,
            settings: this.currentSettings,
            activeProfile: this.activeProfile,
            currentTime: this.player.currentTime,
            totalDuration: this.player.totalDuration
          });
          break;

        case 'COMMAND_UPDATE_SETTINGS':
          if (payload.settings) {
            this.applySettings(payload.settings);
          }
          if (payload.profile) {
            this.activeProfile = payload.profile;
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown command' });
      }
    }
  }

  // Instantiate content controller
  window.__ACR_CONTROLLER__ = new ContentController();
})();
