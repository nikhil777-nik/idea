/**
 * Background Service Worker for Auto Cursor Replay (Manifest V3)
 * Manages extension lifecycle, storage initialization, and script injection.
 */

const DEFAULT_SETTINGS = {
  speed: 1.0,
  loop: true,
  showClicks: true,
  visibleCursor: true,
  cursorStyle: 'default',
  cursorSize: 24,
  cursorOpacity: 0.95
};

const DEFAULT_DEMO_PROFILE = {
  id: 'demo-profile',
  name: 'Default Demo Loop',
  version: 1,
  createdAt: Date.now(),
  events: [
    { type: 'move', x: 150, y: 150, time: 0 },
    { type: 'move', x: 280, y: 180, time: 300 },
    { type: 'move', x: 450, y: 220, time: 700 },
    { type: 'click', x: 450, y: 220, time: 900 },
    { type: 'move', x: 620, y: 250, time: 1400 },
    { type: 'pause', time: 1800 },
    { type: 'move', x: 700, y: 400, time: 2400 },
    { type: 'dblclick', x: 700, y: 400, time: 2700 },
    { type: 'move', x: 500, y: 550, time: 3300 },
    { type: 'scroll', deltaY: 180, time: 3700 },
    { type: 'move', x: 300, y: 450, time: 4300 },
    { type: 'move', x: 150, y: 150, time: 5000 }
  ]
};

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AutoCursorReplay] Service worker installed:', details.reason);

  chrome.storage.local.get(['acr_settings', 'acr_profiles', 'acr_active_profile_id'], (result) => {
    if (!result.acr_settings) {
      chrome.storage.local.set({ acr_settings: DEFAULT_SETTINGS });
    }
    if (!result.acr_profiles || result.acr_profiles.length === 0) {
      chrome.storage.local.set({
        acr_profiles: [DEFAULT_DEMO_PROFILE],
        acr_active_profile_id: DEFAULT_DEMO_PROFILE.id
      });
    }
  });
});

// Helper to ensure content scripts are injected in target tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'ENSURE_CONTENT_SCRIPT') {
    const tabId = message.tabId;
    if (tabId) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [
          'storage/storage.js',
          'player/player.js',
          'recorder/recorder.js',
          'content/content.js'
        ]
      }).then(() => {
        chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['content/cursor.css']
        }).catch(err => console.warn('CSS insert warning:', err));

        sendResponse({ success: true });
      }).catch(err => {
        console.warn('Script injection warning:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
  }
});
