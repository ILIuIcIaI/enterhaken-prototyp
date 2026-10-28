import * as THREE from 'three';
import { toonMaterial, outlineMaterial } from './toon.js';
import { createClips, GAITS, JOINTS } from './animations.js';
import { Inertializer, LimbSpring, ArmAim } from './motion.js';
import { BASE_B, AP, PartBuilder } from './charkit.js';
import { getDesign } from './designs/index.js';
import { WIND, windGust } from './cloth.js';
import { CONFIG } from './config.js';

// Spielfigur: gemeinsames Skelett, Animationssteuerung, prozedurale Ebenen und Stoffsimulation.
// Das Aussehen (Proportionen, Kleidung, Haare, Gesicht, Stoffteile) liefert ein Design aus src/designs/.
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

export class Character {
  constructor(designId = 'belle') {
    this.design = getDesign(designId);
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
      if (GAIT_ORDER.includes(name) || name === 'swing') a.setEffectiveTimeScale(0); // Phase wird von außen gesteuert
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
    // Weltraum-Gruppe: Gleiter-Flügel und Stoffbahnen (werden nicht am Skelett, sondern frei gerechnet)
    this.world = new THREE.Group();
    this.world.add(this.wings);
    for (const c of this.cloths) this.world.add(c.mesh);

    // Prozedurale Ebenen: weiche Übergänge, nachschwingende Gliedmaßen, Greifarme
    const J = this.joints;
    const animated = [J.model, ...JOINTS.map((n) => J[n])];
    this.basePose = { nodes: animated, q: animated.map((n) => n.quaternion.clone()), p: animated.map((n) => n.position.clone()) };
    this.inert = new Inertializer(animated);
    this.poseKey = '';
    this.limbW = 0;
    this.limbs = [];
    for (const k of ['L', 'R']) {
      this.limbs.push(
        new LimbSpring(J['thigh' + k], J['shin' + k], { k: 140, zeta: 0.45, max: 0.45, gravity: 0.4 }),
        new LimbSpring(J['shin' + k], J['foot' + k], { k: 170, zeta: 0.5, max: 0.35, gravity: 0.3 }),
      );
    }
    this.armSprings = [];
    for (const k of ['L', 'R']) {
      this.armSprings.push([
        new LimbSpring(J['upperArm' + k], J['forearm' + k], { k: 130, zeta: 0.34, max: 0.6, gravity: 0.35 }),
        new LimbSpring(J['forearm' + k], J['hand' + k], { k: 160, zeta: 0.38, max: 0.45, gravity: 0.3 }),
      ]);
    }
    this.chestSpring = new LimbSpring(J.chest, J.neck, { k: 260, zeta: 0.5, max: 0.16, gravity: 0.2 });
    this.arms = [new ArmAim(J, -1), new ArmAim(J, 1)];
    this.swingPhase = 0.5;
  }

  // Startpunkt des Seils: aus der Hand, sobald der Arm zum Haken zeigt, sonst aus der Hüftausrüstung
  ropeOrigin(side, hip, out) {
    const arm = this.arms[side < 0 ? 0 : 1];
    if (arm.w < 0.01) return out.copy(hip);
    arm.ha.getWorldPosition(out);
    return out.lerp(hip, 1 - arm.w);
  }

  // ------------------------------------------------------------------ Modell
  // Gemeinsames Skelett für alle Figuren; Proportionen (B, HC, Maßstab) und Aussehen kommen aus dem Design.
  build() {
    const D = this.design;
    const B = { ...BASE_B, ...(D.B ?? {}) };
    const HC = D.HC ? new THREE.Vector3(...D.HC) : new THREE.Vector3(0, 1.482, 0.006);
    const origins = new Map();
    const mats = new Map();
    const mat = (color, opts = {}) => {
      const key = color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
      if (!mats.has(key)) mats.set(key, toonMaterial(color, opts));
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
    model.scale.setScalar(D.scale ?? 1);
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

    const boneList = [hips, spine, chest, neck, head, hairBack, hem];
    for (const k of ['L', 'R']) boneList.push(side[k].ua, side[k].fa, side[k].ha, side[k].th, side[k].sn, side[k].ft);
    this.skinned = [];
    this.cloths = [];
    const K = {
      B, HC, AP: D.AP ?? AP, scale: D.scale ?? 1, origins, joints: this.joints, side, model,
      hips, spine, chest, neck, head, hairBack, hem,
      P: new PartBuilder(origins), mat, cloths: this.cloths,
      bi: (b) => boneList.indexOf(b),
      skinned: (geo, material, hull = 0.005) => {
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
      },
    };
    D.build(K);
    K.P.build();

    // Binden in A-Haltung (passt zu Jacken und Ärmeln), danach zurück in die Ruhepose
    for (const k of ['L', 'R']) side[k].ua.rotation.z = side[k].s * K.AP;
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(boneList);
    for (const m of this.skinned) m.bind(skeleton);
    for (const k of ['L', 'R']) side[k].ua.rotation.z = 0;
    this.springNodes = { hairBack, hem };
  }

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

    // Jeder Wechsel des führenden Clips (außer innerhalb der Gangarten) startet eine Trägheitsüberblendung
    let lead = 'idle', leadW = -1;
    for (const [n, w] of Object.entries(T)) if (w > leadW) { lead = n; leadW = w; }
    if (lead === 'idle' || GAIT_ORDER.includes(lead)) lead = 'loco';
    // Die Gewichte springen dabei direkt auf die neue Pose; den weichen Weg dorthin übernimmt allein
    // die Überblendung (eine zusätzliche Kreuzblende würde am Anfang wieder einen Ruck erzeugen).
    const key = `${info.state}|${lead}`;
    let k = 1 - Math.exp(-dt / 0.13);
    if (key !== this.poseKey) {
      const fromShot = ONE_SHOTS.includes(this.poseKey.split('|')[1]);
      this.inert.trigger(this.oneShot ? (this.oneShot === 'dash' || this.oneShot === 'jump' ? 0.18 : 0.24) : fromShot ? 0.36 : 0.32);
      this.poseKey = key;
      k = 1;
    }
    for (const name of Object.keys(this.actions)) {
      const w = this.weights[name] + ((T[name] ?? 0) - this.weights[name]) * k;
      this.weights[name] = w;
      this.actions[name].setEffectiveWeight(w);
    }
    // Schwing-Pose folgt der Position im Bogen (0 Abschwung, 0.5 unten, 1 Aufschwung)
    if (info.swingPhase !== undefined) this.swingPhase += (info.swingPhase - this.swingPhase) * (1 - Math.exp(-6 * dt));
    this.actions.swing.time = clamp(this.swingPhase, 0, 0.999) * this.clips.swing.duration;

    // Gang-Phase: alle Zyklen laufen synchron, Kadenz = Tempo / Schrittlänge (keine rutschenden Füße)
    const prev = this.phase;
    if (info.state === 'ground' && info.hspeed > 0.05) this.phase = (this.phase + (dt * info.hspeed) / gait.stride) % 1;
    this.locoMove = this.weights.walk + this.weights.jog + this.weights.sprint;
    if (Math.floor(prev * 2) !== Math.floor(this.phase * 2) && this.locoMove > 0.3) {
      this.steps.push(0.3 + 0.35 * this.weights.jog + 0.7 * this.weights.sprint);
    }
    for (const n of GAIT_ORDER) this.actions[n].time = this.phase * GAITS[n].cycle;
    if (this.weights.wallrun > 0.01) this.actions.wallrun.setEffectiveTimeScale(clamp(info.speed / 24, 0.8, 1.6));

    // Der Mixer schreibt ein Gelenk nur, wenn sich sein Clip-Wert seit dem letzten Mal geändert hat.
    // Darum vorher die reine Clip-Pose wiederherstellen – sonst summieren sich die prozeduralen Ebenen
    // bei ruhigen Posen von Frame zu Frame auf.
    const base = this.basePose;
    for (let i = 0; i < base.nodes.length; i++) {
      base.nodes[i].quaternion.copy(base.q[i]);
      base.nodes[i].position.copy(base.p[i]);
    }
    this.mixer.update(dt);
    for (let i = 0; i < base.nodes.length; i++) {
      base.q[i].copy(base.nodes[i].quaternion);
      base.p[i].copy(base.nodes[i].position);
    }
    this.postProcess(dt, info);
    this.inert.apply(dt);
    this.root.updateMatrixWorld(true);
    this.secondary(dt, info);
    this.updateWings(dt, info.gliding);
    for (const c of this.cloths) {
      c.sim.update(dt);
      c.mesh.userData.sync();
    }
  }

  // Nachschwingen von Beinen, Armen und Oberkörper, dann Greifarme; je Zustand unterschiedlich stark.
  // Am Boden aus (die Gangzyklen sollen exakt bleiben), beim Schwingen am stärksten.
  secondary(dt, info) {
    const J = this.joints;
    let target = 0;
    if (this.oneShot === 'flip' || this.oneShot === 'landHard' || this.oneShot === 'pivot') target = 0;
    else if (info.state === 'ground') target = 0;
    else if (info.state === 'wallrun') target = 0.25;
    else if (info.swinging) target = info.reeling ? 0.6 : 1;
    else if (info.gliding) target = 0.3;
    else if (info.boosting || this.oneShot === 'dash') target = 0.45;
    else target = 0.8;
    this.limbW += (target - this.limbW) * (1 - Math.exp(-(target > this.limbW ? 3 : 6) * dt));
    const g = CONFIG.physics.gravity;
    const w = this.limbW;
    for (const s of this.limbs) s.apply(dt, w, g);
    this.chestSpring.apply(dt, w * 0.8, g);
    const hooks = info.hooks ?? [];
    for (let i = 0; i < 2; i++) {
      const free = 1 - this.arms[i].w;
      for (const s of this.armSprings[i]) s.apply(dt, w * free, g);
    }
    for (let i = 0; i < 2; i++) this.arms[i].update(dt, hooks[i]);

    // Rockhälften folgen den Oberschenkeln (gegen Durchdringen), flattern in der Luft
    const ground = info.state === 'ground';
    const speedF = Math.min(1, info.speed / 30);
    const fl = ground ? 0 : Math.sin(this.time * 21) * 0.06 * speedF;
    J.skirtL.rotation.x = clamp(J.thighL.rotation.x * 0.45, -0.2, 0.9) + fl;
    J.skirtR.rotation.x = clamp(J.thighR.rotation.x * 0.45, -0.2, 0.9) - fl;
    this.root.updateMatrixWorld(true);
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
    // Dauerwind: feste Haare wiegen sich ganz leicht zur windabgewandten Seite
    const wg = 0.05 * windGust(this.time) + 0.008 * Math.sin(this.time * 2.3);
    const wFwd = -WIND.dir.x * Math.sin(yawNow) - WIND.dir.z * Math.cos(yawNow), wRight = WIND.dir.x * Math.cos(yawNow) - WIND.dir.z * Math.sin(yawNow);
    this.springNodes.hairBack.rotation.set(sp.hair + flutter - wFwd * wg, 0, sp.side + wRight * wg);
    const hemT = -speedF * 0.5 - (ground ? Math.min(0.15, info.hspeed * 0.015) : clamp(info.vy * 0.01, -0.25, 0.25));
    sp.hemV += ((hemT - sp.hem) * 90 - sp.hemV * 11) * dt;
    sp.hem += sp.hemV * dt;
    this.springNodes.hem.rotation.x = sp.hem + Math.sin(this.time * 19) * 0.04 * speedF;
  }
}
