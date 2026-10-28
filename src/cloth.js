import * as THREE from 'three';

// Stoff- und Haarsimulation (Verlet) für Kleider, Mäntel, Umhänge, lange Haare, Zöpfe und Krawatten.
// Gerechnet wird im Weltraum mit festen Teilschritten (120 Hz):
//   • oberste Reihe sitzt fest an einem Knochen (Taille, Schultern, Hinterkopf …)
//   • Abstands- und Biegebedingungen halten den Stoff zusammen
//   • Kapseln um Beine und Rumpf schieben den Stoff heraus – Beine gleiten nie hindurch
//   • ein sanfter Zug zur Ruheform und ein maximaler Ausschlag halten die Bewegung „im Rahmen“
//   • Fahrtwind und leichte Böen lassen den Stoff bei Tempo flattern
// Die Körperbewegung wird zu einem Teil direkt mitgenommen (inertia < 1), damit schnelle Schwünge
// den Stoff nicht wegschleudern, er aber spürbar nachschwingt.

const H = 1 / 120;

// Leichter Dauerwind aus einer festen Richtung (Weltraum): Umhänge, Röcke, Zöpfe und Haarsträhnen wehen sanft mit.
// Stärke schwankt langsam (0.72…1.0 × speed m/s); dazu kommt der Fahrtwind aus der eigenen Bewegung.
// Wirkung: die Zielform verschiebt sich etwas in Windrichtung – am freien Saum am meisten (WIND.sway × maxDev).
export const WIND = { dir: new THREE.Vector3(0.8, 0, 0.6).normalize(), speed: 3.2, sway: 0.16 };
export const windGust = (t) => 0.72 + 0.28 * Math.sin(t * 0.83) * Math.sin(t * 0.31 + 0.7);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m0 = new THREE.Matrix4();
const _bq = new Float32Array(3);

// Kapseln zwischen zwei Knochen, optional verjüngt (r → r2) (Weltraum, je Teilschritt zwischen letztem und aktuellem Bild interpoliert)
export class Colliders {
  constructor(list) {
    this.list = list.map((c) => ({ ...c, a0: new THREE.Vector3(), b0: new THREE.Vector3(), a1: new THREE.Vector3(), b1: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }));
    this.init = false;
  }

  capture() {
    for (const c of this.list) {
      c.a0.copy(c.a1);
      c.b0.copy(c.b1);
      c.from.localToWorld(c.a1.copy(c.offA ?? _p.set(0, 0, 0)));
      if (c.to) c.to.localToWorld(c.b1.copy(c.offB ?? _p.set(0, 0, 0)));
      else c.from.localToWorld(c.b1.copy(c.offB ?? _p.set(0, 0, 0)));
      if (!this.init) { c.a0.copy(c.a1); c.b0.copy(c.b1); }
    }
    this.init = true;
  }

  at(u) {
    for (const c of this.list) {
      c.a.lerpVectors(c.a0, c.a1, u);
      c.b.lerpVectors(c.b0, c.b1, u);
    }
  }

  // Punkt aus allen Kapseln schieben (pad = Stoffdicke)
  push(x, pad) {
    for (const c of this.list) {
      _d.subVectors(c.b, c.a);
      const l2 = _d.lengthSq();
      let t = l2 > 1e-10 ? _q.subVectors(x, c.a).dot(_d) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      _p.copy(c.a).addScaledVector(_d, t);
      _b.subVectors(x, _p);
      const r = (c.r2 === undefined ? c.r : c.r + (c.r2 - c.r) * t) + pad, dist = _b.length();
      if (dist < r) {
        if (dist < 1e-6) _b.set(0, 0, 1);
        else _b.divideScalar(dist);
        x.copy(_p).addScaledVector(_b, r);
      }
    }
  }
}

// Sperrbereich: Quader im lokalen Raum eines Knochens (etwas kleiner als der Körper). Anders als die Kapseln
// merkt er sich, von welcher Seite ein Stoffpunkt kam – auch bei abruptem Bremsen oder Drehen kann der Stoff
// nicht durch Rumpf oder Hüfte hindurch auf die andere Seite rutschen (er wird an der Eintrittsseite gehalten).
export class Barrier {
  // sides = false: nur nach vorne/hinten hinausschieben (an der Hüfte lägen die seitlichen Ausgänge in den Oberschenkeln)
  constructor(anchor, min, max, sides = true) {
    this.anchor = anchor;
    this.min = min;
    this.max = max;
    this.sides = sides;
    this.t0 = new THREE.Vector3();
    this.t1 = new THREE.Vector3();
    this.e = new Float32Array(9);
    this.s2 = 1;
  }

  capture(first) {
    const m = this.anchor.matrixWorld.elements;
    this.t0.copy(this.t1);
    this.t1.set(m[12], m[13], m[14]);
    if (first) this.t0.copy(this.t1);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) this.e[k * 3 + j] = m[k * 4 + j];
    this.s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  }

  // Weltpunkt → lokal (out), Zeitanteil u im Bild
  toLocal(x, o, u, out) {
    const e = this.e, t0 = this.t0, t1 = this.t1;
    const dx = x[o] - (t0.x + (t1.x - t0.x) * u), dy = x[o + 1] - (t0.y + (t1.y - t0.y) * u), dz = x[o + 2] - (t0.z + (t1.z - t0.z) * u);
    out[0] = (e[0] * dx + e[1] * dy + e[2] * dz) / this.s2;
    out[1] = (e[3] * dx + e[4] * dy + e[5] * dz) / this.s2;
    out[2] = (e[6] * dx + e[7] * dy + e[8] * dz) / this.s2;
  }

  toWorld(q, x, o, u) {
    const e = this.e, t0 = this.t0, t1 = this.t1;
    x[o] = t0.x + (t1.x - t0.x) * u + e[0] * q[0] + e[3] * q[1] + e[6] * q[2];
    x[o + 1] = t0.y + (t1.y - t0.y) * u + e[1] * q[0] + e[4] * q[1] + e[7] * q[2];
    x[o + 2] = t0.z + (t1.z - t0.z) * u + e[2] * q[0] + e[5] * q[1] + e[8] * q[2];
  }

  // q (lokal) aus dem Quader schieben – zur Seite, auf der der Punkt vorher war (p[o..o+2] = letzte lokale Lage)
  resolve(q, p, o, pad) {
    const mn = this.min, mx = this.max;
    if (q[0] <= mn.x - pad || q[0] >= mx.x + pad || q[1] <= mn.y || q[1] >= mx.y || q[2] <= mn.z - pad || q[2] >= mx.z + pad) return false;
    if (!this.sides) q[2] = p[o + 2] < (mn.z + mx.z) / 2 ? mn.z - pad : mx.z + pad;
    else if (p[o + 2] >= mx.z + pad) q[2] = mx.z + pad;
    else if (p[o + 2] <= mn.z - pad) q[2] = mn.z - pad;
    else if (p[o] >= mx.x + pad) q[0] = mx.x + pad;
    else if (p[o] <= mn.x - pad) q[0] = mn.x - pad;
    else {
      // war schon drin (z. B. nach einem Reset): kürzester Weg hinaus
      const d = [q[2] - (mn.z - pad), mx.z + pad - q[2], q[0] - (mn.x - pad), mx.x + pad - q[0]];
      const k = d.indexOf(Math.min(...d));
      if (k === 0) q[2] = mn.z - pad; else if (k === 1) q[2] = mx.z + pad; else if (k === 2) q[0] = mn.x - pad; else q[0] = mx.x + pad;
    }
    return true;
  }
}

export class Cloth {
  // rest: Float32Array (rows*cols*3) im lokalen Raum von anchor; pinned(r, c) → bool
  constructor({ anchor, rest, rows, cols, wrap = false, pinned = (r) => r === 0, colliders = null, pad = 0.012,
    shape = 0.04, maxDev = () => 0.3, inertia = 0.55, wind = 0.5, gust = 0.35, gravity = 9.8, damping = 0.985,
    stretch = 1.0, bend = 0.35, iterations = 4, barriers = [], tether = 1.04, lift = 1 }) {
    // lift: Anteil des Fahrtwinds von unten (beim Fallen), der den Stoff hochdrückt – kurze Röcke klappen sonst ganz hoch
    Object.assign(this, { anchor, rows, cols, wrap, colliders, pad, shape, maxDev, inertia, wind, gust, gravity, damping, stretch, bend, iterations, barriers, tether, lift });
    const n = rows * cols;
    this.n = n;
    this.rest = rest;
    this.x = new Float32Array(n * 3);
    this.xp = new Float32Array(n * 3);
    this.w0 = new Float32Array(n * 3); // Ruhelage Welt (letztes Bild)
    this.w1 = new Float32Array(n * 3); // Ruhelage Welt (aktuelles Bild)
    this.pin = new Uint8Array(n);
    this.dev = new Float32Array(n);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      this.pin[i] = pinned(r, c) ? 1 : 0;
      this.dev[i] = maxDev(r / Math.max(1, rows - 1), c);
    }
    // Bedingungen: Strukturkanten (Ruhelängen), Biegekanten (übernächster Punkt)
    const L = (i, j) => Math.hypot(rest[i * 3] - rest[j * 3], rest[i * 3 + 1] - rest[j * 3 + 1], rest[i * 3 + 2] - rest[j * 3 + 2]);
    const links = [], bends = [];
    const cc = wrap ? cols : cols - 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c < cc) { const j = r * cols + ((c + 1) % cols); links.push(i, j, L(i, j)); }
      if (r + 1 < rows) { const j = (r + 1) * cols + c; links.push(i, j, L(i, j)); }
      if (r + 2 < rows) { const j = (r + 2) * cols + c; bends.push(i, j, L(i, j)); }
      if (c + 2 < cols || wrap) { const j = r * cols + ((c + 2) % cols); if (cols > 2) bends.push(i, j, L(i, j)); }
      if (r + 1 < rows && c < cc) { const j = (r + 1) * cols + ((c + 1) % cols); links.push(i, j, L(i, j)); }
    }
    this.links = new Float32Array(links);
    this.bends = new Float32Array(bends);
    // Haltefäden: jeder freie Punkt bleibt höchstens tether × Ruheabstand von seinem nächsten festen Punkt entfernt
    // (der Stoff dehnt sich nie wie Gummi, auch wenn er völlig frei schwingt)
    this.tIdx = new Int32Array(n).fill(-1);
    this.tLen = new Float32Array(n);
    if (tether) for (let i = 0; i < n; i++) {
      if (this.pin[i]) continue;
      let best = -1, bd = Infinity;
      for (let j = 0; j < n; j++) if (this.pin[j]) { const d = L(i, j); if (d < bd) { bd = d; best = j; } }
      this.tIdx[i] = best;
      this.tLen[i] = bd;
    }
    this.lp = barriers.map(() => new Float32Array(n * 3)); // letzte lokale Lage je Sperrbereich
    this.anchorPos0 = new THREE.Vector3();
    this.anchorPos1 = new THREE.Vector3();
    this.ready = false;
    this.time = Math.random() * 100;
    this.sc = 1;
  }

  restWorld(out) {
    _m.copy(this.anchor.matrixWorld);
    const e = _m.elements, R = this.rest;
    for (let i = 0; i < this.n; i++) {
      const x = R[i * 3], y = R[i * 3 + 1], z = R[i * 3 + 2];
      out[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }

  reset() {
    this.restWorld(this.w1);
    this.w0.set(this.w1);
    this.x.set(this.w1);
    this.xp.set(this.w1);
    this.anchor.getWorldPosition(this.anchorPos1);
    this.anchorPos0.copy(this.anchorPos1);
    this.colliders?.capture();
    this.colliders?.capture();
    this.sc = new THREE.Vector3().setFromMatrixScale(this.anchor.matrixWorld).x;
    this.barriers.forEach((b, k) => {
      b.capture(true);
      for (let i = 0; i < this.n; i++) b.toLocal(this.x, i * 3, 1, this.lp[k].subarray(i * 3, i * 3 + 3));
    });
    this.ready = true;
  }

  // nach dem Update der Knochen aufrufen
  update(dt) {
    if (!this.ready) return this.reset();
    if (dt <= 0) return;
    this.w0.set(this.w1);
    this.restWorld(this.w1);
    this.anchorPos0.copy(this.anchorPos1);
    this.anchor.getWorldPosition(this.anchorPos1);
    // Teleport / Reset der Figur: Stoff sofort in Ruhelage
    if (this.anchorPos0.distanceToSquared(this.anchorPos1) > 25) return this.reset();
    this.colliders?.capture();
    for (const b of this.barriers) b.capture(false);
    const steps = Math.max(1, Math.min(6, Math.round(dt / H)));
    const h = dt / steps;
    const vx = (this.anchorPos1.x - this.anchorPos0.x) / dt, vy = (this.anchorPos1.y - this.anchorPos0.y) / dt, vz = (this.anchorPos1.z - this.anchorPos0.z) / dt;
    const speed = Math.hypot(vx, vy, vz);
    const { x, xp, w0, w1, pin, dev, n } = this;
    const follow = 1 - this.inertia;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps, u0 = (s - 1) / steps;
      this.time += h;
      this.colliders?.at(u);
      // Luftstrom = Dauerwind − eigene Bewegung (begrenzt) + Böen
      const aw = WIND.speed * windGust(this.time) * 0.35, ax = WIND.dir.x * aw - vx, az = WIND.dir.z * aw - vz;
      const k = Math.min(1, Math.hypot(ax, vy, az) / 25);
      const g = 1 + this.gust * Math.sin(this.time * 7.3) * Math.sin(this.time * 2.9 + 1.3);
      const wx = ax * this.wind * g, wy = -vy * this.wind * 0.5 * g * (vy < 0 ? this.lift : 1), wz = az * this.wind * g;
      const lim = 26 * this.wind;
      const wl = Math.hypot(wx, wy, wz), ws = wl > lim ? lim / wl : 1;
      const sway = WIND.sway * windGust(this.time) * (WIND.speed / 3.2);
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        // Ruhelage für diesen Teilschritt
        const rx = w0[o] + (w1[o] - w0[o]) * u, ry = w0[o + 1] + (w1[o + 1] - w0[o + 1]) * u, rz = w0[o + 2] + (w1[o + 2] - w0[o + 2]) * u;
        if (pin[i]) {
          xp[o] = x[o]; xp[o + 1] = x[o + 1]; xp[o + 2] = x[o + 2];
          x[o] = rx; x[o + 1] = ry; x[o + 2] = rz;
          continue;
        }
        // Körperbewegung teilweise direkt mitnehmen
        const px = w0[o] + (w1[o] - w0[o]) * u0, py = w0[o + 1] + (w1[o + 1] - w0[o + 1]) * u0, pz = w0[o + 2] + (w1[o + 2] - w0[o + 2]) * u0;
        const fx = (rx - px) * follow, fy = (ry - py) * follow, fz = (rz - pz) * follow;
        x[o] += fx; x[o + 1] += fy; x[o + 2] += fz;
        xp[o] += fx; xp[o + 1] += fy; xp[o + 2] += fz;
        const ox = x[o], oy = x[o + 1], oz = x[o + 2];
        const flutter = 1 + 0.6 * Math.sin(this.time * 17 + i * 0.7) * k;
        x[o] += (x[o] - xp[o]) * this.damping + wx * ws * flutter * h * h;
        x[o + 1] += (x[o + 1] - xp[o + 1]) * this.damping + (wy * ws - this.gravity) * h * h;
        x[o + 2] += (x[o + 2] - xp[o + 2]) * this.damping + wz * ws * flutter * h * h;
        xp[o] = ox; xp[o + 1] = oy; xp[o + 2] = oz;
        // sanfter Zug zur Ruheform (vom Dauerwind leicht verschoben, mit leichtem Flattern)
        const sw = sway * Math.min(dev[i], 0.3) * (1 + 0.2 * Math.sin(this.time * 3.1 + i * 0.37));
        x[o] += (rx + WIND.dir.x * sw - x[o]) * this.shape; x[o + 1] += (ry - x[o + 1]) * this.shape; x[o + 2] += (rz + WIND.dir.z * sw - x[o + 2]) * this.shape;
      }
      for (let it = 0; it < this.iterations; it++) {
        this.solve(this.links, this.stretch);
        if (it % 2 === 0) this.solve(this.bends, this.bend);
        if (this.colliders) {
          for (let i = 0; i < n; i++) {
            if (pin[i]) continue;
            _a.fromArray(x, i * 3);
            this.colliders.push(_a, this.pad);
            _a.toArray(x, i * 3);
          }
        }
      }
      if (this.tether) this.applyTethers();
      // maximaler Ausschlag gegenüber der Ruhelage (bei freiem Stoff nur Sicherheitsnetz)
      for (let i = 0; i < n; i++) {
        if (pin[i]) continue;
        const o = i * 3;
        const rx = w0[o] + (w1[o] - w0[o]) * u, ry = w0[o + 1] + (w1[o + 1] - w0[o + 1]) * u, rz = w0[o + 2] + (w1[o + 2] - w0[o + 2]) * u;
        const dx = x[o] - rx, dy = x[o + 1] - ry, dz = x[o + 2] - rz, d = Math.hypot(dx, dy, dz);
        if (d > dev[i]) {
          const f = dev[i] / d;
          x[o] = rx + dx * f; x[o + 1] = ry + dy * f; x[o + 2] = rz + dz * f;
        }
      }
      // Haltefäden und Ausschlagsgrenze können Punkte zurück in die Beine ziehen – Kapseln darum noch einmal anwenden,
      // die Körpersperre zuletzt: keine andere Korrektur darf den Stoff danach noch hineinschieben
      if (this.colliders) {
        for (let i = 0; i < n; i++) {
          if (pin[i]) continue;
          _a.fromArray(x, i * 3);
          this.colliders.push(_a, this.pad);
          this.colliders.push(_a, this.pad); // zweimal: zwischen zwei Kapseln (Beine, Hüfte) nicht von der einen in die andere
          _a.toArray(x, i * 3);
        }
      }
      this.applyBarriers(u);
    }
  }

  applyTethers() {
    const x = this.x, slack = this.tether * this.sc;
    for (let i = 0; i < this.n; i++) {
      const j = this.tIdx[i];
      if (j < 0) continue;
      const oi = i * 3, oj = j * 3;
      const dx = x[oi] - x[oj], dy = x[oi + 1] - x[oj + 1], dz = x[oi + 2] - x[oj + 2], d = Math.hypot(dx, dy, dz), L = this.tLen[i] * slack;
      if (d > L) { const f = L / d; x[oi] = x[oj] + dx * f; x[oi + 1] = x[oj + 1] + dy * f; x[oi + 2] = x[oj + 2] + dz * f; }
    }
  }

  applyBarriers(u) {
    if (!this.barriers.length) return;
    const x = this.x, pin = this.pin, q = _bq, pad = this.pad / this.sc;
    this.barriers.forEach((b, k) => {
      const lp = this.lp[k];
      for (let i = 0; i < this.n; i++) {
        const o = i * 3;
        b.toLocal(x, o, u, q);
        if (!pin[i] && b.resolve(q, lp, o, pad)) b.toWorld(q, x, o, u);
        lp[o] = q[0]; lp[o + 1] = q[1]; lp[o + 2] = q[2];
      }
    });
  }

  solve(list, k) {
    const x = this.x, pin = this.pin;
    for (let q = 0; q < list.length; q += 3) {
      const i = list[q], j = list[q + 1], L = list[q + 2] * this.sc;
      const oi = i * 3, oj = j * 3;
      const dx = x[oj] - x[oi], dy = x[oj + 1] - x[oi + 1], dz = x[oj + 2] - x[oi + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-7) continue;
      const wi = pin[i] ? 0 : 1, wj = pin[j] ? 0 : 1, ws = wi + wj;
      if (!ws) continue;
      const diff = ((d - L) / d) * k / ws;
      x[oi] += dx * diff * wi; x[oi + 1] += dy * diff * wi; x[oi + 2] += dz * diff * wi;
      x[oj] -= dx * diff * wj; x[oj + 1] -= dy * diff * wj; x[oj + 2] -= dz * diff * wj;
    }
  }
}

// Fläche aus einem Stoffgitter: außen Stoff, innen Futter (eigene Farbe), Vertexfarben und UVs
export function clothMesh(cloth, { outer, inner, colors = null, uvs = null, seam = true }) {
  const { rows, cols, wrap } = cloth;
  const vc = wrap && seam ? cols + 1 : cols;
  const n = rows * vc;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < vc; c++) {
    const i = r * vc + c;
    uv[i * 2] = uvs ? uvs(r, c)[0] : c / (vc - 1);
    uv[i * 2 + 1] = uvs ? uvs(r, c)[1] : 1 - r / (rows - 1);
  }
  const idx = [];
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c + 1 < vc + (wrap && !seam ? 1 : 0); c++) {
    const c1 = (c + 1) % vc;
    const a = r * vc + c, b = (r + 1) * vc + c, d = r * vc + c1, e = (r + 1) * vc + c1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (colors) {
    const col = new Float32Array(n * 3), cc = new THREE.Color();
    for (let r = 0; r < rows; r++) for (let c = 0; c < vc; c++) {
      colors(r, c % cols, cc);
      col.set([cc.r, cc.g, cc.b], (r * vc + c) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  geo.setIndex(idx);
  const group = new THREE.Group();
  const front = new THREE.Mesh(geo, outer);
  front.castShadow = true;
  front.frustumCulled = false;
  group.add(front);
  if (inner) {
    const back = new THREE.Mesh(geo, inner);
    back.frustumCulled = false;
    group.add(back);
  }
  let oriented = false;
  group.userData.sync = () => {
    const p = geo.attributes.position.array, x = cloth.x;
    for (let r = 0; r < rows; r++) for (let c = 0; c < vc; c++) {
      const s = (r * cols + (c % cols)) * 3, d = (r * vc + c) * 3;
      p[d] = x[s]; p[d + 1] = x[s + 1]; p[d + 2] = x[s + 2];
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    // Außenseite = vom Körper weg: zeigen die Normalen im Mittel zum Ankerknochen, Umlaufsinn drehen
    if (!oriented && cloth.ready) {
      oriented = true;
      cloth.anchor.getWorldPosition(_a);
      const nrm = geo.attributes.normal.array;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const dx = p[i * 3] - _a.x, dz = p[i * 3 + 2] - _a.z;
        sum += nrm[i * 3] * dx + nrm[i * 3 + 2] * dz;
      }
      if (sum < 0) {
        const ix = geo.index.array;
        for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
        geo.index.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }
    geo.computeBoundingSphere();
  };
  return group;
}

// Röhre entlang einer Partikelkette (Zopf, Haarsträhne, Kordel); radius(t, k) mit k = Winkel
export function ropeMesh(cloth, { material, radius, radial = 10, sub = 3 }) {
  const N = cloth.rows, segs = (N - 1) * sub + 1, n = segs * (radial + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = [];
  for (let s = 0; s < segs; s++) for (let k = 0; k <= radial; k++) {
    uv[(s * (radial + 1) + k) * 2] = k / radial;
    uv[(s * (radial + 1) + k) * 2 + 1] = s / (segs - 1);
    if (s + 1 < segs && k < radial) {
      const a = s * (radial + 1) + k, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const pts = Array.from({ length: N }, () => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const P = new THREE.Vector3(), T = new THREE.Vector3(), Nn = new THREE.Vector3(), Bn = new THREE.Vector3(), prevN = new THREE.Vector3(0, 0, 1);
  mesh.userData.sync = () => {
    for (let i = 0; i < N; i++) pts[i].fromArray(cloth.x, i * 3);
    const p = geo.attributes.position.array;
    prevN.set(0, 0, 1);
    for (let s = 0; s < segs; s++) {
      const t = s / (segs - 1);
      curve.getPoint(t, P);
      curve.getTangent(t, T);
      // Rahmen mit möglichst wenig Verdrehung weitertragen
      Bn.crossVectors(T, prevN);
      if (Bn.lengthSq() < 1e-8) Bn.set(1, 0, 0).cross(T);
      Bn.normalize();
      Nn.crossVectors(Bn, T).normalize();
      prevN.copy(Nn);
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2, r = radius(t, a);
        const o = (s * (radial + 1) + k) * 3;
        p[o] = P.x + (Nn.x * Math.cos(a) + Bn.x * Math.sin(a)) * r;
        p[o + 1] = P.y + (Nn.y * Math.cos(a) + Bn.y * Math.sin(a)) * r;
        p[o + 2] = P.z + (Nn.z * Math.cos(a) + Bn.z * Math.sin(a)) * r;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  return mesh;
}

// Ruheform im lokalen Raum eines Knochens aus Modellraum-Punkten (Bind-Pose, Knochen unrotiert)
export function toLocal(points, origin) {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => { out[i * 3] = p.x - origin.x; out[i * 3 + 1] = p.y - origin.y; out[i * 3 + 2] = p.z - origin.z; });
  return out;
}
