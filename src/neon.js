import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_Y } from './citygen.js';
import { strut } from './pier.js';
import { colored } from './mover.js';
import { toonMaterial } from './toon.js';

// Neonlicht an der Neon-Röhre der Hochbahn (Bögen innen, durchgehende Streifen innen und außen, Portalrahmen) und am Turm
// mit Durchbruch (Rahmen um beide Öffnungen, Kantenlinien im Loch, Kranz an der Krone). Alles leuchtet (Bloom) und
// pulsiert sanft (city.js: updateDecor). Bauten selbst: city.js addNeonTube, addHoleTower.
const NEON = ['#30f0ff', '#ff3ad8', '#9a5aff'];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function neonMeshes(city) {
  const group = new THREE.Group(), glow = [], T = city.neonTube, Ht = city.holeTower, tr = city.track, Y = TRACK_Y, a = {};
  if (T) {
    // Punkt neben der Bahn: Bogenlänge s, seitlich v, Höhe y
    const P = (s, v, y) => { tr.at(s, a); return V3(a.x - a.tz * v, y, a.z + a.tx * v); };
    const w = T.hw - 0.15, top = Y + T.h - 0.4;
    let k = 0;
    for (let s = T.s0 + 2; s < T.s1 - 1; s += 4, k++) {
      const col = NEON[k % 3];
      glow.push(strut(P(s, -w, Y + 0.3), P(s, -w, top), 0.16, col), strut(P(s, w, Y + 0.3), P(s, w, top), 0.16, col), strut(P(s, -w, top), P(s, w, top), 0.16, col));
    }
    for (let s = T.s0; s < T.s1 - 1e-6; s += 3) {
      const s1 = Math.min(T.s1, s + 3);
      for (const v of [-w - 0.05, w + 0.05]) for (const [y, col] of [[Y + 1.4, '#ff3ad8'], [Y + T.h - 2, '#30f0ff']]) glow.push(strut(P(s, v, y), P(s1, v, y), 0.1, col));
      for (const v of [-T.hw - 0.62, T.hw + 0.62]) for (const [y, col] of [[Y - 1.1, '#30f0ff'], [Y + T.h - 0.2, '#ff3ad8']]) glow.push(strut(P(s, v, y), P(s1, v, y), 0.12, col));
    }
    for (const s of [T.s0, T.s1]) {
      for (const v of [-w, w]) glow.push(strut(P(s, v, Y - 1.2), P(s, v, top + 0.2), 0.22, '#ffffff'));
      glow.push(strut(P(s, -w, top + 0.2), P(s, w, top + 0.2), 0.22, '#ffffff'));
    }
  }
  if (Ht) {
    const { cx, cz, half, wall, y0, y1, alongX } = Ht, w = half - wall;
    // u entlang der Lochachse, v quer dazu
    const W = (u, y, v) => (alongX ? V3(cx + u, y, cz + v) : V3(cx + v, y, cz + u));
    for (const u of [-half - 0.08, half + 0.08]) {
      glow.push(strut(W(u, y0 + 0.1, -w), W(u, y0 + 0.1, w), 0.3, '#ff3ad8'), strut(W(u, y1 - 0.1, -w), W(u, y1 - 0.1, w), 0.3, '#ff3ad8'));
      glow.push(strut(W(u, y0, -w + 0.1), W(u, y1, -w + 0.1), 0.3, '#30f0ff'), strut(W(u, y0, w - 0.1), W(u, y1, w - 0.1), 0.3, '#30f0ff'));
    }
    for (const v of [-w + 0.12, w - 0.12]) for (const y of [y0 + 0.12, y1 - 0.12]) glow.push(strut(W(-half, y, v), W(half, y, v), 0.18, '#9a5aff'));
    const cr = half - 5 + 0.05, yc = Ht.H + 13.6;
    for (const [p, q] of [[[-cr, -cr], [cr, -cr]], [[cr, -cr], [cr, cr]], [[cr, cr], [-cr, cr]], [[-cr, cr], [-cr, -cr]]]) glow.push(strut(W(p[0], yc, p[1]), W(q[0], yc, q[1]), 0.25, '#30f0ff'));
  }
  // Grindringe um Häuserblöcke: leuchtendes Rohr, Halter zur Fassade alle ~9 m
  const solid = [];
  for (const R of city.neonRings ?? []) {
    const curve = new THREE.CatmullRomCurve3(R.pts.map((p) => V3(p.x, p.y, p.z)), true, 'centripetal');
    glow.push(colored(new THREE.TubeGeometry(curve, R.pts.length * 4, 0.13, 6, true), R.col));
    const { b, y } = R, I = RING_IN, L = 1.05; // Halter vom Rohr bis zur Fassade (2,5 m hinter der Blockkante)
    for (const [x0, z0, x1, z1, nx, nz] of [[b.x0 + I, b.z0 + I, b.x1 - I, b.z0 + I, 0, 1], [b.x1 - I, b.z0 + I, b.x1 - I, b.z1 - I, -1, 0], [b.x1 - I, b.z1 - I, b.x0 + I, b.z1 - I, 0, -1], [b.x0 + I, b.z1 - I, b.x0 + I, b.z0 + I, 1, 0]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 9));
      for (let k = 1; k < n; k++) {
        const u = k / n, p = V3(x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * u), q = p.clone().add(V3(nx * L, 0, nz * L));
        solid.push(strut(p, q, 0.09, '#2a2630'), strut(p.clone().add(V3(nx * 0.3, 0, nz * 0.3)), q.clone().add(V3(0, -0.8, 0)), 0.07, '#2a2630'));
      }
    }
  }
  if (solid.length) {
    const m = new THREE.Mesh(mergeGeometries(solid), toonMaterial('#ffffff', { vertexColors: true, rim: 0.15 }));
    for (const g of solid) g.dispose();
    group.add(m);
  }
  if (glow.length) {
    city.neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4) });
    group.add(new THREE.Mesh(mergeGeometries(glow), city.neonMat));
    for (const g of glow) g.dispose();
  }
  return group;
}

// Neon-Grindringe: um einige Häuserblöcke am Stadtrand läuft in mittlerer Höhe ein leuchtendes Rohr einen Meter vor den
// Fassaden (die Häuser stehen 2,5 m hinter der Blockkante, das Rohr hängt also über dem Grundstücksrand) – nie über
// Gehweg oder Fahrbahn, nicht aufdringlich (sechs Stück, weit verteilt). Nur wo ringsum Gebäude stehen, die es halten.
// Einmal um den Block grinden (grind.js).
const RING_IN = 1.5;
export function placeNeonRings(city) {
  const rings = (city.neonRings = []), near = [];
  const heightAt = (x, z) => {
    city.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3, near);
    let h = 0;
    for (const b of near) if (!b.noRender && !b.rot && b.minY < 1 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) h = Math.max(h, b.maxY);
    return h;
  };
  const ok = [];
  for (const b of city.blockList ?? []) {
    if (!b.built || b.super || b.mega || b.zone === 'downtown' || b.zone === 'waterfront') continue;
    const dn = Math.hypot(b.cx, b.cz) / city.coastR(b.cx, b.cz);
    if (dn < 0.38 || dn > 0.8) continue;
    // Fassadenhöhen 3,5 m innerhalb der Blockkante, alle 4 m (Lücken zwischen den Häusern überspannt das Rohr)
    const hs = [];
    for (const [x0, z0, x1, z1, nx, nz] of [[b.x0, b.z0, b.x1, b.z0, 0, 1], [b.x1, b.z0, b.x1, b.z1, -1, 0], [b.x1, b.z1, b.x0, b.z1, 0, -1], [b.x0, b.z1, b.x0, b.z0, 1, 0]]) {
      const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 4);
      for (let k = 1; k < n; k++) hs.push(heightAt(x0 + ((x1 - x0) * k) / n + nx * 3.5, z0 + ((z1 - z0) * k) / n + nz * 3.5));
    }
    hs.sort((p, q) => p - q);
    const tall = hs.filter((h) => h > 0), y = Math.min(22, (tall[Math.floor(tall.length * 0.1)] ?? 0) - 3);
    if (y < 9 || hs.filter((h) => h >= y + 1.5).length < hs.length * 0.75) continue;
    ok.push({ b, y });
  }
  // gut verteilt: zuerst der Block nahe der Mitte, dann immer der, der von den gewählten am weitesten weg ist
  while (ok.length && rings.length < 6) {
    let best = null, bd = -Infinity;
    for (const c of ok) {
      const d = rings.length ? Math.min(...rings.map((r) => Math.hypot(r.b.cx - c.b.cx, r.b.cz - c.b.cz))) : -Math.hypot(c.b.cx, c.b.cz);
      if (d > bd) { bd = d; best = c; }
    }
    ok.splice(ok.indexOf(best), 1);
    const { b, y } = best, o = -RING_IN, r = 2.4, pts = [];
    for (const [cx, cz, a0] of [[b.x1 + o - r, b.z0 - o + r, -Math.PI / 2], [b.x1 + o - r, b.z1 + o - r, 0], [b.x0 - o + r, b.z1 + o - r, Math.PI / 2], [b.x0 - o + r, b.z0 - o + r, Math.PI]]) {
      for (let k = 0; k <= 6; k++) { const a = a0 + (k / 6) * (Math.PI / 2); pts.push({ x: cx + Math.cos(a) * r, y, z: cz + Math.sin(a) * r }); }
    }
    rings.push({ b, y, pts, col: NEON[rings.length % 3] });
  }
}
