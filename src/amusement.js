import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { Mover, colored, box } from './mover.js';
import { CONFIG } from './config.js';
import { WARM, strut, cyl, stripedCone, bulb } from './pier.js';

// Vergnügungspier (feste Teile: landmarks.js buildPier, Optik: pier.js): das Riesenrad dreht sich langsam, seine Gondeln
// hängen immer waagrecht – einhaken, darauf landen, mitfahren. Die Achterbahn: der Zug wartet im Bahnhof, wird den
// Lifthügel hinaufgezogen und rollt dann mit der Schwerkraft (Tempo aus der Höhe unter dem Scheitel) – man kann auf ihm
// mitfahren oder die Schiene selbst entlanggrinden. Dazu Karussell, Kettenkarussell, Schiffschaukel, Freifallturm und
// Autoscooter. Alles ist eine reine Funktion der Zeit wie bei Bahn und Schiffen.
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), ONE = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _b = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const merged = (geos, opts = {}) => {
  const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3, ...opts }));
  m.castShadow = true;
  for (const x of geos) x.dispose();
  return m;
};
const glowing = (geos) => {
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }));
  for (const x of geos) x.dispose();
  return m;
};
const WHEEL_OMEGA = 0.06;   // rad/s – eine Umdrehung in gut 100 s
const DWELL = 6;            // Halt im Bahnhof (s)
const GONDOLA = ['#c8352b', '#2f6fb0', '#e08a1e', '#2c8a4e', '#8a3a7a', '#1f9aa6', '#d8c23a', '#e8e4dc'];

export class Amusement {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.movers = [];
    const P = city.landmarkData?.pier;
    if (!P) return;
    const F = P.F, W = P.wheel;
    // Riesenrad: Gruppe in der Radebene (x entlang der Küste, y oben, z gegen die Achse)
    this.t = new THREE.Vector3(F.tx, 0, F.tz);
    this.hub = new THREE.Vector3(F.at(W.d, W.s).x, W.y, F.at(W.d, W.s).z);
    this.W = W;
    const basis = new THREE.Matrix4().makeBasis(this.t, UP, new THREE.Vector3(-F.ux, 0, -F.uz));
    this.wheel = this.wheelModel(W);
    this.wheel.position.copy(this.hub);
    this.wheel.quaternion.setFromRotationMatrix(basis);
    this.wheelBase = this.wheel.quaternion.clone();
    this.group.add(this.wheel);
    this.gondolas = [];
    for (let k = 0; k < W.n; k++) {
      const mover = new Mover('gondola', [{ min: new THREE.Vector3(-1.4, -3, -1.6), max: new THREE.Vector3(1.4, -0.4, 1.6) }]);
      mover.radius = 8;
      mover.quat.setFromRotationMatrix(basis);
      const mesh = this.gondolaModel(GONDOLA[k % GONDOLA.length]);
      mesh.quaternion.copy(mover.quat);
      this.group.add(mesh);
      this.gondolas.push({ mover, mesh, a0: (k / W.n) * Math.PI * 2 });
    }
    // Achterbahn: Strecke mit Bogenlänge, Bahnhof, Lifthügel, Fahrt mit der Schwerkraft
    const T = P.track, n = T.length;
    this.track = T;
    this.cum = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) this.cum[i] = this.cum[i - 1] + T[i - 1].distanceTo(T[i % n]);
    const near = (d, s, y) => { const p = F.at(d, s); let bi = 0, bd = Infinity; T.forEach((q, i) => { const dd = Math.hypot(q.x - p.x, q.y - (P.top + y), q.z - p.z); if (dd < bd) { bd = dd; bi = i; } }); return bi; };
    const iStart = near(...P.station[0]), iEnd = near(...P.station[1]);
    let iTop = 0;
    T.forEach((q, i) => { if (q.y > T[iTop].y) iTop = i; });
    const inRange = (i, a, b) => (a <= b ? i >= a && i <= b : i >= a || i <= b);
    const g = CONFIG.physics.gravity, vTop = 4;
    const speed = (i) => {
      if (inRange(i, iStart, iEnd)) return 2.5;                                   // Bahnhof
      if (inRange(i, iEnd, iTop)) return 4;                                        // Kettenlift
      return Math.max(vTop, Math.sqrt(vTop * vTop + 2 * g * Math.max(0, T[iTop].y - T[i].y)) * 0.96);
    };
    this.time = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      this.time[i] = this.time[i - 1] + (this.cum[i] - this.cum[i - 1]) / ((speed(i - 1) + speed(i % n)) / 2) + (i - 1 === iEnd ? DWELL : 0);
    }
    this.cycle = this.time[n];
    this.iEnd = iEnd;
    this.train = new Mover('coaster', [{ min: new THREE.Vector3(-1.4, 0.3, -6.4), max: new THREE.Vector3(1.4, 2, 6.4) }]);
    this.train.radius = 14;
    this.trainMesh = this.trainModel();
    this.group.add(this.trainMesh, this.trackModel(T));
    // weitere Fahrgeschäfte (Lage: landmarks.js buildPier)
    this.rides = [Carousel, SwingRide, PirateShip, DropTower, BumperCars].map((R) => new R(this.group, P));
    this.movers = [...this.gondolas.map((g2) => g2.mover), this.train, ...this.rides.flatMap((r) => r.movers)];
  }

  wheelModel(W) {
    const R = W.R, geos = [];
    geos.push(colored(new THREE.TorusGeometry(R, 0.38, 6, 64), '#e8e4dc'));
    geos.push(colored(new THREE.TorusGeometry(R * 0.93, 0.22, 6, 64), '#e8e4dc'));
    for (let k = 0; k < W.n; k++) {
      const a = (k / W.n) * Math.PI * 2;
      geos.push(colored(new THREE.BoxGeometry(R, 0.3, 0.3).translate(R / 2, 0, 0).rotateZ(a), '#d8d4ce'));
      geos.push(colored(new THREE.BoxGeometry(0.3, 0.3, 3).translate(Math.cos(a) * R, Math.sin(a) * R, 0), '#9a949e')); // Gondelhalter
    }
    geos.push(colored(new THREE.CylinderGeometry(1.6, 1.6, 3.4, 16).rotateX(Math.PI / 2), '#c8352b'));                 // Nabe
    const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 }));
    m.castShadow = true;
    for (const x of geos) x.dispose();
    // Lichter am Rand (abends hübsch)
    const lights = [];
    for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; lights.push(new THREE.SphereGeometry(0.28, 6, 4).translate(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 0)); }
    const lm = new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.4, 1.2) }));
    for (const x of lights) x.dispose();
    const grp = new THREE.Group();
    grp.add(m, lm);
    return grp;
  }

  gondolaModel(col) {
    const geos = [
      colored(box(2.6, 2.1, 3, 0, -1.75, 0), col),
      colored(box(2.9, 0.35, 3.3, 0, -0.55, 0), '#e8e4dc'),
      colored(box(2.62, 0.9, 2.2, 0, -1.5, 0), '#2a2630'),   // Fensterband
      colored(box(0.25, 0.6, 0.25, 0, -0.2, 0), '#9a949e'),
    ];
    const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 }));
    m.castShadow = true;
    for (const x of geos) x.dispose();
    return m;
  }

  trainModel() {
    const geos = [];
    for (let k = 0; k < 3; k++) {
      const z = -4.2 + k * 4.2;
      geos.push(colored(box(2.6, 1.1, 3.8, 0, 0.95, z), k === 0 ? '#d8c23a' : '#c8352b'));
      geos.push(colored(box(2.2, 0.6, 1.2, 0, 1.75, z + 0.8), '#2a2630'));   // Sitzlehnen
      geos.push(colored(box(2.2, 0.6, 1.2, 0, 1.75, z - 0.9), '#2a2630'));
    }
    geos.push(colored(box(2.4, 1.4, 0.9, 0, 1.1, -6.1), '#d8c23a'));          // Bug
    const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 }));
    m.castShadow = true;
    for (const x of geos) x.dispose();
    return m;
  }

  // Schienen (zwei Rohre), Mittelträger und Schwellen entlang der Strecke
  trackModel(T) {
    const n = T.length, side = [], left = [], right = [], spine = [];
    for (let i = 0; i < n; i++) {
      _v.subVectors(T[(i + 1) % n], T[(i - 1 + n) % n]).normalize();
      const s = new THREE.Vector3().crossVectors(_v, UP).normalize();
      side.push(s);
      left.push(T[i].clone().addScaledVector(s, -0.6).add(new THREE.Vector3(0, 0.3, 0)));
      right.push(T[i].clone().addScaledVector(s, 0.6).add(new THREE.Vector3(0, 0.3, 0)));
      spine.push(T[i].clone().add(new THREE.Vector3(0, -0.35, 0)));
    }
    const geos = [
      colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(left, true), n * 2, 0.12, 5, true), '#e8e4dc'),
      colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(right, true), n * 2, 0.12, 5, true), '#e8e4dc'),
      colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine, true), n * 2, 0.3, 6, true), '#c8352b'),
    ];
    for (let i = 0; i < n; i += 2) {
      _v.subVectors(T[(i + 1) % n], T[i]).normalize();
      const tie = new THREE.BoxGeometry(1.5, 0.12, 0.3);
      _m.lookAt(_o.set(0, 0, 0), _v, UP);
      tie.applyMatrix4(_m).translate(T[i].x, T[i].y + 0.18, T[i].z);
      geos.push(colored(tie, '#9a949e'));
    }
    const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.25 }));
    m.castShadow = true;
    for (const x of geos) x.dispose();
    return m;
  }

  update(time, dt) {
    if (!this.track) return;
    // Riesenrad und Gondeln (die Gondeln drehen nicht mit, sie hängen waagrecht)
    const a = time * WHEEL_OMEGA, W = this.W;
    this.wheelAngle = a;
    for (const gd of this.gondolas) {
      const m = gd.mover, px = m.pos.x, py = m.pos.y, pz = m.pos.z, ang = gd.a0 + a;
      m.pos.copy(this.hub).addScaledVector(this.t, Math.cos(ang) * W.R).addScaledVector(UP, Math.sin(ang) * W.R);
      if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
    }
    // Achterbahnzug: Fahrplan rückwärts nachschlagen
    const tm = ((time % this.cycle) + this.cycle) % this.cycle, Tt = this.time, n = this.track.length;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const k = (lo + hi) >> 1; if (Tt[k] <= tm) lo = k; else hi = k; }
    const wait = lo === this.iEnd ? DWELL : 0;
    const u = Math.max(0, Math.min(1, (tm - Tt[lo] - wait) / Math.max(1e-6, Tt[hi] - Tt[lo] - wait)));
    const A = this.track[lo], B = this.track[hi % n], C = this.track[(hi + 2) % n];
    const m = this.train, px = m.pos.x, py = m.pos.y, pz = m.pos.z;
    m.pos.lerpVectors(A, B, u);
    _v.subVectors(C, A).normalize();
    _m.lookAt(_o.set(0, 0, 0), _v, UP);
    m.quat.setFromRotationMatrix(_m);
    if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
    for (const r of this.rides) r.update(time, dt);
  }

  render(time) {
    if (!this.track) return;
    for (const r of this.rides) r.render(time);
    this.wheel.quaternion.copy(this.wheelBase).multiply(_q.setFromAxisAngle(_o.set(0, 0, 1), this.wheelAngle ?? 0));
    for (const gd of this.gondolas) gd.mesh.position.copy(gd.mover.pos);
    this.trainMesh.position.copy(this.train.pos);
    this.trainMesh.quaternion.copy(this.train.quat);
  }
}

// ------------------------------------------------------------------ Karussell
// Plattform, Dach und Mittelsäule drehen sich gemeinsam, die Pferde wippen auf und ab. Plattform und Dach sind bewegte
// Flächen (zwei um 45° versetzte Quadrate ≈ Achteck): aufspringen und mitfahren.
class Carousel {
  constructor(group, P) {
    const C = P.carousel, p = P.F.at(C.d, C.s);
    this.c = V(p.x, P.top, p.z);
    this.w = 0.42;
    const boxes = [
      { min: V(-7.5, 0.25, -7.5), max: V(7.5, 0.85, 7.5) },
      { min: V(-7.5, 7.05, -7.5), max: V(7.5, 8.0, 7.5) },
      { min: V(-3.6, 8.0, -3.6), max: V(3.6, 9.1, 3.6) },
    ];
    this.movers = [0, Math.PI / 4].map((off) => {
      const m = new Mover('carousel', boxes);
      m.radius = 14;
      m.off = off;
      m.pos.copy(this.c);
      m.omega = V(0, this.w, 0);
      return m;
    });
    const g = (this.model = new THREE.Group()), geos = [], lights = [];
    g.position.copy(this.c);
    geos.push(cyl(8, 8, 0.6, 40, 0, 0.25, 0, '#c8a070'), cyl(8.06, 8.06, 0.3, 40, 0, 0.4, 0, '#c8352b', true));
    for (let k = 0; k < 12; k++) geos.push(colored(new THREE.CylinderGeometry(1.4, 1.4, 6.25, 2, 1, false, (k / 12) * Math.PI * 2, Math.PI / 6).translate(0, 0.85 + 3.125, 0), k % 2 ? '#2f6fb0' : '#d8c23a'));
    geos.push(...stripedCone(8.8, 2.8, 16, ['#c8352b', '#f4f0ea'], 0, 7.1, 0), cyl(8.8, 8.8, 0.9, 40, 0, 6.6, 0, '#f2c230', true));
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; lights.push(bulb(Math.cos(a) * 8.86, 6.68, Math.sin(a) * 8.86, WARM[k % WARM.length], 0.16)); }
    geos.push(colored(new THREE.SphereGeometry(0.45, 10, 8).translate(0, 10.1, 0), '#f2c230'), cyl(0.05, 0.05, 1.6, 5, 0, 10.4, 0, '#e8e4dc'), colored(box(0.9, 0.55, 0.03, 0.47, 11.65, 0), '#c8352b'));
    // Pferde auf goldenen Stangen: außen 12, innen 8 (Lage im drehenden System, Kopf in Fahrtrichtung)
    this.horses = [];
    for (const [n, r] of [[12, 6.5], [8, 4.2]]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (r < 5 ? 0.2 : 0);
        this.horses.push({ a, r, ph: k * 1.7 + r });
        geos.push(cyl(0.06, 0.06, 6.2, 6, Math.cos(a) * r, 0.85, -Math.sin(a) * r, '#d8c23a'));
      }
    }
    // zwei Ausführungen im Wechsel (goldene Mähne / rotes Sattelzeug, braune Mähne / blaues Sattelzeug), Fell leicht getönt
    const mat = toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 });
    this.horseMeshes = [HORSE_A, HORSE_B].map((v, j) => {
      const m = new THREE.InstancedMesh(horseGeo(v), mat, Math.ceil((this.horses.length - j) / 2));
      m.castShadow = true;
      return m;
    });
    const tints = ['#ffffff', '#f6d8b0', '#cfe2f6', '#f4c2cf', '#d8eec8', '#e6dcff'];
    this.horses.forEach((h, i) => { h.mesh = this.horseMeshes[i % 2]; h.slot = i >> 1; h.mesh.setColorAt(h.slot, new THREE.Color(tints[i % tints.length])); });
    g.add(merged(geos), glowing(lights), ...this.horseMeshes);
    group.add(g);
    this.angle = 0;
  }

  update(t) {
    this.angle = this.w * t;
    for (const m of this.movers) m.quat.setFromAxisAngle(UP, this.angle + m.off);
  }

  render(t) {
    this.model.rotation.y = this.angle;
    for (const h of this.horses) {
      _p.set(Math.cos(h.a) * h.r, 2.3 + 0.3 * Math.sin(t * 2.3 + h.ph), -Math.sin(h.a) * h.r);
      _m.compose(_p, _q.setFromAxisAngle(UP, h.a + Math.PI / 2), ONE);
      h.mesh.setMatrixAt(h.slot, _m);
    }
    for (const m of this.horseMeshes) m.instanceMatrix.needsUpdate = true;
  }
}

// Karussellpferd (Kopf nach +x, Rumpfmitte im Ursprung, Stange bei x = 0): runder Rumpf mit Brust und Kruppe, geneigter
// Hals, Kopf mit Maul, Ohren und Augen, Mähne und Schweif in Büscheln, Beine mit Knie und Hufen im Galopp, Sattel mit
// Decke, Steigbügeln und Zügeln, Brustband mit Schmucksteinen, Feder auf dem Kopf
const HORSE_A = { hair: '#d9a63a', saddle: '#c8352b', blanket: '#2f6fb0', trim: '#f2c230', plume: '#c8352b' };
const HORSE_B = { hair: '#6a4430', saddle: '#2f6fb0', blanket: '#8a3a7a', trim: '#f2c230', plume: '#2f6fb0' };
function horseGeo(v) {
  const coat = '#ffffff', geos = [];
  const ball = (r, sx, sy, sz, x, y, z, col, seg = 12) => geos.push(colored(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)).scale(sx, sy, sz).translate(x, y, z), col));
  const limb = (a, b, r0, r1, col) => {
    const d = _v.subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0).applyQuaternion(_q.setFromUnitVectors(UP, d.normalize()));
    geos.push(colored(g.translate(a.x, a.y, a.z), col));
  };
  // Rumpf, Brust, Kruppe, Hals
  ball(1, 0.92, 0.42, 0.33, 0, 0, 0, coat, 16);
  ball(0.4, 1, 1.05, 0.85, 0.66, 0.06, 0, coat);
  ball(0.42, 1, 1, 0.85, -0.6, 0.04, 0, coat);
  limb(V(0.62, 0.15, 0), V(1.08, 0.98, 0), 0.3, 0.19, coat);
  // Kopf schräg nach vorn unten, Maul, Ohren, Augen, Nüstern
  geos.push(colored(new THREE.SphereGeometry(0.24, 12, 8).scale(1.55, 0.85, 0.75).rotateZ(-0.6).translate(1.24, 1.0, 0), coat));
  ball(0.15, 1.2, 0.9, 0.95, 1.52, 0.8, 0, '#efe6dc');
  for (const s of [-1, 1]) {
    geos.push(colored(new THREE.ConeGeometry(0.06, 0.22, 6).rotateZ(0.3).translate(1.12, 1.3, s * 0.09), coat));
    ball(0.042, 1, 1, 0.6, 1.33, 1.06, s * 0.165, '#1a1820', 8);
    ball(0.025, 1, 1, 1, 1.68, 0.79, s * 0.07, '#3a3644', 6);
  }
  // Mähne als Büschel den Hals entlang, Stirnschopf, Schweif als Bogen
  for (let k = 0; k < 6; k++) { const u = k / 5; ball(0.12 - u * 0.03, 0.9, 1.3, 0.5, 0.58 + 0.5 * u - 0.07, 0.4 + 0.78 * u + 0.08, 0, v.hair, 8); }
  ball(0.09, 1.2, 0.8, 0.6, 1.24, 1.2, 0, v.hair, 8);
  [[-0.98, 0.16, 0.13], [-1.16, 0.02, 0.12], [-1.3, -0.16, 0.11], [-1.38, -0.36, 0.09], [-1.4, -0.54, 0.07]].forEach(([x, y, r]) => ball(r, 1, 1.2, 0.8, x, y, 0, v.hair, 8));
  // Beine im Galopp: vorn eines angewinkelt, eines ausgreifend, hinten gestreckt und abstoßend
  const legs = [
    [[0.62, -0.15, 0.16], [0.95, -0.45, 0.16], [0.82, -0.78, 0.16]],
    [[0.58, -0.15, -0.16], [0.74, -0.6, -0.16], [0.96, -0.98, -0.16]],
    [[-0.62, -0.12, 0.16], [-0.95, -0.5, 0.16], [-1.24, -0.84, 0.16]],
    [[-0.58, -0.12, -0.16], [-0.68, -0.6, -0.16], [-0.92, -1.0, -0.16]],
  ];
  for (const [S, K, H] of legs) {
    const s = V(...S), k = V(...K), h = V(...H);
    limb(s, k, 0.11, 0.085, coat);
    limb(k, h, 0.075, 0.06, coat);
    const dir = _o.subVectors(h, k).normalize();
    limb(h.clone().addScaledVector(dir, -0.02), h.clone().addScaledVector(dir, 0.1), 0.085, 0.09, v.trim);
  }
  // Sattel mit Decke und Goldborte, Steigbügel, Brustband mit Steinen, Zügel, Feder
  geos.push(colored(box(0.6, 0.08, 0.5, -0.04, 0.43, 0), v.saddle), colored(box(0.1, 0.16, 0.44, -0.32, 0.5, 0), v.saddle), colored(box(0.08, 0.14, 0.3, 0.24, 0.5, 0), v.saddle));
  geos.push(colored(box(0.78, 0.46, 0.7, -0.04, 0.22, 0), v.blanket), colored(box(0.8, 0.06, 0.72, -0.04, -0.01, 0), v.trim));
  for (const s of [-1, 1]) {
    geos.push(colored(box(0.03, 0.42, 0.02, -0.04, 0.0, s * 0.36), '#3a3644'));
    geos.push(colored(new THREE.TorusGeometry(0.07, 0.016, 5, 10).translate(-0.04, -0.27, s * 0.37), v.trim));
    limb(V(1.5, 0.84, s * 0.12), V(0.3, 0.62, s * 0.14), 0.014, 0.014, '#3a3644');
  }
  geos.push(colored(new THREE.TorusGeometry(0.42, 0.035, 6, 14, Math.PI).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2).translate(0.66, 0.02, 0), v.trim));
  [['#c8352b', 0, 1.1], ['#2f6fb0', -0.17, 1.06], ['#2c8a4e', 0.17, 1.06]].forEach(([c, z, x]) => ball(0.05, 0.6, 1, 1, x, 0.02, z, c, 8));
  geos.push(colored(new THREE.ConeGeometry(0.06, 0.34, 6).rotateZ(0.5).translate(1.06, 1.38, 0), v.plume));
  const g = mergeGeometries(geos);
  for (const x of geos) x.dispose();
  return g;
}

// ------------------------------------------------------------------ Kettenkarussell
// Turm fest, die Krone dreht sich (Pause, Anlauf, Fahrt, Auslauf); die Sessel schwingen an ihren Ketten nach außen
// (Gleichgewicht aus Schwerkraft und Fliehkraft). Sessel und Schirm sind Ankerpunkte – loslassen schleudert.
const SWING_CYCLE = 46, SWING_W = 1.1;
class SwingRide {
  constructor(group, P) {
    const S = (this.S = P.swing), p = P.F.at(S.d, S.s), n = (this.n = 16);
    this.c = V(p.x, P.top + S.h, p.z);
    this.chairs = [];
    for (let k = 0; k < n; k++) {
      const m = new Mover('chair', [{ min: V(-0.55, -1.45, -0.5), max: V(0.55, -0.25, 0.5) }]);
      m.radius = 3;
      this.chairs.push(m);
    }
    this.canopy = new Mover('canopy', [{ min: V(-4.4, 0.3, -4.4), max: V(4.4, 2.2, 4.4) }]);
    this.canopy.radius = 8;
    this.canopy.pos.copy(this.c);
    this.canopy.omega = V(0, 0, 0);
    this.movers = [...this.chairs, this.canopy];
    this.alpha = new Float32Array(n);
    // Krone: Schirm mit Saum und Birnen, Ausleger zu den Kettenpunkten
    const crown = (this.crown = new THREE.Group()), geos = [], lights = [];
    crown.position.copy(this.c);
    geos.push(...stripedCone(6.3, 2.5, 16, ['#2f6fb0', '#f4f0ea'], 0, 0.3, 0), cyl(6.3, 6.3, 0.55, 32, 0, 0, 0, '#d6c84a', true), cyl(1.2, 1.2, 0.8, 14, 0, -0.4, 0, '#c8352b'));
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; geos.push(strut(V(0, 0.05, 0), V(Math.cos(a) * S.a, 0.05, -Math.sin(a) * S.a), 0.14, '#9a949e')); }
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; lights.push(bulb(Math.cos(a) * 6.36, 0.1, -Math.sin(a) * 6.36, WARM[k % WARM.length], 0.15)); }
    geos.push(colored(new THREE.SphereGeometry(0.4, 10, 8).translate(0, 2.95, 0), '#f2c230'));
    crown.add(merged(geos), glowing(lights));
    // Sessel und Ketten (instanziert)
    this.chairMesh = new THREE.InstancedMesh(chairGeo(), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 }), n);
    this.chairMesh.castShadow = true;
    const cols = ['#c8352b', '#2f6fb0', '#f2c230', '#2c8a4e', '#e08a1e', '#8a3a7a'];
    for (let k = 0; k < n; k++) this.chairMesh.setColorAt(k, new THREE.Color(cols[k % cols.length]));
    this.chainMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4).translate(0, 0.5, 0), toonMaterial('#9a949e', { rim: 0.1, pbr: { roughness: 0.35, metalness: 0.9 } }), n * 2);
    group.add(crown, this.chairMesh, this.chainMesh);
    this.phi = 0;
  }

  // Drehwinkel und Drehzahl der Krone: Pause, linear hoch, volle Fahrt, linear herunter, Pause
  spin(t) {
    const W = SWING_W, tc = ((t % SWING_CYCLE) + SWING_CYCLE) % SWING_CYCLE, n = Math.floor(t / SWING_CYCLE);
    let phi = 27 * W, w = 0;
    if (tc < 9) phi = 0;
    else if (tc < 15) { const u = tc - 9; w = (W * u) / 6; phi = (W * u * u) / 12; }
    else if (tc < 36) { w = W; phi = W * 3 + W * (tc - 15); }
    else if (tc < 42) { const u = tc - 36; w = W * (1 - u / 6); phi = W * 24 + W * u - (W * u * u) / 12; }
    return { phi: n * 27 * W + phi, w };
  }

  update(t, dt) {
    const { phi, w } = this.spin(t), S = this.S, g = CONFIG.physics.gravity;
    this.phi = phi;
    // Kettenwinkel: tan θ = ω²·(a + l·sin θ)/g
    let th = 0;
    for (let k = 0; k < 8; k++) th = Math.atan((w * w * (S.a + S.l * Math.sin(th))) / g);
    this.theta = th;
    const r = S.a + S.l * Math.sin(th), y = -S.l * Math.cos(th);
    this.chairs.forEach((m, k) => {
      const al = phi + (k / this.n) * Math.PI * 2, px = m.pos.x, py = m.pos.y, pz = m.pos.z;
      this.alpha[k] = al;
      m.pos.set(this.c.x + Math.cos(al) * r, this.c.y + y, this.c.z - Math.sin(al) * r);
      m.quat.setFromAxisAngle(UP, al + Math.PI / 2).multiply(_q.setFromAxisAngle(X, -th));
      if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
    });
    this.canopy.quat.setFromAxisAngle(UP, phi);
    this.canopy.omega.set(0, w, 0);
  }

  render() {
    this.crown.rotation.y = this.phi;
    const S = this.S;
    this.chairs.forEach((m, k) => {
      _m.compose(m.pos, m.quat, ONE);
      this.chairMesh.setMatrixAt(k, _m);
      const al = this.alpha[k], tx = -Math.sin(al), tz = -Math.cos(al);
      for (const j of [0, 1]) {
        const off = j ? 0.42 : -0.42;
        _p.set(off, -0.3, 0).applyQuaternion(m.quat).add(m.pos);                                      // am Sessel
        _b.set(this.c.x + Math.cos(al) * S.a + tx * off, this.c.y, this.c.z - Math.sin(al) * S.a + tz * off); // am Ausleger
        _v.subVectors(_b, _p);
        const len = _v.length();
        _m.compose(_p, _q.setFromUnitVectors(UP, _v.divideScalar(len)), _o.set(1, len, 1));
        this.chainMesh.setMatrixAt(k * 2 + j, _m);
      }
    });
    this.chairMesh.instanceMatrix.needsUpdate = true;
    this.chainMesh.instanceMatrix.needsUpdate = true;
  }
}

// Sessel, Blick nach +x, Kettenpunkt im Ursprung
function chairGeo() {
  const geos = [
    colored(box(0.9, 0.12, 0.8, 0, -1.25, 0), '#ffffff'),
    colored(box(0.12, 0.85, 0.8, -0.42, -0.85, 0), '#ffffff'),
    colored(box(0.06, 0.95, 0.06, -0.42, -0.78, -0.4), '#9a949e'), colored(box(0.06, 0.95, 0.06, -0.42, -0.78, 0.4), '#9a949e'),
    colored(box(0.06, 1.0, 0.06, 0.42, -0.8, 0), '#9a949e'),
    colored(box(0.08, 0.08, 0.8, 0.42, -1.0, 0), '#9a949e'),
    colored(box(0.5, 0.08, 0.6, 0.55, -1.6, 0), '#9a949e'),
  ];
  const g = mergeGeometries(geos);
  for (const x of geos) x.dispose();
  return g;
}

// ------------------------------------------------------------------ Schiffschaukel
// Das Boot pendelt an zwei Armpaaren um die Achse oben im A-Gestell; der Ausschlag schwillt an, hält und klingt ab,
// dann eine Pause zum Ein- und Aussteigen.
class PirateShip {
  constructor(group, P) {
    const S = (this.S = P.ship), F = P.F, p = F.at(S.d, S.s), L = S.L;
    this.pivot = V(p.x, P.top + S.h, p.z);
    this.axis = V(F.ux, 0, F.uz);
    this.base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.axis, UP, V(F.tx, 0, F.tz)));
    this.T = 2 * Math.PI * Math.sqrt(L / CONFIG.physics.gravity);
    this.mover = new Mover('ship', [
      { min: V(-2.4, -L - 1.6, -7), max: V(2.4, -L + 1.2, 7) },
      { min: V(-1.8, -L - 0.9, -9.2), max: V(1.8, -L + 2.6, -7) },
      { min: V(-1.8, -L - 0.9, 7), max: V(1.8, -L + 2.6, 9.2) },
    ]);
    this.mover.radius = L + 12;
    this.mover.pos.copy(this.pivot);
    this.mover.omega = V(0, 0, 0);
    this.movers = [this.mover];
    this.model = boatModel(L);
    group.add(this.model);
  }

  // Auslenkung und Winkelgeschwindigkeit: 9 s Pause, dann 9 Schwingungen (3 anschwellen, 3 halten, 3 abklingen)
  swing(t) {
    const T = this.T, A = 1.25, idle = 9, C = idle + 9 * T, tc = ((t % C) + C) % C;
    if (tc < idle) return [0, 0];
    const u = (tc - idle) / T, sm = (x) => x * x * (3 - 2 * x), dsm = (x) => 6 * x * (1 - x);
    let e = 1, de = 0;
    if (u < 3) { e = sm(u / 3); de = dsm(u / 3) / 3; }
    else if (u > 6) { e = sm((9 - u) / 3); de = -dsm((9 - u) / 3) / 3; }
    const w = Math.PI * 2, s = Math.sin(w * u), c = Math.cos(w * u);
    return [A * e * s, (A * (de * s + e * w * c)) / T];
  }

  update(t) {
    const [th, dth] = this.swing(t);
    this.mover.quat.copy(this.base).multiply(_q.setFromAxisAngle(X, th));
    this.mover.omega.copy(this.axis).multiplyScalar(dth);
  }

  render() {
    this.model.position.copy(this.pivot);
    this.model.quaternion.copy(this.mover.quat);
  }
}

// Rumpf als glatte, offene Schale (Querschnitte alle 0,5 m): Boden und ausgestellte Bordwände steigen zu den Enden hin
// an, oben Zierleiste und Reling, innen das Deck
function hullGeo(y0) {
  const pos = [], col = [], Z = 9, step = 0.5;
  const prof = (z) => { const h = (4.8 - 0.022 * z * z) / 2; return { h, b: h * 0.78, bot: y0 - 1.6 + 0.03 * z * z, deck: y0 + 0.3 + 0.022 * z * z, top: y0 + 1.2 + 0.022 * z * z }; };
  const quad = (a, b, c, d, hex) => { const cc = new THREE.Color(hex); for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); col.push(cc.r, cc.g, cc.b); } };
  for (let z = -Z; z < Z - 1e-6; z += step) {
    const A = prof(z), B = prof(z + step), z1 = z + step;
    for (const s of [-1, 1]) {
      quad([s * A.b, A.bot, z], [s * B.b, B.bot, z1], [s * B.h, B.top - 0.55, z1], [s * A.h, A.top - 0.55, z], '#8a3a2a');
      quad([s * A.h, A.top - 0.55, z], [s * B.h, B.top - 0.55, z1], [s * B.h, B.top - 0.25, z1], [s * A.h, A.top - 0.25, z], '#d6a640');
      quad([s * A.h, A.top - 0.25, z], [s * B.h, B.top - 0.25, z1], [s * B.h, B.top, z1], [s * A.h, A.top, z], '#8a3a2a');
      quad([s * A.h, A.top, z], [s * B.h, B.top, z1], [s * (B.h - 0.25), B.top, z1], [s * (A.h - 0.25), A.top, z], '#6a2a1e');
      quad([s * (A.h - 0.25), A.top, z], [s * (B.h - 0.25), B.top, z1], [s * (B.h - 0.25), B.deck, z1], [s * (A.h - 0.25), A.deck, z], '#a8543a');
    }
    quad([-A.b, A.bot, z], [A.b, A.bot, z], [B.b, B.bot, z1], [-B.b, B.bot, z1], '#5a2418');
    quad([-(A.h - 0.25), A.deck, z], [A.h - 0.25, A.deck, z], [B.h - 0.25, B.deck, z1], [-(B.h - 0.25), B.deck, z1], '#b88a5a');
  }
  for (const z of [-Z, Z]) { const A = prof(z); quad([-A.b, A.bot, z], [A.b, A.bot, z], [A.h, A.top, z], [-A.h, A.top, z], '#8a3a2a'); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

// Boot im Pendelsystem (x = Achse, z = Schwingrichtung), Bootsmitte L unter der Achse: Rumpf, Sitzreihen, Kugeln an Bug
// und Heck, Mast mit Segel und Wimpel, Arme hinauf zur Nabe
function boatModel(L) {
  const geos = [hullGeo(-L)], y0 = -L;
  for (let z = -6; z <= 6; z += 2) {
    const w = 4.8 - 0.022 * z * z, deck = y0 + 0.3 + 0.022 * z * z;
    geos.push(colored(box(w - 0.8, 0.45, 0.5, 0, deck + 0.22, z), '#2f6fb0'), colored(box(w - 0.8, 0.5, 0.12, 0, deck + 0.6, z + 0.3), '#2f6fb0'));
  }
  for (const z of [-9.1, 9.1]) geos.push(colored(new THREE.SphereGeometry(0.55, 10, 8).translate(0, y0 + 3.25, z), '#d6a640'));
  geos.push(cyl(0.12, 0.15, 6.5, 8, 0, y0 + 0.3, 0, '#6a4a2a'));
  for (let k = 0; k < 3; k++) geos.push(colored(box(3.4, 1.0, 0.05, 0, y0 + 2.8 + k * 1.0, 0.15), k % 2 ? '#f4f0ea' : '#c8352b'));
  geos.push(colored(box(0.04, 0.5, 0.9, 0, y0 + 6.5, 0.45), '#c8352b'));
  for (const sx of [-2.65, 2.65]) for (const zz of [-3.6, 3.6]) geos.push(strut(V(sx, 0, 0), V(sx, y0 + 1.5, zz), 0.32, '#9a949e'));
  geos.push(colored(new THREE.CylinderGeometry(0.4, 0.4, 5.6, 12).rotateZ(Math.PI / 2), '#5e5866'));
  const g = new THREE.Group();
  g.add(merged(geos, { side: THREE.DoubleSide }));
  return g;
}

// ------------------------------------------------------------------ Freifallturm
// Die Gondel umschließt den Schaft: warten, langsam hochziehen, oben halten, freier Fall, scharf bremsen, langsam
// hinunter. Oben auf der Gondel kann man mitfahren – und sich in der Höhe absetzen.
class DropTower {
  constructor(group, P) {
    const D = P.drop, F = P.F, p = F.at(D.d, D.s), g = CONFIG.physics.gravity;
    this.c = V(p.x, P.top, p.z);
    this.mover = new Mover('drop', [{ min: V(-4.3, 0, -4.3), max: V(4.3, 1.5, 4.3) }]);
    this.mover.radius = 8;
    this.mover.quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(F.ux, 0, F.uz), UP, V(F.tx, 0, F.tz)));
    this.movers = [this.mover];
    const y0 = 0.6, y1 = D.H - 8, yF = y1 - 28, yB = 6, vS = 1.5, vL = 3;
    const tF = Math.sqrt((2 * (y1 - yF)) / g), vF = g * tF, aB = (vF * vF - vS * vS) / (2 * (yF - yB)), tB = (vF - vS) / aB;
    this.seg = { y0, y1, yF, yB, vS, vL, tF, vF, aB, tB, wait: 8, hold: 4, g };
    this.cycle = 8 + (y1 - y0) / vL + 4 + tF + tB + (yB - y0) / vS;
    this.model = dropCarriage();
    group.add(this.model);
  }

  // Höhe über dem Deck und Steiggeschwindigkeit
  height(t) {
    const S = this.seg;
    let u = ((t % this.cycle) + this.cycle) % this.cycle;
    if (u < S.wait) return [S.y0, 0];
    u -= S.wait;
    const tL = (S.y1 - S.y0) / S.vL;
    if (u < tL) return [S.y0 + S.vL * u, S.vL];
    u -= tL;
    if (u < S.hold) return [S.y1, 0];
    u -= S.hold;
    if (u < S.tF) return [S.y1 - 0.5 * S.g * u * u, -S.g * u];
    u -= S.tF;
    if (u < S.tB) return [S.yF - (S.vF * u - 0.5 * S.aB * u * u), -(S.vF - S.aB * u)];
    u -= S.tB;
    return [Math.max(S.y0, S.yB - S.vS * u), -S.vS];
  }

  update(t) {
    const [y, v] = this.height(t);
    this.mover.pos.set(this.c.x, this.c.y + y, this.c.z);
    this.mover.vel.set(0, v, 0);
  }

  render() {
    this.model.position.copy(this.mover.pos);
    this.model.quaternion.copy(this.mover.quat);
  }
}

// Gondel: quadratischer Ring um den Schaft, je Seite drei Sitze nach außen mit Schulterbügeln, Birnen unten
function dropCarriage() {
  const side = [], light = [], geos = [], lights = [];
  for (const t of [-1.5, 0, 1.5]) {
    side.push(colored(box(0.8, 0.15, 1.0, 3.0, 0.6, t), '#c8352b'), colored(box(0.15, 1.2, 1.0, 2.55, 1.1, t), '#c8352b'));
    side.push(colored(box(0.45, 0.14, 0.8, 2.85, 1.78, t), '#f2c230'), colored(box(0.1, 0.5, 0.1, 3.05, 1.5, t - 0.35), '#f2c230'), colored(box(0.1, 0.5, 0.1, 3.05, 1.5, t + 0.35), '#f2c230'));
  }
  side.push(colored(box(1.2, 0.5, 5.6, 2.2, 0.25, 0), '#2a2630'));
  for (let t = -2.6; t <= 2.61; t += 0.65) light.push(bulb(2.82, 0.05, t, WARM[Math.round(t * 2 + 6) % WARM.length], 0.12));
  for (let k = 0; k < 4; k++) {
    for (const g of side) geos.push(g.clone().rotateY((k * Math.PI) / 2));
    for (const g of light) lights.push(g.clone().rotateY((k * Math.PI) / 2));
  }
  for (const g of [...side, ...light]) g.dispose();
  const grp = new THREE.Group();
  grp.add(merged(geos), glowing(lights));
  return grp;
}

// ------------------------------------------------------------------ Autoscooter
// Acht Wagen kurven auf einer abgerundeten Bahn durch die Halle und schlingern dabei hin und her (nur Optik).
class BumperCars {
  constructor(group, P) {
    const H = P.hall;
    this.F = P.F;
    this.y = P.top + 0.2;
    this.cd = (H.d0 + H.d1) / 2;
    this.cs = (H.s0 + H.s1) / 2;
    this.A = (H.d1 - H.d0) / 2 - 3.4;
    this.B = (H.s1 - H.s0) / 2 - 3.4;
    this.r = 3.2;
    const a = this.A - this.r, b = this.B - this.r;
    this.len = 4 * a + 4 * b + 2 * Math.PI * this.r;
    this.n = 8;
    this.movers = [];
    this.mesh = new THREE.InstancedMesh(carGeo(), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 }), this.n);
    this.mesh.castShadow = true;
    const cols = ['#e83a3a', '#2f8ae8', '#f2c230', '#2cc06a', '#ff6ab0', '#ff8a2a', '#1fc0c8', '#9a5ae8'];
    for (let k = 0; k < this.n; k++) this.mesh.setColorAt(k, new THREE.Color(cols[k]));
    group.add(this.mesh);
  }

  // Punkt und Richtung auf der Bahn (lokal d, s) bei Bogenlänge u: Geraden und Viertelkreise im Wechsel
  loop(u, out) {
    const a = this.A - this.r, b = this.B - this.r, r = this.r, q = (Math.PI * r) / 2;
    const segs = [[2 * a, -a, -this.B, 1, 0], [q, a, -b, -Math.PI / 2], [2 * b, this.A, -b, 0, 1], [q, a, b, 0], [2 * a, a, this.B, -1, 0], [q, -a, b, Math.PI / 2], [2 * b, -this.A, b, 0, -1], [q, -a, -b, Math.PI]];
    u = ((u % this.len) + this.len) % this.len;
    for (const sg of segs) {
      if (u > sg[0]) { u -= sg[0]; continue; }
      if (sg.length === 5) { out.d = sg[1] + sg[3] * u; out.s = sg[2] + sg[4] * u; out.hd = sg[3]; out.hs = sg[4]; }
      else { const ang = sg[3] + u / r; out.d = sg[1] + Math.cos(ang) * r; out.s = sg[2] + Math.sin(ang) * r; out.hd = -Math.sin(ang); out.hs = Math.cos(ang); }
      break;
    }
    return out;
  }

  update() {}

  render(t) {
    const F = this.F, o = {};
    for (let k = 0; k < this.n; k++) {
      this.loop(3.2 * t + (k * this.len) / this.n, o);
      const wob = 1.3 * Math.sin(t * 0.9 + k * 2.1), d = this.cd + o.d - o.hs * wob, s = this.cs + o.s + o.hd * wob;
      const p = F.at(d, s), wx = F.ux * o.hd + F.tx * o.hs, wz = F.uz * o.hd + F.tz * o.hs;
      _p.set(p.x, this.y, p.z);
      _m.compose(_p, _q.setFromAxisAngle(UP, Math.atan2(-wz, wx) + 0.35 * Math.sin(t * 1.3 + k)), ONE);
      this.mesh.setMatrixAt(k, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Wagen, Fahrtrichtung +x: Gummipuffer, Wanne, Haube, Lehne, Lenkrad, Stromabnehmer bis unter die Decke
function carGeo() {
  const geos = [
    colored(box(2.3, 0.3, 1.6, 0, 0.2, 0), '#2a2630'),
    colored(box(2.0, 0.45, 1.35, 0, 0.55, 0), '#ffffff'),
    colored(box(0.6, 0.35, 1.2, 0.65, 0.9, 0), '#ffffff'),
    colored(box(0.25, 0.7, 1.1, -0.75, 1.05, 0), '#ffffff'),
    colored(new THREE.TorusGeometry(0.2, 0.04, 6, 12).rotateY(Math.PI / 2).rotateZ(0.5).translate(0.25, 1.05, 0), '#2a2630'),
    colored(new THREE.CylinderGeometry(0.04, 0.04, 4.9, 5).translate(-0.95, 0.75 + 2.45, 0), '#9a949e'),
    colored(box(0.3, 0.12, 0.3, -0.95, 5.65, 0), '#9a949e'),
  ];
  const g = mergeGeometries(geos);
  for (const x of geos) x.dispose();
  return g;
}
