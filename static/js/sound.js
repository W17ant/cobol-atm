/* ═══════════════════════════════════════════════════════════════════
   ATM Sound Engine — Procedural Web Audio API
   No external audio files needed. All sounds generated in real-time.
   ═══════════════════════════════════════════════════════════════════ */
const ATMSound = {
  ctx: null,
  master: null,
  enabled: false,
  _hum: null,

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
    this.enabled = true;
  },

  ensure() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggle() {
    if (!this.ctx) { this.init(); return true; }
    this.enabled = !this.enabled;
    this.master.gain.value = this.enabled ? 0.3 : 0;
    if (!this.enabled && this._hum) { this._hum.stop(); this._hum = null; }
    return this.enabled;
  },

  /* Keypad beep — short sine wave click */
  beep() {
    if (!this.enabled) return;
    this.ensure();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  },

  /* Card motor — low rumble with noise */
  cardMotor() {
    if (!this.enabled) return;
    this.ensure();
    const dur = 1.2;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * 0.15 * Math.sin(Math.PI * t / dur)
        + Math.sin(t * 120 * Math.PI * 2) * 0.08 * Math.sin(Math.PI * t / dur);
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(this.master);
    src.start();
  },

  /* Cash dispenser whirr — mechanical servo noise */
  cashDispense() {
    if (!this.enabled) return;
    this.ensure();
    const dur = 2.0;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      const env = Math.sin(Math.PI * t / dur);
      const click = Math.sin(t * 40 * Math.PI * 2) > 0.8 ? 0.3 : 0;
      data[i] = ((Math.random() * 2 - 1) * 0.1 + click * 0.06
        + Math.sin(t * 180 * Math.PI * 2) * 0.05) * env;
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 2;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(this.master);
    src.start();
  },

  /* Receipt printer — rapid clicking/buzzing */
  receiptPrint(duration) {
    if (!this.enabled) return;
    this.ensure();
    const dur = duration || 1.5;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      const env = Math.sin(Math.PI * t / dur);
      const rapid = Math.sin(t * 800 * Math.PI * 2) > 0.6 ? 1 : 0;
      data[i] = (Math.random() * 2 - 1) * 0.04 * rapid * env;
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(this.master);
    src.start();
  },

  /* Ambient ATM hum — very quiet continuous drone */
  startHum() {
    if (!this.enabled || this._hum) return;
    this.ensure();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 50;
    gain.gain.value = 0.008;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this._hum = osc;
  },

  stopHum() {
    if (this._hum) { this._hum.stop(); this._hum = null; }
  },

  /* Error buzz */
  errorBuzz() {
    if (!this.enabled) return;
    this.ensure();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  },

  /* Success chime */
  successChime() {
    if (!this.enabled) return;
    this.ensure();
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = this.ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.04, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  },
};
