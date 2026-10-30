import { CONFIG } from './config.js';
import { PRESETS, WEATHER } from './environment.js';
import { setRealistic } from './toon.js';

// Einstellungen im Menü (Reiter „Einstellungen“, auch in der Pause). Werden in diesem Browser gespeichert und beim
// Start angewendet. Das Tuning-Menü (G) bleibt das Werkzeug für alle Feinwerte.
const KEY = 'enterhaken.settings';

export const DEFAULTS = {
  resolution: 100,
  shadows: 'high',
  ink: 100,
  bloom: 100,
  fov: CONFIG.camera.fov,
  speedlines: true,
  hyperReal: false,
  animeChars: true,
  shake: true,
  fps: false,
  windowReflections: true,
  waterReflections: true,
  sensitivity: 100,
  invertY: false,
  aimAssist: false,
  volume: 100,
  sfx: 100,
  perfectSlowmo: true,
  glitch: true,
  flow: true,
  timeOfDay: 'evening',
  dayCycle: false,
  weather: 'clear',
};

// Schattenkarten (Stadt, Figur) je Stufe
const SHADOWS = { low: [1024, 1024], mid: [2048, 1024], high: [2048, 2048], ultra: [4096, 2048] };
const BASE = { sensitivity: CONFIG.camera.sensitivity, bloom: CONFIG.graphics.bloom };

// Aufbau des Menüs: zwei Spalten mit Gruppen
const SCHEMA = [
  { title: 'Grafik', col: 0, items: [
    { key: 'resolution', label: 'Renderauflösung', type: 'range', min: 50, max: 150, step: 5, unit: '%', live: false, hint: 'Weniger läuft flüssiger, mehr ist schärfer' },
    { key: 'shadows', label: 'Schatten', type: 'choice', options: [['low', 'Niedrig'], ['mid', 'Mittel'], ['high', 'Hoch'], ['ultra', 'Ultra']] },
    { key: 'ink', label: 'Tuschelinien', type: 'range', min: 0, max: 150, step: 5, unit: '%' },
    { key: 'bloom', label: 'Leuchten', type: 'range', min: 0, max: 200, step: 5, unit: '%' },
    { key: 'fov', label: 'Sichtfeld', type: 'range', min: 55, max: 100, step: 1, unit: '°' },
    { key: 'windowReflections', label: 'Fensterreflexion', type: 'toggle' },
    { key: 'waterReflections', label: 'Wasserreflexion', type: 'toggle', hint: 'Nasse Straßen (im Hyper-Realistic-Mode auch das Meer) spiegeln die Stadt – aus: nur den Himmel (schneller)' },
    { key: 'speedlines', label: 'Tempolinien', type: 'toggle' },
    { key: 'hyperReal', label: 'Hyper-Realistic-Mode', type: 'toggle', hint: 'Kein Cel-Shading: physikalisch basierte Materialien im Licht des echten Himmels, Spiegelungen, keine Tuschelinien, Filmlook' },
    { key: 'animeChars', label: 'Anime-Look der Figuren', type: 'toggle', hint: 'Im Hyper-Realistic-Mode behalten die Figuren feine Umrisse und eine weiche Schattenkante' },
    { key: 'shake', label: 'Kamerawackeln', type: 'toggle' },
    { key: 'fps', label: 'Bilder pro Sekunde anzeigen', type: 'toggle' },
  ] },
  { title: 'Audio', col: 0, items: [
    { key: 'volume', label: 'Gesamtlautstärke', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
    { key: 'sfx', label: 'Effekte', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
  ] },
  { title: 'Welt', col: 1, clock: true, items: [
    { key: 'timeOfDay', label: 'Tageszeit', type: 'choice', options: [['morning', 'Morgen'], ['noon', 'Mittag'], ['evening', 'Abend']] },
    { key: 'dayCycle', label: 'Tag-Nacht-Zyklus', type: 'toggle', hint: 'Ein ganzer Tag samt Nacht in gut 7 Minuten' },
    { key: 'weather', label: 'Wetter', type: 'choice', options: [['clear', 'Klar'], ['cloudy', 'Bewölkt'], ['rain', 'Regen']] },
  ] },
  { title: 'Steuerung', col: 1, items: [
    { key: 'sensitivity', label: 'Mausempfindlichkeit', type: 'range', min: 20, max: 300, step: 5, unit: '%' },
    { key: 'invertY', label: 'Maus-Y umkehren', type: 'toggle' },
    { key: 'aimAssist', label: 'Zielhilfe', type: 'toggle', hint: 'Knapp an einem Gebäude vorbeigezielt zählt trotzdem' },
  ] },
  { title: 'Spiel', col: 1, items: [
    { key: 'perfectSlowmo', label: 'Zeitlupe bei perfekten Momenten', type: 'toggle', hint: 'Perfekter Absprung vom Seil, Rettung in letzter Sekunde, knapp an einer Kante vorbei' },
    { key: 'glitch', label: 'Glitch-Effekt in der Zeitlupe', type: 'toggle', hint: 'Farbversatz und Bildstreifen' },
    { key: 'flow', label: 'Flow', type: 'toggle', hint: 'Schnell und sauber unterwegs füllt die Leiste – jede Stufe lädt Gas schneller nach' },
  ] },
];

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = {};
    // nur bekannte Schlüssel mit passendem Typ übernehmen
    for (const k in DEFAULTS) if (typeof v[k] === typeof DEFAULTS[k]) out[k] = v[k];
    if (out.shadows && !SHADOWS[out.shadows]) delete out.shadows;
    if (out.timeOfDay && !(out.timeOfDay in PRESETS)) delete out.timeOfDay;
    if (out.weather && !(out.weather in WEATHER)) delete out.weather;
    return out;
  } catch {
    return {};
  }
}

function save(values) {
  try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* privates Fenster o. Ä. */ }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// neue Größe einer Schattenkarte: die alte wird verworfen und beim nächsten Bild neu angelegt
function shadowSize(light, size) {
  const sh = light.shadow;
  if (sh.mapSize.x === size) return;
  sh.mapSize.set(size, size);
  if (sh.map) {
    sh.map.dispose();
    sh.map = null;
  }
}

// first: beim Start – Tageszeit dann sofort setzen statt hinzuspulen
function applySettings(game, s, first) {
  const G = CONFIG.graphics, C = CONFIG.camera;
  const env = game.env;
  if (first || env.preset !== s.timeOfDay) env.setPreset(s.timeOfDay, first);
  env.setCycle(s.dayCycle);
  if (first || env.weather !== s.weather) env.setWeather(s.weather, first);
  G.windowReflections = s.windowReflections;
  G.waterReflections = s.waterReflections;
  const pr = Math.min(window.devicePixelRatio, 1.25) * (s.resolution / 100);
  if (Math.abs(pr - game.pixelRatio) > 1e-3) {
    game.pixelRatio = pr;
    game.renderer.setPixelRatio(pr);
    game.onResize();
  }
  const [city, fig] = SHADOWS[s.shadows];
  // Hyper-Realistic-Mode: doppelt so große Schattenfläche bei gleicher Schärfe (realism.js stellt die Fläche ein)
  shadowSize(game.world.sun, s.hyperReal ? Math.min(4096, city * 2) : city);
  shadowSize(game.charShadow.light, fig);
  G.ink = s.ink / 100;
  G.bloom = BASE.bloom * (s.bloom / 100);
  G.speedlines = s.speedlines;
  G.hyperReal = s.hyperReal;
  env.setReal(s.hyperReal);
  game.realism.set(s.hyperReal);
  setRealistic(s.hyperReal, s.animeChars);
  G.fps = s.fps;
  C.fov = s.fov;
  C.shake = s.shake;
  C.sensitivity = BASE.sensitivity * (s.sensitivity / 100);
  C.invertY = s.invertY;
  CONFIG.hook.aimAssist = s.aimAssist;
  CONFIG.gameplay.perfectSlowmo = s.perfectSlowmo;
  CONFIG.gameplay.glitch = s.glitch;
  CONFIG.gameplay.flow = s.flow;
  game.audio.setVolume(s.volume / 100, s.sfx / 100);
  game.gui?.controllersRecursive().forEach((c) => c.updateDisplay()); // Tuning-Menü zeigt die neuen Werte
}

export class Settings {
  constructor(game) {
    this.game = game;
    this.values = { ...DEFAULTS, ...load() };
    this.refreshers = [];
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    save(this.values);
    this.apply();
  }

  reset() {
    this.values = { ...DEFAULTS };
    save(this.values);
    this.apply();
    for (const r of this.refreshers) r();
  }

  apply(first = false) {
    applySettings(this.game, this.values, first);
  }

  // Uhrzeit neben „Welt“ (zeigt auch, wo der Zyklus steht)
  tick() {
    if (this.clockEl) this.clockEl.textContent = this.game.env.clock();
  }

  build(root) {
    root.innerHTML = '';
    this.refreshers.length = 0;
    const cols = [el('div', 'set-col'), el('div', 'set-col')];
    root.append(...cols);
    for (const group of SCHEMA) {
      const sec = el('section', 'set-group');
      const h3 = el('h3', '', group.title);
      if (group.clock) h3.append((this.clockEl = el('span', 'set-clock')));
      sec.append(h3);
      for (const it of group.items) sec.append(this.row(it));
      cols[group.col].append(sec);
    }
  }

  row(it) {
    const row = el('div', 'set-row');
    const id = `set-${it.key}`;
    let label, ctl, refresh;
    if (it.type === 'range') {
      label = el('label', 'set-label', it.label);
      label.htmlFor = id;
      ctl = el('div', 'set-range');
      const input = Object.assign(document.createElement('input'), { type: 'range', id, min: it.min, max: it.max, step: it.step });
      const out = el('output');
      const show = (v) => (out.textContent = `${v}${it.unit}`);
      refresh = () => {
        input.value = this.values[it.key];
        show(this.values[it.key]);
      };
      // live: false → erst beim Loslassen anwenden (Auflösung: die Bildpuffer werden neu angelegt)
      input.addEventListener('input', () => {
        show(input.value);
        if (it.live !== false) this.set(it.key, Number(input.value));
      });
      if (it.live === false) input.addEventListener('change', () => this.set(it.key, Number(input.value)));
      ctl.append(input, out);
    } else if (it.type === 'toggle') {
      label = el('label', 'set-label', it.label);
      label.htmlFor = id;
      ctl = Object.assign(el('button', 'set-toggle'), { type: 'button', id });
      ctl.setAttribute('role', 'switch');
      refresh = () => ctl.setAttribute('aria-checked', String(this.values[it.key]));
      ctl.addEventListener('click', () => {
        this.set(it.key, !this.values[it.key]);
        refresh();
      });
    } else {
      label = el('span', 'set-label', it.label);
      ctl = el('div', 'set-choice');
      ctl.setAttribute('role', 'radiogroup');
      ctl.setAttribute('aria-label', it.label);
      const buttons = it.options.map(([value, name]) => {
        const b = Object.assign(el('button', '', name), { type: 'button' });
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          this.set(it.key, value);
          refresh();
        });
        return [value, b];
      });
      refresh = () => {
        for (const [value, b] of buttons) {
          const on = value === this.values[it.key];
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', String(on));
        }
      };
      ctl.append(...buttons.map(([, b]) => b));
    }
    row.append(label, ctl);
    if (it.hint) row.append(el('div', 'set-hint', it.hint));
    refresh();
    this.refreshers.push(refresh);
    return row;
  }
}
