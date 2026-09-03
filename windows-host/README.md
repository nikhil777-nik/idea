# Windows Companion Native Host - Auto Cursor Replay

This component controls the **REAL Windows system mouse cursor** using Windows low-level APIs (`SetCursorPos`, `GetCursorPos`, `SendInput`, `GetAsyncKeyState`) via Chrome Native Messaging.

---

## 🏗 System Components

1. **`auto_cursor_host.cpp`**: C++ Win32 Native Host application source code.
2. **`auto_cursor_host.py`**: Python Win32 `ctypes` native host runner (runs out-of-the-box using installed Python).
3. **`auto_cursor_host.bat`**: Native Host launcher invoked by Chrome.
4. **`com.auto_cursor_replay.host.json`**: Chrome Native Messaging manifest file.
5. **`register_host.bat`**: One-click script to register the Native Host in Windows Registry.

---

## 🛠 Quick Setup Instructions

### Step 1: Register Native Host in Windows Registry
Double-click or run `register_host.bat` inside the `windows-host` folder. This adds the key:
`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.auto_cursor_replay.host`

### Step 2: Load Chrome Extension
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the `extension/` folder:
   `c:\Users\javitha\OneDrive\Desktop\idea\extension`
4. Copy your generated Extension ID (e.g. `abcdefghijklmnopqrstuvwxyz123456`).

### Step 3: (Optional) Set Extension ID in Manifest
In `windows-host/com.auto_cursor_replay.host.json`, add your specific extension ID to `allowed_origins`:
```json
"allowed_origins": [
  "chrome-extension://<YOUR_EXTENSION_ID>/"
]
```

---

## ⚡ Emergency Stop
During mouse recording or playback, press **<kbd>ESC</kbd>** on your physical keyboard at any time. The background emergency thread will immediately halt all mouse automation and release control.

---

## 🔨 Compiling C++ Source Code (Optional)
If you wish to compile `auto_cursor_host.cpp` using Visual Studio MSVC (`cl.exe`) or MinGW (`g++`):
1. Open Developer Command Prompt.
2. Run `windows-host\build.bat`.
3. Update `auto_cursor_host.bat` to call `auto_cursor_host.exe`.
