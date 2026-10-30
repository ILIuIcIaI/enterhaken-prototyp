import { CONFIG } from './config.js';

// Flow (Einstellungen → Spiel): füllt sich, solange man schnell und ohne Stocken unterwegs ist, und mit sauberen
// Aktionen – perfekte Momente, Wallrun und Wandsprung, Kante greifen und hochziehen, Abrollen, aufs Wasser setzen,
// im vollen Tempo einhaken. Stillstand lässt ihn nach kurzer Gnadenfrist abfallen, Stolpern kostet viel, und ein
// wenig verfliegt er immer – Flow will gehalten werden. Drei Stufen: jede lädt das Gas schneller nach, auf Stufe 3
// kostet der Gas-Schub nur die Hälfte. Anzeige: schmale Leiste über dem Tempo am Bildrand (hud.js).
const GAIN = { wallrun: 6, walljump: 5, ledge: 3, climb: 3, roll: 4, slide: 2, surf: 6, grind: 8, fan: 4, catapult: 10, dash: 1, attach: 1.5, moment: 15 };
const UP = [33, 66, 99.5];   // ab hier die nächste Stufe …
const DOWN = [28, 61, 92];   // … und erst darunter wieder zurück (kein Flackern an der Grenze)

export class Flow {
  constructor() {
    this.value = 0; // 0–100
    this.tier = 0;  // 0–3
    this.idle = 0;
  }

  add(n) {
    if (CONFIG.gameplay.flow) this.value = Math.max(0, Math.min(100, this.value + n));
  }

  // Ereignis des Spielers (player.events)
  onEvent(e) {
    if (e.type === 'move') this.add(e.move === 'stumble' ? -30 : GAIN[e.move] ?? 0);
    else this.add(GAIN[e.type] ?? 0);
  }

  // je Bild (Spielzeit); true, wenn gerade eine Stufe höher erreicht wurde
  update(dt, player) {
    if (!CONFIG.gameplay.flow) {
      this.value = this.tier = this.idle = 0;
      return false;
    }
    if (dt <= 0) return false;
    const sp = player.vel.length();
    if (sp > 12) this.value += (sp - 12) * 0.3 * dt; // bei 40 m/s ≈ 15 s bis voll, Aktionen beschleunigen
    if (player.state === 'grind') this.value += 3 * dt;
    this.idle = sp < 6 && !player.perch ? this.idle + dt : 0;
    if (this.idle > 1.5) this.value -= 25 * dt;
    this.value = Math.max(0, Math.min(100, this.value - 2 * dt));
    const t = this.tier;
    if (t < 3 && this.value >= UP[t]) this.tier = t + 1;
    else if (t > 0 && this.value < DOWN[t - 1]) this.tier = t - 1;
    return this.tier > t;
  }

  // Bonus für den Spieler: schnellere Gas-Erholung, auf Stufe 3 halber Gasverbrauch beim Schub
  get regen() {
    return 1 + 0.35 * this.tier;
  }

  get boostCost() {
    return this.tier >= 3 ? 0.5 : 1;
  }
}
