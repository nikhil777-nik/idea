/**
 * Storage Layer for Auto Cursor Replay (Native Host Edition)
 * Handles profile persistence, user settings, and demo profile initialization.
 */

const STORAGE_KEYS = {
  SETTINGS: 'acr_settings_v2',
  PROFILES: 'acr_profiles_v2',
  ACTIVE_PROFILE_ID: 'acr_active_profile_id_v2'
};

const DEFAULT_SETTINGS = {
  speed: 1.0,
  loop: false,
  scaleToScreen: true
};

const DEFAULT_DEMO_PROFILE = {
  id: 'demo-desktop-profile',
  name: 'Default Demo Circle',
  version: 1,
  createdAt: Date.now(),
  screen: {
    width: 1920,
    height: 1080
  },
  events: [
    { type: 'move', x: 500, y: 500, time: 0 },
    { type: 'move', x: 600, y: 450, time: 300 },
    { type: 'move', x: 700, y: 500, time: 600 },
    { type: 'click', button: 'left', x: 700, y: 500, time: 800 },
    { type: 'move', x: 600, y: 650, time: 1200 },
    { type: 'pause', time: 1600 },
    { type: 'move', x: 500, y: 500, time: 2200 }
  ]
};

class StorageManager {
  static isAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  static async getSettings() {
    if (!this.isAvailable()) return { ...DEFAULT_SETTINGS };
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) });
      });
    });
  }

  static async saveSettings(newSettings) {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    if (this.isAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    }
    return updated;
  }

  static async getProfiles() {
    if (!this.isAvailable()) return [DEFAULT_DEMO_PROFILE];
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
    if (!this.isAvailable()) return DEFAULT_DEMO_PROFILE.id;
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
    if (this.isAvailable()) {
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
        name: profileData.name || 'Untitled Recording',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        screen: profileData.screen || { width: window.screen?.width || 1920, height: window.screen?.height || 1080 },
        events: profileData.events || []
      });
    }
    if (this.isAvailable()) {
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
    if (this.isAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
    }
    return profiles;
  }
}

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
