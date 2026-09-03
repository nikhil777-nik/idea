"""
Auto Cursor Replay - Windows Native Host (Python 3 Win32 ctypes runner)
Controls the REAL Windows system mouse pointer using ctypes.windll.user32.
"""

import sys
import struct
import json
import time
import threading
import ctypes
from ctypes import wintypes

# Win32 API Definitions via ctypes
user32 = ctypes.windll.user32

# Enable Per-Monitor High-DPI Awareness V2 for exact 1:1 pixel coordinates on scaled Windows displays
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        user32.SetProcessDPIAware()
    except Exception:
        pass

class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

# Mouse Event Flags
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_WHEEL = 0x0800
VK_LBUTTON = 0x01
VK_RBUTTON = 0x02
VK_ESCAPE = 0x1B
VK_RETURN = 0x0D

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long),
        ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))
    ]

class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT)]

class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_ulong),
        ("u", INPUT_UNION)
    ]

INPUT_MOUSE = 0

def set_cursor_pos(x, y):
    user32.SetCursorPos(int(x), int(y))

def get_cursor_pos():
    pt = POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y

def perform_click(x, y, button="left", is_dbl=False):
    set_cursor_pos(x, y)
    flags_down = MOUSEEVENTF_LEFTDOWN if button == "left" else MOUSEEVENTF_RIGHTDOWN
    flags_up = MOUSEEVENTF_LEFTUP if button == "left" else MOUSEEVENTF_RIGHTUP

    inp_down = INPUT(type=INPUT_MOUSE, u=INPUT_UNION(mi=MOUSEINPUT(0, 0, 0, flags_down, 0, None)))
    inp_up = INPUT(type=INPUT_MOUSE, u=INPUT_UNION(mi=MOUSEINPUT(0, 0, 0, flags_up, 0, None)))

    user32.SendInput(1, ctypes.byref(inp_down), ctypes.sizeof(INPUT))
    user32.SendInput(1, ctypes.byref(inp_up), ctypes.sizeof(INPUT))

    if is_dbl:
        time.sleep(0.05)
        user32.SendInput(1, ctypes.byref(inp_down), ctypes.sizeof(INPUT))
        user32.SendInput(1, ctypes.byref(inp_up), ctypes.sizeof(INPUT))

def perform_scroll(delta_y):
    inp = INPUT(type=INPUT_MOUSE, u=INPUT_UNION(mi=MOUSEINPUT(0, 0, int(delta_y), MOUSEEVENTF_WHEEL, 0, None)))
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

# Native Messaging I/O
def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(message)

def send_message(message_dict):
    encoded = json.dumps(message_dict).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('@I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

# Global state
g_is_recording = False
g_is_playing = False
g_is_paused = False
g_speed = 1.0
g_loop = False
g_events = []
g_recorded_events = []
g_stop_flag = False

def emergency_esc_watcher():
    global g_is_recording, g_is_playing, g_is_paused
    while True:
        if user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000:
            if g_is_playing or g_is_recording:
                g_is_playing = False
                g_is_recording = False
                g_is_paused = False
                send_message({"status": "stopped", "action": "EMERGENCY_STOP", "message": "Emergency ESC pressed"})
                time.sleep(0.3)
        time.sleep(0.05)

def recording_thread():
    global g_is_recording, g_recorded_events
    g_recorded_events = []
    start_time = time.time()
    last_x, last_y = -1, -1
    last_lbtn = False
    last_rbtn = False

    while g_is_recording:
        # Pressing ENTER stops recording automatically
        if user32.GetAsyncKeyState(VK_RETURN) & 0x8000:
            g_is_recording = False
            break

        elapsed = int((time.time() - start_time) * 1000)
        x, y = get_cursor_pos()

        if x != last_x or y != last_y:
            g_recorded_events.append({"type": "move", "x": x, "y": y, "time": elapsed})
            last_x, last_y = x, y

        lbtn = (user32.GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0
        if lbtn and not last_lbtn:
            g_recorded_events.append({"type": "click", "button": "left", "x": x, "y": y, "time": elapsed})
        last_lbtn = lbtn

        rbtn = (user32.GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0
        if rbtn and not last_rbtn:
            g_recorded_events.append({"type": "click", "button": "right", "x": x, "y": y, "time": elapsed})
        last_rbtn = rbtn

        time.sleep(0.02)

    send_message({
        "action": "RECORDING_COMPLETE",
        "status": "ready",
        "events": g_recorded_events
    })

def replay_thread(events, speed, loop, scale, orig_w, orig_h):
    global g_is_playing, g_is_paused

    if not events:
        g_is_playing = False
        send_message({"status": "stopped", "error": "No events"})
        return

    cur_w = user32.GetSystemMetrics(0) # SM_CXSCREEN
    cur_h = user32.GetSystemMetrics(1) # SM_CYSCREEN

    scale_x = (cur_w / orig_w) if (scale and orig_w > 0) else 1.0
    scale_y = (cur_h / orig_h) if (scale and orig_h > 0) else 1.0

    while True:
        start_time = time.time()
        for ev in events:
            while g_is_paused and g_is_playing:
                time.sleep(0.1)

            if not g_is_playing:
                break

            target_time_sec = (ev.get("time", 0) / 1000.0) / (speed if speed > 0 else 1.0)
            elapsed_sec = time.time() - start_time
            if target_time_sec > elapsed_sec:
                time.sleep(target_time_sec - elapsed_sec)

            tx = int(ev.get("x", 0) * scale_x)
            ty = int(ev.get("y", 0) * scale_y)

            ev_type = ev.get("type", "move")
            if ev_type == "move":
                set_cursor_pos(tx, ty)
            elif ev_type == "click":
                perform_click(tx, ty, ev.get("button", "left"), False)
            elif ev_type == "dblclick":
                perform_click(tx, ty, ev.get("button", "left"), True)
            elif ev_type == "scroll":
                perform_scroll(ev.get("deltaY", 120))

        if not loop or not g_is_playing:
            break

    g_is_playing = False
    g_is_paused = False
    send_message({"status": "stopped", "action": "REPLAY_COMPLETE"})

def main():
    global g_is_recording, g_is_playing, g_is_paused, g_speed, g_loop, g_events

    threading.Thread(target=emergency_esc_watcher, daemon=True).start()

    while True:
        try:
            msg = read_message()
            if msg is None:
                break
        except Exception:
            break

        action = msg.get("action", "")

        if action == "START_RECORDING":
            g_is_playing = False
            g_is_paused = False
            g_is_recording = True
            threading.Thread(target=recording_thread, daemon=True).start()
            send_message({"status": "recording", "success": True})

        elif action == "STOP_RECORDING":
            g_is_recording = False
            send_message({"status": "ready", "success": True})

        elif action == "START_REPLAY":
            g_is_recording = False
            g_is_paused = False
            g_is_playing = True

            profile = msg.get("profile", {})
            events = profile.get("events", [])
            screen = profile.get("screen", {"width": 1920, "height": 1080})
            speed = float(msg.get("speed", 1.0))
            loop = bool(msg.get("loop", False))
            scale = bool(msg.get("scaleToScreen", True))

            threading.Thread(
                target=replay_thread,
                args=(events, speed, loop, scale, screen.get("width", 1920), screen.get("height", 1080)),
                daemon=True
            ).start()

            send_message({"status": "playing", "success": True})

        elif action == "PAUSE_REPLAY":
            if g_is_playing:
                g_is_paused = True
                send_message({"status": "paused", "success": True})

        elif action == "RESUME_REPLAY":
            if g_is_playing and g_is_paused:
                g_is_paused = False
                send_message({"status": "playing", "success": True})

        elif action == "STOP_REPLAY":
            g_is_playing = False
            g_is_paused = False
            send_message({"status": "stopped", "success": True})

        elif action == "SET_SPEED":
            g_speed = float(msg.get("speed", 1.0))
            send_message({"status": "updated", "success": True})

        elif action == "SET_LOOP":
            g_loop = bool(msg.get("loop", False))
            send_message({"status": "updated", "success": True})

        elif action == "GET_STATUS":
            status = "ready"
            if g_is_recording:
                status = "recording"
            elif g_is_playing:
                status = "paused" if g_is_paused else "playing"
            send_message({"status": status, "success": True})

if __name__ == "__main__":
    main()
