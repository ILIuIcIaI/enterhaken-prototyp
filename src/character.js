import * as THREE from 'three';
import { toonMaterial, outlineMaterial } from './toon.js';
import { createClips } from './animations.js';
import { CONFIG } from './config.js';

// Spielfigur Kaia im Anime-Stil: kräftig blauer Bob,
// offene dunkle Jacke über hellem Top, schwarze Shorts, asymmetrische Socken, Sneaker.
// Farben zentral hier anpassen:
export const LOOK = {
  skin: '#f7d3c0',
  hair: '#3d6df0',
  hairShade: '#2441a8',
  clip: '#ffd23f',
  top: '#f2eff0',
  jacket: '#2b2c3a',
  jacketAccent: '#ffd23f',
  jacketAccent2: '#ff4a5a',
  shorts: '#1c1b25',
  sockLong: '#17161e',
  sockShort: '#f4f3f6',
  shoe: '#f6f6f8',
  shoeAccent: '#ff4a5a',
  gear: '#4a4e5e',
  gearAccent: '#ffd23f',
  iris: '#2f6ff0',
  irisDeep: '#13256e',
  lash: '#1b1026',
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _r = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.joints = {};
    this.time = 0;
    this.build();

    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = createClips(-CONFIG.player.halfHeight);
    this.actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      if (['jump', 'land', 'landHard', 'flip'].includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[name] = a;
    }
    this.current = 'idle';
    this.actions.idle.play();
    this.oneShot = null;
    this.oneShotTime = 0;
    this.hair = { ang: 0, vel: 0, side: 0, sideVel: 0 };
    this.lastYaw = 0;
  }

  // ------------------------------------------------------------------ Modell
  build() {
    const L = LOOK;
    const outline = outlineMaterial();
    const mats = {};
    const mat = (key, opts) => (mats[key + (opts ? JSON.stringify(opts) : '')] ??= toonMaterial(L[key], opts));
    const J = (name, parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    const part = (parent, geo, material, { pos, rot, scale, hull = true } = {}) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      if (pos) m.position.set(...pos);
      if (rot) m.rotation.set(...rot);
      if (scale) m.scale.set(...scale);
      if (hull) {
        const o = new THREE.Mesh(geo, outline);
        m.add(o);
      }
      parent.add(m);
      return m;
    };
    const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 12).translate(0, -len / 2, 0);
    const shell = (rTop, rBot, h, open) => new THREE.CylinderGeometry(rTop, rBot, h, 24, 1, true, Math.PI + open, Math.PI * 2 - open * 2);

    const flip = J('flip', this.root);
    const model = J('model', flip, 0, -CONFIG.player.halfHeight, 0);
    const hips = J('hips', model, 0, 0.86, 0);

    // Becken / Shorts / Gürtel mit Seilwinden
    part(hips, new THREE.SphereGeometry(0.16, 18, 12), mat('shorts'), { pos: [0, -0.02, 0], scale: [1, 0.62, 0.74] });
    part(hips, new THREE.CylinderGeometry(0.118, 0.13, 0.12, 18), mat('top'), { pos: [0, 0.07, 0], scale: [1, 1, 0.78] });
    part(hips, new THREE.TorusGeometry(0.128, 0.016, 6, 24), mat('gear'), { pos: [0, 0.025, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], hull: false });
    for (const s of [-1, 1]) {
      part(hips, new THREE.CylinderGeometry(0.05, 0.05, 0.09, 14), mat('gear'), { pos: [0.17 * s, -0.02, 0.01], rot: [0, 0, Math.PI / 2] });
      part(hips, new THREE.CylinderGeometry(0.054, 0.054, 0.02, 14), mat('gearAccent'), { pos: [0.215 * s, -0.02, 0.01], rot: [0, 0, Math.PI / 2], hull: false });
      part(hips, new THREE.CapsuleGeometry(0.036, 0.2, 4, 10), mat('gear'), { pos: [0.12 * s, -0.06, 0.15], rot: [Math.PI / 2 - 0.3, 0, 0] });
    }

    const spine = J('spine', hips, 0, 0.1, 0);
    const chest = J('chest', spine, 0, 0.12, 0);
    part(chest, new THREE.SphereGeometry(0.15, 20, 14), mat('top'), { pos: [0, 0.05, 0], scale: [0.95, 1.22, 0.72] });
    // Offene Jacke mit gelbem Saum und Kapuze
    part(chest, shell(0.158, 0.172, 0.3, 0.62), mat('jacket', { side: THREE.DoubleSide }), { pos: [0, 0.04, 0.005], scale: [1, 1, 0.8], hull: false });
    part(chest, shell(0.176, 0.176, 0.035, 0.62), mat('jacketAccent', { side: THREE.DoubleSide }), { pos: [0, -0.1, 0.005], scale: [1, 1, 0.8], hull: false });
    part(chest, new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('jacket', { side: THREE.DoubleSide }), { pos: [0, 0.2, 0.08], scale: [1.15, 0.55, 0.9], hull: false });
    part(chest, new THREE.CylinderGeometry(0.075, 0.095, 0.05, 14, 1, true), mat('jacket', { side: THREE.DoubleSide }), { pos: [0, 0.235, 0.005], hull: false });

    const neck = J('neck', chest, 0, 0.24, 0);
    part(neck, new THREE.CylinderGeometry(0.036, 0.04, 0.1, 10), mat('skin'), { pos: [0, 0.035, 0] });
    const head = J('head', neck, 0, 0.08, 0);
    part(head, new THREE.SphereGeometry(0.105, 32, 24), toonMaterial('#ffffff', { map: faceTexture(), rim: 0.25 }), { pos: [0, 0.1, 0], scale: [0.93, 1.02, 0.98] });

    // Haare: Kappe, Pony, Seitensträhnen, Bob (schwingt nach), Haarspange
    const hair = new THREE.Group();
    hair.position.set(0, 0.1, 0);
    head.add(hair);
    part(hair, new THREE.SphereGeometry(0.118, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), mat('hair'), { pos: [0, 0.008, 0.004], rot: [0.5, 0, 0], scale: [1.02, 1, 1.05] });
    // Pony: unterschiedlich lange, spitz zulaufende Strähnen über der Stirn
    const fringe = [[-3, 0.07], [-2, 0.1], [-1, 0.085], [0, 0.105], [1, 0.08], [2, 0.1], [3, 0.075]];
    for (const [i, len] of fringe) {
      const x = i * 0.024;
      part(hair, new THREE.ConeGeometry(0.03, len, 5).rotateX(Math.PI), mat('hair'), {
        pos: [x, 0.1 - len / 2, -0.1 + Math.abs(i) * 0.012],
        rot: [-0.42 + Math.abs(i) * 0.03, -x * 4, i * 0.1],
        scale: [1, 1, 0.42],
      });
    }
    for (const s of [-1, 1]) {
      part(hair, new THREE.ConeGeometry(0.036, 0.17, 6).rotateX(Math.PI), mat('hair'), { pos: [0.094 * s, -0.035, -0.035], rot: [-0.08, 0, -0.1 * s], scale: [0.7, 1, 0.5] });
    }
    const bob = new THREE.Group();
    bob.position.set(0, 0.02, 0.02);
    hair.add(bob);
    this.bob = bob;
    part(bob, shell(0.122, 0.142, 0.13, 1.0), mat('hair', { side: THREE.DoubleSide }), { pos: [0, -0.065, -0.02], hull: false });
    part(bob, shell(0.112, 0.13, 0.11, 1.05), mat('hairShade', { side: THREE.DoubleSide }), { pos: [0, -0.07, -0.02], hull: false });
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 0.32 + (k / 8) * Math.PI * 1.36;
      part(bob, new THREE.ConeGeometry(0.03, 0.06, 5).rotateX(Math.PI), mat('hair'), { pos: [Math.cos(a) * 0.132, -0.15, Math.sin(a) * 0.132 - 0.02], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], hull: false });
    }
    part(hair, new THREE.BoxGeometry(0.035, 0.012, 0.012), mat('clip'), { pos: [-0.085, 0.045, -0.072], rot: [0, 0.6, 0.7], hull: false });
    part(hair, new THREE.BoxGeometry(0.035, 0.012, 0.012), mat('jacketAccent2'), { pos: [-0.092, 0.025, -0.068], rot: [0, 0.6, 0.7], hull: false });

    // Arme (Jackenärmel mit roten Streifen, Griffe der Ausrüstung in den Händen)
    for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
      const sh = new THREE.Group();
      sh.position.set(0.16 * s, 0.19, 0);
      chest.add(sh);
      const upper = J('upperArm' + side, sh);
      part(upper, limb(0.052, 0.17), mat('jacket'));
      part(upper, new THREE.CylinderGeometry(0.058, 0.058, 0.025, 12), mat('jacketAccent2'), { pos: [0, -0.17, 0], hull: false });
      const fore = J('forearm' + side, upper, 0, -0.24, 0);
      part(fore, limb(0.034, 0.15), mat('skin'));
      part(fore, new THREE.CylinderGeometry(0.052, 0.046, 0.07, 12), mat('jacket'), { pos: [0, -0.02, 0] });
      const hand = J('hand' + side, fore, 0, -0.205, 0);
      part(hand, new THREE.SphereGeometry(0.035, 10, 8), mat('skin'), { pos: [0, -0.035, 0], scale: [0.78, 1.2, 0.95] });
      part(hand, new THREE.CylinderGeometry(0.017, 0.017, 0.13, 8), mat('gear'), { pos: [0, -0.045, -0.03], rot: [Math.PI / 2, 0, 0] });
      part(hand, new THREE.BoxGeometry(0.012, 0.03, 0.02), mat('gearAccent'), { pos: [0, -0.065, -0.07], hull: false });
    }

    // Beine: links Overknee-Strumpf, rechts kurze Socke (asymmetrisch)
    for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
      const thigh = J('thigh' + side, hips, 0.085 * s, -0.05, 0);
      part(thigh, new THREE.CylinderGeometry(0.08, 0.076, 0.1, 14), mat('shorts'), { pos: [0, -0.035, 0] });
      part(thigh, limb(0.061, 0.29), mat('skin'));
      if (side === 'L') {
        part(thigh, new THREE.CapsuleGeometry(0.064, 0.13, 4, 12).translate(0, -0.315, 0), mat('sockLong'), { hull: false });
        part(thigh, new THREE.CylinderGeometry(0.067, 0.067, 0.022, 14), mat('jacketAccent'), { pos: [0, -0.245, 0], hull: false });
      }
      const shin = J('shin' + side, thigh, 0, -0.38, 0);
      part(shin, limb(0.047, 0.3), mat(side === 'L' ? 'sockLong' : 'skin'));
      if (side === 'R') part(shin, new THREE.CylinderGeometry(0.05, 0.048, 0.07, 12), mat('sockShort'), { pos: [0, -0.31, 0] });
      const foot = J('foot' + side, shin, 0, -0.36, 0);
      part(foot, new THREE.CapsuleGeometry(0.046, 0.12, 4, 12), mat('shoe'), { pos: [0, -0.03, -0.035], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.78] });
      part(foot, new THREE.BoxGeometry(0.096, 0.02, 0.2), mat('shoeAccent'), { pos: [0, -0.062, -0.035], hull: false });
    }
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

  // ------------------------------------------------------------------ Animations-Zustandsmaschine
  play(name, fade = 0.18) {
    if (name === this.current) return;
    const next = this.actions[name];
    const prev = this.actions[this.current];
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    prev.crossFadeTo(next, fade, false);
    this.current = name;
  }

  trigger(name, fade = 0.08) {
    this.oneShot = name;
    this.oneShotTime = 0;
    this.current = '__';
    for (const [n, a] of Object.entries(this.actions)) if (n !== name) a.fadeOut(fade);
    const a = this.actions[name];
    a.reset();
    a.setEffectiveTimeScale(1);
    a.setEffectiveWeight(1);
    a.fadeIn(fade);
    a.play();
    this.current = name;
  }

  // info: { state, speed, hspeed, vy, swinging, reeling, boosting, events, lookDir }
  update(dt, info) {
    this.time += dt;
    for (const e of info.events) {
      if (e.type === 'jump') this.trigger('jump');
      else if (e.type === 'walljump') this.trigger('flip');
      else if (e.type === 'land') {
        if (e.strength > 24) this.trigger('landHard', 0.05);
        else if (e.strength > 7) this.trigger('land', 0.05);
      }
    }

    // One-Shots laufen aus oder werden durch einen Zustandswechsel abgebrochen
    if (this.oneShot) {
      this.oneShotTime += dt;
      const clip = this.clips[this.oneShot];
      const s = this.oneShot;
      const cancel =
        ((s === 'land' || s === 'landHard') && (info.state !== 'ground' || (info.hspeed > 5 && this.oneShotTime > (s === 'land' ? 0.1 : 0.3)))) ||
        ((s === 'jump' || s === 'flip') && (info.state !== 'air' || info.swinging));
      if (cancel || this.oneShotTime >= clip.duration - 0.06) this.oneShot = null;
    }

    if (!this.oneShot) {
      let want;
      if (info.state === 'ground') want = info.hspeed > CONFIG.player.runSpeed + 4 ? 'slide' : info.hspeed > 0.6 ? 'run' : 'idle';
      else if (info.state === 'wallrun') want = 'wallrun';
      else if (info.swinging) want = info.reeling ? 'reel' : 'swing';
      else if (info.boosting) want = 'boost';
      else want = info.vy > 1.5 ? 'airUp' : 'fall';
      this.play(want, want === 'run' || want === 'idle' ? 0.2 : 0.16);
    }
    if (this.current === 'run') this.actions.run.setEffectiveTimeScale(Math.min(1.9, Math.max(0.55, info.hspeed / 10)));
    if (this.current === 'wallrun') this.actions.wallrun.setEffectiveTimeScale(Math.min(1.6, Math.max(0.8, info.speed / 24)));

    this.mixer.update(dt);
    this.postProcess(dt, info);
  }

  // Prozedurale Ebene über den Clips: Kopf schaut in Zielrichtung, Haare schwingen nach.
  postProcess(dt, info) {
    const head = this.joints.head;
    if (info.lookDir && this.oneShot !== 'flip') {
      _v.copy(info.lookDir).applyQuaternion(_q.copy(this.root.quaternion).invert());
      const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(-_v.x, -_v.z)));
      const pitch = Math.max(-0.5, Math.min(0.5, Math.asin(Math.max(-1, Math.min(1, _v.y)))));
      head.quaternion.multiply(_q.setFromEuler(_e.set(pitch * 0.45, yaw * 0.55, 0)));
    }
    // Haar-Feder: Fahrtwind drückt den Bob nach hinten, Drehungen lassen ihn seitlich schwingen
    const yaw = Math.atan2(2 * (this.root.quaternion.w * this.root.quaternion.y), 1 - 2 * this.root.quaternion.y ** 2);
    let dYaw = yaw - this.lastYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.lastYaw = yaw;
    const h = this.hair;
    const target = Math.min(1, info.speed / 30) * 0.55 + Math.max(-0.3, Math.min(0.3, -info.vy * 0.015));
    h.vel += ((target - h.ang) * 120 - h.vel * 14) * dt;
    h.ang += h.vel * dt;
    h.sideVel += ((-dYaw / Math.max(dt, 1e-3)) * 0.04 * 60 * dt - h.side * 90 * dt - h.sideVel * 10 * dt);
    h.side += h.sideVel * dt;
    h.side = Math.max(-0.4, Math.min(0.4, h.side));
    const flutter = Math.sin(this.time * 24) * 0.04 * Math.min(1, info.speed / 30);
    this.bob.rotation.set(h.ang + flutter, 0, h.side);
  }
}

// Gesichtstextur, die direkt auf die Kopfkugel gemappt wird (Vorderseite liegt bei u = 0.75).
function faceTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = LOOK.skin;
  g.fillRect(0, 0, W, H);
  const cx = W * 0.75, ey = H * 0.535;

  // Wangenröte
  for (const s of [-1, 1]) {
    const grd = g.createRadialGradient(cx + s * 70, ey + 52, 2, cx + s * 70, ey + 52, 34);
    grd.addColorStop(0, 'rgba(255,120,140,0.35)');
    grd.addColorStop(1, 'rgba(255,120,140,0)');
    g.fillStyle = grd;
    g.fillRect(cx + s * 70 - 40, ey + 12, 80, 80);
  }

  const eye = (s) => {
    g.save();
    g.translate(cx + s * 60, ey);
    g.scale(s, 1);
    // Augenweiß
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(0, 4, 30, 34, 0, 0, Math.PI * 2);
    g.fill();
    // Iris mit Verlauf und goldenen Sprenkeln
    const ir = g.createLinearGradient(0, -30, 0, 34);
    ir.addColorStop(0, LOOK.irisDeep);
    ir.addColorStop(0.55, LOOK.iris);
    ir.addColorStop(1, '#8fd0ff');
    g.fillStyle = ir;
    g.beginPath();
    g.ellipse(2, 6, 22, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,205,80,0.85)';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      g.beginPath();
      g.arc(2 + Math.cos(a) * 13, 12 + Math.sin(a) * 17, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#0a0d2a';
    g.beginPath();
    g.ellipse(2, 8, 9, 13, 0, 0, Math.PI * 2);
    g.fill();
    // Glanzlichter
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(-8, -6, 7, 9, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(10, 22, 3.5, 0, Math.PI * 2);
    g.fill();
    // Obere Wimpernlinie mit Schwung nach außen, untere Linie
    g.strokeStyle = LOOK.lash;
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(-30, -18);
    g.quadraticCurveTo(2, -40, 32, -22);
    g.lineTo(42, -30);
    g.stroke();
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-20, 38);
    g.quadraticCurveTo(4, 44, 24, 36);
    g.stroke();
    // Augenbraue
    g.strokeStyle = '#26307a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-26, -58);
    g.quadraticCurveTo(4, -70, 30, -60);
    g.stroke();
    g.restore();
  };
  eye(-1);
  eye(1);

  // Nase (Andeutung) und Mund
  g.strokeStyle = 'rgba(180,110,100,0.7)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx + 2, ey + 46);
  g.lineTo(cx - 2, ey + 52);
  g.stroke();
  g.strokeStyle = '#a03a4a';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 12, ey + 74);
  g.quadraticCurveTo(cx, ey + 82, cx + 12, ey + 73);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
