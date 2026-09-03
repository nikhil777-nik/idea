/**
 * Popup UI Controller for Auto Cursor Replay (Real Windows Cursor Edition)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const connWarning = document.getElementById('connection-warning');
  const btnReconnect = document.getElementById('btn-reconnect');

  const btnRecord = document.getElementById('btn-record');
  const btnStopRec = document.getElementById('btn-stop-rec');

  const profileSelect = document.getElementById('profile-select');
  const btnNewProfile = document.getElementById('btn-new-profile');
  const btnRenameProfile = document.getElementById('btn-rename-profile');
  const btnDeleteProfile = document.getElementById('btn-delete-profile');

  const idleReplayControls = document.getElementById('idle-replay-controls');
  const activeReplayControls = document.getElementById('active-replay-controls');
  const btnPlay = document.getElementById('btn-play');
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnStop = document.getElementById('btn-stop');
  const btnStopActive = document.getElementById('btn-stop-active');

  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const pillBtns = document.querySelectorAll('.pill-btn');

  const toggleLoop = document.getElementById('toggle-loop');
  const toggleScale = document.getElementById('toggle-scale');

  const btnExport = document.getElementById('btn-export');
  const btnImport = document.getElementById('btn-import');
  const importFileInput = document.getElementById('import-file-input');

  // Internal State
  let currentSettings = {};
  let profiles = [];
  let activeProfile = null;
  let currentStatus = 'ready';

  await init();

  async function init() {
    if (window.StorageManager) {
      currentSettings = await window.StorageManager.getSettings();
      profiles = await window.StorageManager.getProfiles();
      activeProfile = await window.StorageManager.getActiveProfile();
    }

    renderProfilesSelect();
    renderSettingsUI();
    listenToNativeMessages();
    await checkNativeStatus();
  }

  function renderProfilesSelect() {
    profileSelect.innerHTML = '';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (activeProfile && p.id === activeProfile.id) {
        opt.selected = true;
      }
      profileSelect.appendChild(opt);
    });
  }

  function renderSettingsUI() {
    speedSlider.value = currentSettings.speed || 1.0;
    speedValue.textContent = `${(currentSettings.speed || 1.0).toFixed(2)}x`;
    updateSpeedPills(currentSettings.speed || 1.0);

    toggleLoop.checked = !!currentSettings.loop;
    toggleScale.checked = currentSettings.scaleToScreen !== false;
  }

  function updateSpeedPills(speed) {
    pillBtns.forEach(btn => {
      const pSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(pSpeed - speed) < 0.05) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function updateStatusUI(status, isConnected = true, errorMsg = null) {
    currentStatus = status;
    statusPill.className = 'status-pill';

    if (!isConnected || status === 'disconnected') {
      statusPill.classList.add('status-disconnected');
      statusText.textContent = 'DISCONNECTED';
      connWarning.classList.remove('hidden');
      return;
    }

    connWarning.classList.add('hidden');

    if (status === 'recording') {
      statusPill.classList.add('status-recording');
      statusText.textContent = 'RECORDING';

      btnRecord.classList.add('hidden');
      btnStopRec.classList.remove('hidden');

      idleReplayControls.classList.remove('hidden');
      activeReplayControls.classList.add('hidden');
    } else if (status === 'playing') {
      statusPill.classList.add('status-playing');
      statusText.textContent = 'PLAYING';

      btnRecord.classList.remove('hidden');
      btnStopRec.classList.add('hidden');

      idleReplayControls.classList.add('hidden');
      activeReplayControls.classList.remove('hidden');
      btnPause.classList.remove('hidden');
      btnResume.classList.add('hidden');
    } else if (status === 'paused') {
      statusPill.classList.add('status-paused');
      statusText.textContent = 'PAUSED';

      btnRecord.classList.remove('hidden');
      btnStopRec.classList.add('hidden');

      idleReplayControls.classList.add('hidden');
      activeReplayControls.classList.remove('hidden');
      btnPause.classList.add('hidden');
      btnResume.classList.remove('hidden');
    } else if (status === 'stopped') {
      statusPill.classList.add('status-stopped');
      statusText.textContent = 'STOPPED';

      btnRecord.classList.remove('hidden');
      btnStopRec.classList.add('hidden');

      idleReplayControls.classList.remove('hidden');
      activeReplayControls.classList.add('hidden');
    } else {
      statusPill.classList.add('status-ready');
      statusText.textContent = 'READY';

      btnRecord.classList.remove('hidden');
      btnStopRec.classList.add('hidden');

      idleReplayControls.classList.remove('hidden');
      activeReplayControls.classList.add('hidden');
    }
  }

  async function sendToNative(action, payload = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        source: 'POPUP',
        action,
        payload
      }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] Service Worker communication error:', chrome.runtime.lastError.message);
          updateStatusUI('disconnected', false, chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(res);
        }
      });
    });
  }

  async function checkNativeStatus() {
    const res = await sendToNative('GET_STATUS');
    if (res) {
      updateStatusUI(res.status || 'ready', res.connected !== false, res.error);
    }
  }

  function listenToNativeMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.source === 'NATIVE_HOST' && message.payload) {
        const payload = message.payload;
        if (payload.status) {
          updateStatusUI(payload.status, payload.status !== 'disconnected', payload.error);
        }

        // If recording completed and sent recorded events back
        if (payload.action === 'RECORDING_COMPLETE' && payload.events) {
          handleRecordingFinished(payload.events, payload.screen);
        }
      }
    });
  }

  async function handleRecordingFinished(recordedEvents, recordedScreen) {
    if (!recordedEvents || recordedEvents.length === 0) {
      alert('No mouse movement recorded.');
      return;
    }
    const name = prompt('Save Movement As:', `Recording ${new Date().toLocaleTimeString()}`);
    if (!name) return;

    const newProfile = {
      id: `profile_${Date.now()}`,
      name: name.trim(),
      version: 1,
      createdAt: Date.now(),
      screen: recordedScreen || {
        width: Math.round(window.screen.width * (window.devicePixelRatio || 1)),
        height: Math.round(window.screen.height * (window.devicePixelRatio || 1))
      },
      events: recordedEvents
    };

    if (window.StorageManager) {
      profiles = await window.StorageManager.saveProfile(newProfile);
      await window.StorageManager.setActiveProfileId(newProfile.id);
      activeProfile = newProfile;
      renderProfilesSelect();
    }
  }

  // Event Handlers
  btnReconnect.addEventListener('click', async () => {
    const res = await sendToNative('RECONNECT_NATIVE');
    if (res) {
      updateStatusUI(res.status || 'ready', res.connected !== false, res.error);
    }
  });

  // Record Movement
  btnRecord.addEventListener('click', async () => {
    const res = await sendToNative('START_RECORDING');
    if (res && res.success) {
      updateStatusUI('recording');
    }
  });

  btnStopRec.addEventListener('click', async () => {
    const res = await sendToNative('STOP_RECORDING');
    if (res && res.success) {
      updateStatusUI('ready');
    }
  });

  // Play
  btnPlay.addEventListener('click', async () => {
    if (!activeProfile || !activeProfile.events || activeProfile.events.length === 0) {
      alert('Active profile has no recorded mouse events.');
      return;
    }
    const res = await sendToNative('START_REPLAY', {
      profile: activeProfile,
      speed: currentSettings.speed,
      loop: currentSettings.loop,
      scaleToScreen: currentSettings.scaleToScreen,
      currentScreen: { width: window.screen.width, height: window.screen.height }
    });
    if (res && res.success) {
      updateStatusUI('playing');
    }
  });

  // Pause
  btnPause.addEventListener('click', async () => {
    const res = await sendToNative('PAUSE_REPLAY');
    if (res && res.success) {
      updateStatusUI('paused');
    }
  });

  // Resume
  btnResume.addEventListener('click', async () => {
    const res = await sendToNative('RESUME_REPLAY');
    if (res && res.success) {
      updateStatusUI('playing');
    }
  });

  // Stop
  const stopPlayback = async () => {
    const res = await sendToNative('STOP_REPLAY');
    updateStatusUI('stopped');
  };
  btnStop.addEventListener('click', stopPlayback);
  btnStopActive.addEventListener('click', stopPlayback);

  // Profile Select
  profileSelect.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    if (window.StorageManager) {
      await window.StorageManager.setActiveProfileId(selectedId);
      activeProfile = await window.StorageManager.getActiveProfile();
    }
  });

  // New Profile
  btnNewProfile.addEventListener('click', async () => {
    const name = prompt('New Profile Name:', 'Custom Movement');
    if (!name) return;
    const newProfile = {
      id: `profile_${Date.now()}`,
      name: name.trim(),
      version: 1,
      createdAt: Date.now(),
      screen: { width: window.screen.width, height: window.screen.height },
      events: []
    };
    if (window.StorageManager) {
      profiles = await window.StorageManager.saveProfile(newProfile);
      await window.StorageManager.setActiveProfileId(newProfile.id);
      activeProfile = newProfile;
      renderProfilesSelect();
    }
  });

  // Rename Profile
  btnRenameProfile.addEventListener('click', async () => {
    if (!activeProfile) return;
    const newName = prompt('Rename Profile:', activeProfile.name);
    if (!newName || newName.trim() === activeProfile.name) return;

    activeProfile.name = newName.trim();
    if (window.StorageManager) {
      profiles = await window.StorageManager.saveProfile(activeProfile);
      renderProfilesSelect();
    }
  });

  // Delete Profile
  btnDeleteProfile.addEventListener('click', async () => {
    if (!activeProfile) return;
    if (profiles.length <= 1) {
      alert('Cannot delete the only profile.');
      return;
    }
    if (!confirm(`Delete profile "${activeProfile.name}"?`)) return;

    if (window.StorageManager) {
      try {
        profiles = await window.StorageManager.deleteProfile(activeProfile.id);
        activeProfile = await window.StorageManager.getActiveProfile();
        renderProfilesSelect();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  // Speed Slider
  speedSlider.addEventListener('input', async (e) => {
    const val = parseFloat(e.target.value);
    speedValue.textContent = `${val.toFixed(2)}x`;
    updateSpeedPills(val);
    currentSettings.speed = val;
    if (window.StorageManager) await window.StorageManager.saveSettings(currentSettings);
    await sendToNative('SET_SPEED', { speed: val });
  });

  pillBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = parseFloat(btn.dataset.speed);
      speedSlider.value = val;
      speedValue.textContent = `${val.toFixed(2)}x`;
      updateSpeedPills(val);
      currentSettings.speed = val;
      if (window.StorageManager) await window.StorageManager.saveSettings(currentSettings);
      await sendToNative('SET_SPEED', { speed: val });
    });
  });

  // Toggles
  toggleLoop.addEventListener('change', async (e) => {
    currentSettings.loop = e.target.checked;
    if (window.StorageManager) await window.StorageManager.saveSettings(currentSettings);
    await sendToNative('SET_LOOP', { loop: e.target.checked });
  });

  toggleScale.addEventListener('change', async (e) => {
    currentSettings.scaleToScreen = e.target.checked;
    if (window.StorageManager) await window.StorageManager.saveSettings(currentSettings);
  });

  // Export JSON
  btnExport.addEventListener('click', () => {
    if (!activeProfile) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeProfile, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${activeProfile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_recording.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Import JSON
  btnImport.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (!importedData.events || !Array.isArray(importedData.events)) {
          alert('Invalid JSON file format: Missing events array.');
          return;
        }

        const newProfile = {
          id: `profile_${Date.now()}`,
          name: importedData.name || file.name.replace('.json', ''),
          version: importedData.version || 1,
          createdAt: Date.now(),
          screen: importedData.screen || { width: window.screen.width, height: window.screen.height },
          events: importedData.events
        };

        if (window.StorageManager) {
          profiles = await window.StorageManager.saveProfile(newProfile);
          await window.StorageManager.setActiveProfileId(newProfile.id);
          activeProfile = newProfile;
          renderProfilesSelect();
          alert(`Imported profile "${newProfile.name}"!`);
        }
      } catch (err) {
        alert('Failed to parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
});
