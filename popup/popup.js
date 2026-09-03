/**
 * Popup UI Controller for Auto Cursor Replay Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');

  const idleControls = document.getElementById('idle-controls');
  const activeControls = document.getElementById('active-controls');
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnStop = document.getElementById('btn-stop');
  const btnRecord = document.getElementById('btn-record');

  const profileSelect = document.getElementById('profile-select');
  const btnNewProfile = document.getElementById('btn-new-profile');
  const btnRenameProfile = document.getElementById('btn-rename-profile');
  const btnDeleteProfile = document.getElementById('btn-delete-profile');

  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const pillBtns = document.querySelectorAll('.pill-btn');

  const toggleLoop = document.getElementById('toggle-loop');
  const toggleVisible = document.getElementById('toggle-visible');
  const toggleClicks = document.getElementById('toggle-clicks');

  const segBtns = document.querySelectorAll('.seg-btn');
  const sizeSlider = document.getElementById('size-slider');
  const sizeValue = document.getElementById('size-value');
  const opacitySlider = document.getElementById('opacity-slider');
  const opacityValue = document.getElementById('opacity-value');

  const btnExport = document.getElementById('btn-export');
  const btnImport = document.getElementById('btn-import');
  const importFileInput = document.getElementById('import-file-input');

  // State variables
  let activeTabId = null;
  let currentSettings = {};
  let profiles = [];
  let activeProfile = null;
  let currentStatus = 'idle'; // 'idle', 'playing', 'paused', 'recording'

  // Initialize Extension State
  await init();

  async function init() {
    // Get active tab
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        activeTabId = tab.id;
        // Inject content script if needed
        chrome.runtime.sendMessage({ command: 'ENSURE_CONTENT_SCRIPT', tabId: tab.id });
      }
    }

    // Load data from StorageManager
    if (window.StorageManager) {
      const data = await window.StorageManager.initializeDefaults();
      currentSettings = data.settings;
      profiles = data.profiles;
      activeProfile = await window.StorageManager.getActiveProfile();
    }

    renderProfilesSelect();
    renderSettingsUI();
    await checkContentStatus();
  }

  function renderProfilesSelect() {
    profileSelect.innerHTML = '';
    profiles.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      if (activeProfile && p.id === activeProfile.id) {
        option.selected = true;
      }
      profileSelect.appendChild(option);
    });
  }

  function renderSettingsUI() {
    // Speed
    speedSlider.value = currentSettings.speed || 1.0;
    speedValue.textContent = `${(currentSettings.speed || 1.0).toFixed(2)}x`;
    updateSpeedPills(currentSettings.speed || 1.0);

    // Toggles
    toggleLoop.checked = currentSettings.loop !== false;
    toggleVisible.checked = currentSettings.visibleCursor !== false;
    toggleClicks.checked = currentSettings.showClicks !== false;

    // Cursor Customization
    segBtns.forEach(btn => {
      if (btn.dataset.style === currentSettings.cursorStyle) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    sizeSlider.value = currentSettings.cursorSize || 24;
    sizeValue.textContent = `${currentSettings.cursorSize || 24}px`;

    opacitySlider.value = currentSettings.cursorOpacity || 0.95;
    opacityValue.textContent = `${Math.round((currentSettings.cursorOpacity || 0.95) * 100)}%`;
  }

  function updateSpeedPills(speed) {
    pillBtns.forEach(btn => {
      const pillSpeed = parseFloat(btn.dataset.speed);
      if (Math.abs(pillSpeed - speed) < 0.05) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async function checkContentStatus() {
    if (!activeTabId) return;
    try {
      chrome.tabs.sendMessage(activeTabId, { command: 'COMMAND_GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          updateStatusUI('idle');
          return;
        }
        if (res.status) {
          updateStatusUI(res.status);
        }
      });
    } catch (e) {
      updateStatusUI('idle');
    }
  }

  function updateStatusUI(status) {
    currentStatus = status;
    statusPill.className = 'status-pill';

    if (status === 'playing') {
      statusPill.classList.add('status-running');
      statusText.textContent = 'RUNNING';

      idleControls.classList.add('hidden');
      activeControls.classList.remove('hidden');
      btnPause.classList.remove('hidden');
      btnResume.classList.add('hidden');
    } else if (status === 'paused') {
      statusPill.classList.add('status-paused');
      statusText.textContent = 'PAUSED';

      idleControls.classList.add('hidden');
      activeControls.classList.remove('hidden');
      btnPause.classList.add('hidden');
      btnResume.classList.remove('hidden');
    } else if (status === 'recording') {
      statusPill.classList.add('status-recording');
      statusText.textContent = 'RECORDING';

      idleControls.classList.add('hidden');
      activeControls.classList.remove('hidden');
      btnPause.classList.add('hidden');
      btnResume.classList.add('hidden');
    } else {
      statusPill.classList.add('status-off');
      statusText.textContent = 'OFF';

      idleControls.classList.remove('hidden');
      activeControls.classList.add('hidden');
    }
  }

  async function sendToContentScript(command, payload = {}) {
    if (!activeTabId) return null;
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(activeTabId, { command, payload }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[AutoCursorReplay] Message error:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  async function updateSettings(partial) {
    currentSettings = { ...currentSettings, ...partial };
    if (window.StorageManager) {
      await window.StorageManager.saveSettings(currentSettings);
    }
    await sendToContentScript('COMMAND_UPDATE_SETTINGS', {
      settings: currentSettings,
      profile: activeProfile
    });
  }

  // --- Event Handlers ---

  // Start Playback
  btnStart.addEventListener('click', async () => {
    if (!activeProfile || !activeProfile.events || activeProfile.events.length === 0) {
      alert('Active profile has no recorded movement events.');
      return;
    }
    const res = await sendToContentScript('COMMAND_START_PLAY', {
      profile: activeProfile,
      settings: currentSettings
    });
    if (res && res.success) {
      updateStatusUI('playing');
    }
  });

  // Pause Playback
  btnPause.addEventListener('click', async () => {
    const res = await sendToContentScript('COMMAND_PAUSE_PLAY');
    if (res && res.success) {
      updateStatusUI('paused');
    }
  });

  // Resume Playback
  btnResume.addEventListener('click', async () => {
    const res = await sendToContentScript('COMMAND_RESUME_PLAY');
    if (res && res.success) {
      updateStatusUI('playing');
    }
  });

  // Stop Playback
  btnStop.addEventListener('click', async () => {
    const res = await sendToContentScript('COMMAND_STOP_PLAY');
    updateStatusUI('idle');
  });

  // Record New Movement
  btnRecord.addEventListener('click', async () => {
    const res = await sendToContentScript('COMMAND_START_RECORD');
    if (res && res.success) {
      updateStatusUI('recording');
      window.close(); // Close popup so user can record freely on page
    }
  });

  // Select Profile
  profileSelect.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    if (window.StorageManager) {
      await window.StorageManager.setActiveProfileId(selectedId);
      activeProfile = await window.StorageManager.getActiveProfile();
      await updateSettings({});
    }
  });

  // New Profile
  btnNewProfile.addEventListener('click', async () => {
    const name = prompt('Enter a name for the new profile:', 'New Recording');
    if (!name) return;
    const newProfile = {
      id: `profile_${Date.now()}`,
      name: name.trim(),
      version: 1,
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
    const newName = prompt('Rename movement profile:', activeProfile.name);
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
      alert('You must keep at least one profile.');
      return;
    }
    if (!confirm(`Delete profile "${activeProfile.name}"?`)) return;

    if (window.StorageManager) {
      try {
        profiles = await window.StorageManager.deleteProfile(activeProfile.id);
        activeProfile = await window.StorageManager.getActiveProfile();
        renderProfilesSelect();
        await updateSettings({});
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
    await updateSettings({ speed: val });
  });

  // Speed Pills
  pillBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = parseFloat(btn.dataset.speed);
      speedSlider.value = val;
      speedValue.textContent = `${val.toFixed(2)}x`;
      updateSpeedPills(val);
      await updateSettings({ speed: val });
    });
  });

  // Toggles
  toggleLoop.addEventListener('change', async (e) => {
    await updateSettings({ loop: e.target.checked });
  });
  toggleVisible.addEventListener('change', async (e) => {
    await updateSettings({ visibleCursor: e.target.checked });
  });
  toggleClicks.addEventListener('change', async (e) => {
    await updateSettings({ showClicks: e.target.checked });
  });

  // Cursor Style Buttons
  segBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      segBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await updateSettings({ cursorStyle: btn.dataset.style });
    });
  });

  // Cursor Size
  sizeSlider.addEventListener('input', async (e) => {
    const val = parseInt(e.target.value, 10);
    sizeValue.textContent = `${val}px`;
    await updateSettings({ cursorSize: val });
  });

  // Cursor Opacity
  opacitySlider.addEventListener('input', async (e) => {
    const val = parseFloat(e.target.value);
    opacityValue.textContent = `${Math.round(val * 100)}%`;
    await updateSettings({ cursorOpacity: val });
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
          alert('Invalid recording format: Missing events array.');
          return;
        }

        const newProfile = {
          id: `profile_${Date.now()}`,
          name: importedData.name || file.name.replace('.json', ''),
          version: importedData.version || 1,
          createdAt: Date.now(),
          events: importedData.events
        };

        if (window.StorageManager) {
          profiles = await window.StorageManager.saveProfile(newProfile);
          await window.StorageManager.setActiveProfileId(newProfile.id);
          activeProfile = newProfile;
          renderProfilesSelect();
          await updateSettings({});
          alert(`Successfully imported profile "${newProfile.name}"!`);
        }
      } catch (err) {
        alert('Failed to parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
});
