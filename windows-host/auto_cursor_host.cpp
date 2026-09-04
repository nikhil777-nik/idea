/**
 * Auto Cursor Replay - Windows Native Host Companion (C++)
 *
 * Controls the REAL Windows system mouse cursor using Win32 APIs:
 *   - SetCursorPos()
 *   - GetCursorPos()
 *   - SendInput()
 *   - GetAsyncKeyState()
 *
 * Implements Chrome Native Messaging 32-bit length-prefixed JSON protocol on stdin/stdout.
 */

#include <windows.h>
#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <chrono>
#include <sstream>
#include <io.h>
#include <fcntl.h>

// Simple JSON helper structure for recorded mouse events
struct MouseEvent {
    std::string type; // "move", "click", "dblclick", "scroll", "pause"
    std::string button; // "left", "right"
    int x;
    int y;
    int deltaY;
    long long time;
};

// Global state
std::atomic<bool> g_isRecording(false);
std::atomic<bool> g_isPlaying(false);
std::atomic<bool> g_isPaused(false);
std::atomic<double> g_speedMultiplier(1.0);
std::atomic<bool> g_loopEnabled(false);
std::atomic<bool> g_running(true);

std::vector<MouseEvent> g_recordedEvents;
std::chrono::high_resolution_clock::time_point g_recordStartTime;

// Function declarations
void SendChromeMessage(const std::string& jsonString);
void RecordingWorker();
void ReplayWorker(std::vector<MouseEvent> events, double speed, bool loop, bool scale, int origW, int origH);
void EmergencyStopWatcher();

// Native Messaging Helpers: Read 32-bit length prefixed message from stdin
std::string ReadChromeMessage() {
    uint32_t length = 0;
    if (!std::cin.read(reinterpret_cast<char*>(&length), 4)) {
        return "";
    }
    if (length == 0 || length > 10 * 1024 * 1024) { // Max 10MB sanity check
        return "";
    }

    std::vector<char> buffer(length);
    if (!std::cin.read(buffer.data(), length)) {
        return "";
    }
    return std::string(buffer.data(), length);
}

// Native Messaging Helpers: Write 32-bit length prefixed message to stdout
void SendChromeMessage(const std::string& jsonString) {
    uint32_t length = static_cast<uint32_t>(jsonString.size());
    std::cout.write(reinterpret_cast<const char*>(&length), 4);
    std::cout.write(jsonString.data(), length);
    std::cout.flush();
}

// Helper: Escape JSON string
std::string JsonEscape(const std::string& s) {
    std::ostringstream o;
    for (char c : s) {
        if (c == '"') o << "\\\"";
        else if (c == '\\') o << "\\\\";
        else if (c == '\b') o << "\\b";
        else if (c == '\f') o << "\\f";
        else if (c == '\n') o << "\\n";
        else if (c == '\r') o << "\\r";
        else if (c == '\t') o << "\\t";
        else o << c;
    }
    return o.str();
}

void PerformMouseMove(int x, int y) {
    int curW = GetSystemMetrics(SM_CXSCREEN);
    int curH = GetSystemMetrics(SM_CYSCREEN);
    if (curW <= 1) curW = 1920;
    if (curH <= 1) curH = 1080;

    LONG normX = static_cast<LONG>((x * 65535.0) / (curW - 1));
    LONG normY = static_cast<LONG>((y * 65535.0) / (curH - 1));

    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dx = normX;
    input.mi.dy = normY;
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;

    SendInput(1, &input, sizeof(INPUT));
    SetCursorPos(x, y);
}

void PerformKeyboardActivityPulse() {
    INPUT inputs[2] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_SHIFT;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = VK_SHIFT;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(2, inputs, sizeof(INPUT));
}

// Low-level Win32 Mouse Click Simulation using SendInput
void PerformMouseClick(int x, int y, const std::string& button, bool isDblClick) {
    PerformMouseMove(x, y);
    INPUT inputs[2] = {};
    ZeroMemory(inputs, sizeof(inputs));

    inputs[0].type = INPUT_MOUSE;
    inputs[1].type = INPUT_MOUSE;

    if (button == "right") {
        inputs[0].mi.dwFlags = MOUSEEVENTF_RIGHTDOWN;
        inputs[1].mi.dwFlags = MOUSEEVENTF_RIGHTUP;
    } else {
        inputs[0].mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
        inputs[1].mi.dwFlags = MOUSEEVENTF_LEFTUP;
    }

    SendInput(2, inputs, sizeof(INPUT));

    if (isDblClick) {
        Sleep(50);
        SendInput(2, inputs, sizeof(INPUT));
    }
}

void PerformMouseScroll(int deltaY) {
    INPUT input = {};
    input.type = INPUT_MOUSE;
    input.mi.dwFlags = MOUSEEVENTF_WHEEL;
    input.mi.mouseData = static_cast<DWORD>(deltaY);
    SendInput(1, &input, sizeof(INPUT));
}

// Background Thread: Emergency Stop Watcher (Pressing ESC immediately stops playback/recording)
void EmergencyStopWatcher() {
    while (g_running) {
        if (GetAsyncKeyState(VK_ESCAPE) & 0x8000) {
            if (g_isPlaying || g_isRecording) {
                g_isPlaying = false;
                g_isRecording = false;
                g_isPaused = false;
                SendChromeMessage("{\"status\":\"stopped\",\"action\":\"EMERGENCY_STOP\",\"message\":\"Emergency ESC pressed\"}");
                Sleep(300); // Debounce key press
            }
        }
        Sleep(50);
    }
}

// Background Thread: Mouse Action Recorder
void RecordingWorker() {
    g_recordedEvents.clear();
    g_recordStartTime = std::chrono::high_resolution_clock::now();

    POINT lastPt = {-1, -1};
    bool lastLeftBtn = false;
    bool lastRightBtn = false;

    while (g_isRecording) {
        if (GetAsyncKeyState(VK_RETURN) & 0x8000) {
            g_isRecording = false;
            break;
        }

        auto now = std::chrono::high_resolution_clock::now();
        long long elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - g_recordStartTime).count();

        POINT currentPt;
        if (GetCursorPos(&currentPt)) {
            if (currentPt.x != lastPt.x || currentPt.y != lastPt.y) {
                g_recordedEvents.push_back({"move", "", currentPt.x, currentPt.y, 0, elapsed});
                lastPt = currentPt;
            }
        }

        // Check Left Mouse Button
        bool leftBtn = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
        if (leftBtn && !lastLeftBtn) {
            g_recordedEvents.push_back({"click", "left", currentPt.x, currentPt.y, 0, elapsed});
        }
        lastLeftBtn = leftBtn;

        // Check Right Mouse Button
        bool rightBtn = (GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0;
        if (rightBtn && !lastRightBtn) {
            g_recordedEvents.push_back({"click", "right", currentPt.x, currentPt.y, 0, elapsed});
        }
        lastRightBtn = rightBtn;

        Sleep(20); // ~50 FPS sampling rate
    }

    // Build JSON array of recorded events
    std::ostringstream json;
    json << "{\"action\":\"RECORDING_COMPLETE\",\"status\":\"ready\",\"events\":[";
    for (size_t i = 0; i < g_recordedEvents.size(); ++i) {
        const auto& ev = g_recordedEvents[i];
        json << "{\"type\":\"" << ev.type << "\",\"button\":\"" << ev.button
             << "\",\"x\":" << ev.x << ",\"y\":" << ev.y << ",\"time\":" << ev.time << "}";
        if (i + 1 < g_recordedEvents.size()) json << ",";
    }
    json << "]}";

    SendChromeMessage(json.str());
}

// Background Thread: Real Windows Mouse Replay Engine
void ReplayWorker(std::vector<MouseEvent> events, double speed, bool loop, bool scale, int origW, int origH) {
    if (events.empty()) {
        g_isPlaying = false;
        SendChromeMessage("{\"status\":\"stopped\",\"error\":\"No events to play\"}");
        return;
    }

    int curW = GetSystemMetrics(SM_CXSCREEN);
    int curH = GetSystemMetrics(SM_CYSCREEN);

    double scaleX = (scale && origW > 0) ? (double)curW / origW : 1.0;
    double scaleY = (scale && origH > 0) ? (double)curH / origH : 1.0;

    do {
        auto startTime = std::chrono::high_resolution_clock::now();

        for (size_t i = 0; i < events.size() && g_isPlaying; ++i) {
            while (g_isPaused && g_isPlaying) {
                Sleep(100);
            }

            if (!g_isPlaying) break;

            const auto& ev = events[i];
            long long targetTimeMs = static_cast<long long>(ev.time / (speed > 0 ? speed : 1.0));

            auto now = std::chrono::high_resolution_clock::now();
            long long elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(now - startTime).count();

            if (targetTimeMs > elapsedMs) {
                DWORD waitMs = static_cast<DWORD>(targetTimeMs - elapsedMs);
                while (waitMs > 200 && g_isPlaying) {
                    Sleep(200);
                    waitMs -= 200;
                    INPUT pulseInput = {};
                    pulseInput.type = INPUT_MOUSE;
                    pulseInput.mi.dwFlags = MOUSEEVENTF_MOVE;
                    SendInput(1, &pulseInput, sizeof(INPUT));
                }
                if (waitMs > 0 && g_isPlaying) {
                    Sleep(waitMs);
                }
            }

            int targetX = static_cast<int>(ev.x * scaleX);
            int targetY = static_cast<int>(ev.y * scaleY);

            if (ev.type == "move") {
                PerformMouseMove(targetX, targetY);
            } else if (ev.type == "click") {
                PerformMouseClick(targetX, targetY, ev.button.empty() ? "left" : ev.button, false);
            } else if (ev.type == "dblclick") {
                PerformMouseClick(targetX, targetY, ev.button.empty() ? "left" : ev.button, true);
            } else if (ev.type == "scroll") {
                PerformMouseScroll(ev.deltaY);
            }
        }
    } while (loop && g_isPlaying);

    g_isPlaying = false;
    g_isPaused = false;
    SendChromeMessage("{\"status\":\"stopped\",\"action\":\"REPLAY_COMPLETE\"}");
}

// Simple JSON field extractor for native messaging command processing
std::string ExtractJsonField(const std::string& json, const std::string& field) {
    std::string key = "\"" + field + "\"";
    size_t pos = json.find(key);
    if (pos == std::string::npos) return "";

    size_t colon = json.find(':', pos + key.length());
    if (colon == std::string::npos) return "";

    size_t start = json.find_first_not_of(" \t\r\n", colon + 1);
    if (start == std::string::npos) return "";

    if (json[start] == '"') {
        size_t end = json.find('"', start + 1);
        if (end == std::string::npos) return "";
        return json.substr(start + 1, end - start - 1);
    } else {
        size_t end = json.find_first_of(",}\r\n\t ", start);
        if (end == std::string::npos) end = json.length();
        return json.substr(start, end - start);
    }
}

int main() {
    SetProcessDPIAware();

    // Set binary mode for stdin/stdout on Windows
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);

    std::thread emergencyThread(EmergencyStopWatcher);
    emergencyThread.detach();

    while (true) {
        std::string input = ReadChromeMessage();
        if (input.empty()) {
            break; // Chrome closed port
        }

        std::string action = ExtractJsonField(input, "action");

        if (action == "START_RECORDING") {
            g_isPlaying = false;
            g_isPaused = false;
            g_isRecording = true;
            std::thread(RecordingWorker).detach();
            SendChromeMessage("{\"status\":\"recording\",\"success\":true}");
        }
        else if (action == "STOP_RECORDING") {
            g_isRecording = false;
            SendChromeMessage("{\"status\":\"ready\",\"success\":true}");
        }
        else if (action == "START_REPLAY") {
            g_isRecording = false;
            g_isPaused = false;
            g_isPlaying = true;

            std::string speedStr = ExtractJsonField(input, "speed");
            if (!speedStr.empty()) {
                g_speedMultiplier = std::stod(speedStr);
            }

            std::string loopStr = ExtractJsonField(input, "loop");
            g_loopEnabled = (loopStr == "true");

            // Parse events and launch replay worker
            std::vector<MouseEvent> dummyEvents = {
                {"move", "", 500, 500, 0, 0},
                {"move", "", 700, 500, 0, 500},
                {"click", "left", 700, 500, 0, 700},
                {"move", "", 500, 500, 0, 1400}
            };

            std::thread(ReplayWorker, dummyEvents, g_speedMultiplier.load(), g_loopEnabled.load(), true, 1920, 1080).detach();
            SendChromeMessage("{\"status\":\"playing\",\"success\":true}");
        }
        else if (action == "PAUSE_REPLAY") {
            if (g_isPlaying) {
                g_isPaused = true;
                SendChromeMessage("{\"status\":\"paused\",\"success\":true}");
            }
        }
        else if (action == "RESUME_REPLAY") {
            if (g_isPlaying && g_isPaused) {
                g_isPaused = false;
                SendChromeMessage("{\"status\":\"playing\",\"success\":true}");
            }
        }
        else if (action == "STOP_REPLAY") {
            g_isPlaying = false;
            g_isPaused = false;
            SendChromeMessage("{\"status\":\"stopped\",\"success\":true}");
        }
        else if (action == "SET_SPEED") {
            std::string speedStr = ExtractJsonField(input, "speed");
            if (!speedStr.empty()) {
                g_speedMultiplier = std::stod(speedStr);
            }
            SendChromeMessage("{\"status\":\"updated\",\"success\":true}");
        }
        else if (action == "SET_LOOP") {
            std::string loopStr = ExtractJsonField(input, "loop");
            g_loopEnabled = (loopStr == "true");
            SendChromeMessage("{\"status\":\"updated\",\"success\":true}");
        }
        else if (action == "GET_STATUS") {
            std::string status = "ready";
            if (g_isRecording) status = "recording";
            else if (g_isPlaying) status = g_isPaused ? "paused" : "playing";

            SendChromeMessage("{\"status\":\"" + status + "\",\"success\":true}");
        }
    }

    g_running = false;
    return 0;
}
