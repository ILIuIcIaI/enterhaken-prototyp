import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Weiche, organische Formen aus Abstandsfunktionen (SDF): Grundkörper werden mit weichen Übergängen
// verschmolzen und per Marching Cubes in ein glattes Mesh mit runden Normalen verwandelt.
// Konvention: Rückgabe < 0 = innen. Alle Funktionen arbeiten mit Skalaren (keine Allokationen).

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

export function sdSphere(px, py, pz, cx, cy, cz, r) {
  const x = px - cx, y = py - cy, z = pz - cz;
  return Math.sqrt(x * x + y * y + z * z) - r;
}

// Ellipsoid (Näherung nach Inigo Quilez)
export function sdEllipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
// Kegelstumpf mit runden Enden zwischen a (Radius r1) und b (Radius r2), nach Inigo Quilez
export function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// abgerundeter Quader (Halbmaße hx,hy,hz, Kantenradius r)
export function sdRoundBox(px, py, pz, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r, qz = Math.abs(pz - cz) - hz + r;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// Torus in der XZ-Ebene um (cx,cy,cz)
export function sdTorus(px, py, pz, cx, cy, cz, R, r) {
  const dx = px - cx, dz = pz - cz, dy = py - cy;
  const q = Math.sqrt(dx * dx + dz * dz) - R;
  return Math.sqrt(q * q + dy * dy) - r;
}

// Menge von Kegelstümpfen mit grober Raster-Vorauswahl: bei vielen Teilen (z. B. Haarsträhnen)
// werden pro Abfrage nur die Teile in der Nähe ausgewertet.
export class ConeSet {
  constructor(min, max, cells = 12, k = 0.01) {
    this.min = min;
    this.max = max;
    this.cells = cells;
    this.k = k;
    this.items = [];
    this.grid = null;
  }

  add(a, b, r1, r2, tag = 0) {
    this.items.push({ a, b, r1, r2, tag });
  }

  build() {
    const { min, max, cells } = this;
    this.size = new THREE.Vector3().subVectors(max, min).divideScalar(cells);
    this.grid = Array.from({ length: cells * cells * cells }, () => []);
    const reach = this.k + 0.004;
    this.items.forEach((it, idx) => {
      const r = Math.max(it.r1, it.r2) + reach;
      const lo = [Math.min(it.a.x, it.b.x) - r, Math.min(it.a.y, it.b.y) - r, Math.min(it.a.z, it.b.z) - r];
      const hi = [Math.max(it.a.x, it.b.x) + r, Math.max(it.a.y, it.b.y) + r, Math.max(it.a.z, it.b.z) + r];
      const c0 = [0, 1, 2].map((i) => Math.max(0, Math.floor((lo[i] - min.getComponent(i)) / this.size.getComponent(i))));
      const c1 = [0, 1, 2].map((i) => Math.min(cells - 1, Math.floor((hi[i] - min.getComponent(i)) / this.size.getComponent(i))));
      for (let x = c0[0]; x <= c1[0]; x++)
        for (let y = c0[1]; y <= c1[1]; y++)
          for (let z = c0[2]; z <= c1[2]; z++) this.grid[x + y * cells + z * cells * cells].push(idx);
    });
  }

  // liefert den weich verschmolzenen Abstand; this.lastTag/lastT = nächstgelegenes Teil und Position darauf
  eval(px, py, pz) {
    const { min, size, cells } = this;
    const cx = Math.floor((px - min.x) / size.x), cy = Math.floor((py - min.y) / size.y), cz = Math.floor((pz - min.z) / size.z);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= cells || cy >= cells || cz >= cells) return 1;
    const list = this.grid[cx + cy * cells + cz * cells * cells];
    let d = 1, best = 1;
    this.lastTag = -1;
    for (const idx of list) {
      const it = this.items[idx];
      const di = sdRoundCone(px, py, pz, it.a.x, it.a.y, it.a.z, it.b.x, it.b.y, it.b.z, it.r1, it.r2);
      if (di < best) { best = di; this.lastTag = it.tag; }
      d = smin(d, di, this.k);
    }
    return d;
  }
}

// Polygonisiert sdf(x, y, z) im Quader [min, max]. res = Zellen pro Achse (anisotrop erlaubt).
// Ergebnis: indizierte BufferGeometry mit glatten Normalen aus dem Feldgradienten.
export function polygonize(sdf, min, max, res, maxPoly = 250000) {
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, maxPoly);
  mc.isolation = 0;
  const hx = (max.x - min.x) / 2, hy = (max.y - min.y) / 2, hz = (max.z - min.z) / 2;
  const cx = min.x + hx, cy = min.y + hy, cz = min.z + hz;
  const size = mc.size, size2 = size * size, half = mc.halfsize, field = mc.field;
  const W = (i, c, h) => c + ((i - half) / half) * h;
  // Zweistufig: grobes Gitter (Schritt S) und nur Zellen nahe der Oberfläche fein auswerten;
  // weit entfernte Zellen werden trilinear aus den groben Ecken gefüllt (Vorzeichen bleibt exakt).
  const S = 4, nc = Math.ceil((size - 1) / S) + 1;
  const ci = (k) => Math.min(size - 1, k * S);
  const coarse = new Float32Array(nc * nc * nc);
  for (let k = 0; k < nc; k++) for (let j = 0; j < nc; j++) for (let i = 0; i < nc; i++) {
    coarse[(k * nc + j) * nc + i] = sdf(W(ci(i), cx, hx), W(ci(j), cy, hy), W(ci(k), cz, hz));
  }
  const cell = [hx / half, hy / half, hz / half];
  // Ein Block kann die Fläche nur enthalten, wenn eine Ecke näher als die halbe Diagonale liegt (Abstandsfeld);
  // Faktor 0.9 statt 0.5 als Reserve für die angenäherten Felder (glatte Vereinigung, Ellipsoide)
  const margin = 0.9 * Math.hypot(cell[0] * S, cell[1] * S, cell[2] * S);
  const C = (i, j, k) => coarse[(k * nc + j) * nc + i];
  for (let k = 0; k + 1 < nc; k++) for (let j = 0; j + 1 < nc; j++) for (let i = 0; i + 1 < nc; i++) {
    const c = [C(i, j, k), C(i + 1, j, k), C(i, j + 1, k), C(i + 1, j + 1, k), C(i, j, k + 1), C(i + 1, j, k + 1), C(i, j + 1, k + 1), C(i + 1, j + 1, k + 1)];
    let mn = Infinity, pos = 0;
    for (const v of c) { mn = Math.min(mn, Math.abs(v)); if (v > 0) pos++; }
    const far = mn > margin && (pos === 0 || pos === 8);
    const x0 = ci(i), x1 = ci(i + 1), y0 = ci(j), y1 = ci(j + 1), z0 = ci(k), z1 = ci(k + 1);
    for (let z = z0; z <= z1; z++) {
      const tz = z1 > z0 ? (z - z0) / (z1 - z0) : 0, wz = W(z, cz, hz);
      for (let y = y0; y <= y1; y++) {
        const ty = y1 > y0 ? (y - y0) / (y1 - y0) : 0, wy = W(y, cy, hy);
        const row = z * size2 + y * size;
        for (let x = x0; x <= x1; x++) {
          if (far) {
            const tx = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
            const a = c[0] + (c[1] - c[0]) * tx, b = c[2] + (c[3] - c[2]) * tx, e = c[4] + (c[5] - c[4]) * tx, f = c[6] + (c[7] - c[6]) * tx;
            const u = a + (b - a) * ty, w = e + (f - e) * ty;
            field[row + x] = -(u + (w - u) * tz);
          } else field[row + x] = -sdf(W(x, cx, hx), wy, wz);
        }
      }
    }
  }
  mc.update();
  const n = Math.min(mc.count, maxPoly * 3);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = cx + mc.positionArray[i * 3] * hx;
    pos[i * 3 + 1] = cy + mc.positionArray[i * 3 + 1] * hy;
    pos[i * 3 + 2] = cz + mc.positionArray[i * 3 + 2] * hz;
    // Normalen von Gitter- in Weltmaßstab umrechnen
    const ax = mc.normalArray[i * 3] / hx, ay = mc.normalArray[i * 3 + 1] / hy, az = mc.normalArray[i * 3 + 2] / hz;
    const l = Math.hypot(ax, ay, az) || 1;
    nor[i * 3] = ax / l; nor[i * 3 + 1] = ay / l; nor[i * 3 + 2] = az / l;
  }
  // Umlaufsinn prüfen und notfalls drehen, damit Vorderseiten nach außen zeigen
  let s = 0;
  for (let t = 0; t < Math.min(n, 3000); t += 3) {
    const ux = pos[(t + 1) * 3] - pos[t * 3], uy = pos[(t + 1) * 3 + 1] - pos[t * 3 + 1], uz = pos[(t + 1) * 3 + 2] - pos[t * 3 + 2];
    const vx = pos[(t + 2) * 3] - pos[t * 3], vy = pos[(t + 2) * 3 + 1] - pos[t * 3 + 1], vz = pos[(t + 2) * 3 + 2] - pos[t * 3 + 2];
    s += (uy * vz - uz * vy) * nor[t * 3] + (uz * vx - ux * vz) * nor[t * 3 + 1] + (ux * vy - uy * vx) * nor[t * 3 + 2];
  }
  if (s < 0) {
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        [pos[(t + 1) * 3 + k], pos[(t + 2) * 3 + k]] = [pos[(t + 2) * 3 + k], pos[(t + 1) * 3 + k]];
        [nor[(t + 1) * 3 + k], nor[(t + 2) * 3 + k]] = [nor[(t + 2) * 3 + k], nor[(t + 1) * 3 + k]];
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  mc.geometry.dispose();
  const merged = mergeVertices(g, 1e-6);
  merged.computeBoundingSphere();
  return merged;
}

// Färbt bzw. gewichtet jeden Vertex über eine Funktion fn(x, y, z, nx, ny, nz) → [r, g, b]
export function paint(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Skin-Gewichte pro Vertex: fn(x, y, z) → Liste [[knochenIndex, gewicht], ...]; die vier stärksten zählen.
export function skin(geo, fn) {
  const p = geo.attributes.position;
  const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const list = fn(p.getX(i), p.getY(i), p.getZ(i)).filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((s, e) => s + e[1], 0) || 1;
    list.forEach((e, k) => { si[i * 4 + k] = e[0]; sw[i * 4 + k] = e[1] / sum; });
    if (!list.length) sw[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}
