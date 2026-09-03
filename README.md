# Auto Cursor Replay - Real Windows Mouse Automation

An automated mouse recorder and replayer that controls the **REAL Windows system mouse cursor/pointer** across your entire OS desktop using Chrome Native Messaging and Win32 low-level APIs.

> ⚠️ **NO FAKE CURSORS**: This application does not use virtual HTML/CSS div pointers. When you press **PLAY**, your physical Windows mouse arrow automatically travels across your desktop, opening windows, clicking buttons, and scrolling.

---

## 📂 Project Architecture

```
c:\Users\javitha\OneDrive\Desktop\idea\
├── extension/
│   ├── manifest.json                  # Manifest V3 (nativeMessaging, storage)
│   ├── background/
│   │   └── service-worker.js         # Relays messages between popup and Native Host
│   ├── popup/
│   │   ├── popup.html                # Modern Gen-Z dark glassmorphic UI
│   │   ├── popup.css                 # Dark theme styling, status pills, sliders
│   │   └── popup.js                  # Popup UI controller
│   ├── storage/
│   │   └── storage.js                # Profile persistence & screen resolution settings
│   └── assets/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
└── windows-host/
    ├── auto_cursor_host.cpp           # C++ Win32 Native Host application
    ├── auto_cursor_host.py            # Python Win32 ctypes runner (instant execution)
    ├── auto_cursor_host.bat           # Launcher script called by Chrome
    ├── build.bat                      # C++ build script (MSVC / MinGW)
    ├── com.auto_cursor_replay.host.json # Chrome Native Messaging manifest
    ├── register_host.bat              # One-click Windows Registry installer
    └── README.md                      # Host component documentation
```

---

## ⚡ Quick Start Guide

### Step 1: Register Native Host (Done automatically)
The Windows Registry key has already been added to your system:
`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.auto_cursor_replay.host`

*(If running on a new machine, double-click `windows-host/register_host.bat`).*

### Step 2: Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the folder:
   `c:\Users\javitha\OneDrive\Desktop\idea\extension`

### Step 3: Record & Replay REAL Mouse Movement
1. Open the **Auto Cursor Replay** popup in Chrome.
2. Click **🔴 RECORD MOVEMENT**.
3. Move your physical Windows mouse across the screen, click items, or scroll.
4. Click **⏹ STOP RECORDING** and save your recording profile.
5. Click **▶ PLAY**: Watch your physical Windows mouse pointer automatically repeat the exact movement path with original speed and timing!

---

## 🛑 Emergency Stop
Press the **<kbd>ESC</kbd>** key on your keyboard at any time during recording or playback. The Native Host emergency thread will instantly abort mouse automation and return control to you.
