/**
 * Background Service Worker for Auto Cursor Replay (Manifest V3)
 * Manages Native Messaging Port connection to Windows Companion Application.
 */

const NATIVE_HOST_NAME = 'com.auto_cursor_replay.host';

let nativePort = null;
let currentStatus = 'ready'; // 'ready', 'recording', 'playing', 'paused', 'stopped'
let lastError = null;

function connectNativeHost() {
  if (nativePort) return nativePort;

  try {
    console.log('[AutoCursorReplay] Connecting to Native Host:', NATIVE_HOST_NAME);
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener(async (message) => {
      console.log('[AutoCursorReplay] Received from Native Host:', message);
      if (message.status) {
        currentStatus = message.status;
      }

      // Auto-save completed recording even when popup is closed!
      if (message.action === 'RECORDING_COMPLETE' && message.events && message.events.length > 0) {
        await autoSaveRecording(message.events, message.screen);
      }

      // Broadcast message to popup if open
      chrome.runtime.sendMessage({
        source: 'NATIVE_HOST',
        payload: message
      }).catch(() => {});
    });

    nativePort.onDisconnect.addListener(() => {
      lastError = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Native host disconnected';
      console.warn('[AutoCursorReplay] Native host disconnected:', lastError);
      nativePort = null;
      currentStatus = 'disconnected';
      chrome.runtime.sendMessage({
        source: 'NATIVE_HOST',
        payload: { status: 'disconnected', error: lastError }
      }).catch(() => {});
    });

    return nativePort;
  } catch (err) {
    lastError = err.message;
    console.error('[AutoCursorReplay] Failed to connect native host:', err);
    nativePort = null;
    currentStatus = 'disconnected';
    return null;
  }
}

async function autoSaveRecording(events, screen) {
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const profileName = `Recording ${timeString}`;

  return new Promise((resolve) => {
    chrome.storage.local.get(['acr_profiles_v2'], (result) => {
      let profiles = result.acr_profiles_v2 || [];
      const newProfile = {
        id: `profile_${Date.now()}`,
        name: profileName,
        version: 1,
        createdAt: Date.now(),
        screen: screen || { width: 1920, height: 1080 },
        events: events
      };

      profiles.push(newProfile);
      chrome.storage.local.set({
        acr_profiles_v2: profiles,
        acr_active_profile_id_v2: newProfile.id
      }, () => {
        console.log('[AutoCursorReplay] Automatically saved recording:', profileName);
        resolve(newProfile);
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AutoCursorReplay] Extension installed.');
  connectNativeHost();
});

// Listener for Popup commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'POPUP') {
    const { action, payload } = message;

    if (action === 'GET_STATUS') {
      sendResponse({
        status: currentStatus,
        connected: !!nativePort,
        error: lastError
      });
      return true;
    }

    if (action === 'RECONNECT_NATIVE') {
      const port = connectNativeHost();
      sendResponse({
        connected: !!port,
        status: currentStatus,
        error: lastError
      });
      return true;
    }

    // Forward action to Native Host
    const port = connectNativeHost();
    if (!port) {
      sendResponse({
        success: false,
        error: lastError || 'Native host is not connected. Make sure register_host.bat was executed.'
      });
      return true;
    }

    try {
      port.postMessage({ action, ...payload });
      sendResponse({ success: true, status: currentStatus });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
});
