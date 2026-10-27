import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toonMaterial, outlineMaterial } from './toon.js';
import { createClips, GAITS } from './animations.js';
import { tubeGeometry, skirtGeometry, headGeometry, withColor } from './charGeo.js';
import { smin, smax, sdEllipsoid, sdRoundCone, sdRoundBox, sdTorus, ConeSet, polygonize, paint, skin } from './sdf.js';
import { CONFIG } from './config.js';

// Spielfigur Kaia. Jacke mit Kapuze, Haare, Hände und Schuhe
// entstehen aus weich verschmolzenen Abstandsfeldern (glatte, runde Formen mit Stofffalten),
// Beine, Shirt und Strümpfe als gehäutete Röhren. Farben zentral hier anpassen:
export const LOOK = {
  skin: '#f6d6c6',
  hair: '#1c2240', hairTip: '#34467e', hairShine: '#5a6db0', hairInner: '#10132a', hairClip: '#d8343a',
  tee: '#16161c', print: '#f2f0ea',
  jacket: '#18181f', jacketTrim: '#d2d5de', jacketOrange: '#e8642a', jacketBand: '#0f0f13', hoodLining: '#c63a2e', emblem: '#f3f1ec',
  belt: '#d0452b', buckle: '#b8bcc6', device: '#f2efe6', deviceAccent: '#f4c430', strap: '#c8322c',
  skirt: '#5b5e69', skirtLight: '#8e919b', plaidA: '#5e3326', plaidB: '#a8673e', shorts: '#202028',
  stocking: '#141418', stockingStripe: '#ecebef', sock: '#8a4630', sockPattern: '#4e2419',
  shoeSole: '#2e2f36', shoeMid: '#e9e9ee', shoeUpper: '#c3c5ce', shoeDark: '#1c1c22', shoeRed: '#d8342c',
  glove: '#c8322c', bracelet: '#2fb3a8', gear: '#3e4250', gearAccent: '#f4c430',
  iris: '#2aa3a6', irisDeep: '#0d4450', irisLight: '#a6ece4', lash: '#1a1024', brow: '#1d2341',
};

// Gelenkpositionen im Modellraum (Füße bei y = 0, Bind-Pose)
const B = {
  hips: [0, 0.86, 0], spine: [0, 0.96, 0], chest: [0, 1.08, 0], neck: [0, 1.31, 0], head: [0, 1.38, 0],
  shoulderX: 0.155, shoulderY: 1.27, elbowY: 1.03, wristY: 0.825,
  hipX: 0.085, hipY: 0.81, kneeY: 0.43, ankleY: 0.07,
};
const AP = 0.2; // A-Haltung der Arme beim Binden: Ärmel und Rumpf bleiben getrennte Formen
const HC = new THREE.Vector3(0, 1.482, 0.006); // Kopfmitte
const HAIR_R = 0.117;
const ONE_SHOTS = ['jump', 'land', 'landHard', 'flip', 'dash', 'stop', 'pivot'];
const GAIT_ORDER = ['walk', 'jog', 'sprint'];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _r = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const col = (hex) => new THREE.Color(hex);

// Profil aus Stützstellen [y, rx, rz, ox, oz] (absteigend in y), linear interpoliert.
function keyed(keys, grow = 0, sx = 1) {
  return (t, y) => {
    let i = 0;
    while (i < keys.length - 2 && y < keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1];
    const u = clamp((a[0] - y) / (a[0] - b[0]), 0, 1);
    return [lerp(a[1], b[1], u) + grow, lerp(a[2], b[2], u) + grow, lerp(a[3] ?? 0, b[3] ?? 0, u) * sx, lerp(a[4] ?? 0, b[4] ?? 0, u)];
  };
}

const TORSO = [
  [1.335, 0.046, 0.043, 0, 0.006], [1.3, 0.088, 0.07, 0, 0.008], [1.26, 0.138, 0.084, 0, 0.01],
  [1.18, 0.126, 0.092, 0, -0.004], [1.1, 0.116, 0.088, 0, -0.006], [1.02, 0.1, 0.076, 0, 0],
  [0.94, 0.11, 0.08, 0, 0], [0.86, 0.128, 0.09, 0, 0.004], [0.79, 0.132, 0.092, 0, 0.006],
];
const LEG = [
  [0.86, 0.075, 0.082], [0.78, 0.073, 0.077], [0.68, 0.066, 0.07], [0.56, 0.056, 0.06],
  [0.48, 0.048, 0.052, -0.004, -0.003], [0.43, 0.046, 0.05, -0.006, -0.006], [0.37, 0.048, 0.053, -0.004, 0.004],
  [0.3, 0.05, 0.056, -0.002, 0.01], [0.22, 0.042, 0.047, 0, 0.007], [0.14, 0.033, 0.037, 0, 0.003], [0.055, 0.03, 0.034, 0, 0.002],
];

// ------------------------------------------------------------------ Abstandsfelder der Kleidung

// Übergroße Jacke mit Kapuze, in A-Haltung modelliert. comp enthält nach jedem Aufruf die Abstände
// der Einzelteile (für Farben und Skin-Gewichte).
function jacketField() {
  const arms = [-1, 1].map((s) => {
    const d = [s * Math.sin(AP), -Math.cos(AP)];
    const S = [s * B.shoulderX, B.shoulderY];
    const E = [S[0] + d[0] * 0.24, S[1] + d[1] * 0.24];
    const W = [E[0] + d[0] * 0.205, E[1] + d[1] * 0.205];
    return { s, d, S, E, W };
  });
  const wOpen = (y) => 0.05 + 0.04 * smooth(1.3, 0.8, y);
  const comp = { torso: 1, sl: 1, sr: 1, hood: 1 };
  const fn = (x, y, z) => {
    const zs = z * 1.33;
    let t = sdRoundCone(x, y, zs, 0, 0.745, 0, 0, 0.87, 0, 0.17, 0.163);
    t = smin(t, sdRoundCone(x, y, zs, 0, 0.87, 0, 0, 1.0, 0, 0.163, 0.155), 0.04);
    t = smin(t, sdRoundCone(x, y, zs, 0, 1.0, 0, 0, 1.14, 0, 0.155, 0.158), 0.04);
    t = smin(t, sdRoundCone(x, y, zs, 0, 1.14, 0, 0, 1.25, 0, 0.158, 0.146), 0.04);
    t = smin(t, sdRoundCone(x, y, zs, 0, 1.25, 0, 0, 1.315, 0, 0.146, 0.08), 0.03);
    t = smin(t, sdEllipsoid(x, y, z, -0.125, 1.238, 0.004, 0.1, 0.068, 0.088), 0.05);
    t = smin(t, sdEllipsoid(x, y, z, 0.125, 1.238, 0.004, 0.1, 0.068, 0.088), 0.05);
    // weiche Stofffalten im unteren Rumpf
    t += 0.0035 * Math.sin(Math.atan2(x, z) * 11 + y * 9) * smooth(1.18, 0.84, y);
    comp.torso = t;
    let dd = t;
    for (const a of arms) {
      let sl = sdRoundCone(x, y, z, a.S[0], a.S[1] + 0.012, 0, a.E[0], a.E[1], 0, 0.07, 0.061);
      sl = smin(sl, sdRoundCone(x, y, z, a.E[0], a.E[1], 0, a.W[0], a.W[1], 0, 0.061, 0.054), 0.03);
      const along = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
      const env = Math.exp(-((along - 0.24) ** 2) / 0.0025) + smooth(0.35, 0.43, along) * 0.8;
      sl += 0.0045 * Math.sin(along * 110 + Math.atan2(z, (x - a.S[0]) * a.s) * 2) * env;
      sl = smax(sl, along - 0.445, 0.008);
      if (a.s < 0) comp.sl = sl;
      else comp.sr = sl;
      dd = smin(dd, sl, 0.035);
    }
    // Kragenwulst der Kapuze um den Hals und die am Rücken aufliegende Kapuze
    const cy = y - 1.305, cz = z - 0.018, ca = -0.3;
    const ry = cy * Math.cos(ca) - cz * Math.sin(ca), rz = cy * Math.sin(ca) + cz * Math.cos(ca);
    let h = sdTorus(x / 1.22, ry, rz, 0, 0, 0, 0.108, 0.042);
    h = smin(h, sdEllipsoid(x, y, z, 0, 1.245, 0.122, 0.13, 0.085, 0.055), 0.03);
    comp.hood = h;
    dd = smin(dd, h, 0.02);
    // Stoffschale: vorne offen, unten offen, Halsausschnitt
    let shell = Math.abs(dd) - 0.008;
    shell = smax(shell, -Math.max(Math.abs(x) - wOpen(y), z + 0.03), 0.012);
    shell = smax(shell, 0.745 - y, 0.008);
    shell = smax(shell, -Math.max(Math.hypot(x, z - 0.008) - 0.05, 1.255 - y), 0.01);
    return shell;
  };
  return { fn, comp, arms, wOpen };
}

// Haarsträhnen als Kegelstumpf-Ketten, mit Kappe zu einer weichen, wuscheligen Masse verschmolzen.
function hairField() {
  const min = new THREE.Vector3(HC.x - 0.175, HC.y - 0.21, HC.z - 0.165);
  const max = new THREE.Vector3(HC.x + 0.175, HC.y + 0.165, HC.z + 0.215);
  const set = new ConeSet(min, max, 14, 0.011);
  let seed = 11;
  const rnd = (a = 0, b = 1) => {
    seed = (seed * 16807) % 2147483647;
    return a + (b - a) * (seed / 2147483647);
  };
  const path = (az, el, len, { out = 0.012, curl = 0.015, sideways = 0, rBase = HAIR_R } = {}) => {
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const s = i / 5;
      const e = el - (len / HAIR_R) * s;
      const ec = Math.max(e, -0.55);
      const r = rBase + out * Math.sin(Math.PI * Math.min(1, s * 1.25));
      const a = az + sideways * s;
      const p = new THREE.Vector3(Math.cos(ec) * Math.sin(a), Math.sin(ec), Math.cos(ec) * Math.cos(a)).multiplyScalar(r).add(HC);
      if (e < ec) p.y -= (ec - e) * HAIR_R;
      if (s > 0.6) {
        const k = (s - 0.6) / 0.4;
        p.x -= (p.x - HC.x) * curl * k * 6;
        p.z -= (p.z - HC.z) * curl * k * 6;
      }
      pts.push(p);
    }
    return pts;
  };
  const strand = (pts, r0, r1 = 0.004) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
      set.add(pts[i], pts[i + 1], lerp(r0, r1, t0 ** 0.8), lerp(r0, r1, t1 ** 0.8), t1);
    }
  };
  // Pony: schmale, leicht gekreuzte Strähnen, eine längere zwischen den Augen
  for (const [off, el, len] of [[-0.62, 0.93, 0.098], [-0.46, 1.0, 0.11], [-0.3, 1.06, 0.12], [-0.15, 1.1, 0.112], [0, 1.12, 0.142], [0.15, 1.1, 0.116], [0.3, 1.05, 0.12], [0.46, 0.99, 0.108], [0.62, 0.92, 0.095]]) {
    strand(path(Math.PI + off + rnd(-0.03, 0.03), el, len * rnd(0.93, 1.05), { out: 0.006, rBase: 0.113, sideways: off * 0.2 + rnd(-0.07, 0.07), curl: 0 }), 0.016);
  }
  for (const s of [-1, 1]) {
    // Gesichtssträhnen bis zum Kinn
    strand(path(Math.PI + s * 0.88, 0.75, 0.205, { out: 0.008, curl: 0.014, sideways: -s * 0.1, rBase: 0.112 }), 0.019);
    strand(path(Math.PI + s * 1.08, 0.83, 0.185, { out: 0.012, curl: 0.018, sideways: -s * 0.04, rBase: 0.112 }), 0.021);
    // Seiten und Hinterkopf, anliegend mit leichtem Volumen
    for (const off of [1.35, 1.62, 1.9, 2.18, 2.46, 2.76]) {
      strand(path(Math.PI + s * (off + rnd(-0.05, 0.05)), rnd(0.78, 0.95), rnd(0.165, 0.19), { out: rnd(0.012, 0.02), curl: 0.026, sideways: s * rnd(0.02, 0.08), rBase: 0.112 }), rnd(0.024, 0.029));
    }
    // abstehende Spitzen am Nacken
    for (const off of [1.85, 2.35, 2.85]) strand(path(Math.PI + s * off, 0.28, rnd(0.07, 0.09), { out: 0.02, curl: -0.035, rBase: 0.108 }), 0.02);
  }
  strand(path(0, 0.92, 0.185, { out: 0.018, curl: 0.026, rBase: 0.112 }), 0.028);
  // Wirbel oben
  for (let i = 0; i < 7; i++) strand(path((i / 7) * Math.PI * 2 + rnd(0, 0.5), rnd(1.28, 1.42), rnd(0.08, 0.1), { out: 0.01, curl: 0, rBase: 0.11 }), 0.026);
  for (const x of [-0.024, 0.02]) strand([[x, 0.108, 0.03], [x * 1.4, 0.13, 0.06], [x * 1.8, 0.14, 0.095]].map(([a, b, c]) => new THREE.Vector3(a, b, c).add(HC)), 0.02, 0.004);
  // kleiner Zopf hinten
  for (const dx of [-0.012, 0, 0.012]) {
    strand([[0, 0.004, 0.102], [0, -0.014, 0.146], [0, -0.05, 0.168], [0, -0.092, 0.158]].map(([x, y, z]) => new THREE.Vector3(x + dx * (1 + Math.abs(y) * 8), y, z).add(HC)), 0.026, 0.005);
  }
  set.build();
  const fn = (x, y, z) => {
    let cap = sdEllipsoid(x, y, z, HC.x, HC.y + 0.01, HC.z + 0.008, 0.113, 0.113, 0.12);
    cap = smax(cap, -sdEllipsoid(x, y, z, HC.x, HC.y - 0.032, HC.z - 0.085, 0.088, 0.085, 0.075), 0.015);
    cap = smax(cap, HC.y - 0.07 - y, 0.02);
    return smin(cap, set.eval(x, y, z), 0.012);
  };
  return { fn, set, min, max };
}

// Klobiger Sneaker (Modellraum, Fuß bei x = 0)
function shoeField(x, y, z) {
  let sole = sdRoundBox(x, y, z, 0, 0.018, -0.045, 0.054, 0.018, 0.138, 0.016);
  sole = smin(sole, sdEllipsoid(x, y, z, 0, 0.026, -0.16, 0.052, 0.022, 0.05), 0.02);
  let up = smin(sdEllipsoid(x, y, z, 0, 0.056, -0.095, 0.047, 0.038, 0.088), sdEllipsoid(x, y, z, 0, 0.072, -0.02, 0.05, 0.05, 0.07), 0.035);
  up = smin(up, sdEllipsoid(x, y, z, 0, 0.078, 0.035, 0.046, 0.056, 0.055), 0.03);
  up = smin(up, sdTorus(x, y, z, 0, 0.112, 0.008, 0.036, 0.013), 0.02);
  up = smax(up, -Math.max(Math.hypot(x, z - 0.008) - 0.032, 0.095 - y), 0.008);
  up = smin(up, sdRoundBox(x, y, z, 0, 0.1, -0.042, 0.022, 0.028, 0.01, 0.008), 0.01);
  return smin(sole, up, 0.012);
}

// Hand mit Fingern und Daumen (Modellraum, Arme hängen, Handfläche zeigt zum Körper)
function handField(s) {
  const cx = s * B.shoulderX;
  const fingers = [];
  [0.03, 0.036, 0.034, 0.027].forEach((len, i) => {
    const z = (i - 1.5) * 0.0135;
    const K = [cx - s * 0.001, 0.757, z];
    const M = [K[0] - s * 0.006, K[1] - len * 0.55, z];
    const T = [M[0] - s * 0.012, M[1] - len * 0.45, z * 1.05];
    fingers.push([K, M, T]);
  });
  return (x, y, z) => {
    let d = sdRoundBox(x, y, z, cx, 0.787, 0, 0.0115, 0.033, 0.026, 0.0095);
    d = smin(d, sdRoundCone(x, y, z, cx, 0.84, 0, cx, 0.812, 0, 0.021, 0.019), 0.01);
    for (const [K, M, T] of fingers) {
      d = smin(d, sdRoundCone(x, y, z, K[0], K[1], K[2], M[0], M[1], M[2], 0.0085, 0.0078), 0.006);
      d = smin(d, sdRoundCone(x, y, z, M[0], M[1], M[2], T[0], T[1], T[2], 0.0078, 0.0066), 0.004);
    }
    d = smin(d, sdRoundCone(x, y, z, cx - s * 0.006, 0.79, -0.02, cx - s * 0.012, 0.775, -0.034, 0.0095, 0.0085), 0.006);
    d = smin(d, sdRoundCone(x, y, z, cx - s * 0.012, 0.775, -0.034, cx - s * 0.016, 0.762, -0.04, 0.0085, 0.0072), 0.004);
    return d;
  };
}

// Sammelt starre Teile je Knochen + Material und verschmilzt sie zu wenigen Meshes (wenige Draw-Calls).
class PartBuilder {
  constructor(origins) {
    this.origins = origins;
    this.buckets = new Map();
  }

  // pos im Modellraum (Bind-Pose); wird in den lokalen Raum des Elternknochens umgerechnet
  add(parent, geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], hull = 0.005 } = {}) {
    const o = this.origins.get(parent);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_p.set(pos[0] - o.x, pos[1] - o.y, pos[2] - o.z), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
    g.applyMatrix4(_m);
    if (mat.vertexColors && !g.attributes.color) withColor(g, '#ffffff');
    if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    const key = `${parent.uuid}|${mat.uuid}|${hull}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { parent, mat, hull, geos: [] }));
    b.geos.push(g);
  }

  build() {
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      b.parent.add(mesh);
      if (b.hull) {
        const hull = new THREE.Mesh(merged, outlineMaterial(b.hull));
        hull.frustumCulled = false;
        b.parent.add(hull);
      }
    }
  }
}

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.joints = {};
    this.time = 0;
    this.build();

    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = createClips(-CONFIG.player.halfHeight);
    this.actions = {};
    this.weights = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      if (ONE_SHOTS.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      if (GAIT_ORDER.includes(name)) a.setEffectiveTimeScale(0); // Phase wird synchron gesteuert
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      a.play();
      this.actions[name] = a;
      this.weights[name] = name === 'idle' ? 1 : 0;
    }
    this.oneShot = null;
    this.oneShotTime = 0;
    this.phase = 0;
    this.locoMove = 0;
    this.steps = [];
    this.look = { yaw: 0, pitch: 0, w: 0 };
    this.turn = { yaw: 0, roll: 0 };
    this.spring = { hair: 0, hairV: 0, side: 0, sideV: 0, hem: 0, hemV: 0, lastYaw: 0 };
    this.wingDeploy = 0;
    this.buildWings();
  }

  // ------------------------------------------------------------------ Modell
  build() {
    const L = LOOK;
    const origins = new Map();
    const mats = new Map();
    const mat = (color, opts = {}) => {
      const key = color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
      if (!mats.has(key)) mats.set(key, toonMaterial(L[color] ?? color, opts));
      return mats.get(key);
    };
    const node = (name, parent, x, y, z, bone = true) => {
      const g = bone ? new THREE.Bone() : new THREE.Group();
      g.name = name;
      const po = origins.get(parent) ?? new THREE.Vector3();
      g.position.set(x - po.x, y - po.y, z - po.z);
      parent.add(g);
      origins.set(g, new THREE.Vector3(x, y, z));
      if (name) this.joints[name] = g;
      return g;
    };

    const flip = new THREE.Group();
    flip.name = 'flip';
    this.root.add(flip);
    this.joints.flip = flip;
    const model = new THREE.Group();
    model.name = 'model';
    model.position.y = -CONFIG.player.halfHeight;
    flip.add(model);
    this.joints.model = model;
    origins.set(model, new THREE.Vector3());

    const hips = node('hips', model, ...B.hips);
    const spine = node('spine', hips, ...B.spine);
    const chest = node('chest', spine, ...B.chest);
    const neck = node('neck', chest, ...B.neck);
    const head = node('head', neck, ...B.head);
    const hairBack = node('hairBack', head, HC.x, HC.y, HC.z);
    const hem = node('jacketHem', hips, 0, 0.88, 0);
    const side = {};
    for (const [s, k] of [[-1, 'L'], [1, 'R']]) {
      const sh = node('shoulder' + k, chest, s * B.shoulderX, B.shoulderY, 0);
      const ua = node('upperArm' + k, sh, s * B.shoulderX, B.shoulderY, 0);
      const fa = node('forearm' + k, ua, s * B.shoulderX, B.elbowY, 0);
      const ha = node('hand' + k, fa, s * B.shoulderX, B.wristY, 0);
      const th = node('thigh' + k, hips, s * B.hipX, B.hipY, 0);
      const sn = node('shin' + k, th, s * B.hipX, B.kneeY, 0);
      const ft = node('foot' + k, sn, s * B.hipX, B.ankleY, 0);
      side[k] = { s, sh, ua, fa, ha, th, sn, ft };
      this.joints['skirt' + k] = node('', hips, 0, 0.865, 0, false);
    }
    const skirtL = this.joints.skirtL, skirtR = this.joints.skirtR;

    const P = new PartBuilder(origins);
    const RB = (w, h, d, r = 0.008, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
    const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
    const torus = (R, t, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(R, t, rs, ts, arc);
    const sphere = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);

    // ---------- Skelett + gehäutete Teile
    const boneList = [hips, spine, chest, neck, head, hairBack, hem];
    for (const k of ['L', 'R']) boneList.push(side[k].ua, side[k].fa, side[k].ha, side[k].th, side[k].sn, side[k].ft);
    const bi = (b) => boneList.indexOf(b);
    this.skinned = [];
    const skinned = (geo, material, hull = 0.005) => {
      const mesh = new THREE.SkinnedMesh(geo, material);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      model.add(mesh);
      this.skinned.push(mesh);
      if (hull) {
        const h = new THREE.SkinnedMesh(geo, outlineMaterial(hull));
        h.frustumCulled = false;
        model.add(h);
        this.skinned.push(h);
      }
    };
    const torsoSkin = { bones: [bi(chest), bi(spine), bi(hips)], joints: [B.chest[1], B.spine[1]], blend: 0.06 };
    skinned(tubeGeometry({ yTop: 1.335, yBot: 0.79, profile: keyed(TORSO), rings: 40, radial: 28, skin: torsoSkin }), mat('#ffffff', { map: teeTexture() }));

    // Jacke: glatte Stoffschale mit Falten; Farben und Gewichte je Bereich
    const J = jacketField();
    const jacketGeo = polygonize(J.fn, new THREE.Vector3(-0.31, 0.725, -0.19), new THREE.Vector3(0.31, 1.4, 0.21), 104);
    const cBlack = col(L.jacket), cTrim = col(L.jacketTrim), cOrange = col(L.jacketOrange), cBand = col(L.jacketBand), cLining = col(L.hoodLining);
    const nearest = (x, y, z) => {
      J.fn(x, y, z);
      const c = J.comp;
      const d = { torso: Math.abs(c.torso), sl: Math.abs(c.sl), sr: Math.abs(c.sr), hood: Math.abs(c.hood) };
      let best = 'torso';
      for (const k of ['sl', 'sr', 'hood']) if (d[k] < d[best]) best = k;
      return { best, d };
    };
    paint(jacketGeo, (x, y, z, nx, ny) => {
      const { best } = nearest(x, y, z);
      if (best === 'hood') return ny > 0.35 && z > 0.06 && y > 1.265 ? cLining : cTrim;
      if (best === 'torso') {
        if (z < 0 && Math.abs(x) < J.wOpen(y) + 0.034) return cTrim;
        if (y < 0.775) return cBand;
        if (y < 0.787) return cTrim;
        return cBlack;
      }
      const a = J.arms[best === 'sl' ? 0 : 1];
      const along = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
      const out = nx * a.s;
      if (along > 0.405) return cBand;
      if (along > 0.392) return cOrange;
      if (along > 0.17 && along < 0.31 && out > 0.05) return cOrange;
      if (along > 0.155 && along <= 0.17 && out > 0.05) return cTrim;
      return cBlack;
    });
    const armBones = J.arms.map((a) => (a.s < 0 ? side.L : side.R));
    skin(jacketGeo, (x, y, z) => {
      const { d } = nearest(x, y, z);
      const dm = Math.min(d.torso, d.sl, d.sr, d.hood);
      const w = (v) => Math.exp(-(v - dm) / 0.015);
      const out = [];
      // Rumpf: Hüfte / Wirbelsäule / Brust nach Höhe, Saum federt nach
      const wt = w(d.torso);
      const wc = smooth(1.02, 1.12, y), wh = smooth(0.99, 0.9, y), ws = Math.max(0, 1 - wc - wh);
      const wHem = smooth(0.86, 0.77, y) * 0.85;
      out.push([bi(chest), wt * wc], [bi(spine), wt * ws], [bi(hips), wt * wh * (1 - wHem)], [bi(hem), wt * wh * wHem]);
      out.push([bi(chest), w(d.hood)]);
      J.arms.forEach((a, i) => {
        const wa = w(i === 0 ? d.sl : d.sr);
        const along = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
        const arm = smooth(-0.02, 0.06, along), fore = smooth(0.2, 0.28, along), hand = smooth(0.42, 0.46, along) * 0.5;
        const sb = armBones[i];
        out.push([bi(chest), wa * (1 - arm)], [bi(sb.ua), wa * arm * (1 - fore)], [bi(sb.fa), wa * arm * fore * (1 - hand)], [bi(sb.ha), wa * arm * fore * hand]);
      });
      // gleiche Knochen zusammenfassen
      const m = new Map();
      for (const [b, v] of out) m.set(b, (m.get(b) ?? 0) + v);
      return [...m.entries()];
    });
    skinned(jacketGeo, mat('#ffffff', { vertexColors: true, rim: 0.28 }), 0.005);

    // Haare: eine zusammenhängende, wuschelige Masse; hinten schwingt sie nach (Knochen hairBack)
    const H = hairField();
    const hairGeo = polygonize(H.fn, H.min, H.max, 112);
    const cHair = col(L.hair), cTip = col(L.hairTip), cShine = col(L.hairShine), cInner = col(L.hairInner);
    paint(hairGeo, (x, y, z, nx, ny, nz) => {
      const ds = H.set.eval(x, y, z);
      const t = ds < 0.006 && H.set.lastTag >= 0 ? H.set.lastTag : 0;
      if (ny < -0.55) return cInner;
      const dy = y - HC.y;
      _v.set(x - HC.x, y - HC.y, z - HC.z).normalize();
      // Glanzring nur oben und hinten, nicht quer über den Pony; gewellt und in Strähnen aufgelöst,
      // damit er nicht wie ein Haarreif wirkt
      const ang = Math.atan2(_v.x, _v.z), wave = 0.007 * Math.sin(ang * 9);
      if (dy > 0.036 + wave && dy < 0.052 + wave && _v.z > -0.25 && Math.sin(ang * 14 + 1.3) > -0.3 &&
          _v.x * nx + _v.y * ny + _v.z * nz > 0.6) return _c.copy(cHair).lerp(cShine, 0.75);
      return _c.copy(cHair).lerp(cTip, t ** 1.5);
    });
    skin(hairGeo, (x, y, z) => {
      let wb = smooth(HC.y + 0.03, HC.y - 0.07, y) * smooth(HC.z - 0.02, HC.z + 0.07, z);
      if (z > HC.z + 0.1) wb = 1;
      return [[bi(head), 1 - wb], [bi(hairBack), wb]];
    });
    skinned(hairGeo, mat('#ffffff', { vertexColors: true, rim: 0.32, rimColor: '#7d8cff' }), 0.0035);

    // Beine, Overknee-Strumpf links, Socke rechts
    const cStripe = col(L.stockingStripe), cStock = col(L.stocking);
    for (const k of ['L', 'R']) {
      const { s, th, sn, ft } = side[k];
      const legSkin = { bones: [bi(th), bi(sn), bi(ft)], joints: [B.kneeY, B.ankleY], blend: 0.05 };
      skinned(tubeGeometry({ yTop: 0.86, yBot: 0.055, cx: s * B.hipX, profile: keyed(LEG, 0, s), rings: 48, radial: 22, skin: legSkin }), mat('skin'));
      if (k === 'L') {
        skinned(tubeGeometry({
          yTop: 0.6, yBot: 0.05, cx: s * B.hipX, profile: keyed(LEG, 0.004, s), rings: 36, radial: 24, skin: legSkin,
          color: (c, a) => c.copy(Math.abs(wrapAngle(a - Math.PI * 1.5)) < 0.17 ? cStripe : cStock),
        }), mat('#ffffff', { vertexColors: true }));
        P.add(th, torus(0.07, 0.007, 6, 28).rotateX(Math.PI / 2), mat('stocking'), { pos: [s * B.hipX, 0.6, 0], scale: [1, 1, 1.08], hull: 0 });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          P.add(th, sphere(0.009, 8, 6), mat('stocking'), { pos: [s * B.hipX + Math.sin(a) * 0.072, 0.593, Math.cos(a) * 0.078], hull: 0 });
        }
      } else {
        skinned(tubeGeometry({ yTop: 0.2, yBot: 0.05, cx: s * B.hipX, profile: keyed(LEG, 0.005, s), rings: 12, radial: 22, skin: legSkin }), mat('#ffffff', { map: sockTexture() }), 0.004);
        P.add(sn, torus(0.047, 0.007, 6, 22).rotateX(Math.PI / 2), mat('sockPattern'), { pos: [s * B.hipX, 0.2, 0.004], hull: 0 });
      }
    }

    // ---------- Schuhe und Hände aus Abstandsfeldern (rund statt kantig)
    const shoeGeo = polygonize(shoeField, new THREE.Vector3(-0.07, -0.004, -0.195), new THREE.Vector3(0.07, 0.135, 0.105), 76);
    const cSole = col(L.shoeSole), cMid = col(L.shoeMid), cUpper = col(L.shoeUpper), cDark = col(L.shoeDark), cRed = col(L.shoeRed);
    paint(shoeGeo, (x, y, z) => {
      if (y < 0.026) return cSole;
      if (y < 0.042) return cMid;
      if (z > 0.07 && y > 0.085) return cRed;
      if (y > 0.088 && z < -0.03 && z > -0.11 && Math.abs(x) < 0.026) return ((z * 55) % 1 + 1) % 1 < 0.5 ? cMid : cDark;
      if (y > 0.098) return cDark;
      if (Math.abs(x) > 0.03 && y > 0.045 && y < 0.072 && z > -0.1 && z < 0.045) return cDark;
      if (z < -0.15) return _c.copy(cUpper).multiplyScalar(0.85);
      return cUpper;
    });
    for (const k of ['L', 'R']) P.add(side[k].ft, shoeGeo, mat('#ffffff', { vertexColors: true }), { pos: [side[k].s * B.hipX, 0, 0], hull: 0.004 });
    const cSkin = col(L.skin), cGlove = col(L.glove);
    for (const k of ['L', 'R']) {
      const { s, ha } = side[k];
      const g = polygonize(handField(s), new THREE.Vector3(s * B.shoulderX - 0.04, 0.69, -0.06), new THREE.Vector3(s * B.shoulderX + 0.04, 0.85, 0.05), 64);
      paint(g, (x, y) => (k === 'L' && y > 0.751 ? cGlove : cSkin));
      P.add(ha, g, mat('#ffffff', { vertexColors: true }), { hull: 0.0025 });
      if (k === 'R') P.add(ha, torus(0.024, 0.006, 6, 20).rotateX(Math.PI / 2), mat('bracelet'), { pos: [s * B.shoulderX, 0.83, 0], hull: 0 });
    }

    // ---------- Becken, Gürtel, Anhänger, Ausrüstung
    P.add(hips, sphere(0.15, 20, 14), mat('shorts'), { pos: [0, 0.8, 0], scale: [0.95, 0.55, 0.68] });
    P.add(hips, torus(0.148, 0.014, 8, 40).rotateX(Math.PI / 2), mat('belt'), { pos: [0, 0.865, 0.004], rot: [0, 0, 0.05], scale: [1, 1, 0.75] });
    P.add(hips, RB(0.045, 0.032, 0.014, 0.006), mat('buckle'), { pos: [0.025, 0.862, -0.113] });
    P.add(hips, RB(0.05, 0.066, 0.022, 0.01, 3), mat('device'), { pos: [0.08, 0.79, -0.114], rot: [0.1, -0.3, 0.1] });
    P.add(hips, RB(0.042, 0.03, 0.008, 0.004), mat('deviceAccent'), { pos: [0.083, 0.8, -0.125], rot: [0.1, -0.3, 0.1], hull: 0 });
    P.add(hips, RB(0.026, 0.014, 0.006, 0.002), mat('#22252e'), { pos: [0.081, 0.774, -0.126], rot: [0.1, -0.3, 0.1], hull: 0 });
    P.add(hips, torus(0.009, 0.0025, 4, 12), mat('buckle'), { pos: [0.074, 0.83, -0.114], hull: 0 });
    P.add(hips, RB(0.016, 0.21, 0.006, 0.003), mat('strap'), { pos: [0.125, 0.75, -0.085], rot: [0.08, -0.5, -0.06], hull: 0.003 });
    for (const s of [-1, 1]) {
      P.add(hips, cyl(0.03, 0.03, 0.065, 16), mat('gear'), { pos: [s * 0.185, 0.765, 0.02], rot: [0, 0, Math.PI / 2], hull: 0.003 });
      P.add(hips, cyl(0.033, 0.033, 0.01, 16), mat('gearAccent'), { pos: [s * 0.215, 0.765, 0.02], rot: [0, 0, Math.PI / 2], hull: 0 });
      P.add(side[s < 0 ? 'L' : 'R'].th, cyl(0.08, 0.077, 0.07, 18), mat('shorts'), { pos: [s * B.hipX, 0.78, 0] });
    }

    // ---------- Rock: zwei Faltenhälften, vorne überlappende Wickelbahn, Karo-Lage rechts
    const skirtMat = mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
    const sk = (o) => skirtGeometry({ yTop: 0.865, rTop: 0.145, flare: 0.07, pleats: 20, depth: 0.012, rz: 0.76, radial: 64, rings: 10, cA: L.skirt, cB: L.skirtLight, ...o });
    P.add(skirtR, sk({ theta0: 0, thetaLen: Math.PI, length: (a) => 0.205 - 0.025 * Math.sin(a) }), skirtMat, { hull: 0.004 });
    P.add(skirtL, sk({ theta0: Math.PI, thetaLen: Math.PI, length: (a) => 0.235 - 0.025 * Math.sin(a) }), skirtMat, { hull: 0.004 });
    P.add(skirtR, sk({ theta0: Math.PI * 0.6, thetaLen: Math.PI * 0.48, rTop: 0.152, flare: 0.078, length: () => 0.2 }), skirtMat, { hull: 0.004 });
    P.add(skirtR, sk({ theta0: Math.PI * 0.1, thetaLen: Math.PI * 0.85, rTop: 0.139, flare: 0.062, pleats: 10, depth: 0.006, length: () => 0.245 }), mat('#ffffff', { map: plaidTexture(), side: THREE.DoubleSide }), { hull: 0 });

    // ---------- Kordeln, Abzeichen
    for (const s of [-1, 1]) {
      P.add(chest, cyl(0.0045, 0.0045, 0.12, 6), mat('jacketTrim'), { pos: [s * 0.06, 1.2, -0.13], rot: [0.08, 0, 0], hull: 0 });
      P.add(chest, cyl(0.007, 0.007, 0.018, 6), mat('strap'), { pos: [s * 0.06, 1.135, -0.132], hull: 0 });
    }
    P.add(chest, cyl(0.026, 0.026, 0.005, 22).rotateX(Math.PI / 2), mat('emblem'), { pos: [-0.115, 1.18, -0.092], rot: [0, -2.5, 0], hull: 0.002 });
    P.add(chest, torus(0.016, 0.0035, 6, 20), mat('hoodLining'), { pos: [-0.117, 1.18, -0.095], rot: [0, -2.5, 0], hull: 0 });
    P.add(chest, RB(0.008, 0.016, 0.004, 0.002), mat('hoodLining'), { pos: [-0.118, 1.18, -0.096], rot: [0, -2.5, 0], hull: 0 });

    // ---------- Hals, Kopf, Haarspange, Haargummi
    P.add(neck, cyl(0.034, 0.038, 0.1, 18), mat('skin'), { pos: [0, 1.34, 0.005] });
    P.add(head, headGeometry(0.104), mat('#ffffff', { map: faceTexture(), rim: 0.22 }), { pos: [HC.x, HC.y - 0.002, HC.z - 0.002], hull: 0.004 });
    const clipAz = Math.PI + 1.0, clipEl = 0.5, cr = 0.127;
    P.add(head, RB(0.034, 0.011, 0.008, 0.003), mat('hairClip'), {
      pos: [HC.x + Math.cos(clipEl) * Math.sin(clipAz) * cr, HC.y + Math.sin(clipEl) * cr, HC.z + Math.cos(clipEl) * Math.cos(clipAz) * cr],
      rot: [0, -1.0 + Math.PI / 2, 0.6], hull: 0.002,
    });
    P.add(hairBack, torus(0.016, 0.006, 6, 14), mat('hairClip'), { pos: [HC.x, HC.y, HC.z + 0.112], rot: [0.3, 0, 0], hull: 0 });

    P.build();

    // Binden in A-Haltung (passt zur Jacke), danach zurück in die Ruhepose
    for (const k of ['L', 'R']) side[k].ua.rotation.z = side[k].s * AP;
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(boneList);
    for (const m of this.skinned) m.bind(skeleton);
    for (const k of ['L', 'R']) side[k].ua.rotation.z = 0;
    this.springNodes = { hairBack, hem };
  }

  // Gleiter-Membranen zwischen Arm und Bein, im Weltraum aus Knochenpositionen aufgebaut.
  buildWings() {
    this.wings = new THREE.Group();
    this.wingParts = [];
    // dunkel am Körper, zur Kante hin leuchtendes Violett (glüht durch den Bloom)
    const fill = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const edge = new THREE.LineBasicMaterial({ color: new THREE.Color(4, 3.1, 0.45) });
    const inner = [0.1, 0.04, 0.16], outer = [1.9, 0.6, 2.6];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([...inner, ...outer, ...outer.map((v) => v * 0.7), ...outer, ...inner]), 3));
      g.setIndex([0, 1, 2, 0, 2, 4, 4, 2, 3]);
      const mesh = new THREE.Mesh(g, fill);
      mesh.frustumCulled = false;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3), 3));
      const line = new THREE.Line(lg, edge);
      line.frustumCulled = false;
      this.wings.add(mesh, line);
      this.wingParts.push({ mesh, line });
    }
    this.wings.visible = false;
  }

  updateWings(dt, gliding) {
    this.wingDeploy += ((gliding ? 1 : 0) - this.wingDeploy) * (1 - Math.exp(-(gliding ? 7 : 10) * dt));
    const d = this.wingDeploy;
    this.wings.visible = d > 0.02;
    if (!this.wings.visible) return;
    const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    ['L', 'R'].forEach((k, i) => {
      const J = this.joints;
      J['upperArm' + k].getWorldPosition(pts[0]);
      J['hand' + k].getWorldPosition(pts[1]);
      J['foot' + k].getWorldPosition(pts[3]);
      J['thigh' + k].getWorldPosition(pts[4]);
      pts[1].sub(pts[0]).multiplyScalar(d).add(pts[0]);
      pts[3].sub(pts[4]).multiplyScalar(d).add(pts[4]);
      pts[2].copy(pts[1]).lerp(pts[3], 0.5).lerp(_v.copy(pts[0]).lerp(pts[4], 0.5), 0.28);
      // leichte V-Stellung, damit die Flügel von hinten als Silhouette sichtbar sind
      pts[1].y += 0.14 * d;
      pts[2].y += 0.18 * d;
      const { mesh, line } = this.wingParts[i];
      const a = mesh.geometry.attributes.position;
      pts.forEach((p, j) => a.setXYZ(j, p.x, p.y, p.z));
      a.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
      const la = line.geometry.attributes.position;
      [pts[1], pts[2], pts[3]].forEach((p, j) => la.setXYZ(j, p.x, p.y, p.z));
      la.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ Ausrichtung
  // up/forward: gewünschte Körperachsen in Weltkoordinaten (normalisiert)
  orient(up, forward, dt, rate = 10) {
    _r.crossVectors(forward, up);
    if (_r.lengthSq() < 1e-6) return;
    _r.normalize();
    _b.crossVectors(_r, up);
    _m.makeBasis(_r, up, _b);
    _q.setFromRotationMatrix(_m);
    this.root.quaternion.slerp(_q, 1 - Math.exp(-rate * dt));
  }

  // ------------------------------------------------------------------ Animationssteuerung
  trigger(name) {
    this.oneShot = name;
    this.oneShotTime = 0;
    this.actions[name].reset();
  }

  // Gangmischung: Gewichte der Zyklen und Schrittlänge für das aktuelle Tempo
  gaitBlend(speed) {
    const g = GAIT_ORDER.map((n) => GAITS[n]);
    const w = { walk: 0, jog: 0, sprint: 0 };
    let stride;
    if (speed <= g[0].speed) {
      w.walk = 1;
      stride = g[0].speed * g[0].cycle;
    } else if (speed >= g[2].speed) {
      w.sprint = 1;
      stride = g[2].speed * g[2].cycle;
    } else {
      const i = speed < g[1].speed ? 0 : 1;
      const t = (speed - g[i].speed) / (g[i + 1].speed - g[i].speed);
      w[GAIT_ORDER[i]] = 1 - t;
      w[GAIT_ORDER[i + 1]] = t;
      stride = lerp(g[i].speed * g[i].cycle, g[i + 1].speed * g[i + 1].cycle, t);
    }
    return { w, stride };
  }

  // info: { state, speed, hspeed, vy, swinging, reeling, gliding, boosting, turnRate, events, lookDir }
  update(dt, info) {
    this.time += dt;
    this.steps.length = 0;
    for (const e of info.events) {
      if (e.type === 'jump') this.trigger('jump');
      else if (e.type === 'walljump') this.trigger('flip');
      else if (e.type === 'dash') this.trigger('dash');
      else if (e.type === 'pivot') this.trigger('pivot');
      else if (e.type === 'stop' && info.state === 'ground') this.trigger('stop');
      else if (e.type === 'land') {
        if (e.strength > 24) this.trigger('landHard');
        else if (e.strength > 7 && e.speed < 4) this.trigger('land');
      }
    }

    // One-Shots laufen aus oder werden durch einen Zustandswechsel abgebrochen
    if (this.oneShot) {
      this.oneShotTime += dt;
      const s = this.oneShot, t = this.oneShotTime;
      const cancel =
        ((s === 'land' || s === 'landHard' || s === 'stop') && (info.state !== 'ground' || (info.hspeed > 3 && t > (s === 'landHard' ? 0.35 : 0.15)))) ||
        (s === 'pivot' && info.state !== 'ground') ||
        ((s === 'jump' || s === 'flip' || s === 'dash') && (info.state !== 'air' || info.swinging || (info.gliding && s !== 'dash'))) ||
        (s === 'dash' && info.gliding && t > 0.2);
      if (cancel || t >= this.clips[s].duration - 0.07) this.oneShot = null;
    }

    // Zielgewichte aller Clips (summieren sich zu 1)
    const T = {};
    const gait = this.gaitBlend(info.hspeed);
    const moveMix = smooth(0.05, 1.2, info.hspeed);
    if (this.oneShot) T[this.oneShot] = 1;
    else if (info.state === 'ground') {
      if (info.hspeed > CONFIG.locomotion.sprintSpeed + 2) T.slide = 1;
      else {
        T.idle = 1 - moveMix;
        for (const n of GAIT_ORDER) T[n] = moveMix * gait.w[n];
      }
    } else if (info.state === 'wallrun') T.wallrun = 1;
    else if (info.gliding) T.glide = 1;
    else if (info.swinging) T[info.reeling ? 'reel' : 'swing'] = 1;
    else if (info.boosting) T.boost = 1;
    else if (info.vy > 2) T.airUp = 1;
    else if (info.vy > -5) T.apex = 1;
    else if (info.vy < -24) T.fallFast = 1;
    else T.fall = 1;

    const k = 1 - Math.exp(-dt / (this.oneShot ? 0.07 : 0.15));
    for (const name of Object.keys(this.actions)) {
      const w = this.weights[name] + ((T[name] ?? 0) - this.weights[name]) * k;
      this.weights[name] = w;
      this.actions[name].setEffectiveWeight(w);
    }

    // Gang-Phase: alle Zyklen laufen synchron, Kadenz = Tempo / Schrittlänge (keine rutschenden Füße)
    const prev = this.phase;
    if (info.state === 'ground' && info.hspeed > 0.05) this.phase = (this.phase + (dt * info.hspeed) / gait.stride) % 1;
    this.locoMove = this.weights.walk + this.weights.jog + this.weights.sprint;
    if (Math.floor(prev * 2) !== Math.floor(this.phase * 2) && this.locoMove > 0.3) {
      this.steps.push(0.3 + 0.35 * this.weights.jog + 0.7 * this.weights.sprint);
    }
    for (const n of GAIT_ORDER) this.actions[n].time = this.phase * GAITS[n].cycle;
    if (this.weights.wallrun > 0.01) this.actions.wallrun.setEffectiveTimeScale(clamp(info.speed / 24, 0.8, 1.6));

    this.mixer.update(dt);
    this.postProcess(dt, info);
    this.root.updateMatrixWorld(true);
    this.updateWings(dt, info.gliding);
  }

  // Prozedurale Ebene über den Clips: Drehung einleiten, Blick, Haare, Rock und Jackensaum.
  postProcess(dt, info) {
    const J = this.joints;
    const ground = info.state === 'ground';
    // Beim Kurvenlaufen führen Kopf und Schultern in die neue Richtung, der Körper folgt –
    // kein Kippen der ganzen Figur, nur der Oberkörper neigt sich leicht in die Kurve.
    const turnT = ground && this.oneShot !== 'pivot' ? clamp(info.turnRate * 0.09, -0.45, 0.45) : 0;
    const rollT = ground ? clamp(info.turnRate * info.hspeed * 0.004, -0.08, 0.08) : 0;
    const kt = 1 - Math.exp(-7 * dt);
    this.turn.yaw += (turnT - this.turn.yaw) * kt;
    this.turn.roll += (rollT - this.turn.roll) * kt;
    if (Math.abs(this.turn.yaw) + Math.abs(this.turn.roll) > 1e-4) {
      J.chest.quaternion.multiply(_q2.setFromEuler(_e.set(0, this.turn.yaw * 0.35, this.turn.roll)));
      J.neck.quaternion.multiply(_q2.setFromEuler(_e.set(0, this.turn.yaw * 0.35, 0)));
      J.head.quaternion.multiply(_q2.setFromEuler(_e.set(0, this.turn.yaw * 0.4, -this.turn.roll * 0.5)));
    }

    // Blick in Zielrichtung – nur am Boden und ruhig, nie verdreht
    const lw = ground && !this.oneShot ? 1 - clamp(info.hspeed / 6, 0, 0.8) : 0;
    this.look.w += (lw - this.look.w) * (1 - Math.exp(-5 * dt));
    let ty = 0, tp = 0;
    if (info.lookDir && this.look.w > 0.01) {
      _v.copy(info.lookDir).applyQuaternion(_q.copy(this.root.quaternion).invert());
      const yaw = Math.atan2(-_v.x, -_v.z);
      ty = Math.abs(yaw) < 1.8 ? clamp(yaw, -1.1, 1.1) : 0;
      tp = clamp(Math.asin(clamp(_v.y, -1, 1)), -0.5, 0.45);
    }
    const kk = 1 - Math.exp(-8 * dt);
    this.look.yaw += (ty - this.look.yaw) * kk;
    this.look.pitch += (tp - this.look.pitch) * kk;
    const w = this.look.w;
    if (w > 0.001) {
      J.neck.quaternion.multiply(_q2.setFromEuler(_e.set(this.look.pitch * 0.2 * w, this.look.yaw * 0.25 * w, 0)));
      J.head.quaternion.multiply(_q2.setFromEuler(_e.set(this.look.pitch * 0.35 * w, this.look.yaw * 0.4 * w, 0)));
    }

    // Federn für Haare und Jackensaum; Gier aus der waagrecht projizierten Blickrichtung (stabil bei Kippen)
    _v.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    const yawNow = Math.atan2(-_v.x, -_v.z);
    const dYaw = wrapAngle(yawNow - this.spring.lastYaw);
    this.spring.lastYaw = yawNow;
    const sp = this.spring;
    const speedF = Math.min(1, info.speed / 30);
    const hairT = speedF * 0.45 + clamp(-info.vy * 0.01, -0.2, 0.25);
    sp.hairV += ((hairT - sp.hair) * 110 - sp.hairV * 13) * dt;
    sp.hair += sp.hairV * dt;
    sp.sideV += -clamp(dYaw, -0.3, 0.3) * 2 - (sp.side * 90 + sp.sideV * 10) * dt;
    sp.side = clamp(sp.side + sp.sideV * dt, -0.3, 0.3);
    const flutter = Math.sin(this.time * 23) * 0.03 * speedF;
    this.springNodes.hairBack.rotation.set(sp.hair + flutter, 0, sp.side);
    const hemT = -speedF * 0.5 - (ground ? Math.min(0.15, info.hspeed * 0.015) : clamp(info.vy * 0.01, -0.25, 0.25));
    sp.hemV += ((hemT - sp.hem) * 90 - sp.hemV * 11) * dt;
    sp.hem += sp.hemV * dt;
    this.springNodes.hem.rotation.x = sp.hem + Math.sin(this.time * 19) * 0.04 * speedF;

    // Rockhälften folgen den Oberschenkeln (gegen Durchdringen), flattern in der Luft
    const fl = ground ? 0 : Math.sin(this.time * 21) * 0.06 * speedF;
    J.skirtL.rotation.x = clamp(J.thighL.rotation.x * 0.45, -0.2, 0.9) + fl;
    J.skirtR.rotation.x = clamp(J.thighR.rotation.x * 0.45, -0.2, 0.9) - fl;
  }
}

// ------------------------------------------------------------------ Texturen

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// Gesicht, direkt auf die Kopfkugel gemappt (Vorderseite bei u = 0.75): türkise, leicht verschlafene Augen.
function faceTexture() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = LOOK.skin;
  g.fillRect(0, 0, W, H);
  const cx = W * 0.75, ey = H * 0.535;

  for (const s of [-1, 1]) {
    const grd = g.createRadialGradient(cx + s * 72, ey + 54, 2, cx + s * 72, ey + 54, 36);
    grd.addColorStop(0, 'rgba(255,120,140,0.38)');
    grd.addColorStop(1, 'rgba(255,120,140,0)');
    g.fillStyle = grd;
    g.fillRect(cx + s * 72 - 40, ey + 14, 80, 80);
    g.strokeStyle = 'rgba(230,90,110,0.45)';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(cx + s * (58 + i * 9), ey + 60);
      g.lineTo(cx + s * (52 + i * 9), ey + 50);
      g.stroke();
    }
  }

  const eye = (s) => {
    g.save();
    g.translate(cx + s * 60, ey);
    g.scale(s, 1);
    g.beginPath();
    g.moveTo(-31, -10);
    g.quadraticCurveTo(0, -30, 32, -16);
    g.quadraticCurveTo(34, 10, 20, 34);
    g.quadraticCurveTo(-4, 42, -26, 26);
    g.quadraticCurveTo(-34, 8, -31, -10);
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = '#ffffff';
    g.fillRect(-40, -40, 80, 90);
    const ir = g.createLinearGradient(0, -24, 0, 36);
    ir.addColorStop(0, LOOK.irisDeep);
    ir.addColorStop(0.5, LOOK.iris);
    ir.addColorStop(1, LOOK.irisLight);
    g.fillStyle = ir;
    g.beginPath();
    g.ellipse(2, 8, 21, 28, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(8,40,48,0.8)';
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = 'rgba(255,215,120,0.55)';
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      g.beginPath();
      g.arc(2 + Math.cos(a) * 12, 12 + Math.sin(a) * 15, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#071a22';
    g.beginPath();
    g.ellipse(2, 9, 8.5, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(20,10,40,0.35)';
    g.fillRect(-40, -40, 80, 22);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(-7, -2, 6.5, 8.5, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(10, 22, 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(-12, 26, 20, 2.5);
    g.restore();
    g.strokeStyle = LOOK.lash;
    g.lineCap = 'round';
    g.lineWidth = 7.5;
    g.beginPath();
    g.moveTo(-33, -9);
    g.quadraticCurveTo(0, -31, 33, -17);
    g.lineTo(43, -25);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-24, -28);
    g.quadraticCurveTo(4, -40, 30, -30);
    g.stroke();
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(-18, 36);
    g.quadraticCurveTo(4, 42, 22, 33);
    g.stroke();
    g.strokeStyle = LOOK.brow;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-26, -60);
    g.quadraticCurveTo(4, -70, 32, -62);
    g.stroke();
    g.restore();
  };
  eye(-1);
  eye(1);

  g.strokeStyle = 'rgba(190,120,110,0.7)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx + 3, ey + 44);
  g.lineTo(cx - 1, ey + 51);
  g.stroke();
  g.strokeStyle = '#a03a4a';
  g.lineWidth = 3.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 11, ey + 74);
  g.quadraticCurveTo(cx, ey + 80, cx + 11, ey + 73);
  g.stroke();
  g.strokeStyle = 'rgba(200,110,120,0.5)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 5, ey + 84);
  g.quadraticCurveTo(cx, ey + 86, cx + 5, ey + 84);
  g.stroke();
  return tex(c);
}

// Schwarzes Shirt mit weißem Print vorne (Schriftzeichen + Zeile darunter).
function teeTexture() {
  const W = 640, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = LOOK.tee;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = LOOK.print;
  g.fillStyle = LOOK.print;
  g.lineCap = 'square';
  const glyph = (x, y, sz, seed) => {
    let r = seed;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    g.lineWidth = sz * 0.13;
    for (let k = 0; k < 4; k++) {
      const x0 = x + rnd() * sz * 0.7, y0 = y + rnd() * sz * 0.7;
      const horiz = rnd() < 0.5;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(horiz ? x0 + sz * (0.3 + rnd() * 0.5) : x0 + (rnd() - 0.5) * sz * 0.3, horiz ? y0 : y0 + sz * (0.3 + rnd() * 0.5));
      g.stroke();
    }
  };
  const x0 = W * 0.5 - 62, y0 = H * 0.24;
  for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) glyph(x0 + i * 42, y0 + row * 46, 38, 11 + row * 7 + i * 3);
  g.font = 'bold 15px sans-serif';
  g.fillText('DIGITAL  ZONE', x0 + 2, y0 + 112);
  g.fillRect(x0, y0 + 120, 124, 3);
  g.fillStyle = '#d8342c';
  g.fillRect(x0 + 96, y0 - 14, 26, 8);
  return tex(c);
}

function sockTexture() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = LOOK.sock;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = LOOK.sockPattern;
  for (let y = 10; y < 64; y += 12) {
    for (let x = (y / 12) % 2 ? 0 : 8; x < 128; x += 16) {
      g.beginPath();
      g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y);
      g.fill();
    }
  }
  g.fillRect(0, 0, 128, 6);
  return tex(c, [3, 1]);
}

function plaidTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = LOOK.plaidA;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(168,103,62,0.75)';
  for (let i = 0; i < 128; i += 32) {
    g.fillRect(i, 0, 12, 128);
    g.fillRect(0, i, 128, 12);
  }
  g.fillStyle = 'rgba(20,10,10,0.5)';
  for (let i = 16; i < 128; i += 32) {
    g.fillRect(i, 0, 3, 128);
    g.fillRect(0, i, 128, 3);
  }
  return tex(c, [4, 1]);
}
