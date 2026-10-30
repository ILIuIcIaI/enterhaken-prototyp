import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SKY, SUN_DIR } from './palette.js';

// Tageszeit (Stunde 0–24) steuert Sonne und Mond, Himmelsfarben, Licht, Nebel, Belichtung, Fensterlicht, Laternen,
// Leuchtreklame, Sterne und Glut. Voreinstellungen: Morgen, Mittag, Abend (der ursprüngliche Look um 19 Uhr). Im
// Tag-Nacht-Zyklus läuft ein ganzer Tag in CYCLE Sekunden. Wechsel per Menü laufen immer weich: die Uhr spult auf dem
// kürzeren Weg vor oder zurück. Das Wetter liegt darüber (zu jeder Tageszeit): Bewölkung macht Himmel und Licht grauer
// und weicher, Regen dunkler und dunstiger, die Straßen werden nass und trocknen danach langsam ab.
export const PRESETS = { morning: 8, noon: 13, evening: 19 };
// Hyper-Realistic-Mode: früherer Morgen und späterer Abend – die tiefe Sonne macht dort die Stimmung
const REAL_PRESETS = { morning: 6.7, noon: 13, evening: 19.15 };
// Wetter: [Bewölkung, Regen] – „klar“ ist der bisherige Himmel mit ein paar Wolkenbändern
export const WEATHER = { clear: [0, 0], cloudy: [0.75, 0], rain: [1, 1] };
const CYCLE = 435;           // s je 24 h (≈ 7¼ min)
const RISE = 6;              // Sonnenaufgang (h)
const EMAX = 58, NIGHT = 32; // höchster Sonnenstand, tiefster Stand nachts (°)
// Tageslänge so, dass die Sonne um 19 Uhr genau wie bisher steht
const EL19 = THREE.MathUtils.radToDeg(Math.asin(SUN_DIR.y));
const DAYLEN = (PRESETS.evening - RISE) / (1 - Math.asin(EL19 / EMAX) / Math.PI);
const AZ19 = Math.atan2(SUN_DIR.z, SUN_DIR.x);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Stützstellen über den Tag. sky: Zenit, oben, Mitte, Horizont zur Sonne, Horizont gegenüber, Boden, Sonne, Glühen,
// Smog · hemi: Himmel, Boden, Stärke · dir: Farbe und Stärke des gerichteten Lichts (tags Sonne, nachts Mond) ·
// exp: Belichtung (× Grafik-Einstellung) · lit: Fensterlicht · reflect: Himmelsspiegelung in den Fenstern ·
// day: 0 Abend/Nacht … 1 heller Tag (z. B. weiße statt farbiger Wolken)
const NIGHT_SKY = ['#04050d', '#0b1128', '#18203f', '#262a4d', '#1a1f3c', '#05050a', '#cfd8ff', '#34406e', '#0c0f1c'];
// nachts bläuliches Mondlicht, damit die Formen lesbar bleiben; tagsüber kräftiges Himmelslicht für helle Schatten
const NIGHT_LIGHT = { hemi: ['#3a4a84', '#161a2e', 1.5], dir: ['#a8b8f0', 0.95], exp: 1.5, fog: 0.0017, lit: 1.25, reflect: 0.7, lamps: 1, neon: 1, stars: 1, embers: 0.5, day: 0 };
export const KEYS = [
  { h: 0, sky: NIGHT_SKY, ...NIGHT_LIGHT },
  { h: 4.5, sky: ['#070a1c', '#141c40', '#2c2f5c', '#4a3a66', '#20264a', '#08080f', '#ffd0b0', '#6a3a5a', '#141428'], hemi: ['#3e4a80', '#171a2c', 1.4], dir: ['#aab6ea', 0.7], exp: 1.42, fog: 0.0017, lit: 1.2, reflect: 0.7, lamps: 1, neon: 1, stars: 0.8, embers: 0.4, day: 0 },
  { h: 6, sky: ['#1a2350', '#3c4a86', '#b0708e', '#ff9a5a', '#5c5e94', '#1e1626', '#ffd2a0', '#ff7a40', '#3a2836'], hemi: ['#7a74a8', '#2e2232', 1.4], dir: ['#ffa070', 1.4], exp: 1.1, fog: 0.0016, lit: 0.7, reflect: 0.9, lamps: 0.6, neon: 0.8, stars: 0.2, embers: 0.2, day: 0.25 },
  { h: 8, sky: ['#2a62c4', '#4f8ae0', '#92bdea', '#f6dcbc', '#aac4e0', '#2e3038', '#fff0d8', '#ffd8a8', '#7a8292'], hemi: ['#b6c4de', '#8a7a6c', 2.4], dir: ['#ffe2bc', 3.0], exp: 0.82, fog: 0.0012, lit: 0.12, reflect: 1.2, lamps: 0, neon: 0.35, stars: 0, embers: 0, day: 1 },
  { h: 13, sky: ['#1f5fd0', '#468ae6', '#86baee', '#d4e6f4', '#bcd4ea', '#363840', '#ffffff', '#fff4dc', '#8e98a8'], hemi: ['#bccadf', '#8c7e6e', 2.6], dir: ['#fff3e0', 3.3], exp: 0.78, fog: 0.0011, lit: 0.08, reflect: 1.25, lamps: 0, neon: 0.3, stars: 0, embers: 0, day: 1 },
  { h: 16.5, sky: ['#2a58b4', '#5a86d0', '#a6b8dc', '#f8d8b0', '#a8b8da', '#302e38', '#fff0d0', '#ffd090', '#757888'], hemi: ['#b8c2dc', '#86746a', 2.45], dir: ['#ffe4c0', 3.2], exp: 0.8, fog: 0.0012, lit: 0.15, reflect: 1.2, lamps: 0, neon: 0.35, stars: 0, embers: 0, day: 1 },
  { h: 18, sky: ['#24306e', '#5a4a96', '#d0789a', '#ffa860', '#8a6aa0', '#241a2c', '#ffe0b0', '#ff8a40', '#4a3040'], hemi: ['#b088c4', '#3e2c36', 1.7], dir: ['#ffb070', 3.2], exp: 0.95, fog: 0.0014, lit: 0.6, reflect: 1.05, lamps: 0.5, neon: 0.7, stars: 0.1, embers: 0.5, day: 0.4 },
  { h: 19, sky: ['#120a2a', '#45206a', '#b03f7c', '#ff8a38', '#7a3a80', '#1c0f26', '#ffd28c', '#ff6224', '#2e1532'], hemi: ['#9568c8', '#2c1a2e', 1.5], dir: ['#ffa060', 3.2], exp: 1.0, fog: 0.0015, lit: 1.15, reflect: 1.0, lamps: 1, neon: 1, stars: 1, embers: 1, day: 0 },
  { h: 20.5, sky: ['#0a0820', '#1e1846', '#44306a', '#8a4058', '#302650', '#0e0a16', '#ff9a78', '#8a3048', '#181026'], hemi: ['#4e4080', '#181020', 1.3], dir: ['#9aa0d8', 0.5], exp: 1.3, fog: 0.0016, lit: 1.25, reflect: 0.8, lamps: 1, neon: 1, stars: 1, embers: 0.8, day: 0 },
  { h: 22, sky: ['#05060f', '#0c1230', '#1c2244', '#2c2a4e', '#1c2040', '#06050c', '#cfd8ff', '#3a3a6e', '#0e1020'], hemi: ['#3c4a82', '#161a2e', 1.45], dir: ['#a8b8f0', 0.9], exp: 1.48, fog: 0.0017, lit: 1.25, reflect: 0.7, lamps: 1, neon: 1, stars: 1, embers: 0.6, day: 0 },
  { h: 24, sky: NIGHT_SKY, ...NIGHT_LIGHT },
].map((k) => ({ ...k, sky: k.sky.map((c) => new THREE.Color(c)), hemi: [new THREE.Color(k.hemi[0]), new THREE.Color(k.hemi[1]), k.hemi[2]], dir: [new THREE.Color(k.dir[0]), k.dir[1]] }));
const SKY_NAMES = ['uSkyZenith', 'uSkyHigh', 'uSkyMid', 'uSkyHorizonSun', 'uSkyHorizonAnti', 'uSkyGround', 'uSkySun', 'uSkyGlow', 'uSkySmog'];

// Farbe zu einem leicht bläulichen Grau gleicher Helligkeit ziehen (Bewölkung)
function overcast(col, amount, bright) {
  const L = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  col.r += (L * 0.96 * bright - col.r) * amount;
  col.g += (L * bright - col.g) * amount;
  col.b += (L * 1.06 * bright - col.b) * amount;
}

export class Environment {
  constructor(game) {
    this.game = game;
    this.hour = PRESETS.evening;
    this.target = null;       // Zielstunde eines weichen Wechsels
    this.preset = 'evening';
    this.cycle = false;
    this.lightDir = SUN_DIR.clone(); // schattenwerfendes Licht: Sonne, nachts der Mond gegenüber
    this.exposure = 1;
    this.day = 0;
    this.elevation = EL19;
    this.weather = 'clear';
    this.cloud = this.cloudT = 0; // Bewölkung (aktuell, Ziel)
    this.rain = this.rainT = 0;   // Regen
    this.wet = 0;                 // Nässe der Straßen und Dächer
    this.rainColor = new THREE.Color();
    this.real = false;            // Hyper-Realistic-Mode
    this.gold = this.dawn = 0;    // Stimmung bei tiefer Sonne: Abendrot, Morgenrot (0–1)
  }

  presetHour(name) {
    return (this.real ? REAL_PRESETS : PRESETS)[name];
  }

  // Beim Moduswechsel läuft die Uhr weich zur Tageszeit des Modus
  setReal(on) {
    if (this.real === on) return;
    this.real = on;
    if (!this.cycle) this.target = this.presetHour(this.preset);
  }

  setWeather(name, instant = false) {
    this.weather = name;
    [this.cloudT, this.rainT] = WEATHER[name];
    if (instant) {
      this.cloud = this.cloudT;
      this.rain = this.wet = this.rainT;
    }
  }

  setPreset(name, instant = false) {
    this.preset = name;
    if (instant) {
      this.hour = this.presetHour(name);
      this.target = null;
    } else this.target = this.presetHour(name);
  }

  setCycle(on) {
    if (this.cycle === on) return;
    this.cycle = on;
    if (!on) this.target = this.presetHour(this.preset); // ohne Zyklus zurück zur gewählten Tageszeit
  }

  // dt Echtzeit; running = das Spiel läuft (nicht Pause oder Fotomodus) – nur dann läuft der Zyklus
  update(dt, running) {
    if (this.target !== null) {
      const d = ((this.target - this.hour + 36) % 24) - 12; // kürzester Weg auf der Uhr (h)
      if (Math.abs(d) < 0.02) {
        this.hour = this.target;
        this.target = null;
      } else this.hour = (this.hour + d * (1 - Math.exp(-1.8 * dt)) + 24) % 24;
    } else if (running && this.cycle) this.hour = (this.hour + (dt * 24) / CYCLE) % 24;
    // Wetter weich überblenden; Nässe kommt mit dem Regen und trocknet danach langsam ab
    const ease = (x, t, rate) => x + (t - x) * (1 - Math.exp(-rate * dt));
    this.cloud = ease(this.cloud, this.cloudT, 0.6);
    this.rain = ease(this.rain, this.rainT, 0.5);
    this.wet = ease(this.wet, this.rain, this.rain > this.wet ? 0.35 : 0.05);
    this.apply();
  }

  apply() {
    const g = this.game, w = g.world, h = this.hour;
    // Sonnenstand: Bogen von RISE bis RISE + DAYLEN, nachts unter dem Horizont; Himmelsrichtung dreht 15°/h
    const t = (((h - RISE) % 24) + 24) % 24;
    const el = t < DAYLEN ? EMAX * Math.sin((Math.PI * t) / DAYLEN) : -NIGHT * Math.sin((Math.PI * (t - DAYLEN)) / (24 - DAYLEN));
    const az = AZ19 + ((h - PRESETS.evening) / 24) * Math.PI * 2, e = THREE.MathUtils.degToRad(el);
    const sun = SKY.uSunDir.value.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e));
    this.elevation = el;

    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    let k = (h - a.h) / (b.h - a.h);
    k = k * k * (3 - 2 * k);
    const mix = (x) => a[x] + (b[x] - a[x]) * k;
    SKY_NAMES.forEach((name, n) => SKY[name].value.lerpColors(a.sky[n], b.sky[n], k));
    w.hemi.color.lerpColors(a.hemi[0], b.hemi[0], k);
    w.hemi.groundColor.lerpColors(a.hemi[1], b.hemi[1], k);
    w.hemi.intensity = a.hemi[2] + (b.hemi[2] - a.hemi[2]) * k;
    // gerichtetes Licht: tags die Sonne, nachts der Mond; dicht am Horizont ausgeblendet – kein Sprung beim Wechsel
    this.lightDir.copy(sun);
    if (el < 0) this.lightDir.negate();
    w.sun.color.lerpColors(a.dir[0], b.dir[0], k);
    w.sun.intensity = (a.dir[1] + (b.dir[1] - a.dir[1]) * k) * smooth(0.5, 4, Math.abs(el));
    // Wetter darüber
    const c = this.cloud, r = this.rain;
    if (c > 0.001) {
      for (const name of SKY_NAMES) overcast(SKY[name].value, 0.72 * c, 1 - 0.3 * r);
      overcast(w.hemi.color, 0.6 * c, 1);
      overcast(w.hemi.groundColor, 0.4 * c, 1);
      w.hemi.intensity *= 1 + 0.2 * c;
      w.sun.intensity *= 1 - 0.72 * c;
    }
    g.scene.fog.density = mix('fog') * (1 + 0.6 * c + 0.9 * r);
    this.exposure = mix('exp') * (1 + 0.06 * c);
    this.day = mix('day');
    SKY.uSunUp.value = smooth(-3, 2, el) * (1 - 0.85 * c);
    // Stimmung: je tiefer die Sonne, desto stärker; klingt in der Dämmerung aus, unter Wolken gibt es keine
    const low = (1 - smooth(5, 25, el)) * smooth(-9, -2, el) * (1 - c);
    this.gold = SKY.uGold.value = h > 12 ? low : 0;
    this.dawn = SKY.uDawn.value = h > 12 ? 0 : low;
    SKY.uMoon.value = smooth(0, 6, -el) * (1 - this.day) * (1 - c);
    w.setSky({ stars: mix('stars') * (1 - c), day: this.day, clouds: c });
    const G = CONFIG.graphics;
    g.city.setDaylight({
      lit: mix('lit') + 0.25 * c * this.day, // an trüben Tagen brennt drinnen öfter Licht
      reflect: G.windowReflections ? mix('reflect') : 0,
      lamps: mix('lamps'),
      night: 1 - smooth(-3, 2, el),
      real: G.hyperReal,
      neon: mix('neon'),
      wet: this.wet,
    });
    w.wet.uWet.value = this.wet;
    g.embers.material.uniforms.uAmount.value = mix('embers') * (1 - r);
    this.rainColor.copy(w.hemi.color).multiplyScalar(0.45).addScalar(0.06);
  }

  // Uhrzeit als Text (für das Menü)
  clock() {
    const m = Math.floor(this.hour * 60) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
}
