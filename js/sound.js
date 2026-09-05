// ============================================================
// SOUND — subtle sound effects only. NO music, ever.
// Uses Web Audio API tones so no binary assets are required,
// but will use /assets/sounds/*.mp3 automatically if present.
// ============================================================

const Sound = {
  enabled: localStorage.getItem("ra_sound") !== "off",
  ctx: null,

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem("ra_sound", this.enabled ? "on" : "off");
    return this.enabled;
  },

  _ctxInstance() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  },

  _tone(freq, duration, type = "sine", gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      const ctx = this._ctxInstance();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* audio not available, fail silently */ }
  },

  click() { this._tone(500, 0.08, "square", 0.06); },
  open() { this._tone(440, 0.15, "sine", 0.08); },
  correct() { this._tone(660, 0.12, "sine", 0.1); setTimeout(() => this._tone(880, 0.15, "sine", 0.1), 100); },
  incorrect() { this._tone(220, 0.2, "sawtooth", 0.06); },
  badge() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, "sine", 0.09), i * 90)); },
  challengeComplete() { [440, 554, 659].forEach((f, i) => setTimeout(() => this._tone(f, 0.15, "triangle", 0.08), i * 80)); },
  storyComplete() { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.2, "sine", 0.09), i * 100)); }
};
