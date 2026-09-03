/**
 * Replay Engine for Auto Cursor Replay Extension
 * Uses requestAnimationFrame for time-interpolated smooth movement and discrete event dispatching.
 */

class CursorPlayer {
  constructor(options = {}) {
    this.events = [];
    this.speed = options.speed || 1.0;
    this.loop = options.loop !== undefined ? options.loop : true;
    this.showClicks = options.showClicks !== undefined ? options.showClicks : true;

    // Callbacks
    this.onMove = options.onMove || (() => {});
    this.onClick = options.onClick || (() => {});
    this.onDblClick = options.onDblClick || (() => {});
    this.onScroll = options.onScroll || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.onFinish = options.onFinish || (() => {});

    // Internal state
    this.status = 'idle'; // 'idle' | 'playing' | 'paused'
    this.currentTime = 0; // Timeline ms (0 to totalDuration)
    this.totalDuration = 0;
    this.lastRealTime = 0;
    this.animFrameId = null;
    this.lastProcessedEventIndex = -1;
    this.lastTriggeredEvents = new Set();
  }

  loadEvents(events) {
    if (!events || events.length === 0) {
      this.events = [];
      this.totalDuration = 0;
      return;
    }

    // Sort events by timestamp just in case
    this.events = [...events].sort((a, b) => a.time - b.time);
    this.totalDuration = this.events[this.events.length - 1].time || 0;
    this.currentTime = 0;
    this.lastTriggeredEvents.clear();
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  setLoop(loop) {
    this.loop = !!loop;
  }

  setShowClicks(showClicks) {
    this.showClicks = !!showClicks;
  }

  start(events, settings = {}) {
    if (events) {
      this.loadEvents(events);
    }
    if (settings.speed !== undefined) this.setSpeed(settings.speed);
    if (settings.loop !== undefined) this.setLoop(settings.loop);
    if (settings.showClicks !== undefined) this.setShowClicks(settings.showClicks);

    if (this.events.length === 0) {
      console.warn('[AutoCursorReplay] Cannot start player: No recorded events loaded.');
      return;
    }

    this.currentTime = 0;
    this.lastTriggeredEvents.clear();
    this.status = 'playing';
    this.lastRealTime = performance.now();
    this.onStateChange(this.status, 0);

    this.tick();
  }

  pause() {
    if (this.status !== 'playing') return;
    this.status = 'paused';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    const progress = this.totalDuration > 0 ? (this.currentTime / this.totalDuration) * 100 : 0;
    this.onStateChange(this.status, progress);
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'playing';
    this.lastRealTime = performance.now();
    const progress = this.totalDuration > 0 ? (this.currentTime / this.totalDuration) * 100 : 0;
    this.onStateChange(this.status, progress);
    this.tick();
  }

  stop() {
    this.status = 'idle';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.currentTime = 0;
    this.lastTriggeredEvents.clear();
    this.onStateChange(this.status, 0);
  }

  tick = () => {
    if (this.status !== 'playing') return;

    const now = performance.now();
    const deltaRealMs = now - this.lastRealTime;
    this.lastRealTime = now;

    // Advance timeline based on speed multiplier
    const deltaVirtMs = deltaRealMs * this.speed;
    const prevTime = this.currentTime;
    this.currentTime += deltaVirtMs;

    // Handle end of playback
    if (this.currentTime >= this.totalDuration) {
      if (this.loop && this.totalDuration > 0) {
        // Trigger remaining events in final segment before loop
        this.processDiscreteEvents(prevTime, this.totalDuration);
        this.currentTime = this.currentTime % this.totalDuration;
        this.lastTriggeredEvents.clear();
        // Immediately process initial events of next loop
        this.processDiscreteEvents(0, this.currentTime);
      } else {
        this.currentTime = this.totalDuration;
        this.processDiscreteEvents(prevTime, this.totalDuration);
        this.updatePositionAtTime(this.totalDuration);

        this.status = 'idle';
        this.onStateChange(this.status, 100);
        this.onFinish();
        return;
      }
    } else {
      this.processDiscreteEvents(prevTime, this.currentTime);
    }

    // Update smooth cursor position
    this.updatePositionAtTime(this.currentTime);

    const progress = this.totalDuration > 0 ? (this.currentTime / this.totalDuration) * 100 : 0;
    this.onStateChange(this.status, progress);

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  processDiscreteEvents(startTime, endTime) {
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.time >= startTime && ev.time <= endTime) {
        if (!this.lastTriggeredEvents.has(i)) {
          this.lastTriggeredEvents.add(i);

          if (this.showClicks && ev.type === 'click') {
            this.onClick(ev.x, ev.y);
          } else if (this.showClicks && ev.type === 'dblclick') {
            this.onDblClick(ev.x, ev.y);
          } else if (ev.type === 'scroll') {
            this.onScroll(ev.deltaY || 100);
          }
        }
      }
    }
  }

  updatePositionAtTime(time) {
    if (this.events.length === 0) return;

    // Find position bearing keyframes around `time`
    const posEvents = this.events.filter(e => e.x !== undefined && e.y !== undefined);
    if (posEvents.length === 0) return;

    if (time <= posEvents[0].time) {
      this.onMove(posEvents[0].x, posEvents[0].y);
      return;
    }

    if (time >= posEvents[posEvents.length - 1].time) {
      const last = posEvents[posEvents.length - 1];
      this.onMove(last.x, last.y);
      return;
    }

    // Find adjacent points A and B
    let prevPoint = posEvents[0];
    let nextPoint = posEvents[posEvents.length - 1];

    for (let i = 0; i < posEvents.length - 1; i++) {
      if (time >= posEvents[i].time && time <= posEvents[i + 1].time) {
        prevPoint = posEvents[i];
        nextPoint = posEvents[i + 1];
        break;
      }
    }

    const duration = nextPoint.time - prevPoint.time;
    let fraction = 0;
    if (duration > 0) {
      fraction = (time - prevPoint.time) / duration;
    }

    // Smooth linear interpolation between points
    const currentX = prevPoint.x + fraction * (nextPoint.x - prevPoint.x);
    const currentY = prevPoint.y + fraction * (nextPoint.y - prevPoint.y);

    this.onMove(currentX, currentY);
  }
}

if (typeof window !== 'undefined') {
  window.CursorPlayer = CursorPlayer;
}
