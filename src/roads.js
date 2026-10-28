import { Polyline } from './geom2d.js';

// Straßennetz als Graph: Knoten (Kreuzungen, Einmündungen) und Straßen (Polylinien mit Breite).
// Daraus entstehen Fahrspuren für den Verkehr, der Bodenplan und die Laternenstandorte.
export class RoadNet {
  constructor() {
    this.nodes = [];
    this.roads = [];
    this.hash = new Map();
  }

  node(x, z) {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let n = this.hash.get(k);
    if (!n) {
      n = { id: this.nodes.length, x, z, roads: [], signal: false };
      this.nodes.push(n);
      this.hash.set(k, n);
    }
    return n;
  }

  // pts beginnen bei a und enden bei b; kind: 'arterial' | 'local' | 'boulevard' | 'connector'
  add(a, b, pts, width, kind) {
    if (a === b && pts.length < 3) return null;
    const pl = new Polyline(pts);
    if (pl.length < 1) return null;
    const r = { id: this.roads.length, a, b, pl, width, kind };
    a.roads.push(r);
    b.roads.push(r);
    this.roads.push(r);
    return r;
  }

  remove(r) {
    r.dead = true;
    r.a.roads = r.a.roads.filter((x) => x !== r);
    r.b.roads = r.b.roads.filter((x) => x !== r);
  }

  compact() {
    this.roads = this.roads.filter((r) => !r.dead);
    this.roads.forEach((r, i) => (r.id = i));
    this.nodes = this.nodes.filter((n) => n.roads.length > 0);
    this.nodes.forEach((n, i) => (n.id = i));
  }

  // Abtastpunkte aller Straßen in einem Raster: schnelle Frage „wie weit bis zum Fahrbahnrand?“
  buildClearance() {
    this.cgrid = new Map();
    for (const r of this.roads) {
      const n = Math.max(2, Math.ceil(r.pl.length / 2));
      const p = {};
      for (let i = 0; i <= n; i++) {
        r.pl.at((r.pl.length * i) / n, p);
        const k = `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`;
        let c = this.cgrid.get(k);
        if (!c) this.cgrid.set(k, (c = []));
        c.push(p.x, p.z, r.width / 2);
      }
    }
  }

  // Abstand zum nächsten Fahrbahnrand (negativ = auf der Straße); nur im Umkreis von ~30 m genau
  clearance(x, z) {
    let best = 40;
    const ix = Math.floor(x / 16), iz = Math.floor(z / 16);
    for (let a = ix - 2; a <= ix + 2; a++) {
      for (let b = iz - 2; b <= iz + 2; b++) {
        const c = this.cgrid.get(`${a},${b}`);
        if (!c) continue;
        for (let i = 0; i < c.length; i += 3) {
          const d = Math.hypot(c[i] - x, c[i + 1] - z) - c[i + 2];
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}
