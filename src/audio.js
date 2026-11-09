// All sound is synthesised with the Web Audio API — no asset files.
export class Sound {
  constructor() { this.enabled = true; this.ctx = null; }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur, { type = 'sine', gain = 0.2, delay = 0, slide = 0, attack = 0.005 } = {}) {
    if (!this.enabled) return; const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { gain = 0.3, freq = 1000, q = 1, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    if (!this.enabled) return; const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  click() { this.tone(660, 0.06, { type: 'triangle', gain: 0.12 }); }
  select() { this.tone(520, 0.09, { type: 'triangle', gain: 0.14 }); this.tone(780, 0.1, { type: 'triangle', gain: 0.1, delay: 0.05 }); }
  place() { this.noise(0.09, { freq: 300, gain: 0.35, type: 'lowpass' }); this.tone(170, 0.1, { gain: 0.2, slide: -60 }); }
  dice(v = 0.5) { this.noise(0.045, { freq: 2600 + Math.random() * 1200, q: 2.5, gain: 0.1 + v * 0.3 }); this.tone(900 + Math.random() * 500, 0.03, { type: 'square', gain: 0.03 + v * 0.05 }); }
  cannon(big = true) { this.noise(big ? 0.5 : 0.18, { freq: big ? 500 : 1400, type: 'lowpass', gain: big ? 0.6 : 0.2, sweep: big ? -420 : -900 }); if (big) this.tone(70, 0.4, { gain: 0.5, slide: -35 }); }
  march() { for (let i = 0; i < 4; i++) this.noise(0.05, { freq: 420, type: 'lowpass', gain: 0.22, delay: i * 0.13 }); }
  conquer() { [392, 523, 659].forEach((f, i) => { this.tone(f, 0.28, { type: 'sawtooth', gain: 0.09, delay: i * 0.09 }); this.tone(f * 2, 0.28, { type: 'triangle', gain: 0.06, delay: i * 0.09 }); }); }
  lose() { [330, 262].forEach((f, i) => this.tone(f, 0.3, { type: 'sawtooth', gain: 0.07, delay: i * 0.13 })); }
  cards() { [880, 1108, 1318].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', gain: 0.12, delay: i * 0.06 })); }
  turn() { this.tone(440, 0.16, { type: 'triangle', gain: 0.1 }); this.tone(660, 0.22, { type: 'triangle', gain: 0.1, delay: 0.1 }); }
  eliminated() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, { type: 'sawtooth', gain: 0.08, delay: i * 0.16 })); this.noise(0.9, { freq: 200, type: 'lowpass', gain: 0.3, delay: 0.5 }); }
  victory() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { this.tone(f, 0.42, { type: 'sawtooth', gain: 0.08, delay: i * 0.15 }); this.tone(f / 2, 0.42, { type: 'triangle', gain: 0.1, delay: i * 0.15 }); }); }
  error() { this.tone(160, 0.12, { type: 'square', gain: 0.06 }); }
}
