import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { colored, box } from './mover.js';
import { mulberry32 } from './rng.js';
import { Polyline } from './geom2d.js';

// Leben in der Stadt (rein optisch, ohne Kollision):
//   Vögel: Schwärme sitzen auf Dächern, Plätzen, am Strand (Möwen) und in Parks. Kommt man nahe oder rauscht schnell
//   vorbei, flattern sie auf, kreisen eine Weile über ihrem Platz und landen wieder, wenn man weg ist.
//   Fußgänger: auf Gehwegen, der Uferpromenade, den Kanal-Uferwegen, dem Jahrmarkt und in Parks – sie gehen hin und
//   her und bleiben ab und zu stehen. Runde Körper, Arme und Beine mit Ellbogen und Knien, Hände und Schuhe, mehrere
//   Frisuren, manche mit Rock oder Rucksack.
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const _root = new THREE.Matrix4(), _body = new THREE.Matrix4(), _j1 = new THREE.Matrix4(), _j2 = new THREE.Matrix4(), _t = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const merge = (geos) => { const g = mergeGeometries(geos); for (const x of geos) x.dispose(); return g; };

// Vogel: Rumpf und zwei Flügel als V (Blick nach −z); Flügelschlag = Skalierung in y (V ↔ umgedrehtes V)
function birdGeo() {
  const wing = (s) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.08, s * 0.42, 0.12, 0.02, 0, 0, 0.12, 0, 0, -0.08, 0, 0, 0.12, s * 0.42, 0.12, 0.02], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
    g.computeVertexNormals();
    return colored(g, '#ffffff');
  };
  return merge([colored(box(0.11, 0.1, 0.36, 0, 0, 0), '#ffffff'), colored(box(0.06, 0.06, 0.08, 0, 0.03, -0.21), '#ffffff'), wing(-1), wing(1)]);
}

export class Birds {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build(city);
  }

  build(city) {
    this.group.clear();
    this.mesh?.geometry.dispose();
    const rand = (this.rand = mulberry32(city.seed * 7 + 3)), flocks = (this.flocks = []);
    const T = city.terrain, ground = (x, z) => T.height(x, z, true);
    // Dächer, Plätze, Strand, Parks
    const roofs = city.roofs.filter((r) => !r.rot && r.maxY > 8 && r.maxY < 70 && Math.min(r.maxX - r.minX, r.maxZ - r.minZ) > 10);
    for (let k = 0; k < 10 && roofs.length; k++) {
      const r = roofs.splice(Math.floor(rand() * roofs.length), 1)[0];
      flocks.push({ x: (r.minX + r.maxX) / 2, y: r.maxY, z: (r.minZ + r.maxZ) / 2, R: Math.min(4, (Math.min(r.maxX - r.minX, r.maxZ - r.minZ) - 3) / 2), kind: 'pigeon' });
    }
    for (const b of (city.plazas ?? []).slice(0, 4)) flocks.push({ x: (b.x0 + b.x1) / 2, y: ground((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), z: (b.z0 + b.z1) / 2, R: 5, kind: 'pigeon' });
    const avoid = [city.landmarkData?.pier?.center, city.landmarkData?.harbor?.F && city.landmarkData.harbor.F.at(0, 0)].filter(Boolean);
    for (let k = 0, tries = 0; k < 5 && tries < 40; tries++) {
      const a = rand() * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a), r = city.coastR(ux, uz) - 16, x = ux * r, z = uz * r;
      if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 160)) continue;
      flocks.push({ x, y: ground(x, z), z, R: 5, kind: 'gull' });
      k++;
    }
    for (const p of city.parks.slice(0, 3)) {
      const x = p.blob.x + p.blob.R * 0.3, z = p.blob.z - p.blob.R * 0.25;
      if (T.waterLevel(x, z) > ground(x, z)) continue;
      flocks.push({ x, y: ground(x, z), z, R: 4, kind: 'pigeon' });
    }
    this.birds = [];
    for (const f of flocks) {
      f.state = 'sit';
      f.timer = 0;
      f.birds = [];
      const n = 7 + Math.floor(rand() * 6);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * f.R, hx = f.x + Math.cos(a) * d, hz = f.z + Math.sin(a) * d;
        const hy = f.kind === 'pigeon' && f.y > 5 ? f.y : ground(hx, hz);
        const b = { f, home: new THREE.Vector3(hx, hy, hz), pos: new THREE.Vector3(hx, hy, hz), vel: new THREE.Vector3(), yaw: rand() * 6.28, pitch: 0, flap: rand() * 6.28, state: 'sit', t: rand() * 4, ph: rand() * 6.28, h: 14 + rand() * 12, rc: 9 + rand() * 8 };
        f.birds.push(b);
        this.birds.push(b);
      }
    }
    this.mesh = new THREE.InstancedMesh(birdGeo(), toonMaterial('#ffffff', { vertexColors: true, rim: 0.2, side: THREE.DoubleSide }), this.birds.length);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    const col = new THREE.Color();
    this.birds.forEach((b, i) => this.mesh.setColorAt(i, col.set(b.f.kind === 'gull' ? (rand() < 0.3 ? '#d8dce4' : '#f4f4f0') : ['#8a8a98', '#7a7a88', '#9a98a4', '#6e6a78'][i % 4])));
    this.group.add(this.mesh);
    this.events = [];
  }

  update(dt, ppos, pspeed) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    for (const f of this.flocks) {
      const d = Math.hypot(ppos.x - f.x, ppos.z - f.z), dy = Math.abs(ppos.y - f.y);
      const scare = (d < 9 && dy < 6) || (d < 22 && dy < 14 && pspeed > 14);
      if (f.state === 'sit' && scare) {
        f.state = 'fly';
        f.timer = 8 + this.rand() * 5;
        this.events.push({ type: 'flutter', x: f.x, y: f.y, z: f.z, n: f.birds.length });
        for (const b of f.birds) {
          const ax = b.pos.x - ppos.x, az = b.pos.z - ppos.z, l = Math.hypot(ax, az) || 1;
          b.state = 'fly';
          b.vel.set((ax / l) * (3 + this.rand() * 3), 5 + this.rand() * 3, (az / l) * (3 + this.rand() * 3));
        }
      } else if (f.state === 'fly') {
        f.timer -= dt;
        if (f.timer <= 0 && d > 18) { f.state = 'land'; for (const b of f.birds) b.state = 'land'; }
      } else if (f.state === 'land' && f.birds.every((b) => b.state === 'sit')) f.state = 'sit';
      for (const b of f.birds) this.step(b, f, dt);
    }
    this.birds.forEach((b, i) => {
      const flying = b.state !== 'sit';
      _e.set(b.pitch, b.yaw, 0);
      _q.setFromEuler(_e);
      if (flying) _s.set(1, Math.cos(b.flap) * 1.4, 1); else _s.set(0.35, 0.4, 1);
      _p.copy(b.pos).y += 0.08;
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  step(b, f, dt) {
    if (b.state === 'sit') {
      // picken und gelegentlich ein kleiner Hüpfer an einen neuen Platz
      b.t -= dt;
      b.pitch = Math.max(0, Math.sin(b.ph + performance.now() * 0.004)) * 0.5;
      if (b.t < 0) { b.t = 2 + this.rand() * 4; b.yaw += (this.rand() - 0.5) * 2; }
      b.pos.copy(b.home);
      return;
    }
    // Ziel: Kreis über dem Platz (fliegen) oder der eigene Sitzplatz (landen)
    if (b.state === 'fly') {
      b.ph += dt * 0.55;
      _v.set(f.x + Math.cos(b.ph) * b.rc, f.y + b.h, f.z + Math.sin(b.ph) * b.rc);
    } else _v.copy(b.home);
    _v.sub(b.pos);
    const dist = _v.length();
    if (b.state === 'land' && dist < 0.35) { b.state = 'sit'; b.pos.copy(b.home); b.vel.set(0, 0, 0); b.pitch = 0; return; }
    _v.setLength(Math.min(9, dist * (b.state === 'land' ? 1.2 : 2)));
    b.vel.lerp(_v, Math.min(1, dt * 2.2));
    b.pos.addScaledVector(b.vel, dt);
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (hs > 0.3) b.yaw = Math.atan2(-b.vel.x, -b.vel.z);
    b.pitch = Math.atan2(b.vel.y, Math.max(hs, 0.5)) * 0.6;
    b.flap += dt * (b.vel.y > 0.3 ? 17 : b.state === 'land' && dist < 4 ? 12 : 9);
  }
}

// ------------------------------------------------------------------ Fußgänger
const SHIRTS = ['#c8352b', '#2f6fb0', '#2c8a4e', '#e08a1e', '#f4f0ea', '#8a3a7a', '#1f9aa6', '#d8c23a', '#3a3644', '#e86aa8', '#7ab0d8', '#a8c878'];
const PANTS = ['#2a3048', '#3a4a6e', '#3a3644', '#5a4632', '#2a2630', '#6a6e78', '#c8b490'];
const SKIRTS = ['#c8352b', '#2a3048', '#8a3a7a', '#2c8a4e', '#e8c86a', '#d8cfc0'];
const SKIN = ['#f2d2b8', '#e0b090', '#c08860', '#8a5a3a', '#f6dcc8', '#a87048'];
const HAIR = ['#2a1e18', '#3a2a20', '#5a3a24', '#8a6a3a', '#d8b878', '#a8482a', '#9a948e'];
const SHOES = ['#f4f0ea', '#1a1820', '#5a3a24', '#c8352b', '#2f6fb0', '#3a3644'];
const BAGS = ['#2a3048', '#c8352b', '#2c8a4e', '#e08a1e', '#3a3644', '#8a3a7a'];

// Teile der Figur (Blick nach −z, Füße im Ursprung). Glieder hängen von ihrem Gelenk nach unten (−y) – Schulter,
// Ellbogen, Hüfte, Knie werden je Bild gedreht. Alles weiß, die Farbe kommt je Person aus der Instanzfarbe.
function pedParts() {
  const W = '#ffffff', D = '#2a2226';
  const cap = (r, len, x, y, z, sx = 1, sz = 1) => colored(new THREE.CapsuleGeometry(r, len, 2, 8).scale(sx, 1, sz).translate(x, y, z), W);
  const ball = (r, sx, sy, sz, x, y, z, col = W, w = 10, h = 8) => colored(new THREE.SphereGeometry(r, w, h).scale(sx, sy, sz).translate(x, y, z), col);
  const cap0 = (k = 1) => colored(new THREE.SphereGeometry(0.119 * k, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.95, 1.03, 1.04).translate(0, 1.652, 0.008), W);
  return {
    torso: merge([cap(0.155, 0.27, 0, 1.2, 0, 1.32, 0.78)]),
    hips: merge([ball(0.15, 1.08, 0.62, 0.8, 0, 0.94, 0)]),
    head: merge([
      colored(new THREE.CylinderGeometry(0.046, 0.052, 0.12, 8).translate(0, 1.52, 0), W),
      ball(0.112, 0.93, 1.06, 1.0, 0, 1.64, 0, W, 14, 10),
      ball(0.022, 0.8, 1, 1.2, 0, 1.628, -0.108, W, 6, 4),
      ball(0.026, 0.5, 1, 0.8, -0.104, 1.64, 0.005, W, 6, 4), ball(0.026, 0.5, 1, 0.8, 0.104, 1.64, 0.005, W, 6, 4),
      ball(0.014, 1, 1, 0.6, -0.038, 1.668, -0.1, D, 6, 4), ball(0.014, 1, 1, 0.6, 0.038, 1.668, -0.1, D, 6, 4),
    ]),
    hair: [
      merge([cap0()]),                                                                                                  // kurz
      merge([cap0(1.02), cap(0.1, 0.17, 0, 1.53, 0.055, 1.08, 0.58)]),                                                  // lang
      merge([cap0(), ball(0.056, 1, 0.9, 1, 0, 1.73, 0.08)]),                                                            // Dutt
      merge([colored(new THREE.SphereGeometry(0.121, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.97, 0.95, 1.04).translate(0, 1.66, 0.006), W),
        colored(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 12, 1, false, Math.PI * 0.5, Math.PI).scale(1, 1, 0.85).translate(0, 1.668, -0.1), W)]), // Basecap
    ],
    upperArm: merge([cap(0.05, 0.2, 0, -0.15, 0)]),
    foreArm: merge([cap(0.041, 0.18, 0, -0.13, 0), ball(0.047, 0.75, 1.1, 0.55, 0, -0.29, 0, W, 7, 5)]),
    thigh: merge([cap(0.074, 0.3, 0, -0.21, 0)]),
    shin: merge([cap(0.059, 0.3, 0, -0.2, 0)]),
    shoe: merge([colored(new THREE.CapsuleGeometry(0.052, 0.13, 2, 6).rotateX(Math.PI / 2).scale(1.12, 0.78, 1).translate(0, -0.43, -0.045), W)]),
    skirt: merge([colored(new THREE.CylinderGeometry(0.165, 0.28, 0.44, 14).translate(0, 0.73, 0), W)]),
    bag: merge([cap(0.1, 0.17, 0, 1.22, 0.17, 1.25, 0.62)]),
  };
}

export class Pedestrians {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build(city);
  }

  build(city) {
    this.group.clear();
    for (const m of this.meshes ?? []) m.geometry.dispose();
    const rand = mulberry32(city.seed * 11 + 9), paths = { street: [], pier: [], promenade: [], park: [] };
    const add = (kind, pts, y = null) => { if (pts.length > 1) { const pl = new Polyline(pts, false); if (pl.length > 12) paths[kind].push({ pl, y }); } };
    // Gehwege beiderseits der Straßen (in Inselnähe)
    for (const r of city.roadNet.roads) {
      if (r.kind === 'connector') continue;
      const off = r.width / 2 - 1.1, L = r.pl.length, a = {};
      if (Math.hypot(r.pl.pts[0].x, r.pl.pts[0].z) > 520) continue;
      for (const side of [-1, 1]) {
        const pts = [];
        for (let s = 1; s < L - 1; s += 4) { r.pl.at(s, a); pts.push({ x: a.x - a.tz * side * off, z: a.z + a.tx * side * off }); }
        add('street', pts);
      }
    }
    // Uferpromenade rundum, Kanal-Uferwege
    const prom = [];
    for (let k = 0; k <= 400; k++) { const t = (k / 400) * Math.PI * 2, ux = Math.cos(t), uz = Math.sin(t), r = city.coastR(ux, uz) - 41.5; prom.push({ x: ux * r, z: uz * r }); }
    for (let k = 0; k < 8; k++) add('promenade', prom.slice(k * 50, k * 50 + 51));
    const cn = city.canal;
    if (cn) for (const s of [-1, 1]) add('street', [{ x: cn.x + s * 6.6, z: cn.z0 + 1 }, { x: cn.x + s * 6.6, z: cn.z1 - 1 }]);
    // Jahrmarkt: entlang der Flaniermeile und zwischen den Tischen
    const P = city.landmarkData?.pier;
    if (P) {
      const F = P.F, Wk = P.walk;
      for (const s of [Wk.s0 + 1.6, (Wk.s0 + Wk.s1) / 2 - 1, (Wk.s0 + Wk.s1) / 2 + 1.5, Wk.s1 - 1.6]) add('pier', [F.at(3, s), F.at(146, s)].map((p) => ({ x: p.x, z: p.z })), P.top);
      for (const s of [-4, 6, 16]) add('pier', [F.at(150, s), F.at(186, s)].map((p) => ({ x: p.x, z: p.z })), P.top);
      add('pier', [F.at(150, -20), F.at(150, 14)].map((p) => ({ x: p.x, z: p.z })), P.top);
    }
    for (const park of city.parks) for (const pl of park.paths ?? []) add('park', pl.pts.map((p) => ({ x: p.x, z: p.z })));
    // Personen: Weg, Tempo, Aussehen
    const peds = (this.peds = []), pick = (a) => a[Math.floor(rand() * a.length)];
    for (const [kind, n] of [['street', 70], ['pier', 46], ['promenade', 22], ['park', 14]]) {
      const list = paths[kind];
      if (!list.length) continue;
      for (let k = 0; k < n; k++) {
        const path = list[Math.floor(rand() * list.length)], skirt = rand() < 0.22;
        peds.push({
          path, s: rand() * path.pl.length, dir: rand() < 0.5 ? -1 : 1, speed: 1.05 + rand() * 0.55, lat: (rand() - 0.5) * 1.4,
          phase: rand() * 6.28, pause: 0, scale: 0.9 + rand() * 0.16, build: 0.9 + rand() * 0.22,
          shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), shoe: pick(SHOES),
          hair: skirt ? (rand() < 0.5 ? 1 : 2) : rand() < 0.55 ? 0 : rand() < 0.5 ? 3 : 1, hairCol: pick(HAIR), skirt: skirt ? pick(SKIRTS) : null,
          bag: rand() < 0.25 ? pick(BAGS) : null,
        });
      }
    }
    this.rand = rand;
    this.city = city;
    // Instanzen je Teil
    const parts = pedParts(), mat = toonMaterial('#ffffff', { vertexColors: true, rim: 0.22 }), n = peds.length, c = new THREE.Color();
    const mk = (g, count) => { const m = new THREE.InstancedMesh(g, mat, Math.max(1, count)); m.count = count; m.frustumCulled = false; m.castShadow = true; this.group.add(m); return m; };
    this.torso = mk(parts.torso, n);
    this.hips = mk(parts.hips, n);
    this.head = mk(parts.head, n);
    const counts = [0, 0, 0, 0];
    for (const p of peds) p.hairSlot = counts[p.hair]++;
    this.hair = parts.hair.map((g, k) => mk(g, counts[k]));
    this.upperArm = mk(parts.upperArm, n * 2);
    this.foreArm = mk(parts.foreArm, n * 2);
    this.thigh = mk(parts.thigh, n * 2);
    this.shin = mk(parts.shin, n * 2);
    this.shoe = mk(parts.shoe, n * 2);
    let ns = 0, nb = 0;
    for (const p of peds) { if (p.skirt) p.skirtSlot = ns++; if (p.bag) p.bagSlot = nb++; }
    this.skirt = mk(parts.skirt, ns);
    this.bag = mk(parts.bag, nb);
    this.meshes = [this.torso, this.hips, this.head, ...this.hair, this.upperArm, this.foreArm, this.thigh, this.shin, this.shoe, this.skirt, this.bag];
    peds.forEach((p, i) => {
      this.torso.setColorAt(i, c.set(p.shirt));
      this.hips.setColorAt(i, c.set(p.skirt ?? p.pants));
      this.head.setColorAt(i, c.set(p.skin));
      this.hair[p.hair].setColorAt(p.hairSlot, c.set(p.hair === 3 ? pick(SHIRTS) : p.hairCol));
      for (const j of [0, 1]) {
        this.upperArm.setColorAt(i * 2 + j, c.set(p.shirt));
        this.foreArm.setColorAt(i * 2 + j, c.set(p.skin));
        this.thigh.setColorAt(i * 2 + j, c.set(p.skirt ? p.skin : p.pants));
        this.shin.setColorAt(i * 2 + j, c.set(p.skirt ? p.skin : p.pants));
        this.shoe.setColorAt(i * 2 + j, c.set(p.shoe));
      }
      if (p.skirt) this.skirt.setColorAt(p.skirtSlot, c.set(p.skirt));
      if (p.bag) this.bag.setColorAt(p.bagSlot, c.set(p.bag));
    });
  }

  hide(p, i) {
    this.torso.setMatrixAt(i, ZERO); this.hips.setMatrixAt(i, ZERO); this.head.setMatrixAt(i, ZERO); this.hair[p.hair].setMatrixAt(p.hairSlot, ZERO);
    for (const j of [0, 1]) for (const m of [this.upperArm, this.foreArm, this.thigh, this.shin, this.shoe]) m.setMatrixAt(i * 2 + j, ZERO);
    if (p.skirt) this.skirt.setMatrixAt(p.skirtSlot, ZERO);
    if (p.bag) this.bag.setMatrixAt(p.bagSlot, ZERO);
  }

  update(dt, camPos) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    const a = {}, T = this.city.terrain;
    this.peds.forEach((p, i) => {
      const L = p.path.pl.length;
      if (p.pause > 0) p.pause -= dt;
      else {
        p.s += p.dir * p.speed * dt;
        p.phase += dt * p.speed * 3.9;
        if (p.s < 0 || p.s > L) { p.s = Math.max(0, Math.min(L, p.s)); p.dir *= -1; if (this.rand() < 0.5) p.pause = 1 + this.rand() * 3; }
        else if (this.rand() < dt * 0.04) p.pause = 2 + this.rand() * 4; // stehen bleiben, schauen
      }
      p.path.pl.at(p.s, a);
      const x = a.x - a.tz * p.lat, z = a.z + a.tx * p.lat;
      if ((x - camPos.x) ** 2 + (z - camPos.z) ** 2 > 260 * 260) { this.hide(p, i); return; }
      const walk = p.pause <= 0 ? 1 : 0, y = p.path.y ?? T.height(x, z, true), k = p.scale, b = p.build;
      const yaw = Math.atan2(-a.tx * p.dir, -a.tz * p.dir), bob = walk * 0.03 * Math.abs(Math.cos(p.phase));
      _root.compose(_p.set(x, y + bob, z), _q.setFromAxisAngle(UP, yaw), _s.set(k, k, k));
      _body.multiplyMatrices(_root, _t.makeScale(b, 1, b));
      this.torso.setMatrixAt(i, _body);
      this.hips.setMatrixAt(i, _body);
      this.head.setMatrixAt(i, _root);
      this.hair[p.hair].setMatrixAt(p.hairSlot, _root);
      if (p.skirt) this.skirt.setMatrixAt(p.skirtSlot, _body);
      if (p.bag) this.bag.setMatrixAt(p.bagSlot, _body);
      for (const j of [0, 1]) {
        const side = j ? 1 : -1, ph = p.phase + (j ? Math.PI : 0), sn = Math.sin(ph);
        // Bein: Oberschenkel schwingt, das Knie beugt sich beim Vorschwingen; Schuh sitzt am Schienbein
        _j1.multiplyMatrices(_root, _t.makeTranslation(side * 0.09 * b, 0.93, 0)).multiply(_t.makeRotationX(walk * 0.48 * sn));
        this.thigh.setMatrixAt(i * 2 + j, _j1);
        _j2.multiplyMatrices(_j1, _t.makeTranslation(0, -0.42, 0)).multiply(_t.makeRotationX(-(0.06 + walk * 0.85 * Math.max(0, Math.cos(ph)))));
        this.shin.setMatrixAt(i * 2 + j, _j2);
        this.shoe.setMatrixAt(i * 2 + j, _j2);
        // Arm: schwingt gegengleich zum Bein derselben Seite, der Ellbogen beugt sich beim Vorschwingen etwas mehr
        _j1.multiplyMatrices(_root, _t.makeTranslation(side * 0.215 * b, 1.4, 0)).multiply(_t.makeRotationX(-walk * 0.36 * sn)).multiply(_t.makeRotationZ(side * 0.07));
        this.upperArm.setMatrixAt(i * 2 + j, _j1);
        _j2.multiplyMatrices(_j1, _t.makeTranslation(0, -0.29, 0)).multiply(_t.makeRotationX(0.14 + walk * 0.4 * Math.max(0, -sn)));
        this.foreArm.setMatrixAt(i * 2 + j, _j2);
      }
    });
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
