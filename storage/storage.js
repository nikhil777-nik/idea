/**
 * Storage Layer for Auto Cursor Replay Extension
 * Handles chrome.storage.local operations, default demo profile, settings, and profile management.
 */

const STORAGE_KEYS = {
  SETTINGS: 'acr_settings',
  PROFILES: 'acr_profiles',
  ACTIVE_PROFILE_ID: 'acr_active_profile_id'
};

const DEFAULT_SETTINGS = {
  speed: 1.0,
  loop: true,
  showClicks: true,
  visibleCursor: true,
  cursorStyle: 'default', // 'default', 'circle', 'highlight'
  cursorSize: 24,         // pixels
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

class StorageManager {
  static isChromeStorageAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  static async getSettings() {
    if (!this.isChromeStorageAvailable()) {
      return { ...DEFAULT_SETTINGS };
    }
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) });
      });
    });
  }

  static async saveSettings(newSettings) {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    }
    return updated;
  }

  static async getProfiles() {
    if (!this.isChromeStorageAvailable()) {
      return [DEFAULT_DEMO_PROFILE];
    }
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.PROFILES], (result) => {
        let profiles = result[STORAGE_KEYS.PROFILES];
        if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
          profiles = [DEFAULT_DEMO_PROFILE];
          chrome.storage.local.set({
            [STORAGE_KEYS.PROFILES]: profiles,
            [STORAGE_KEYS.ACTIVE_PROFILE_ID]: DEFAULT_DEMO_PROFILE.id
          });
        }
        resolve(profiles);
      });
    });
  }

  static async getActiveProfileId() {
    if (!this.isChromeStorageAvailable()) {
      return DEFAULT_DEMO_PROFILE.id;
    }
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (result) => {
        resolve(result[STORAGE_KEYS.ACTIVE_PROFILE_ID] || DEFAULT_DEMO_PROFILE.id);
      });
    });
  }

  static async getActiveProfile() {
    const profiles = await this.getProfiles();
    const activeId = await this.getActiveProfileId();
    const found = profiles.find(p => p.id === activeId);
    return found || profiles[0] || DEFAULT_DEMO_PROFILE;
  }

  static async setActiveProfileId(profileId) {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId });
    }
  }

  static async saveProfile(profileData) {
    const profiles = await this.getProfiles();
    const index = profiles.findIndex(p => p.id === profileData.id);
    if (index >= 0) {
      profiles[index] = { ...profiles[index], ...profileData, updatedAt: Date.now() };
    } else {
      profiles.push({
        id: profileData.id || `profile_${Date.now()}`,
        name: profileData.name || 'Untitled Movement',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: profileData.events || []
      });
    }
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
    }
    return profiles;
  }

  static async deleteProfile(profileId) {
    let profiles = await this.getProfiles();
    if (profiles.length <= 1) {
      throw new Error('Cannot delete the only remaining profile.');
    }
    profiles = profiles.filter(p => p.id !== profileId);
    let activeId = await this.getActiveProfileId();
    if (activeId === profileId) {
      activeId = profiles[0].id;
      await this.setActiveProfileId(activeId);
    }
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
    }
    return profiles;
  }

  static async initializeDefaults() {
    const profiles = await this.getProfiles();
    const settings = await this.getSettings();
    return { profiles, settings };
  }
}

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
