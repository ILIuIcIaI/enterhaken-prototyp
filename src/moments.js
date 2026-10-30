import * as THREE from 'three';
import { CONFIG } from './config.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const _side = new THREE.Vector3();
const _back = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Zeitlupe bei perfekten Momenten (Einstellungen → Spiel): perfekter Absprung vom Seil, Rettung in letzter Sekunde
// dicht über dem Boden, knapp an einer Hauskante vorbei. Die Zeit bremst weich ab und läuft wieder an; dabei zoomt die
// Kamera an die Figur heran und das Bild glitcht (Farbversatz, Streifen). Danach eine Pause, damit es besonders bleibt.
// Bewusst ohne Einblendung: die Bildmitte bleibt frei, der Moment spricht für sich.
const SLOW = 0.3;                              // Zeitfaktor in der Zeitlupe
const T_IN = 0.12, T_HOLD = 0.6, T_OUT = 0.5;  // Echtzeit (s)
const COOLDOWN = 7;

export class Moments {
  constructor(game) {
    this.game = game;
    this.k = 0;          // Stärke der Zeitlupe 0–1 (weich ein- und ausgeblendet) – auch Kamera-Zoom und Glitch
    this.burst = 0;      // kurzer Ausschlag direkt beim Auslösen (starker Glitch)
    this.t = -1;         // Zeit seit dem Auslösen (Echtzeit), −1 = keine Zeitlupe
    this.cool = 0;
    this.rescue = null;  // läuft ein möglicher Abfang kurz über dem Boden? { t }
    this.edge = { wait: 0, close: 0 };
  }

  get scale() {
    return 1 + (SLOW - 1) * this.k;
  }

  trigger() {
    const g = this.game;
    if (this.t >= 0 || this.cool > 0 || g.slowmo) return false;
    g.flow?.onEvent({ type: 'moment' }); // perfekte Momente füllen den Flow – auch ohne Zeitlupe
    if (!CONFIG.gameplay.perfectSlowmo) {
      this.cool = COOLDOWN;
      return false;
    }
    this.t = 0;
    g.audio.moment();
    return true;
  }

  // jeden Frame mit Echtzeit (0 = Pause)
  update(dt) {
    if (dt <= 0) return;
    if (this.t >= 0) {
      const t = (this.t += dt);
      let k = t < T_IN ? t / T_IN : t < T_IN + T_HOLD ? 1 : 1 - (t - T_IN - T_HOLD) / T_OUT;
      if (k <= 0 && t > T_IN) {
        k = 0;
        this.t = -1;
        this.cool = COOLDOWN;
      }
      this.k = k * k * (3 - 2 * k);
      this.burst = this.t >= 0 ? Math.exp(-t / 0.12) : 0;
    } else {
      this.k = 0;
      this.burst = 0;
      this.cool = Math.max(0, this.cool - dt);
    }
    this.watch(dt); // auch ohne Zeitlupe: die Momente zählen für den Flow
  }

  // Abstand zum Boden oder Dach unter der Figur
  heightAboveGround() {
    const p = this.game.player;
    const hit = this.game.city.raycast(p.pos, DOWN, 60, true);
    return hit ? hit.dist - CONFIG.player.halfHeight : 60;
  }

  // Haken wird losgelassen (vor dem Lösen): schnell, steil nach oben und schon vor dem Anker = perfekter Absprung
  onRelease(hook) {
    const p = this.game.player, v = p.vel, sp = v.length();
    if (p.state !== 'air' || sp < 26 || v.y < 0.3 * sp || v.y > 0.85 * sp) return;
    _dir.subVectors(p.pos, hook.anchor);
    if (_dir.x * v.x + _dir.z * v.z <= 0) return; // noch im Abschwung
    if (this.game.city.raycast(p.pos, _dir.copy(v).divideScalar(sp), 15)) return; // gleich gegen eine Wand
    this.trigger();
  }

  // Haken greift im schnellen Fall dicht über dem Boden – fängt das Seil einen ab, ist es eine Rettung
  onAttach() {
    const p = this.game.player;
    if (p.state === 'air' && p.vel.y < -15 && this.heightAboveGround() < 14) this.rescue = { t: 0 };
  }

  watch(dt) {
    const g = this.game, p = g.player;
    // Abfang: das Seil hält, am Tiefpunkt des Bogens geht es wieder hoch – nur, wenn es wirklich knapp war
    const r = this.rescue;
    if (r) {
      r.t += dt;
      if (p.state !== 'air' || !g.hooks.some((h) => h.state === 'attached') || r.t > 2.5) this.rescue = null;
      else if (p.vel.y > -4) {
        if (this.heightAboveGround() < 7) this.trigger();
        this.rescue = null;
      }
    }
    // knapp vorbei: mit hohem Tempo dicht an einer Wand entlang oder über eine Dachkante – und plötzlich ist sie weg
    const e = this.edge;
    if ((e.wait -= dt) > 0) return;
    e.wait = 0.05;
    const sp = p.vel.length();
    _side.set(p.vel.z, 0, -p.vel.x);
    if (p.state !== 'air' || sp < 33 || _side.lengthSq() < 1) {
      e.close = 0;
      return;
    }
    _side.normalize();
    let near = Infinity, along = false;
    for (const dir of [_side, _back.copy(_side).negate(), DOWN]) {
      const hit = g.city.raycast(p.pos, dir, 8);
      if (!hit || hit.dist >= near) continue;
      near = hit.dist;
      along = Math.abs(hit.normal.dot(p.vel)) < 0.35 * sp; // an der Fläche entlang, nicht auf sie zu oder von ihr weg
    }
    if (near < 2.2 && along) e.close = 0.4;
    else if (e.close > 0 && near > 6) {
      e.close = 0;
      this.trigger();
    } else e.close = Math.max(0, e.close - 0.05);
  }
}
