import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _r = new THREE.Vector3();
const _b = new THREE.Vector3();

const damp = (cur, target, k) => cur + (target - cur) * k;

// Low-Poly-Figur mit Umhang, Klingen und Manöverausrüstung an der Hüfte.
// Animation ist komplett prozedural (Gelenkwinkel je Zustand).
export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.phase = 0;
    this.time = 0;

    const mat = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const M = {
      jacket: mat('#8a6a44'), shirt: mat('#d9d4c7'), pants: mat('#e3ddd0'), boots: mat('#3b2a1e'),
      skin: mat('#e2b9a0'), hair: mat('#2a211b'), metal: mat('#8c939b', 0.35, 0.85), dark: mat('#2c3036', 0.6, 0.5),
      blade: mat('#d5dde5', 0.2, 1.0), strap: mat('#4a3424'),
      cape: new THREE.MeshStandardMaterial({ color: '#2f5a3c', roughness: 0.9, side: THREE.DoubleSide }),
    };
    const box = (w, h, d, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.castShadow = true;
      return mesh;
    };

    const body = new THREE.Group();
    this.root.add(body);
    const hips = box(0.36, 0.2, 0.22, M.pants);
    hips.position.y = -0.02;
    body.add(hips);
    const belt = box(0.38, 0.06, 0.24, M.strap);
    belt.position.y = 0.07;
    body.add(belt);

    const torso = new THREE.Group();
    torso.position.y = 0.06;
    body.add(torso);
    this.torso = torso;
    const chest = box(0.42, 0.5, 0.25, M.jacket);
    chest.position.y = 0.27;
    torso.add(chest);
    const collar = box(0.3, 0.08, 0.2, M.shirt);
    collar.position.y = 0.53;
    torso.add(collar);
    const head = box(0.22, 0.25, 0.23, M.skin);
    head.position.y = 0.68;
    torso.add(head);
    const hair = box(0.25, 0.1, 0.26, M.hair);
    hair.position.set(0, 0.82, 0.01);
    torso.add(hair);
    const hairBack = box(0.25, 0.18, 0.06, M.hair);
    hairBack.position.set(0, 0.72, 0.12);
    torso.add(hairBack);

    const capePivot = new THREE.Group();
    capePivot.position.set(0, 0.5, 0.14);
    torso.add(capePivot);
    const capeGeo = new THREE.PlaneGeometry(0.56, 0.85, 1, 4);
    capeGeo.translate(0, -0.425, 0);
    const cape = new THREE.Mesh(capeGeo, M.cape);
    cape.castShadow = true;
    capePivot.add(cape);
    this.cape = capePivot;

    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.27 * s, 0.47, 0);
      torso.add(shoulder);
      const upper = box(0.12, 0.3, 0.12, M.jacket);
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const fore = box(0.1, 0.28, 0.1, M.shirt);
      fore.position.y = -0.14;
      elbow.add(fore);
      const hand = box(0.09, 0.09, 0.09, M.skin);
      hand.position.y = -0.31;
      elbow.add(hand);
      const grip = box(0.05, 0.06, 0.18, M.dark);
      grip.position.set(0, -0.33, -0.04);
      elbow.add(grip);
      const blade = box(0.015, 0.06, 0.85, M.blade);
      blade.position.set(0, -0.33, -0.55);
      elbow.add(blade);
      return { shoulder, elbow, s };
    });

    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * s, -0.1, 0);
      body.add(hip);
      const thigh = box(0.15, 0.4, 0.16, M.pants);
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.4;
      hip.add(knee);
      const shin = box(0.13, 0.36, 0.14, M.boots);
      shin.position.y = -0.18;
      knee.add(shin);
      const foot = box(0.13, 0.08, 0.24, M.boots);
      foot.position.set(0, -0.36, -0.05);
      knee.add(foot);
      return { hip, knee, s };
    });

    // Manöverausrüstung: Seilwinden an der Hüfte, Gaskartuschen, Zentraleinheit
    for (const s of [-1, 1]) {
      const unit = box(0.09, 0.15, 0.3, M.metal);
      unit.position.set(0.25 * s, -0.04, 0.02);
      body.add(unit);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.52, 10), M.metal);
      tank.castShadow = true;
      tank.rotation.x = Math.PI / 2 - 0.25;
      tank.position.set(0.27 * s, -0.22, 0.2);
      body.add(tank);
    }
    const core = box(0.22, 0.14, 0.12, M.dark);
    core.position.set(0, -0.02, 0.16);
    body.add(core);
  }

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

  // mode: 'ground' | 'air' | 'swing' | 'wallrun'
  animate(dt, mode, speed, boosting) {
    this.time += dt;
    const k = 1 - Math.exp(-14 * dt);
    const L = this.legs, A = this.arms;
    let amp = 0, rate = 0;
    const tgt = { hip: [0, 0], knee: [0, 0], shX: [0, 0], shZ: [0.08, 0.08], elbow: [0.2, 0.2], torso: 0 };

    if (mode === 'ground' || mode === 'wallrun') {
      amp = mode === 'wallrun' ? 1 : Math.min(1, speed / 12);
      rate = 4 + Math.min(speed, 30) * 0.9;
      this.phase += dt * rate * (amp > 0.05 ? 1 : 0);
      for (let i = 0; i < 2; i++) {
        const ph = this.phase + i * Math.PI;
        tgt.hip[i] = Math.sin(ph) * 0.95 * amp;
        tgt.knee[i] = -Math.max(0, Math.sin(ph + 1.3)) * 1.3 * amp - 0.05;
        tgt.shX[i] = -Math.sin(ph) * 0.8 * amp;
        tgt.elbow[i] = 0.3 + 0.6 * amp;
      }
      tgt.torso = -0.25 * amp;
      if (speed < 0.5 && mode === 'ground') {
        const b = Math.sin(this.time * 2) * 0.03;
        tgt.shX = [b, -b];
      }
    } else if (mode === 'swing') {
      tgt.hip = [0.45, 0.25];
      tgt.knee = [-0.6, -0.9];
      tgt.shX = [1.1, 1.1];
      tgt.shZ = [0.25, 0.25];
      tgt.elbow = [0.5, 0.5];
      tgt.torso = -0.1;
    } else {
      const f = Math.min(1, speed / 30);
      tgt.hip = [0.35 + 0.2 * f, -0.15];
      tgt.knee = [-0.8, -0.35];
      tgt.shX = [0.2, 0.2];
      tgt.shZ = [0.55 + 0.4 * f, 0.55 + 0.4 * f];
      tgt.elbow = [0.7, 0.7];
      tgt.torso = -0.15 - 0.2 * f;
    }

    for (let i = 0; i < 2; i++) {
      L[i].hip.rotation.x = damp(L[i].hip.rotation.x, tgt.hip[i], k);
      L[i].knee.rotation.x = damp(L[i].knee.rotation.x, tgt.knee[i], k);
      A[i].shoulder.rotation.x = damp(A[i].shoulder.rotation.x, tgt.shX[i], k);
      A[i].shoulder.rotation.z = damp(A[i].shoulder.rotation.z, tgt.shZ[i] * A[i].s, k);
      A[i].elbow.rotation.x = damp(A[i].elbow.rotation.x, tgt.elbow[i], k);
    }
    this.torso.rotation.x = damp(this.torso.rotation.x, tgt.torso, k);

    // Umhang weht mit der Geschwindigkeit nach hinten
    const f = Math.min(1, speed / 35);
    const flutter = Math.sin(this.time * 22) * 0.08 * Math.min(1, speed / 25);
    const capeTarget = -(0.12 + f * 1.2 + (boosting ? 0.15 : 0)) + flutter;
    this.cape.rotation.x = damp(this.cape.rotation.x, capeTarget, 1 - Math.exp(-10 * dt));
  }
}
