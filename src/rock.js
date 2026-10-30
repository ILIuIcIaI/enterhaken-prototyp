import * as THREE from 'three';
import { WATER_Y } from './terrain.js';

// Felsinsel als Höhenfeld: ein Plateau mit Klippe, darunter eine Felsterrasse, eine zweite Klippe und ein nasser
// Sockel, der unter Wasser ausläuft. Von der Küstenseite führt ein Felsweg hinauf. Physik (Terrain.height, Strahlen in
// city.raycast) und Mesh (islet.js) nutzen dieselbe Funktion – man läuft genau auf dem, was man sieht. Zu steile Stellen
// wirken wie eine Wand (player.js: resolveRock).

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash2 = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
// glattes Wertrauschen, drei gedrehte Oktaven
const vnoise = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x, z) => {
  let v = 0, a = 0.5;
  for (let i = 0; i < 3; i++) {
    v += a * vnoise(x, z);
    const nx = 0.8 * x - 0.6 * z, nz = 0.6 * x + 0.8 * z;
    x = nx * 2.03 + 3.1;
    z = nz * 2.03 + 1.7;
    a *= 0.5;
  }
  return v / 0.875;
};
// Gebrochener Fels: Voronoi-Zellen mit eigener Höhe und Neigung, an den Zellgrenzen schmale Spalten – gerade, kantige
// Bruchlinien statt weicher Höhenlinien
const blocks = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z);
  let f1 = 9, f2 = 9, h = 0, tx = 0, tz = 0, ox = 0, oz = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cz = iz + j, px = cx + hash2(cx, cz), pz = cz + hash2(cz + 31, cx - 17), d = Math.hypot(px - x, pz - z);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        h = hash2(cx * 1.7 + 3, cz * 2.3 - 1);
        tx = hash2(cx - 5, cz * 3) - 0.5;
        tz = hash2(cx * 3, cz - 9) - 0.5;
        ox = px;
        oz = pz;
      } else if (d < f2) f2 = d;
    }
  }
  return (0.2 + 0.8 * h + 0.9 * (tx * (x - ox) + tz * (z - oz))) * smooth(0, 0.2, f2 - f1);
};
// Summe von Sinuswellen mit festen Phasen: glattes, periodisches Rauschen über den Winkel
const wavy = (th, table) => {
  let v = 0;
  for (const [k, a, p] of table) v += a * Math.sin(k * th + p);
  return v;
};
const OUTLINE = [[2, 0.11, 0.7], [3, 0.075, 2.4], [5, 0.045, 4.1], [8, 0.026, 1.2], [13, 0.016, 5.3], [21, 0.009, 0.4]];
const CLIFF1 = [[3, 0.018, 1.9], [7, 0.016, 0.3], [11, 0.012, 3.7], [19, 0.007, 2.2]];
const CLIFF2 = [[4, 0.012, 3.1], [9, 0.01, 5.2], [17, 0.007, 0.9]];
// nasser Sockel, Terrasse und Plateau (Höhe über dem Meeresspiegel)
export const ROCK_SHELF = 0.9, ROCK_TERRACE = 3.6;

export class Rock {
  // th0: Richtung (Winkel), in der der Felsweg zum Wasser hinunterführt; top: Höhe des Plateaus (Welt-y)
  constructor(x, z, R, top, th0, rand) {
    this.x = x;
    this.z = z;
    this.R = R;
    this.top = top;
    this.th0 = th0;
    this.reach = R * 1.32 * 1.27; // Grobprüfung: außerhalb gibt es keinen Fels
    this.yMax = top + 3;
    // Wärterhaus auf dem Plateau, seitlich vom Weg
    const thH = th0 + 1.95;
    this.hut = { x: x + Math.cos(thH) * 13, z: z + Math.sin(thH) * 13, a: thH };
    // große Findlinge auf Terrasse und Plateau (Höcker im Höhenfeld, keine Extra-Kollision)
    this.boulders = [];
    for (let k = 0; k < 34; k++) {
      const th = rand() * TAU;
      if (Math.abs(this.dTh(th)) < 0.42) continue; // der Weg bleibt frei
      const terrace = k % 4 > 0, rho = terrace ? 0.72 + rand() * 0.2 : 0.3 + rand() * 0.27;
      const r = this.radius(th) * rho, s = terrace ? 1.3 + rand() * 2.1 : 1.1 + rand() * 1.2;
      const bx = x + Math.cos(th) * r, bz = z + Math.sin(th) * r, bh = s * (0.5 + rand() * 0.45);
      if (Math.hypot(bx - this.hut.x, bz - this.hut.z) < 9.5) continue;
      this.boulders.push({ x: bx, z: bz, r: s, h: bh });
    }
  }

  dTh(th) {
    return Math.atan2(Math.sin(th - this.th0), Math.cos(th - this.th0));
  }

  // Uferlinie: Abstand vom Mittelpunkt in Richtung th
  radius(th) {
    return this.R * (1 + wavy(th, OUTLINE));
  }
  // Lage der beiden Klippen als Anteil der Uferlinie
  cliffA(th) { return 0.64 + wavy(th, CLIFF1) + 0.012 * Math.abs(Math.sin(th * 37)) + 0.009 * Math.abs(Math.sin(th * 61 + 1.1)); }
  cliffB(th) { return 0.88 + wavy(th, CLIFF2); }

  // Höhe aus Winkel und normiertem Abstand (ohne Findlinge)
  profile(th, rho) {
    const a = this.cliffA(th), b = this.cliffB(th), W = WATER_Y;
    const yShelf = W + ROCK_SHELF, yTerr = W + ROCK_TERRACE;
    // Plateau: flach um den Turm, zur Kante hin leicht gewölbt und höckerig
    const plateau = (r) => this.top - 0.75 * smooth(0.25, a, r) + smooth(0.14, 0.34, r) * (0.32 * Math.sin(th * 5 + r * 17) * Math.sin(th * 3 - r * 11) + 0.18 * Math.sin(th * 11 + r * 29));
    // Felsgürtel unter der Klippe: fällt nach außen ab, zerklüftet aus gebrochenen Blöcken; läuft unter dem Meer aus
    const r = rho * this.radius(th), x = Math.cos(th) * r + 40, z = Math.sin(th) * r + 40;
    const lump = (fbm(x * 0.075, z * 0.075) - 0.5) * 3.6 + (blocks(x * 0.17, z * 0.17) - 0.5) * 2.1 + (blocks(x * 0.47 + 7, z * 0.47) - 0.5) * 0.6;
    const terr = yTerr - 1.15 * smooth(a + 0.05, b, rho) + lump * smooth(a + 0.03, a + 0.1, rho);
    const shelf = yShelf + (W - 0.7 - yShelf) * smooth(b + 0.04, 1, rho) + lump * 0.45 * (1 - smooth(0.93, 1, rho));
    let y = plateau(rho);
    y += (terr - y) * smooth(a - 0.008, a + 0.045, rho);     // obere Klippe
    y += (shelf - y) * smooth(b - 0.005, b + 0.04, rho);     // untere Klippe
    if (rho > 1) y = W - 0.7 - 15 * smooth(1, 1.3, rho);     // steil zum Grund
    // Felsweg: gleichmäßige Rampe vom Plateau bis ins Wasser
    const w = (1 - smooth(0.13, 0.2, Math.abs(this.dTh(th)))) * smooth(0.5, 0.53, rho) * (1 - smooth(0.98, 1.04, rho));
    if (w > 0) {
      const y0 = plateau(0.5), t = Math.min(1, (rho - 0.5) / 0.54);
      y += (y0 + (W - 0.9 - y0) * (0.8 * t + 0.2 * smooth(0, 1, t)) - y) * w;
    }
    return y;
  }

  // Oberfläche an (x, z); -Infinity außerhalb
  height(x, z) {
    const dx = x - this.x, dz = z - this.z, r2 = dx * dx + dz * dz;
    if (r2 > this.reach * this.reach) return -Infinity;
    const th = Math.atan2(dz, dx), rho = Math.sqrt(r2) / this.radius(th);
    if (rho > 1.3) return -Infinity;
    let y = this.profile(th, rho);
    for (const b of this.boulders) {
      const q = ((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r);
      if (q < 4) y += b.h * Math.exp(-q * 1.5);
    }
    return y;
  }

  // Steigung (dh/dx, dh/dz)
  gradient(x, z, out) {
    const e = 0.08;
    out.x = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    out.y = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return out;
  }

  // Strahl gegen den Fels: abtasten, dann Bisektion. Startet der Strahl im Fels, zählt das nicht als Treffer.
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    // Eintritt und Austritt im umschließenden Zylinder
    const fx = ox - this.x, fz = oz - this.z, A = dx * dx + dz * dz, B = fx * dx + fz * dz, C = fx * fx + fz * fz - this.reach * this.reach;
    let t0 = 0, t1 = maxT;
    if (A < 1e-12) {
      if (C > 0) return null;
    } else {
      const D = B * B - A * C;
      if (D <= 0) return null;
      const s = Math.sqrt(D);
      t0 = Math.max(0, (-B - s) / A);
      t1 = Math.min(maxT, (-B + s) / A);
    }
    if (t1 <= t0) return null;
    // … und in der Höhenschicht des Felsens
    const yLo = WATER_Y - 16, yHi = this.yMax;
    if (Math.abs(dy) > 1e-9) {
      const a = (yLo - oy) / dy, b = (yHi - oy) / dy;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
      if (t1 <= t0) return null;
    } else if (oy < yLo || oy > yHi) return null;
    const f = (t) => oy + dy * t - this.height(ox + dx * t, oz + dz * t);
    if (t0 === 0 && f(0) <= 0) return null;
    const step = 0.7, n = Math.ceil((t1 - t0) / step);
    let a = t0;
    for (let i = 1; i <= n; i++) {
      const b = Math.min(t1, t0 + i * step);
      if (f(b) <= 0) {
        let lo = a, hi = b;
        for (let k = 0; k < 12; k++) {
          const m = (lo + hi) / 2;
          if (f(m) > 0) lo = m; else hi = m;
        }
        return hi;
      }
      a = b;
    }
    return null;
  }

  // Tiefentextur für das Meer: Felshöhe auf 8 Bit (Schaum und Flachwasser rund um die Insel)
  depthTexture(size = 512) {
    const lo = WATER_Y - 6, hi = WATER_Y + 2, data = new Uint8Array(size * size);
    const half = this.reach, w = (2 * half) / size;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const y = this.height(this.x - half + (i + 0.5) * w, this.z - half + (j + 0.5) * w);
        data[j * size + i] = Math.round(255 * Math.min(1, Math.max(0, (y - lo) / (hi - lo))));
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { tex, rect: new THREE.Vector3(this.x, this.z, half), lo, hi };
  }
}
