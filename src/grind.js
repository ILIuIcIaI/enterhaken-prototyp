import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { TRACK_Y } from './citygen.js';

// Grind-Linien: Schienen und Brüstungen des Viadukts, Stromkabel zwischen hohen Häusern. Jede Linie ist ein
// 3D-Polygonzug mit Bogenlänge; ein Raster findet in jedem Schritt die Segmente nahe der Figur (player.js: tryGrind).
const CELL = 16;

export class GrindNet {
  constructor() {
    this.lines = [];
    this.grid = new Map();
  }

  // pts: [{x, y, z}], closed: Schleife (das Viadukt), kind: 'rail' | 'ledge' | 'cable'
  addLine(pts, { closed = false, kind = 'rail' } = {}) {
    const P = closed ? [...pts, pts[0]] : pts;
    const cum = [0];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    const line = { pts: P, cum, length: cum[cum.length - 1], closed, kind, id: this.lines.length };
    this.lines.push(line);
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      const ix0 = Math.floor(Math.min(a.x, b.x) / CELL), ix1 = Math.floor(Math.max(a.x, b.x) / CELL);
      const iz0 = Math.floor(Math.min(a.z, b.z) / CELL), iz1 = Math.floor(Math.max(a.z, b.z) / CELL);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = (ix + 4096) * 8192 + iz + 4096;
          let cell = this.grid.get(key);
          if (!cell) this.grid.set(key, (cell = []));
          cell.push(line, i);
        }
      }
    }
    return line;
  }

  // nächster Punkt einer Linie zu den Füßen: waagrecht höchstens r entfernt, Füße knapp darüber oder (im Fallen)
  // etwas darunter. Gibt { line, s, t (Tangente in Richtung wachsender Bogenlänge), d } zurück oder null.
  capture(feet, r, out) {
    const cell = this.grid.get((Math.floor(feet.x / CELL) + 4096) * 8192 + Math.floor(feet.z / CELL) + 4096);
    if (!cell) return null;
    let best = r * r, found = false;
    for (let k = 0; k < cell.length; k += 2) {
      const line = cell[k], i = cell[k + 1], a = line.pts[i - 1], b = line.pts[i];
      const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
      const l2 = ex * ex + ey * ey + ez * ez || 1;
      const u = Math.min(1, Math.max(0, ((feet.x - a.x) * ex + (feet.y - a.y) * ey + (feet.z - a.z) * ez) / l2));
      const qx = a.x + ex * u, qy = a.y + ey * u, qz = a.z + ez * u;
      const dy = feet.y - qy;
      if (dy < -0.45 || dy > 0.6) continue;
      const d = (feet.x - qx) ** 2 + (feet.z - qz) ** 2;
      if (d >= best) continue;
      best = d;
      found = true;
      const l = Math.sqrt(l2);
      out.line = line;
      out.s = line.cum[i - 1] + u * l;
      out.t.set(ex / l, ey / l, ez / l);
      out.d = Math.sqrt(d);
    }
    return found ? out : null;
  }

  // Punkt und Tangente bei Bogenlänge s
  at(line, s, outP, outT) {
    const L = line.length, cum = line.cum;
    if (line.closed) s = ((s % L) + L) % L;
    else s = Math.min(L, Math.max(0, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m; else hi = m;
    }
    const a = line.pts[lo], b = line.pts[hi], seg = cum[hi] - cum[lo] || 1, u = (s - cum[lo]) / seg;
    outP.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
    outT.set((b.x - a.x) / seg, (b.y - a.y) / seg, (b.z - a.z) / seg);
  }
}

// Linien der Stadt bauen. Viadukt: beide Schienen und beide Brüstungen (am Bahnhof geht die Linie an der
// Bahnsteigkante weiter). Kabel: zwischen benachbarten hohen Dächern auf kurzen Masten, mit Durchhang, nur wo nichts
// im Weg ist – vom höheren zum tieferen Dach rutscht man schnell hinunter. Gibt das Netz und das Kabel-Mesh zurück.
export function buildGrinds(city, rand) {
  const net = new GrindNet();
  const tr = city.track, L = tr.length, a = {};
  for (const [off, y, kind] of [[0.75, TRACK_Y + 0.17, 'rail'], [3.1, TRACK_Y + 0.9, 'ledge']]) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let s = 0; s < L; s += 2) {
        tr.at(s, a);
        pts.push({ x: a.x - a.tz * side * off, y, z: a.z + a.tx * side * off });
      }
      net.addLine(pts, { closed: true, kind });
    }
  }

  // Vergnügungspier: Geländer und die Achterbahnschiene (landmarks.js, amusement.js)
  const Pi = city.landmarkData?.pier;
  if (Pi) {
    for (const pts of Pi.rails) net.addLine(pts, { kind: 'rail' });
    net.addLine(Pi.coaster, { closed: true, kind: 'rail' });
    if (Pi.slide) net.addLine(Pi.slide.pts, { kind: 'rail' });                 // Spiralrutsche am Rutschturm
    for (const pts of Pi.festoons ?? []) net.addLine(pts, { kind: 'cable' });  // Lichterketten über der Flaniermeile
  }

  // Neon-Grindringe um Häuserblöcke
  for (const r of city.neonRings ?? []) net.addLine(r.pts, { closed: true, kind: 'rail' });

  // Stadion: Innen- und Außenkante des Dachrings
  for (const pts of city.stadiumData?.rings ?? []) net.addLine(pts, { closed: true, kind: 'ledge' });

  // Riesenbaum: die Äste entlang
  for (const b of city.landmarkData?.tree?.branches ?? []) net.addLine(b.grind, { kind: 'rail' });

  // Neon-Röhre der Hochbahn: die Dachkanten
  for (const pts of city.neonTube?.edges ?? []) net.addLine(pts, { kind: 'ledge' });

  // Rohbau-Wolkenkratzer: die Randträger der offenen oberen Etagen
  for (const pts of city.site?.grind ?? []) net.addLine(pts, { kind: 'rail' });

  // Kabel zwischen hohen Dächern
  const roofs = city.roofs.filter((r) => r.maxY > 22);
  const near = [], cables = [], used = new Set();
  const gap = (A, B) => Math.hypot(Math.max(0, A.minX - B.maxX, B.minX - A.maxX), Math.max(0, A.minZ - B.maxZ, B.minZ - A.maxZ));
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  for (let tries = 0; tries < roofs.length * 4 && cables.length < 48; tries++) {
    const A = roofs[Math.floor(rand() * roofs.length)];
    const cands = roofs.filter((B) => B !== A && gap(A, B) > 12 && gap(A, B) < 40 && Math.abs(A.maxY - B.maxY) < 0.45 * gap(A, B));
    if (!cands.length) continue;
    const B = cands[Math.floor(rand() * cands.length)];
    const key = A.minX < B.minX ? `${A.minX},${A.minZ}|${B.minX},${B.minZ}` : `${B.minX},${B.minZ}|${A.minX},${A.minZ}`;
    if (used.has(key)) continue;
    used.add(key);
    // Masten an den zugewandten Kanten, etwas innerhalb
    const cA = { x: (A.minX + A.maxX) / 2, z: (A.minZ + A.maxZ) / 2 }, cB = { x: (B.minX + B.maxX) / 2, z: (B.minZ + B.maxZ) / 2 };
    const pin = (R, c) => ({ x: Math.min(R.maxX - 0.6, Math.max(R.minX + 0.6, c.x)), z: Math.min(R.maxZ - 0.6, Math.max(R.minZ + 0.6, c.z)) });
    const pa = { ...pin(A, cB), y: A.maxY + 1.3 }, pb = { ...pin(B, cA), y: B.maxY + 1.3 };
    const span = Math.hypot(pb.x - pa.x, pb.z - pa.z), sag = 0.03 * span + 0.3;
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const u = k / 24;
      pts.push({ x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u - sag * 4 * u * (1 - u), z: pa.z + (pb.z - pa.z) * u });
    }
    // frei? Strahl entlang jedes Stücks gegen die Häuser in der Nähe (außer den beiden Dächern)
    city.query(Math.min(pa.x, pb.x) - 2, Math.min(pa.z, pb.z) - 2, Math.max(pa.x, pb.x) + 2, Math.max(pa.z, pb.z) + 2, near);
    const boxes = near.filter((b) => b !== A && b !== B);
    let blocked = false;
    for (let k = 1; k <= 24 && !blocked; k++) {
      const p = pts[k - 1], q = pts[k];
      _o.set(p.x, p.y, p.z);
      _d.set(q.x - p.x, q.y - p.y, q.z - p.z);
      const len = _d.length();
      _d.divideScalar(len);
      if (city.raycast(_o, _d, len + 0.4, false, boxes)) blocked = true;
    }
    if (blocked) continue;
    // auch die Masten müssen auf ihrem eigenen Dach stehen (nicht in einem Aufbau)
    cables.push({ pts, pa, pb, ya: A.maxY, yb: B.maxY });
    net.addLine(pts, { kind: 'cable' });
  }

  // Mesh: dünne Röhren und Masten
  const geos = [];
  for (const c of cables) {
    const curve = new THREE.CatmullRomCurve3(c.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
    geos.push(new THREE.TubeGeometry(curve, 24, 0.045, 5, false));
    for (const [p, y0] of [[c.pa, c.ya], [c.pb, c.yb]]) {
      geos.push(new THREE.CylinderGeometry(0.07, 0.09, p.y - y0 + 0.15, 6).translate(p.x, (p.y + y0) / 2, p.z));
    }
  }
  const mesh = geos.length ? new THREE.Mesh(mergeGeometries(geos), toonMaterial('#24212c', { rim: 0.2, pbr: { roughness: 0.3, metalness: 0.85 } })) : null;
  for (const g of geos) g.dispose();
  if (mesh) mesh.castShadow = true;
  return { net, mesh, cables: cables.length };
}
