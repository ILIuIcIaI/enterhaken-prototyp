import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Polyline } from './geom2d.js';
import { toonMaterial } from './toon.js';
import { mulberry32 } from './rng.js';
import { TRACK_Y } from './citygen.js';
import { Mover, colored, box } from './mover.js';
import { Ships, RoofCranes, HarborTraffic } from './harbor.js';
import { Amusement } from './amusement.js';
import { Airship, Balloons, WindTurbines } from './aerial.js';

// Bewegte Ziele für den Enterhaken: Hochbahn auf fester Strecke (mit Halt in zwei Bahnhöfen) und
// Flugzeuge auf weiten, ruhigen Schleifen über der Insel. Alle Bewegungen sind reine Funktionen der Zeit –
// Physik (Seilanker) und Darstellung fragen dieselbe Pose ab, dadurch bleibt der Haken exakt am Objekt.

const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ Hochbahn
class Train {
  constructor(scene, city) {
    this.track = city.track;
    this.cars = 4;
    this.carLen = 15;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildSchedule(city);
    const body = mergeGeometries([
      colored(box(3.0, 3.1, this.carLen - 0.6, 0, 1.95, 0), '#d8dce4'),
      colored(box(3.04, 0.42, this.carLen - 0.5, 0, 1.05, 0), '#2a6fd0'),
      colored(box(3.06, 0.14, this.carLen - 0.5, 0, 3.0, 0), '#2a6fd0'),
      colored(box(2.6, 0.35, this.carLen - 1.6, 0, 3.62, 0), '#9aa0ac'),
      colored(box(2.4, 0.5, 2.2, 0, 0.45, -this.carLen / 2 + 3), '#22242a'),
      colored(box(2.4, 0.5, 2.2, 0, 0.45, this.carLen / 2 - 3), '#22242a'),
    ]);
    const glow = new THREE.Color(2.4, 1.9, 1.3);
    const win = mergeGeometries([colored(box(3.08, 0.95, this.carLen - 2.4, 0, 2.15, 0), '#ffffff')]);
    const front = mergeGeometries([colored(box(0.5, 0.25, 0.06, -0.9, 1.25, -this.carLen / 2 + 0.28), '#ffffff'), colored(box(0.5, 0.25, 0.06, 0.9, 1.25, -this.carLen / 2 + 0.28), '#ffffff')]);
    const bodyMat = toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 });
    const winMat = new THREE.MeshBasicMaterial({ color: glow });
    const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3) });
    this.movers = [];
    this.meshes = [];
    for (let i = 0; i < this.cars; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, bodyMat);
      b.castShadow = true;
      g.add(b, new THREE.Mesh(win, winMat));
      if (i === 0) g.add(new THREE.Mesh(front, lightMat));
      if (i === this.cars - 1) { const r = new THREE.Mesh(front, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.15) })); r.rotation.y = Math.PI; g.add(r); }
      this.group.add(g);
      this.meshes.push(g);
      const half = this.carLen / 2 - 0.3;
      this.movers.push(new Mover('train', [{ min: new THREE.Vector3(-1.5, 0.4, -half), max: new THREE.Vector3(1.5, 3.8, half) }]));
    }
  }

  // Fahrplan als Tabelle s(t): anfahren, fahren, bremsen, halten – periodisch über eine Runde
  buildSchedule(city) {
    const L = this.track.length, V = 17, A = 0.9, dwell = 9;
    const stops = city.stations.map((s) => s.s).sort((a, b) => a - b);
    const legs = stops.map((s, i) => ((stops[(i + 1) % stops.length] - s + L) % L) || L);
    const t = [0], s = [stops[0]];
    let time = 0, pos = stops[0];
    const dt = 0.1;
    for (const leg of legs) {
      for (let k = 0; k < dwell / dt; k++) { time += dt; t.push(time); s.push(pos); }
      let v = 0, done = 0;
      while (done < leg - 0.01) {
        const rest = leg - done;
        const brake = (v * v) / (2 * A);
        v = rest <= brake + 0.2 ? Math.max(0.6, v - A * dt) : Math.min(V, v + A * dt);
        done = Math.min(leg, done + v * dt);
        time += dt;
        t.push(time);
        s.push(pos + done);
      }
      pos += leg;
    }
    this.period = time;
    this.tTab = t;
    this.sTab = s;
  }

  sAt(time) {
    const tt = ((time % this.period) + this.period) % this.period;
    const i = Math.min(this.tTab.length - 2, Math.floor(tt / 0.1));
    const u = (tt - this.tTab[i]) / Math.max(1e-6, this.tTab[i + 1] - this.tTab[i]);
    return this.sTab[i] + (this.sTab[i + 1] - this.sTab[i]) * Math.min(1, Math.max(0, u));
  }

  update(time, dt) {
    const s0 = this.sAt(time);
    const a = {}, b = {};
    for (let i = 0; i < this.cars; i++) {
      const sc = s0 - i * (this.carLen + 0.8);
      this.track.at(sc + 5.5, a);
      this.track.at(sc - 5.5, b);
      const m = this.movers[i];
      const px = m.pos.x, pz = m.pos.z;
      m.pos.set((a.x + b.x) / 2, TRACK_Y, (a.z + b.z) / 2);
      m.quat.setFromAxisAngle(UP, Math.atan2(-(a.x - b.x), -(a.z - b.z)));
      if (dt > 0) m.vel.set((m.pos.x - px) / dt, 0, (m.pos.z - pz) / dt);
    }
  }

  render() {
    this.meshes.forEach((g, i) => { g.position.copy(this.movers[i].pos); g.quaternion.copy(this.movers[i].quat); });
  }
}

// ------------------------------------------------------------------ Flugzeuge
// Jedes Flugzeug fliegt eine eigene weite Schleife. Die Höhe folgt einem gemeinsamen Sicherheitsprofil
// über den Gebäuden plus einem festen Abstand je Flugzeug (55 m) – so können sich zwei Flugzeuge nie
// begegnen, auch wenn sich ihre Bahnen im Grundriss kreuzen.
class Planes {
  constructor(scene, city, count = 3) {
    const rand = mulberry32(city.seed * 13 + 5);
    this.group = new THREE.Group();
    scene.add(this.group);
    // Sicherheitsprofil: höchstes Gebäude je Radiusring + Abstand, nach außen nie ansteigend
    const bins = new Float32Array(32);
    for (const b of city.boxes) {
      const r = Math.hypot((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
      const k = Math.min(31, Math.floor(r / 25));
      bins[k] = Math.max(bins[k], b.maxY);
    }
    this.clear = new Float32Array(32);
    let run = 0;
    for (let k = 31; k >= 0; k--) { run = Math.max(run, bins[k], k + 1 < 32 ? bins[k + 1] : 0); this.clear[k] = Math.max(170, run + 55); }
    this.planes = [];
    const colors = ['#2a6fd0', '#d0402a', '#1fa38a'];
    for (let i = 0; i < count; i++) {
      const cx = (rand() - 0.5) * 220, cz = (rand() - 0.5) * 220, rot = rand() * Math.PI;
      const A = 520 + i * 95 + rand() * 60, Bv = 360 + i * 70 + rand() * 60, w = 0.08 + rand() * 0.05, ph = rand() * 6.28;
      const pts = [];
      for (let k = 0; k < 400; k++) {
        const th = (k / 400) * Math.PI * 2 * (i % 2 ? -1 : 1);
        const r = 1 + w * Math.sin(3 * th + ph);
        const x = Math.cos(th) * A * r, z = Math.sin(th) * Bv * r;
        pts.push({ x: cx + x * Math.cos(rot) - z * Math.sin(rot), z: cz + x * Math.sin(rot) + z * Math.cos(rot) });
      }
      const path = new Polyline(pts, true);
      const mesh = this.model(colors[i % colors.length]);
      this.group.add(mesh);
      const mover = new Mover('plane', [
        { min: new THREE.Vector3(-1.9, -1.9, -15), max: new THREE.Vector3(1.9, 1.9, 14) },
        { min: new THREE.Vector3(-13, -0.5, -2.5), max: new THREE.Vector3(13, 0.4, 2.2) },
        { min: new THREE.Vector3(-5, -0.2, 10.5), max: new THREE.Vector3(5, 0.3, 13.5) },
      ]);
      this.planes.push({ path, speed: 38 + i * 5, phase: rand() * path.length, layer: i * 55, mesh, mover, bank: 0 });
    }
    this.movers = this.planes.map((p) => p.mover);
  }

  model(stripe) {
    const g = new THREE.Group();
    const body = mergeGeometries([
      colored(new THREE.CylinderGeometry(1.75, 1.75, 22, 16).rotateX(Math.PI / 2), '#e8eaf0'),
      colored(new THREE.SphereGeometry(1.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 2.2).translate(0, 0, -11), '#e8eaf0'),
      colored(new THREE.ConeGeometry(1.75, 6, 16).rotateX(Math.PI / 2).translate(0, 0.5, 14), '#e8eaf0'),
      colored(box(26, 0.35, 4.2, 0, -0.6, -0.5), '#cfd3dc'),
      colored(box(10, 0.25, 2.4, 0, 0.6, 13.2), '#cfd3dc'),
      colored(box(0.35, 5, 3.4, 0, 3.2, 13.4), stripe),
      colored(box(3.62, 0.5, 22, 0, -0.2, 0.5), stripe),
      colored(new THREE.CylinderGeometry(0.8, 0.9, 4.2, 12).rotateX(Math.PI / 2).translate(-5.5, -1.4, -1.2), '#9aa0ac'),
      colored(new THREE.CylinderGeometry(0.8, 0.9, 4.2, 12).rotateX(Math.PI / 2).translate(5.5, -1.4, -1.2), '#9aa0ac'),
    ]);
    const m = new THREE.Mesh(body, toonMaterial('#ffffff', { vertexColors: true, rim: 0.35 }));
    m.castShadow = true;
    const win = new THREE.Mesh(box(3.58, 0.35, 17, 0, 0.55, -0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.2) }));
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6).translate(-13, -0.55, -0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), fog: false }));
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6).translate(13, -0.55, -0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 6, 0.8), fog: false }));
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 5.8, 14.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 8), fog: false }));
    g.add(m, win, red, green, strobe);
    g.userData.strobe = strobe;
    return g;
  }

  height(x, z) {
    const r = Math.hypot(x, z) / 25;
    const k = Math.min(30, Math.floor(r)), u = Math.min(1, r - k);
    return this.clear[k] + (this.clear[k + 1] - this.clear[k]) * u;
  }

  update(time, dt) {
    const a = {}, b = {}, c = {};
    for (const p of this.planes) {
      const s = p.phase + p.speed * time;
      p.path.at(s, a);
      p.path.at(s + 12, b);
      p.path.at(s - 12, c);
      const y = this.height(a.x, a.z) + p.layer, yb = this.height(b.x, b.z) + p.layer;
      // Querneigung aus der Kurvenkrümmung (koordinierte Kurve), Nicken aus Steig-/Sinkflug
      const turn = Math.atan2(b.tz, b.tx) - Math.atan2(c.tz, c.tx);
      const kappa = Math.atan2(Math.sin(turn), Math.cos(turn)) / 24;
      const bankT = Math.max(-0.5, Math.min(0.5, Math.atan((p.speed * p.speed * kappa) / 9.81)));
      p.bank = bankT;
      const m = p.mover;
      const px = m.pos.x, py = m.pos.y, pz = m.pos.z;
      m.pos.set(a.x, y, a.z);
      _v.set(a.tx, (yb - y) / 12, a.tz).normalize();
      _m.lookAt(_o.set(0, 0, 0), _v, UP);
      m.quat.setFromRotationMatrix(_m);
      m.quat.multiply(_q.setFromAxisAngle(_d.set(0, 0, 1), bankT));
      if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
    }
  }

  render(time) {
    for (const p of this.planes) {
      p.mesh.position.copy(p.mover.pos);
      p.mesh.quaternion.copy(p.mover.quat);
      p.mesh.userData.strobe.visible = time % 1.4 < 0.08;
    }
  }
}

export class Transit {
  constructor(scene, city) {
    this.scene = scene;
    this.build(city);
    this.hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), local: new THREE.Vector3(), mover: null };
  }

  build(city) {
    if (this.train) { this.scene.remove(this.train.group, this.planes.group, this.ships.group, this.cranes.group, this.harbor.group, this.amusement.group, this.airship.group, this.balloons.group, this.turbines.group); }
    this.train = new Train(this.scene, city);
    this.planes = new Planes(this.scene, city, 3);
    this.ships = new Ships(this.scene, city);
    this.cranes = new RoofCranes(this.scene, city);
    this.harbor = new HarborTraffic(this.scene, city);
    this.amusement = new Amusement(this.scene, city);
    this.airship = new Airship(this.scene, this.planes);
    this.balloons = new Balloons(this.scene, city);
    this.turbines = new WindTurbines(this.scene, city);
    this.movers = [
      ...this.train.movers, ...this.planes.movers, ...this.ships.movers, ...this.cranes.movers, ...this.harbor.movers,
      ...this.amusement.movers, ...this.airship.movers, ...this.balloons.movers, ...this.turbines.movers,
    ];
    this.update(0, 0);
  }

  update(time, dt) {
    this.train.update(time, dt);
    this.planes.update(time, dt);
    this.ships.update(time, dt);
    this.cranes.update(time);
    this.harbor.update(time, dt);
    this.amusement.update(time, dt);
    this.airship.update(time, dt);
    this.balloons.update(time, dt);
    this.turbines.update(time);
  }

  render(time) {
    this.train.render();
    this.planes.render(time);
    this.ships.render();
    this.cranes.render();
    this.harbor.render();
    this.amusement.render(time);
    this.airship.render(time);
    this.balloons.render(time);
    this.turbines.render();
  }

  raycast(origin, dir, maxDist) {
    let best = maxDist, found = null;
    const h = this.hit;
    for (const m of this.movers) {
      if (m.pos.distanceToSquared(origin) > (best + (m.radius ?? 30)) ** 2) continue; // lange Objekte: Schiffe, Luftschiff
      const tmp = this._tmp ?? (this._tmp = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), local: new THREE.Vector3(), mover: null });
      if (m.raycast(origin, dir, best, tmp) && tmp.dist < best) {
        best = tmp.dist;
        h.dist = tmp.dist; h.point.copy(tmp.point); h.normal.copy(tmp.normal); h.local.copy(tmp.local); h.mover = m;
        found = h;
      }
    }
    return found;
  }
}
