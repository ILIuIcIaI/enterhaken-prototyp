import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toonMaterial, outlineMaterial } from './toon.js';
import { createClips, WALK_CYCLE, SPRINT_CYCLE } from './animations.js';
import { tubeGeometry, strandGeometry, skirtGeometry, headGeometry, withColor } from './charGeo.js';
import { CONFIG } from './config.js';

// Spielfigur Kaia: dunkelblaue, wuschelige Kurzhaare mit Pony,
// kleinem Zopf und roter Spange, türkise Augen, übergroße schwarze Jacke mit hellgrauer Kapuze und orangen
// Ärmelfeldern, schwarzes Print-Shirt, roter Gürtel mit Anhänger, grauer asymmetrischer Faltenrock mit
// Karo-Lage, links Overknee-Strumpf mit weißem Streifen, rechts kurze rostbraune Socke, klobige Sneaker.
// Arme, Beine, Oberkörper und Jacke sind gehäutet (weiche Gelenke), Details sind starre Teile an den Knochen.
export const LOOK = {
  skin: '#f6d6c6',
  hair: '#1c2240', hairTip: '#3b4c88', hairInner: '#11142a', hairClip: '#d8343a',
  tee: '#16161c', print: '#f2f0ea',
  jacket: '#18181f', jacketTrim: '#d2d5de', jacketOrange: '#e8642a', hoodLining: '#c63a2e', emblem: '#f3f1ec',
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
const HC = new THREE.Vector3(0, 1.482, 0.006); // Kopfmitte
const HAIR_R = 0.117;
const ONE_SHOTS = ['jump', 'superJump', 'land', 'landHard', 'flip', 'dash', 'stop'];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _r = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
  [1.335, 0.046, 0.043, 0, 0.006], [1.3, 0.088, 0.07, 0, 0.008], [1.26, 0.14, 0.084, 0, 0.01],
  [1.18, 0.128, 0.092, 0, -0.004], [1.1, 0.118, 0.088, 0, -0.006], [1.02, 0.102, 0.076, 0, 0],
  [0.94, 0.112, 0.08, 0, 0], [0.86, 0.13, 0.09, 0, 0.004], [0.79, 0.135, 0.092, 0, 0.006],
];
const JACKET = [
  [1.318, 0.07, 0.064, 0, 0.012], [1.302, 0.108, 0.086, 0, 0.012], [1.278, 0.146, 0.102, 0, 0.011],
  [1.25, 0.166, 0.11, 0, 0.008], [1.2, 0.166, 0.118, 0, 0.002], [1.12, 0.158, 0.118, 0, 0],
  [1.04, 0.152, 0.112, 0, 0], [0.96, 0.152, 0.11, 0, 0], [0.89, 0.162, 0.12, 0, 0],
];
const SLEEVE = [ // runde, abfallende Schulterkappe, weiter Ärmel
  [1.302, 0.03, 0.03], [1.292, 0.05, 0.05], [1.272, 0.064, 0.063], [1.24, 0.068, 0.066], [1.16, 0.064, 0.062],
  [1.06, 0.06, 0.059], [1.0, 0.059, 0.057], [0.92, 0.056, 0.054], [0.885, 0.052, 0.051], [0.875, 0.047, 0.047], [0.835, 0.044, 0.044],
];
const LEG = [
  [0.86, 0.075, 0.082], [0.78, 0.073, 0.077], [0.68, 0.066, 0.07], [0.56, 0.056, 0.06],
  [0.48, 0.048, 0.052, -0.004, -0.003], [0.43, 0.046, 0.05, -0.006, -0.006], [0.37, 0.048, 0.053, -0.004, 0.004],
  [0.3, 0.05, 0.056, -0.002, 0.01], [0.22, 0.042, 0.047, 0, 0.007], [0.14, 0.033, 0.037, 0, 0.003], [0.055, 0.03, 0.034, 0, 0.002],
];

// Sammelt starre Teile je Knochen + Material und verschmilzt sie zu wenigen Meshes (wenige Draw-Calls).
class PartBuilder {
  constructor(origins) {
    this.origins = origins;
    this.buckets = new Map();
  }

  // pos im Modellraum (Bind-Pose); wird in den lokalen Raum des Elternknochens umgerechnet
  add(parent, geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], hull = 0.005 } = {}) {
    const o = this.origins.get(parent);
    // einheitlich nicht-indiziert, damit sich alle Teile (z. B. RoundedBox) verschmelzen lassen
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_p.set(pos[0] - o.x, pos[1] - o.y, pos[2] - o.z), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
    g.applyMatrix4(_m);
    if (mat.vertexColors && !g.attributes.color) withColor(g, '#ffffff');
    if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
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
      if (name === 'walk' || name === 'sprint') a.setEffectiveTimeScale(0); // Phase wird synchron gesteuert
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      a.play();
      this.actions[name] = a;
      this.weights[name] = name === 'idle' ? 1 : 0;
    }
    this.oneShot = null;
    this.oneShotTime = 0;
    this.phase = 0;
    this.locoMove = 0;
    this.locoSprint = 0;
    this.steps = [];
    this.look = { yaw: 0, pitch: 0, w: 0 };
    this.lean = { x: 0, z: 0 };
    this.spring = { hair: 0, hairV: 0, side: 0, sideV: 0, tail: 0, tailV: 0, lastYaw: 0 };
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
      // Rockhälften folgen den Oberschenkeln
      this.joints['skirt' + k] = node('', hips, 0, 0.865, 0, false);
    }
    const skirtL = this.joints.skirtL, skirtR = this.joints.skirtR;
    const tail = node('', hips, 0, 0.9, 0.02, false);
    const hairBack = node('', head, HC.x, HC.y, HC.z, false);
    this.springNodes = { tail, hairBack };

    const P = new PartBuilder(origins);
    const RB = (w, h, d, r = 0.008, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
    const sphere = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
    const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
    const torus = (R, t, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(R, t, rs, ts, arc);
    const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);

    // ---------- gehäutete Teile (Shirt, Jacke, Ärmel, Beine, Strumpf, Socke)
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
    const boneList = [hips, spine, chest, neck, head];
    for (const k of ['L', 'R']) boneList.push(side[k].ua, side[k].fa, side[k].ha, side[k].th, side[k].sn, side[k].ft);
    const bi = (b) => boneList.indexOf(b);
    const torsoSkin = { bones: [bi(chest), bi(spine), bi(hips)], joints: [B.chest[1], B.spine[1]], blend: 0.06 };

    skinned(tubeGeometry({ yTop: 1.335, yBot: 0.79, profile: keyed(TORSO), rings: 40, radial: 28, skin: torsoSkin }), mat('#ffffff', { map: teeTexture() }));
    const trim = new THREE.Color(L.jacketTrim), black = new THREE.Color(L.jacket);
    skinned(
      tubeGeometry({
        yTop: 1.318, yBot: 0.89, profile: keyed(JACKET), rings: 30, radial: 34, theta0: Math.PI + 0.62, thetaLen: Math.PI * 2 - 1.24, skin: torsoSkin,
        color: (c, a, t, u) => c.copy(u < 0.06 || u > 0.94 ? trim : black),
      }),
      mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide }),
    );
    const orange = new THREE.Color(L.jacketOrange), cuff = new THREE.Color('#121216');
    for (const k of ['L', 'R']) {
      const { s, ua, fa, ha, th, sn, ft } = side[k];
      const outward = s > 0 ? Math.PI / 2 : Math.PI * 1.5;
      skinned(
        tubeGeometry({
          yTop: 1.302, yBot: 0.835, cx: s * (B.shoulderX + 0.008), profile: keyed(SLEEVE), rings: 34, radial: 18,
          skin: { bones: [bi(ua), bi(fa), bi(ha)], joints: [B.elbowY, B.wristY], blend: 0.05 },
          color: (c, a, t) => {
            const d = Math.abs(wrapAngle(a - outward));
            if (t > 0.917) c.copy(cuff);
            else if (t > 0.89 && t < 0.905) c.copy(orange);
            else if (d < 1.25 && t > 0.38 && t < 0.62) c.copy(orange);
            else if (d < 1.25 && t > 0.355 && t < 0.38) c.copy(trim);
            else c.copy(black);
          },
        }),
        mat('#ffffff', { vertexColors: true }),
      );
      const legSkin = { bones: [bi(th), bi(sn), bi(ft)], joints: [B.kneeY, B.ankleY], blend: 0.05 };
      skinned(tubeGeometry({ yTop: 0.86, yBot: 0.055, cx: s * B.hipX, profile: keyed(LEG, 0, s), rings: 44, radial: 18, skin: legSkin }), mat('skin'));
      if (k === 'L') {
        const sw = new THREE.Color(L.stockingStripe), sb = new THREE.Color(L.stocking);
        skinned(
          tubeGeometry({
            yTop: 0.6, yBot: 0.05, cx: s * B.hipX, profile: keyed(LEG, 0.004, s), rings: 34, radial: 20, skin: legSkin,
            color: (c, a) => c.copy(Math.abs(wrapAngle(a - Math.PI * 1.5)) < 0.17 ? sw : sb),
          }),
          mat('#ffffff', { vertexColors: true }),
        );
        P.add(th, torus(0.07, 0.007, 6, 28).rotateX(Math.PI / 2), mat('stocking'), { pos: [s * B.hipX, 0.6, 0], scale: [1, 1, 1.08], hull: 0 });
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          P.add(th, sphere(0.009, 6, 4), mat('stocking'), { pos: [s * B.hipX + Math.sin(a) * 0.072, 0.593, Math.cos(a) * 0.078], hull: 0 });
        }
      } else {
        skinned(tubeGeometry({ yTop: 0.2, yBot: 0.05, cx: s * B.hipX, profile: keyed(LEG, 0.005, s), rings: 12, radial: 18, skin: legSkin }), mat('#ffffff', { map: sockTexture() }), 0.004);
        P.add(sn, torus(0.047, 0.007, 6, 22).rotateX(Math.PI / 2), mat('sockPattern'), { pos: [s * B.hipX, 0.2, 0.004], hull: 0 });
      }
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
      P.add(hips, cyl(0.034, 0.034, 0.075, 16), mat('gear'), { pos: [s * 0.168, 0.82, 0.02], rot: [0, 0, Math.PI / 2] });
      P.add(hips, cyl(0.037, 0.037, 0.012, 16), mat('gearAccent'), { pos: [s * 0.2, 0.82, 0.02], rot: [0, 0, Math.PI / 2], hull: 0 });
      P.add(hips, capsule(0.02, 0.09), mat('gear'), { pos: [s * 0.11, 0.8, 0.098], rot: [Math.PI / 2 - 0.35, 0, 0], hull: 0.003 });
      P.add(side[s < 0 ? 'L' : 'R'].th, cyl(0.08, 0.077, 0.07, 18), mat('shorts'), { pos: [s * B.hipX, 0.78, 0] });
    }

    // ---------- Rock: zwei Faltenhälften, vorne überlappende Wickelbahn, Karo-Lage rechts
    const skirtMat = mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
    const sk = (o) => skirtGeometry({ yTop: 0.865, rTop: 0.145, flare: 0.07, pleats: 18, depth: 0.012, rz: 0.76, cA: L.skirt, cB: L.skirtLight, ...o });
    P.add(skirtR, sk({ theta0: 0, thetaLen: Math.PI, length: (a) => 0.205 - 0.025 * Math.sin(a) }), skirtMat, { hull: 0.004 });
    P.add(skirtL, sk({ theta0: Math.PI, thetaLen: Math.PI, length: (a) => 0.235 - 0.025 * Math.sin(a) }), skirtMat, { hull: 0.004 });
    P.add(skirtR, sk({ theta0: Math.PI * 0.6, thetaLen: Math.PI * 0.48, rTop: 0.152, flare: 0.078, length: () => 0.2 }), skirtMat, { hull: 0.004 });
    P.add(skirtR, sk({ theta0: Math.PI * 0.1, thetaLen: Math.PI * 0.85, rTop: 0.139, flare: 0.062, pleats: 10, depth: 0.006, length: () => 0.245 }), mat('#ffffff', { map: plaidTexture(), side: THREE.DoubleSide }), { hull: 0 });

    // ---------- Jacken-Saum (federt nach), Kapuze, Abzeichen
    const band = new THREE.Color('#0f0f13');
    P.add(tail, tubeGeometry({
      yTop: 0.905, yBot: 0.735, profile: (t) => [lerp(0.165, 0.19, t), lerp(0.122, 0.14, t)], rings: 10, radial: 34,
      theta0: Math.PI + 0.72, thetaLen: Math.PI * 2 - 1.44,
      color: (c, a, t, u) => c.copy(u < 0.05 || u > 0.95 ? trim : t > 0.82 ? band : t > 0.78 ? trim : black),
    }), mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide }), { hull: 0.004 });
    const collar = torus(0.105, 0.038, 12, 36, Math.PI * 1.3).rotateX(Math.PI / 2).rotateY(Math.PI * 0.15);
    P.add(chest, collar, mat('jacketTrim'), { pos: [0, 1.296, 0.014], rot: [-0.22, 0, 0], scale: [1.27, 1, 1.08] });
    // Kapuze liegt als flache Schale auf dem Rücken, rotes Futter innen
    P.add(chest, new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('jacketTrim', { side: THREE.DoubleSide }), { pos: [0, 1.29, 0.115], scale: [1.35, 1.0, 0.42], hull: 0.004 });
    P.add(chest, new THREE.CircleGeometry(0.098, 20).rotateX(-Math.PI / 2), mat('hoodLining'), { pos: [0, 1.286, 0.115], scale: [1.32, 1, 0.38], hull: 0 });
    for (const s of [-1, 1]) {
      P.add(chest, cyl(0.0045, 0.0045, 0.12, 6), mat('jacketTrim'), { pos: [s * 0.05, 1.2, -0.118], rot: [0.08, 0, 0], hull: 0 });
      P.add(chest, cyl(0.007, 0.007, 0.018, 6), mat('strap'), { pos: [s * 0.05, 1.135, -0.12], hull: 0 });
    }
    P.add(chest, cyl(0.026, 0.026, 0.005, 22).rotateX(Math.PI / 2), mat('emblem'), { pos: [-0.12, 1.18, -0.085], rot: [0, -2.31, 0], hull: 0.002 });
    P.add(chest, torus(0.016, 0.0035, 6, 20), mat('hoodLining'), { pos: [-0.122, 1.18, -0.088], rot: [0, -2.31, 0], hull: 0 });
    P.add(chest, RB(0.008, 0.016, 0.004, 0.002), mat('hoodLining'), { pos: [-0.123, 1.18, -0.089], rot: [0, -2.31, 0], hull: 0 });

    // ---------- Hände: Handfläche, Finger, Daumen; links roter Halbfinger-Handschuh, rechts türkises Armband
    for (const k of ['L', 'R']) {
      const { s, ha } = side[k];
      const cx = s * B.shoulderX;
      const palm = k === 'L' ? 'glove' : 'skin';
      P.add(ha, RB(0.026, 0.068, 0.056, 0.011), mat(palm), { pos: [cx, 0.79, 0], hull: 0.003 });
      if (k === 'L') P.add(ha, RB(0.028, 0.012, 0.058, 0.004), mat('glove'), { pos: [cx, 0.758, 0], hull: 0 });
      for (let i = 0; i < 4; i++) {
        const z = (i - 1.5) * 0.0135;
        const len = [0.03, 0.036, 0.034, 0.028][i];
        P.add(ha, capsule(0.0085, len), mat('skin'), { pos: [cx - s * 0.004, 0.748 - len / 2, z], rot: [0, 0, -s * 0.28], hull: 0 });
      }
      P.add(ha, capsule(0.0095, 0.026), mat('skin'), { pos: [cx - s * 0.009, 0.782, -0.031], rot: [0.55, 0, -s * 0.35], hull: 0 });
      if (k === 'R') P.add(ha, torus(0.04, 0.007, 6, 20).rotateX(Math.PI / 2), mat('bracelet'), { pos: [cx, 0.842, 0], hull: 0 });
    }

    // ---------- Schuhe: klobige grau-weiße Sneaker mit schwarzen und roten Akzenten
    for (const k of ['L', 'R']) {
      const { s, ft } = side[k];
      const cx = s * B.hipX;
      P.add(ft, RB(0.105, 0.032, 0.27, 0.012, 3), mat('shoeSole'), { pos: [cx, 0.016, -0.045] });
      P.add(ft, RB(0.1, 0.022, 0.255, 0.009, 3), mat('shoeMid'), { pos: [cx, 0.04, -0.045], hull: 0 });
      P.add(ft, sphere(0.06, 18, 12), mat('shoeUpper'), { pos: [cx, 0.058, -0.088], scale: [0.82, 0.62, 1.5] });
      P.add(ft, RB(0.096, 0.075, 0.115, 0.03, 3), mat('shoeUpper'), { pos: [cx, 0.077, 0.02] });
      P.add(ft, RB(0.108, 0.026, 0.13, 0.008), mat('shoeDark'), { pos: [cx, 0.06, -0.03], hull: 0 });
      P.add(ft, torus(0.04, 0.013, 8, 18).rotateX(Math.PI / 2), mat('shoeDark'), { pos: [cx, 0.11, 0.005], hull: 0 });
      P.add(ft, RB(0.05, 0.06, 0.02, 0.008), mat('shoeDark'), { pos: [cx, 0.1, -0.04], rot: [-0.5, 0, 0], hull: 0 });
      P.add(ft, RB(0.028, 0.045, 0.016, 0.006), mat('shoeRed'), { pos: [cx, 0.11, 0.08], hull: 0 });
      P.add(ft, RB(0.11, 0.008, 0.07, 0.003), mat('shoeRed'), { pos: [cx, 0.03, 0.04], hull: 0 });
      for (let i = 0; i < 3; i++) P.add(ft, RB(0.05, 0.007, 0.012, 0.003), mat('shoeMid'), { pos: [cx, 0.088 - i * 0.008, -0.056 - i * 0.021], rot: [-0.5, 0, 0], hull: 0 });
    }

    // ---------- Hals, Kopf, Ohren
    P.add(neck, cyl(0.034, 0.038, 0.1, 14), mat('skin'), { pos: [0, 1.34, 0.005] });
    P.add(head, headGeometry(0.104), mat('#ffffff', { map: faceTexture(), rim: 0.22 }), { pos: [HC.x, HC.y - 0.002, HC.z - 0.002], hull: 0.004 });
    for (const s of [-1, 1]) P.add(head, sphere(0.02, 10, 8), mat('skin'), { pos: [s * 0.098, 1.474, 0.016], scale: [0.45, 1, 0.75], hull: 0 });

    // ---------- Haare: Kappe + viele verjüngte Strähnen (Pony, Gesichtssträhnen, Seiten, Hinterkopf, Zopf)
    const hairMat = mat('#ffffff', { vertexColors: true, rim: 0.3, rimColor: '#7d8cff' });
    const capGeo = withColor(new THREE.SphereGeometry(0.114, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), L.hair);
    P.add(head, capGeo, hairMat, { pos: [HC.x, HC.y + 0.01, HC.z + 0.006], rot: [0.45, 0, 0], scale: [1.03, 1, 1.05], hull: 0.004 });
    const strand = (parent, az, el, len, o = {}) => {
      const { out = 0.012, r0 = 0.021, curl = 0.015, sideways = 0, rBase = HAIR_R, flat = 0.38, c0 = L.hair, c1 = L.hairTip } = o;
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const s = i / 6;
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
      P.add(parent, strandGeometry(pts, { r0, r1: 0.0025, flat, center: HC, c0, c1 }), hairMat, { hull: 0.0025 });
    };
    // deterministischer Zufall für die Unordnung im Haar
    let seed = 7;
    const rnd = (a = 0, b = 1) => {
      seed = (seed * 16807) % 2147483647;
      return a + (b - a) * (seed / 2147483647);
    };
    // Pony – unterschiedlich lange, leicht gekreuzte Strähnen, eine längere zwischen den Augen
    for (const [off, el, len] of [[-0.66, 0.92, 0.095], [-0.5, 1.0, 0.11], [-0.34, 1.06, 0.122], [-0.2, 1.1, 0.112], [-0.07, 1.12, 0.142], [0.06, 1.12, 0.128], [0.2, 1.08, 0.108], [0.34, 1.04, 0.12], [0.5, 0.98, 0.105], [0.66, 0.9, 0.092]]) {
      strand(head, Math.PI + off + rnd(-0.03, 0.03), el, len * rnd(0.92, 1.06), { out: rnd(0.003, 0.008), rBase: 0.109, r0: rnd(0.016, 0.022), sideways: off * 0.2 + rnd(-0.08, 0.08), curl: 0 });
    }
    // Gesichtssträhnen bis zum Kinn
    for (const s of [-1, 1]) {
      strand(head, Math.PI + s * 0.86, 0.74, 0.205, { out: 0.01, r0: 0.02, curl: 0.012, sideways: -s * 0.1 });
      strand(head, Math.PI + s * 1.05, 0.82, 0.19, { out: 0.016, r0: 0.022, curl: 0.016, sideways: -s * 0.04 });
      strand(head, Math.PI + s * 1.22, 0.9, 0.17, { out: 0.024, r0: 0.024, curl: 0.01 });
    }
    // Seiten und Hinterkopf in zwei Lagen (äußere Lage steht ab = Volumen), schwingen nach
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const off = 1.4 + i * 0.29 + rnd(-0.06, 0.06);
        strand(hairBack, Math.PI + s * off, rnd(0.7, 0.9), rnd(0.17, 0.2), { out: rnd(0.014, 0.022), r0: rnd(0.022, 0.028), curl: 0.022, sideways: s * rnd(0.02, 0.1) });
        strand(hairBack, Math.PI + s * (off + 0.14), rnd(1.0, 1.2), rnd(0.14, 0.17), { out: rnd(0.028, 0.04), r0: rnd(0.024, 0.03), curl: rnd(-0.01, 0.02), sideways: s * rnd(-0.05, 0.08) });
      }
      // abstehende Spitzen am Nacken
      for (const off of [1.85, 2.3, 2.75]) strand(hairBack, Math.PI + s * off, 0.28, rnd(0.07, 0.1), { out: 0.026, r0: 0.02, curl: -0.035, rBase: 0.112 });
    }
    strand(hairBack, 0, 0.9, 0.19, { out: 0.024, r0: 0.026, curl: 0.022 });
    // Wirbel oben und zwei abstehende Büschel am Hinterkopf
    for (let i = 0; i < 8; i++) strand(head, (i / 8) * Math.PI * 2 + rnd(0, 0.5), rnd(1.3, 1.42), rnd(0.07, 0.095), { out: rnd(0.012, 0.022), r0: 0.03, flat: 0.32, curl: 0 });
    for (const x of [-0.025, 0.02]) {
      const pts = [[x, 0.108, 0.03], [x * 1.4, 0.13, 0.06], [x * 1.8, 0.138, 0.095]].map(([a, b, c]) => new THREE.Vector3(a, b, c).add(HC));
      P.add(hairBack, strandGeometry(pts, { r0: 0.02, r1: 0.002, flat: 0.5, center: HC, c0: L.hair, c1: L.hairTip }), hairMat, { hull: 0.0025 });
    }
    // kleiner Zopf hinten mit rotem Haargummi
    for (const dx of [-0.012, 0, 0.012]) {
      const pts = [[0, 0.004, 0.103], [0, -0.012, 0.145], [0, -0.048, 0.168], [0, -0.09, 0.158]].map(([x, y, z]) => new THREE.Vector3(x + dx * (1 + Math.abs(y) * 8), y, z).add(HC));
      P.add(hairBack, strandGeometry(pts, { r0: 0.024, r1: 0.003, flat: 0.7, center: HC, c0: L.hair, c1: L.hairTip }), hairMat, { hull: 0.0025 });
    }
    P.add(hairBack, torus(0.016, 0.006, 6, 14), mat('hairClip'), { pos: [HC.x, HC.y + 0.0, HC.z + 0.112], rot: [0.3, 0, 0], hull: 0 });
    // rote Spange an der linken Schläfe
    const clipAz = Math.PI + 1.0, clipEl = 0.5;
    P.add(head, RB(0.034, 0.011, 0.008, 0.003), mat('hairClip'), {
      pos: [HC.x + Math.cos(clipEl) * Math.sin(clipAz) * 0.126, HC.y + Math.sin(clipEl) * 0.126, HC.z + Math.cos(clipEl) * Math.cos(clipAz) * 0.126],
      rot: [0, -1.0 + Math.PI / 2, 0.6], hull: 0.002,
    });

    P.build();
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(boneList);
    for (const m of this.skinned) m.bind(skeleton);
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
      // gebogene Hinterkante zwischen Handgelenk und Knöchel
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

  // info: { state, speed, hspeed, vy, swinging, reeling, gliding, dashing, charging, charge, turnRate, accel, events, lookDir }
  update(dt, info) {
    this.time += dt;
    this.steps.length = 0;
    for (const e of info.events) {
      if (e.type === 'jump') this.trigger('jump');
      else if (e.type === 'superjump') this.trigger('superJump');
      else if (e.type === 'walljump') this.trigger('flip');
      else if (e.type === 'dash') this.trigger('dash');
      else if (e.type === 'stop' && info.state === 'ground') this.trigger('stop');
      else if (e.type === 'land') {
        if (e.strength > 24) this.trigger('landHard');
        else if (e.strength > 7 && e.speed < 6) this.trigger('land');
      }
    }

    // One-Shots laufen aus oder werden durch einen Zustandswechsel abgebrochen
    if (this.oneShot) {
      this.oneShotTime += dt;
      const s = this.oneShot, t = this.oneShotTime;
      const cancel =
        ((s === 'land' || s === 'landHard' || s === 'stop') && (info.state !== 'ground' || (info.hspeed > 3.5 && t > (s === 'landHard' ? 0.35 : 0.15)))) ||
        ((s === 'jump' || s === 'superJump' || s === 'flip' || s === 'dash') && (info.state !== 'air' || info.swinging || (info.gliding && s !== 'dash'))) ||
        (s === 'dash' && info.gliding && t > 0.2);
      if (cancel || t >= this.clips[s].duration - 0.07) this.oneShot = null;
    }

    // Zielgewichte aller Clips (summieren sich zu 1)
    const T = {};
    const L = CONFIG.locomotion;
    const sprintMix = clamp((info.hspeed - L.walkSpeed) / (L.sprintSpeed - L.walkSpeed), 0, 1);
    const moveMix = smooth(0.05, L.walkSpeed * 0.55, info.hspeed);
    if (this.oneShot) T[this.oneShot] = 1;
    else if (info.state === 'ground') {
      if (info.charging) {
        const c = 0.3 + 0.7 * smooth(0, 1, info.charge);
        T.charge = c;
        T.idle = 1 - c;
      } else if (info.hspeed > L.sprintSpeed + 2) T.slide = 1;
      else {
        T.idle = 1 - moveMix;
        T.walk = moveMix * (1 - sprintMix);
        T.sprint = moveMix * sprintMix;
      }
    } else if (info.state === 'wallrun') T.wallrun = 1;
    else if (info.gliding) T.glide = 1;
    else if (info.swinging) T[info.reeling ? 'reel' : 'swing'] = 1;
    else if (info.vy > 2) T.airUp = 1;
    else if (info.vy > -5) T.apex = 1;
    else if (info.vy < -24) T.fallFast = 1;
    else T.fall = 1;

    const k = 1 - Math.exp(-dt / (this.oneShot ? 0.07 : 0.17));
    for (const name of Object.keys(this.actions)) {
      const w = this.weights[name] + ((T[name] ?? 0) - this.weights[name]) * k;
      this.weights[name] = w;
      this.actions[name].setEffectiveWeight(w);
    }

    // Gang-Phase: Geh- und Sprintzyklus laufen synchron, Schrittlänge passt sich dem Tempo an
    const stride = lerp(L.walkSpeed * WALK_CYCLE, L.sprintSpeed * SPRINT_CYCLE, sprintMix);
    const prev = this.phase;
    if (info.state === 'ground' && info.hspeed > 0.05) this.phase = (this.phase + (dt * info.hspeed) / stride) % 1;
    if (Math.floor(prev * 2) !== Math.floor(this.phase * 2) && this.weights.walk + this.weights.sprint > 0.3) {
      this.steps.push(0.35 + 0.65 * this.weights.sprint);
    }
    this.actions.walk.time = this.phase * WALK_CYCLE;
    this.actions.sprint.time = this.phase * SPRINT_CYCLE;
    this.locoMove = this.weights.walk + this.weights.sprint;
    this.locoSprint = this.weights.sprint;
    if (this.weights.wallrun > 0.01) this.actions.wallrun.setEffectiveTimeScale(clamp(info.speed / 24, 0.8, 1.6));

    this.mixer.update(dt);
    this.postProcess(dt, info);
    this.root.updateMatrixWorld(true);
    this.updateWings(dt, info.gliding);
  }

  // Prozedurale Ebene über den Clips: Gewichtsverlagerung, Blick, Haare, Rock und Jacke.
  postProcess(dt, info) {
    const J = this.joints;
    const ground = info.state === 'ground';
    // Vorlage beim Beschleunigen, Zurücklehnen beim Bremsen, Neigen in Kurven – um die Füße herum
    const tx = ground ? clamp(-info.accel * 0.011, -0.12, 0.1) : 0;
    const tz = ground ? clamp(info.turnRate * info.hspeed * 0.011, -0.28, 0.28) : 0;
    const kl = 1 - Math.exp(-6 * dt);
    this.lean.x += (tx - this.lean.x) * kl;
    this.lean.z += (tz - this.lean.z) * kl;
    J.model.rotation.set(this.lean.x, 0, this.lean.z);

    // Blick in Zielrichtung – nur am Boden und ruhig, nie verdreht (behebt den Kopf-Dreh-Bug in der Luft)
    const lw = ground && !this.oneShot && !info.charging ? 1 - clamp(info.hspeed / 8, 0, 0.7) : 0;
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

    // Haar-Feder: Fahrtwind drückt nach hinten, Drehungen lassen seitlich schwingen.
    // Gierwinkel aus der waagrecht projizierten Blickrichtung – stabil auch bei gekipptem Körper.
    _v.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    const yawNow = Math.atan2(-_v.x, -_v.z);
    const dYaw = wrapAngle(yawNow - this.spring.lastYaw);
    this.spring.lastYaw = yawNow;
    const sp = this.spring;
    const speedF = Math.min(1, info.speed / 30);
    const hairT = speedF * 0.5 + clamp(-info.vy * 0.012, -0.25, 0.3);
    sp.hairV += ((hairT - sp.hair) * 110 - sp.hairV * 13) * dt;
    sp.hair += sp.hairV * dt;
    sp.sideV += -clamp(dYaw, -0.3, 0.3) * 2.2 - (sp.side * 90 + sp.sideV * 10) * dt;
    sp.side = clamp(sp.side + sp.sideV * dt, -0.35, 0.35);
    const flutter = Math.sin(this.time * 23) * 0.035 * speedF;
    this.springNodes.hairBack.rotation.set(sp.hair + flutter, 0, sp.side);

    // Jacken-Saum flattert nach hinten
    const tailT = -speedF * 0.55 - (ground ? 0 : clamp(info.vy * 0.01, -0.25, 0.25));
    sp.tailV += ((tailT - sp.tail) * 90 - sp.tailV * 11) * dt;
    sp.tail += sp.tailV * dt;
    this.springNodes.tail.rotation.x = sp.tail + Math.sin(this.time * 19) * 0.05 * speedF;

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
    // Augenform zwischen Ober- und Unterlid
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
    // Iris: tiefes Petrol oben, Türkis, helle Unterkante, oben vom Lid verschattet
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
    // Oberlid: kräftige Wimpernlinie mit Schwung, Lidfalte, Unterlid
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
    // Augenbraue (größtenteils unter dem Pony)
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
