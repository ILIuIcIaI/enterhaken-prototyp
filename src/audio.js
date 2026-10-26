// Prozeduraler Sound mit der WebAudio-API: Fahrtwind, Seilwinde, Aufladen, Gleiten und kurze Effekte.
export class AudioFX {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    [this.windFilter, this.windGain] = this.loop('lowpass', 400, 0.7);
    [this.glideFilter, this.glideGain] = this.loop('bandpass', 900, 0.6);

    this.reelOsc = ctx.createOscillator();
    this.reelOsc.type = 'sawtooth';
    this.reelOsc.frequency.value = 80;
    const reelFilter = ctx.createBiquadFilter();
    reelFilter.type = 'lowpass';
    reelFilter.frequency.value = 700;
    this.reelGain = ctx.createGain();
    this.reelGain.gain.value = 0;
    this.reelOsc.connect(reelFilter).connect(this.reelGain).connect(this.master);
    this.reelOsc.start();

    this.chargeOsc = ctx.createOscillator();
    this.chargeOsc.type = 'triangle';
    this.chargeOsc.frequency.value = 110;
    this.chargeGain = ctx.createGain();
    this.chargeGain.gain.value = 0;
    this.chargeOsc.connect(this.chargeGain).connect(this.master);
    this.chargeOsc.start();
  }

  loop(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return [filter, gain];
  }

  // opts: { reeling, gliding, charge (-1 = nicht aufladen) }
  update(speed, { reeling = false, gliding = false, charge = -1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, Math.max(0, (speed - 4) / 60));
    this.windGain.gain.setTargetAtTime(w * w * 0.6, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(250 + w * 2400, t, 0.12);
    this.glideGain.gain.setTargetAtTime(gliding ? 0.08 + w * 0.25 : 0, t, 0.15);
    this.glideFilter.frequency.setTargetAtTime(500 + w * 1500, t, 0.15);
    this.reelGain.gain.setTargetAtTime(reeling ? 0.05 : 0, t, 0.05);
    this.reelOsc.frequency.setTargetAtTime(70 + Math.min(speed, 60) * 3, t, 0.1);
    this.chargeGain.gain.setTargetAtTime(charge >= 0 ? 0.03 + charge * 0.06 : 0, t, 0.04);
    if (charge >= 0) this.chargeOsc.frequency.setTargetAtTime(110 + charge * 330, t, 0.05);
  }

  burst(type, freq, dur, gain, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(type, f0, f1, dur, gain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shoot() {
    this.burst('highpass', 2500, 0.14, 0.3);
    this.tone('square', 1500, 400, 0.07, 0.05);
  }

  attach() {
    this.tone('sine', 170, 55, 0.16, 0.45);
    this.burst('bandpass', 900, 0.06, 0.35, 2);
  }

  miss() {
    this.tone('triangle', 650, 280, 0.14, 0.08);
  }

  snap(strength) {
    this.tone('triangle', 240, 90, 0.12, Math.min(0.3, strength / 80));
  }

  // dumpfer Schritt – beim Sprinten lauter und tiefer
  step(intensity) {
    this.tone('sine', 95 - intensity * 25, 45, 0.09, 0.06 + intensity * 0.12);
    this.burst('lowpass', 380 + intensity * 200, 0.07, 0.04 + intensity * 0.08);
  }

  land(strength) {
    const s = Math.min(1, strength / 35);
    this.tone('sine', 110, 40, 0.22, 0.2 + 0.4 * s);
    this.burst('lowpass', 500, 0.18, 0.2 + 0.3 * s);
  }

  superJump(charge) {
    this.tone('sine', 90, 35, 0.35, 0.35 + charge * 0.3);
    this.burst('lowpass', 700, 0.4, 0.3 + charge * 0.3);
    this.burst('highpass', 1800, 0.25, 0.12 + charge * 0.15);
  }

  dash() {
    this.burst('bandpass', 1300, 0.3, 0.45, 0.7);
    this.tone('sawtooth', 320, 90, 0.18, 0.05);
  }

  glide(on) {
    this.burst(on ? 'highpass' : 'bandpass', on ? 1600 : 700, 0.22, on ? 0.22 : 0.12, 0.8);
  }

  wallrun() {
    this.burst('bandpass', 320, 0.12, 0.35, 1.5);
  }

  jump() {
    this.burst('lowpass', 900, 0.08, 0.15);
  }
}
