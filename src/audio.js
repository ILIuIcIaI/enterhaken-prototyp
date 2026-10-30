// Prozeduraler Sound mit der WebAudio-API: Fahrtwind, Gas, Seilwinde, Gleiten und kurze Effekte.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.vol = { master: 1, sfx: 1 }; // Einstellungen (0–1)
    this.slow = 0;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    // Effekte → Zeitlupen-Filter → Gesamtlautstärke
    this.out = ctx.createGain();
    this.out.gain.value = this.vol.master ** 2;
    this.out.connect(ctx.destination);
    this.slowFilter = ctx.createBiquadFilter();
    this.slowFilter.type = 'lowpass';
    this.slowFilter.frequency.value = 20000;
    this.slowFilter.Q.value = 0.5;
    this.slowFilter.connect(this.out);
    this.master = ctx.createGain();
    this.master.gain.value = 0.55 * this.vol.sfx ** 2;
    this.master.connect(this.slowFilter);

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

    [this.gasFilter, this.gasGain] = this.loop('bandpass', 1700, 0.9);
    // Regen: helles Prasseln und tiefes Rauschen
    [, this.rainGain] = this.loop('bandpass', 2600, 0.45);
    [, this.rainLowGain] = this.loop('lowpass', 520, 0.5);
    // Wasser: Rauschen beim Surfen und beim Sprint über das Wasser
    [this.waterFilter, this.waterGain] = this.loop('bandpass', 900, 0.6);
    // Grinden: metallisches Schaben (schmalbandiges Rauschen, höher bei Tempo)
    [this.grindFilter, this.grindGain] = this.loop('bandpass', 2600, 4);
  }

  // vom Lüfter hochgeschleudert: aufsteigendes Rauschen
  fanLaunch() {
    this.burst('highpass', 1800, 0.55, 0.32, 0.6);
    this.burst('bandpass', 700, 0.4, 0.22, 0.8);
    this.tone('sawtooth', 110, 520, 0.35, 0.035);
  }

  // auffliegender Vogelschwarm: viele kurze Flügelschläge durcheinander (k = Lautstärke nach Abstand)
  flutter(k = 1) {
    for (let i = 0; i < 14; i++) this.burst('bandpass', 900 + Math.random() * 900, 0.06, 0.1 * k, 1.6, i * 0.045 + Math.random() * 0.03);
  }

  // Glocke der Klappbrücke: drei helle Schläge mit Nachklang
  bell() {
    for (let k = 0; k < 3; k++) {
      this.tone('triangle', 1320, 1300, 0.9, 0.06, k * 0.45);
      this.tone('sine', 2640, 2600, 0.6, 0.025, k * 0.45);
    }
  }

  // Aufsetzen auf eine Schiene / ein Kabel: metallisches Klacken
  grindHit() {
    this.tone('square', 900, 280, 0.08, 0.05);
    this.burst('highpass', 3200, 0.12, 0.22, 1.2);
  }

  // Lautstärken aus den Einstellungen (0–1, quadratisch fürs Gehör)
  setVolume(master, sfx) {
    this.vol.master = master;
    this.vol.sfx = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(master ** 2, t, 0.03);
    this.master.gain.setTargetAtTime(0.55 * sfx ** 2, t, 0.03);
  }

  // Zeitlupe dämpft den Klang (0 = normal, 1 = volle Zeitlupe)
  setSlow(k) {
    k = Math.min(1, Math.max(0, k));
    if (!this.ctx || Math.abs(k - this.slow) < 0.005) return;
    this.slow = k;
    this.slowFilter.frequency.setTargetAtTime(20000 * Math.pow(900 / 20000, k), this.ctx.currentTime, 0.03);
  }

  // Platschen: aufs Wasser setzen, einsinken
  splash(strength = 1) {
    this.burst('lowpass', 1400, 0.45, 0.3 * strength, 0.7);
    this.burst('bandpass', 3200, 0.25, 0.12 * strength, 0.8);
    this.tone('sine', 220, 90, 0.18, 0.08 * strength);
  }

  // Flow-Stufe erreicht: kurzer, heller Doppelton – je Stufe höher
  flowUp(tier) {
    const f = 440 * Math.pow(1.26, tier);
    this.tone('triangle', f, f * 1.5, 0.12, 0.07);
    this.tone('triangle', f * 1.5, f * 2, 0.18, 0.06, 0.09);
  }

  // perfekter Moment: tiefer Schlag und Luftzug
  moment() {
    this.tone('sine', 150, 38, 0.9, 0.5);
    this.burst('lowpass', 700, 0.6, 0.28, 0.8);
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

  // opts: { reeling, gliding, boosting, rain (0–1), water (Tempo auf dem Wasser, 0 = nicht), grind (Tempo beim Grinden) }
  update(speed, { reeling = false, gliding = false, boosting = false, rain = 0, water = 0, grind = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gk = Math.min(1, grind / 30);
    this.grindGain.gain.setTargetAtTime(grind > 0 ? 0.08 + 0.16 * gk : 0, t, 0.05);
    this.grindFilter.frequency.setTargetAtTime(1800 + 2200 * gk, t, 0.08);
    const wv = Math.min(1, water / 25);
    this.waterGain.gain.setTargetAtTime(water > 0 ? 0.1 + 0.3 * wv : 0, t, 0.08);
    this.waterFilter.frequency.setTargetAtTime(600 + 1800 * wv, t, 0.1);
    this.rainGain.gain.setTargetAtTime(rain * 0.16, t, 0.4);
    this.rainLowGain.gain.setTargetAtTime(rain * 0.1, t, 0.4);
    const w = Math.min(1, Math.max(0, (speed - 4) / 60));
    this.windGain.gain.setTargetAtTime(w * w * 0.6, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(250 + w * 2400, t, 0.12);
    this.glideGain.gain.setTargetAtTime(gliding ? 0.08 + w * 0.25 : 0, t, 0.15);
    this.glideFilter.frequency.setTargetAtTime(500 + w * 1500, t, 0.15);
    this.reelGain.gain.setTargetAtTime(reeling ? 0.05 : 0, t, 0.05);
    this.reelOsc.frequency.setTargetAtTime(70 + Math.min(speed, 60) * 3, t, 0.1);
    this.gasGain.gain.setTargetAtTime(boosting ? 0.22 : 0, t, 0.04);
  }

  burst(type, freq, dur, gain, q = 1, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
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

  tone(type, f0, f1, dur, gain, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
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
