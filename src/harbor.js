import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Polyline } from './geom2d.js';
import { toonMaterial } from './toon.js';
import { Mover, colored, box } from './mover.js';
import { WATER_Y } from './terrain.js';
import { SHIP_LOOPS } from './landmarks.js';
import { mulberry32 } from './rng.js';
import { shipPlan, shipBoxes, shipModel, updateShipLights } from './ship.js';

// Bewegte Wahrzeichen (Teil von Transit, gleiche Zeitbasis wie Bahn und Flugzeuge – Physik und Bild fragen dieselbe
// Pose ab):
//   Containerschiffe auf weiten, gegenläufigen Runden draußen vor der Insel: man kann auf ihnen landen, über die
//   Container laufen und sich einhaken; sie schaukeln leicht im Seegang.
//   Turmdrehkräne auf hohen Dächern (Mast steht fest in der Stadt, landmarks.js): der Ausleger dreht sich langsam –
//   einhaken und mitnehmen lassen.
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);
const _z = new THREE.Vector3(0, 0, 1);

// Großes Containerschiff und der kleinere Hafen-Frachter (Rumpf, Ladung, Aufbauten: ship.js)
const SHIP = { half: 90, beam: 13.5, deck: 6, fore: 15, tiers: 5, decks: 5, bridge: [52, 72, 28] };
const FEEDER = { half: 52, beam: 9, deck: 4.5, fore: 10, tiers: 3, decks: 3, bridge: [28, 42, 18.5] };
const NAMES = [
  { text: 'MERIDIAN STAR', home: 'NORDHAFEN', logo: 'M', funnel: '#c77a27' },
  { text: 'KOBALT SPIRIT', home: 'NORDHAFEN', logo: 'K', funnel: '#1f4e79' },
];

export class Ships {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const rand = mulberry32(4242);
    this.ships = SHIP_LOOPS.map((d, i) => {
      const pts = [];
      for (let k = 0; k < 360; k++) {
        const th = (k / 360) * Math.PI * 2, ux = Math.cos(th), uz = Math.sin(th), r = city.coastR(ux, uz) + d;
        pts.push({ x: ux * r, z: uz * r });
      }
      const path = new Polyline(pts, true);
      const plan = shipPlan(SHIP, rand);
      const mover = new Mover('ship', shipBoxes(plan));
      mover.radius = SHIP.half + 20; // für Kollision und Grind-Prüfung: das Schiff ist lang
      const mesh = shipModel(plan, i ? '#25405c' : '#2f3238', NAMES[i], rand);
      this.group.add(mesh);
      return { path, dir: i % 2 ? -1 : 1, speed: 6 + i * 1.5, phase: rand() * path.length, mover, mesh };
    });
    this.movers = this.ships.map((s) => s.mover);
  }

  update(time, dt) {
    const a = {}, b = {};
    for (const s of this.ships) {
      const at = s.phase + s.dir * s.speed * time;
      s.path.at(at, a);
      s.path.at(at + s.dir * 20, b);
      const m = s.mover, px = m.pos.x, py = m.pos.y, pz = m.pos.z;
      m.pos.set(a.x, WATER_Y + 0.3 * Math.sin(time * 0.7 + s.phase), a.z);
      // Bug zeigt in Fahrtrichtung (lokal −z), dazu ruhiges Schaukeln
      _v.set(b.x - a.x, 0, b.z - a.z).normalize();
      _m.lookAt(_o.set(0, 0, 0), _v, UP);
      m.quat.setFromRotationMatrix(_m);
      m.quat.multiply(_q.setFromAxisAngle(_z, 0.025 * Math.sin(time * 0.45 + s.phase)));
      m.quat.multiply(_r.setFromAxisAngle(_x, 0.01 * Math.sin(time * 0.33 + s.phase * 2)));
      if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
    }
  }

  render() {
    updateShipLights();
    for (const s of this.ships) {
      s.mesh.position.copy(s.mover.pos);
      s.mesh.quaternion.copy(s.mover.quat);
    }
  }
}

export class RoofCranes {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cranes = (city.landmarkData?.cranes ?? []).map((c) => {
      const R = c.reach;
      const mover = new Mover('crane', [
        { min: new THREE.Vector3(-1, -1.6, -R), max: new THREE.Vector3(1, 0.6, 3) },        // Ausleger (vorn = −z)
        { min: new THREE.Vector3(-1, -1.6, 3), max: new THREE.Vector3(1, 0.6, 16) },        // Gegenausleger
        { min: new THREE.Vector3(-1.8, -4.4, 11), max: new THREE.Vector3(1.8, -1.6, 15) },  // Gegengewicht
        { min: new THREE.Vector3(0.9, -4.2, -1.5), max: new THREE.Vector3(3.6, -1.6, 1.5) }, // Kabine
      ]);
      mover.radius = R + 20;
      const mesh = this.model(R);
      this.group.add(mesh);
      return { ...c, mover, mesh };
    });
    this.movers = this.cranes.map((c) => c.mover);
  }

  model(R) {
    const geos = [], Y = '#e0b81e', D = '#3a3440';
    geos.push(colored(box(2, 2.2, R + 3, 0, -0.5, (-R + 3) / 2), Y));          // Ausleger
    for (let z = -R + 2; z < 2; z += 4) geos.push(colored(box(2.05, 0.3, 0.3, 0, 0.62, z), D)); // Fachwerk-Andeutung
    geos.push(colored(box(2, 2.2, 13, 0, -0.5, 9.5), Y));                      // Gegenausleger
    geos.push(colored(box(3.6, 2.8, 4, 0, -3, 13), '#8a8494'));                // Gegengewicht
    geos.push(colored(box(2.7, 2.6, 3, 2.25, -2.9, 0), '#eeeae2'));            // Kabine
    geos.push(colored(box(1.4, 8, 1.4, 0, 4.6, 0), Y));                        // Turmspitze
    geos.push(colored(box(1.6, 1.2, 2.4, 0, -1.8, -R * 0.7), D));              // Laufkatze
    geos.push(colored(new THREE.CylinderGeometry(0.05, 0.05, 22, 4).translate(0, -12.6, -R * 0.7), D)); // Seil
    geos.push(colored(box(1.2, 1.4, 1.2, 0, -24, -R * 0.7), '#c8352b'));       // Haken
    const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 }));
    m.castShadow = true;
    for (const x of geos) x.dispose();
    return m;
  }

  update(time) {
    for (const c of this.cranes) {
      c.mover.pos.set(c.x, c.y + 1.6, c.z);
      c.mover.quat.setFromAxisAngle(UP, c.phase + c.omega * time);
      (c.mover.omega ??= new THREE.Vector3()).set(0, c.omega, 0); // wer abspringt, nimmt den Schwung des Auslegers mit
    }
  }

  render() {
    for (const c of this.cranes) {
      c.mesh.position.copy(c.mover.pos);
      c.mesh.quaternion.copy(c.mover.quat);
    }
  }
}

// Hafenverkehr: ein Feeder-Frachter liegt am Kai, legt nach einer Weile ab, fährt durch die Hafeneinfahrt hinaus,
// umrundet die Insel und kehrt zurück. Für ihn hebt sich die Klappbrücke über der Einfahrt – schnell, mit Warnlicht
// und Glocke; wer dabei auf einer Klappe steht, wird hinausgeschleudert (player.js: catapult). Alles ist eine reine
// Funktion der Zeit wie bei Bahn und Flugzeugen.
const DWELL = 50;                  // Liegezeit am Kai (s)
const LEAF_MAX = 1.31;             // Klappe ganz offen (≈ 75°)
const T_OPEN = 2.2, T_CLOSE = 7;   // Öffnen ist schnell (Katapult!), Schließen gemächlich
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class HarborTraffic {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.events = [];
    this.movers = [];
    const H = city.landmarkData?.harbor;
    if (!H?.mole) return;
    const F = H.F, M = H.mole, top = H.quayTop;
    // Route in Küstenkoordinaten (d, s): Liegeplatz → Bogen zur Einfahrt → hinaus → Runde um die Insel → zurück durch
    // die Einfahrt → Wende im Becken → Liegeplatz
    const loc = [];
    const line = (d0, s0, d1, s1) => {
      const n = Math.max(1, Math.ceil(Math.hypot(d1 - d0, s1 - s0) / 3));
      for (let k = 0; k < n; k++) { const u = k / n; loc.push([d0 + (d1 - d0) * u, s0 + (s1 - s0) * u]); }
    };
    const arc = (cd, cs, r, a0, a1) => {
      const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / 3));
      for (let k = 0; k < n; k++) { const a = a0 + ((a1 - a0) * k) / n; loc.push([cd + r * Math.cos(a), cs + r * Math.sin(a)]); }
    };
    const gapS = (M.s0 + M.s1) / 2, Dsea = 215;
    line(52, -45, 52, gapS - 55);
    arc(102, gapS - 55, 50, Math.PI, Math.PI / 2);           // → hinaus zur Einfahrt
    line(102, gapS - 5, 195, gapS - 5);
    arc(195, gapS + 15, 20, -Math.PI / 2, 0);                // → auf die Runde
    const pts = loc.map(([d, s]) => ({ ...F.at(d, s), harbor: true }));
    // Runde um die Insel im festen Küstenabstand
    const Rd = F.R + Dsea, a0 = F.th + (gapS + 25) / Rd, a1 = F.th + Math.PI * 2 - 140 / Rd;
    for (let a = a0; a < a1; a += 3 / Rd) {
      const ux = Math.cos(a), uz = Math.sin(a), r = city.coastR(ux, uz) + Dsea;
      pts.push({ x: ux * r, z: uz * r, harbor: false });
    }
    loc.length = 0;
    line(Dsea, -130, Dsea, gapS - 40);
    arc(Dsea - 40, gapS - 40, 40, 0, Math.PI / 2);           // → Richtung Küste
    line(Dsea - 40, gapS, 110, gapS);
    arc(110, gapS - 30, 30, Math.PI / 2, Math.PI);           // im Becken nach links
    line(80, gapS - 30, 80, -50);
    arc(66, -50, 14, 0, -Math.PI);                            // Wende am Westende
    line(52, -50, 52, -45);
    for (const [d, s] of loc) pts.push({ ...F.at(d, s), harbor: true });
    this.path = new Polyline(pts, true);
    // Fahrplan: im Hafen langsam, draußen zügig, zum Liegeplatz hin abbremsen und dort warten
    const P = this.path.pts, n = P.length, cum = this.path.cum, berth = F.at(52, -15);
    let iB = 0, best = Infinity;
    P.forEach((p, i) => { const dd = Math.hypot(p.x - berth.x, p.z - berth.z); if (dd < best) { best = dd; iB = i; } });
    const speedAt = (i) => {
      const p = P[i], h = Math.hypot(p.x - berth.x, p.z - berth.z);
      const v = p.harbor === false ? 9 : Math.min(9, 3.2 + Math.max(0, h - 260) * 0.05);
      const along = Math.abs(cum[i] - cum[iB]);
      return Math.max(0.6, Math.min(v, 0.6 + Math.min(along, this.lenWrap(cum, i, iB)) * 0.08));
    };
    this.T = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      this.T[i] = this.T[i - 1] + (cum[i] - cum[i - 1]) / ((speedAt(i - 1) + speedAt(i)) / 2) + (i - 1 === iB ? DWELL : 0);
    }
    this.cycle = this.T[n - 1];
    this.iB = iB;
    // Durchfahrten der Einfahrt: der Weg kreuzt die Mole (Küstenabstand Mitte der Mole) in der Lücke
    const dm = (M.d0 + M.d1) / 2;
    const dOf = (p) => (p.x - F.ux * F.R) * F.ux + (p.z - F.uz * F.R) * F.uz;
    const sOf = (p) => (p.x - F.ux * F.R) * F.tx + (p.z - F.uz * F.R) * F.tz;
    this.passes = [];
    for (let i = 1; i < n; i++) {
      if ((dOf(P[i - 1]) - dm) * (dOf(P[i]) - dm) <= 0 && sOf(P[i]) > M.s0 && sOf(P[i]) < M.s1) this.passes.push(this.T[i]);
    }
    // Schiff
    const rand = mulberry32(777);
    const plan = shipPlan(FEEDER, rand);
    this.ship = new Mover('ship', shipBoxes(plan));
    this.ship.radius = FEEDER.half + 20;
    this.shipMesh = shipModel(plan, '#33463a', { text: 'HANNA', home: 'NORDHAFEN', logo: 'H', funnel: '#2f6a4f' }, rand);
    this.group.add(this.shipMesh);
    // Klappbrücke: zwei Klappen, Drehachse an den Maschinenhäuschen, jede reicht bis zur Mitte der Lücke
    const len = (M.s1 - M.s0) / 2, wid = (M.d1 - M.d0) / 2;
    const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(F.tx, 0, F.tz);
    this.leaves = [[M.s0, 1], [M.s1, -1]].map(([s, dir]) => {
      const hinge = F.at(dm, s);
      const x = t.clone().multiplyScalar(dir), z = new THREE.Vector3().crossVectors(x, up);
      const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
      const mover = new Mover('leaf', [{ min: new THREE.Vector3(0, -1.2, -wid), max: new THREE.Vector3(len, 0, wid) }]);
      mover.radius = len + 10;
      mover.pos.set(hinge.x, top, hinge.z);
      mover.quat.copy(base);
      mover.omega = new THREE.Vector3();
      const leaf = { mover, base, axis: z, alpha: 0, rate: 0, mesh: this.leafModel(len, wid) };
      mover.catapult = { ready: () => leaf.alpha > 0.5 && leaf.rate > 0.35, normal: (out) => out.set(0, 1, 0).applyQuaternion(mover.quat) };
      this.group.add(leaf.mesh);
      return leaf;
    });
    // Warnlichter auf den Maschinenhäuschen
    this.warnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.02, 0.02), fog: false });
    for (const s of [M.s0 - 3, M.s1 + 3]) {
      for (const dd of [M.d0 + 0.6, M.d1 - 0.6]) {
        const p = F.at(dd, s);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), this.warnMat);
        m.position.set(p.x, top + 6.4, p.z);
        this.group.add(m);
      }
    }
    this.bellAt = -1;
    this.movers = [this.ship, ...this.leaves.map((l) => l.mover)];
  }

  // Abstand entlang der geschlossenen Route (kürzere Richtung)
  lenWrap(cum, i, j) {
    const L = cum[cum.length - 1], d = Math.abs(cum[i] - cum[j]);
    return Math.min(d, L - d);
  }

  leafModel(len, wid) {
    const geos = [
      colored(box(len, 1.2, 2 * wid, len / 2, -0.6, 0), '#4a4652'),
      colored(box(1.2, 1.25, 2 * wid, len - 0.6, -0.6, 0), '#d6c84a'),      // gelbe Kante an der Spitze
      colored(box(len, 1.1, 0.25, len / 2, 0.55, wid - 0.15), '#2a2630'),   // Geländer
      colored(box(len, 1.1, 0.25, len / 2, 0.55, -wid + 0.15), '#2a2630'),
      colored(box(7, 3.8, 2 * wid - 1, -3.5, -3.1, 0), '#6a6474'),          // Gegengewicht unter der Achse
    ];
    for (let k = 1; k < 6; k++) geos.push(colored(box(0.6, 0.06, 2 * wid - 1, (len * k) / 6, 0.03, 0), '#e8e4dc'));
    const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.25 }));
    m.castShadow = true;
    for (const g of geos) g.dispose();
    return m;
  }

  // Öffnung der Klappen (0–1) zur Zykluszeit tm
  openAt(tm) {
    let f = 0;
    for (const tp of this.passes) {
      for (const c of [-this.cycle, 0, this.cycle]) {
        const w0 = tp + c - 28, w1 = tp + c + 42;
        f = Math.max(f, smooth01(w0, w0 + T_OPEN, tm) * (1 - smooth01(w1, w1 + T_CLOSE, tm)));
      }
    }
    return f;
  }

  update(time, dt) {
    if (!this.path) return;
    const tm = (((time + this.T[this.iB] + 5) % this.cycle) + this.cycle) % this.cycle;
    // Schiff: Wegpunkt aus dem Fahrplan (binäre Suche), am Liegeplatz Pause
    const T = this.T, P = this.path.pts;
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= tm) lo = m; else hi = m; }
    const wait = lo === this.iB ? DWELL : 0;
    const u = Math.max(0, Math.min(1, (tm - T[lo] - wait) / Math.max(1e-6, T[hi] - T[lo] - wait)));
    const a = P[lo], b = P[hi], c = P[(hi + 3) % P.length];
    const m = this.ship, px = m.pos.x, pz = m.pos.z;
    m.pos.set(a.x + (b.x - a.x) * u, WATER_Y + 0.25 * Math.sin(time * 0.8), a.z + (b.z - a.z) * u);
    _v.set(c.x - a.x, 0, c.z - a.z).normalize();
    _m.lookAt(_o.set(0, 0, 0), _v, UP);
    m.quat.setFromRotationMatrix(_m);
    m.quat.multiply(_q.setFromAxisAngle(_z, 0.02 * Math.sin(time * 0.5)));
    if (dt > 0) m.vel.set((m.pos.x - px) / dt, 0, (m.pos.z - pz) / dt);
    // Klappbrücke: Winkel, Drehrate (für das Katapult) und Drehachse in Weltkoordinaten
    const alpha = this.openAt(tm) * LEAF_MAX;
    for (const l of this.leaves) {
      l.rate = dt > 0 ? (alpha - l.alpha) / dt : 0;
      l.alpha = alpha;
      l.mover.quat.copy(l.base).multiply(_q.setFromAxisAngle(_z, alpha));
      l.mover.omega.copy(l.axis).multiplyScalar(l.rate);
    }
    // Warnung: Licht blinkt vor und während der Öffnung, Glocke kurz vorher
    let warn = false;
    for (const tp of this.passes) {
      for (const c2 of [-this.cycle, 0, this.cycle]) {
        const w0 = tp + c2 - 28, w1 = tp + c2 + 42;
        if (tm > w0 - 5 && tm < w1 + T_CLOSE) warn = true;
        if (tm > w0 - 4 && tm < w0 - 3 && this.bellAt !== Math.round(w0)) {
          this.bellAt = Math.round(w0);
          this.events.push({ type: 'bridgeBell', pos: this.leaves[0].mover.pos });
        }
      }
    }
    const on = warn && time % 0.8 < 0.4;
    this.warnMat.color.setRGB(on ? 7 : 0.3, on ? 0.4 : 0.02, on ? 0.3 : 0.02);
  }

  render() {
    if (!this.path) return;
    this.shipMesh.position.copy(this.ship.pos);
    this.shipMesh.quaternion.copy(this.ship.quat);
    for (const l of this.leaves) {
      l.mesh.position.copy(l.mover.pos);
      l.mesh.quaternion.copy(l.mover.quat);
    }
  }
}
