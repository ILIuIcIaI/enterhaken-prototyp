import * as THREE from 'three';
import { toonMaterial } from './toon.js';
import { CONFIG } from './config.js';
import { SKY } from './palette.js';

// Lüfter auf den Flachdächern unter 40 m (Gehäuse und Position: city.js placeFans; Hochschleudern und Aufwind:
// player.js). Hier die Optik: Gitterring und Rotor als Instanzen – der Rotor dreht sich nur in Kameranähe – und die
// Windströme: weiße Windlinien im Stil von The Legend of Zelda: The Wind Waker, die spiralförmig aus den nahen
// Lüftern aufsteigen. Sie zeigen genau die Windsäule (CONFIG.fan: column, height), in der der Gleiter hochgeschleudert
// wird. Beim Hochschleudern schießt ein ganzes Bündel mit nach oben.
const NEAR = 140;      // Rotoren drehen sich bis zu dieser Entfernung
const WIND_NEAR = 95;  // Windlinien nur an Lüftern in dieser Nähe
const LINES = 84, K = 14; // Windlinien im Vorrat, Punkte je Linie
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class RoofFans {
  constructor(scene, city) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build(city);
    // Windlinien: kamerazugewandte Bänder, jedes Bild auf der CPU nachgeführt
    const nv = LINES * K * 2;
    this.wpos = new Float32Array(nv * 3);
    this.walpha = new Float32Array(nv);
    const idx = [];
    for (let l = 0; l < LINES; l++) {
      for (let k = 0; k < K - 1; k++) {
        const a = (l * K + k) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.wpos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.walpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.wgeo = geo;
    this.wmat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aAlpha; varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`,
    });
    this.wmesh = new THREE.Mesh(geo, this.wmat);
    this.wmesh.frustumCulled = false;
    this.wmesh.renderOrder = 3;
    scene.add(this.wmesh);
    this.lines = Array.from({ length: LINES }, () => ({ t: 0, life: 0, fan: null, phi: 0, omega: 0, speed: 0, r0: 0, wide: 0 }));
    this.spawnT = 0;
  }

  build(city) {
    this.group.clear();
    this.fans = city.fans ?? [];
    const n = Math.max(1, this.fans.length);
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20).rotateX(Math.PI / 2), toonMaterial('#3a3644', { rim: 0.2, pbr: { roughness: 0.4, metalness: 0.8 } }), n);
    const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 8);
    const blade = new THREE.BoxGeometry(2.3, 0.05, 0.38).rotateX(0.35);
    const rotorGeo = mergeSimple([hub, blade, blade.clone().rotateY(Math.PI / 2)]);
    this.rotor = new THREE.InstancedMesh(rotorGeo, toonMaterial('#b8b2c2', { rim: 0.3, pbr: { roughness: 0.3, metalness: 0.9 } }), n);
    this.rotor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.angle = new Float32Array(n);
    this.fans.forEach((f, i) => {
      _m.makeTranslation(f.x, f.y + 0.06, f.z);
      ring.setMatrixAt(i, _m);
      this.angle[i] = (i * 1.7) % 6.283;
      this.rotor.setMatrixAt(i, _m.compose(_p.set(f.x, f.y - 0.1, f.z), _q.setFromAxisAngle(UP, this.angle[i]), _s));
    });
    ring.count = this.rotor.count = this.fans.length;
    ring.frustumCulled = this.rotor.frustumCulled = false;
    this.group.add(ring, this.rotor);
    this.city = city;
  }

  // Hochgeschleudert: ein Bündel Windlinien schießt mit nach oben
  burst(fan) {
    let n = 7;
    for (const l of this.lines) {
      if (l.life > 0 && l.t < l.life) continue;
      this.spawn(l, fan, 1.6);
      if (--n === 0) break;
    }
  }

  spawn(l, fan, boost = 1) {
    l.fan = fan;
    l.t = 0;
    l.life = 2.4 + Math.random() * 0.6;
    l.phi = Math.random() * Math.PI * 2;
    l.omega = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.4);
    l.speed = (15 + Math.random() * 5) * boost;
    l.r0 = 0.9 + Math.random() * 0.8;
    l.wide = 0.22 + Math.random() * 0.12; // kräftige Linien wie in Wind Waker, auch aus der Ferne lesbar
  }

  // Punkt einer Windlinie zur Zeit t: Schraube um die Säule über dem Lüfter, die nach oben weiter wird
  at(l, t, out) {
    const r = l.r0 + t * 1.35, a = l.phi + l.omega * t;
    return out.set(l.fan.x + Math.cos(a) * r, l.fan.y + 0.4 + l.speed * t, l.fan.z + Math.sin(a) * r);
  }

  update(dt, camera) {
    const cam = camera.position;
    // Rotoren in der Nähe drehen
    let changed = false;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      if (Math.abs(f.x - cam.x) > NEAR || Math.abs(f.z - cam.z) > NEAR) continue;
      this.angle[i] += dt * 9;
      this.rotor.setMatrixAt(i, _m.compose(_p.set(f.x, f.y - 0.1, f.z), _q.setFromAxisAngle(UP, this.angle[i]), _s));
      changed = true;
    }
    if (changed) this.rotor.instanceMatrix.needsUpdate = true;
    // neue Windlinien an Lüftern in der Nähe
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.city?.fanNear) {
      this.spawnT = 0.05;
      const near = [];
      const ix = Math.floor(cam.x / 40), iz = Math.floor(cam.z / 40);
      for (let a = ix - 2; a <= ix + 2; a++) {
        for (let b = iz - 2; b <= iz + 2; b++) {
          for (const f of this.city.fanGrid.get((a + 512) * 1024 + b + 512) ?? []) {
            if ((f.x - cam.x) ** 2 + (f.z - cam.z) ** 2 < WIND_NEAR * WIND_NEAR) near.push(f);
          }
        }
      }
      if (near.length) {
        const free = this.lines.find((l) => !(l.life > 0 && l.t < l.life));
        if (free) this.spawn(free, near[Math.floor(Math.random() * near.length)]);
      }
    }
    // Bänder aufbauen: kamerazugewandt, Spitze kräftig, Schwanz und Lebensende blenden aus
    const P = this.wpos, A = this.walpha;
    // Hyper-Realistic-Mode: nur ein Hauch von Luftschlieren statt der kräftigen Zeichentrick-Linien
    const real = CONFIG.graphics.hyperReal, thin = real ? 0.5 : 1, faint = real ? 0.16 + 0.22 * SKY.uSunUp.value : 1;
    this.wmat.uniforms.uColor.value.setScalar(real ? 0.3 + 0.7 * SKY.uSunUp.value : 1);
    for (let li = 0; li < LINES; li++) {
      const l = this.lines[li];
      const alive = l.life > 0 && l.t < l.life;
      if (alive) l.t += dt;
      const fade = alive ? Math.min(1, l.t / 0.25) * Math.min(1, (l.life - l.t) / 0.5) : 0;
      for (let k = 0; k < K; k++) {
        const v = (li * K + k) * 2;
        if (!alive) { A[v] = A[v + 1] = 0; continue; }
        const tt = Math.max(0, l.t - (1 - k / (K - 1)) * 0.7);
        this.at(l, tt, _a);
        this.at(l, tt + 0.02, _b);
        _t.subVectors(_b, _a).normalize();
        _w.subVectors(cam, _a).cross(_t).normalize().multiplyScalar(l.wide * thin);
        P[v * 3] = _a.x + _w.x; P[v * 3 + 1] = _a.y + _w.y; P[v * 3 + 2] = _a.z + _w.z;
        P[v * 3 + 3] = _a.x - _w.x; P[v * 3 + 4] = _a.y - _w.y; P[v * 3 + 5] = _a.z - _w.z;
        const u = k / (K - 1);
        A[v] = A[v + 1] = 0.9 * faint * fade * Math.min(1, u * 1.6) * (1 - 0.15 * u); // Schwanz blendet aus, Spitze kräftig
      }
    }
    this.wgeo.attributes.position.needsUpdate = true;
    this.wgeo.attributes.aAlpha.needsUpdate = true;
  }
}

// kleine Hilfe: Geometrien ohne Attribut-Unterschiede zusammenfügen (Nabe + zwei Flügelpaare)
function mergeSimple(geos) {
  const parts = geos.map((g) => g.toNonIndexed());
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
