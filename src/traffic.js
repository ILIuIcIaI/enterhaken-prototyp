import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Polyline, bezier } from './geom2d.js';
import { toonMaterial } from './toon.js';
import { mulberry32 } from './rng.js';

// Straßenverkehr: Autos und Busse fahren rechts auf Fahrspuren des Straßennetzes, halten Abstand
// (Intelligent-Driver-Modell), stoppen an Ampeln (jede Zufahrt hat eine eigene Grünphase, dadurch
// kreuzen sich nie zwei Fahrwege) und warten an Einmündungen ohne Ampel, bis die Kreuzung frei ist.

const PAINT = ['#c8323c', '#2f5fb3', '#e8e4dc', '#1d1f24', '#7a8088', '#2f8a6a', '#d8a23a', '#6a3a8a', '#b8bcc4', '#8a2a2a', '#3a9ac0', '#d86a2a'];
const BUS_PAINT = ['#2f6fd8', '#d84a2f', '#2fa87a'];
const GREEN = 6.5, CLEAR = 1.8;

function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

// Fahrzeugmodelle (Länge entlang -z = vorne): lackierte Teile, dunkle Teile (Scheiben, Reifen), Lichter
function carModel(kind) {
  const paint = [], dark = [], lights = [];
  const L = kind === 'bus' ? 11.5 : kind === 'van' ? 5.0 : kind === 'hatch' ? 3.9 : 4.5;
  const W = kind === 'bus' ? 2.5 : 1.8;
  if (kind === 'bus') {
    paint.push(box(W, 2.6, L, 0, 1.75, 0));
    dark.push(box(W + 0.02, 0.9, L - 1.6, 0, 2.15, 0.3), box(W - 0.2, 1.2, 0.05, 0, 2.0, -L / 2 - 0.01));
  } else {
    const cabH = kind === 'van' ? 1.0 : 0.62, cabL = kind === 'van' ? L * 0.78 : L * (kind === 'hatch' ? 0.62 : 0.52);
    paint.push(box(W, 0.62, L, 0, 0.66, 0));
    paint.push(box(W - 0.12, cabH, cabL, 0, 0.97 + cabH / 2, kind === 'van' ? 0.25 : 0.15));
    dark.push(box(W - 0.08, cabH * 0.72, cabL + 0.04, 0, 0.99 + cabH * 0.42, kind === 'van' ? 0.25 : 0.15));
    if (kind === 'taxi') paint.push(box(0.55, 0.18, 0.28, 0, 1.0 + cabH + 0.1, 0.15));
  }
  const wr = kind === 'bus' ? 0.52 : 0.34;
  for (const sx of [-1, 1]) {
    for (const sz of kind === 'bus' ? [-L * 0.32, L * 0.34] : [-L * 0.32, L * 0.32]) {
      dark.push(new THREE.CylinderGeometry(wr, wr, 0.26, 10).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.08), wr, sz));
    }
    lights.push(box(0.36, 0.16, 0.05, sx * (W / 2 - 0.3), kind === 'bus' ? 0.9 : 0.72, -L / 2 - 0.02));
  }
  const color = (geos, c) => geos.map((g) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  const white = new THREE.Color(3.5, 3.2, 2.6), red = new THREE.Color(3.2, 0.25, 0.2);
  const tail = [];
  for (const sx of [-1, 1]) tail.push(box(0.4, 0.16, 0.05, sx * (W / 2 - 0.28), kind === 'bus' ? 0.9 : 0.75, L / 2 + 0.02));
  if (kind === 'taxi') tail.push(box(0.5, 0.14, 0.3, 0, 1.73, 0.15));
  const strip = (g) => mergeGeometries(g.map((x) => x.toNonIndexed()));
  return {
    L, W,
    paint: strip(paint),
    dark: strip(dark),
    lights: mergeGeometries([...color(lights, white), ...color(tail, kind === 'taxi' ? new THREE.Color(3.4, 2.6, 0.6) : red)].map((x) => x.toNonIndexed())),
  };
}

export class Traffic {
  constructor(scene, city, count = 150) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build(city, count);
  }

  build(city, count) {
    for (const c of this.group.children) c.geometry.dispose();
    this.group.clear();
    const rand = mulberry32(city.seed * 7 + 3);
    const net = city.roadNet;
    this.lanes = [];
    this.nodeLanes = new Map(); // Knoten → ankommende Spuren
    // Spuren (rechts fahren), an Kreuzungen gekürzt
    const trim = (n) => (n.roads.length >= 3 ? 8.6 : n.roads.length === 1 ? 4 : 0);
    for (const r of net.roads) {
      const off = (r.width - (r.kind === 'local' ? 3.6 : 5)) / 4;
      for (const dir of [1, -1]) {
        const src = dir > 0 ? r.pl.pts : [...r.pl.pts].reverse();
        const from = dir > 0 ? r.a : r.b, to = dir > 0 ? r.b : r.a;
        const base = new Polyline(src);
        const t0 = trim(from), t1 = trim(to);
        if (base.length < t0 + t1 + 3) continue;
        const pts = [];
        const p = {};
        const n = Math.max(2, Math.ceil((base.length - t0 - t1) / 3));
        for (let i = 0; i <= n; i++) {
          base.at(t0 + ((base.length - t0 - t1) * i) / n, p);
          pts.push({ x: p.x - p.tz * off, z: p.z + p.tx * off });
        }
        const lane = { id: this.lanes.length, road: r, from, to, pl: new Polyline(pts), cars: [], moves: [], speed: r.kind === 'local' ? 8.5 : r.kind === 'boulevard' ? 14 : 12.5, bus: r.kind !== 'local' };
        this.lanes.push(lane);
        if (!this.nodeLanes.has(to)) this.nodeLanes.set(to, []);
        this.nodeLanes.get(to).push(lane);
      }
    }
    // Fahrwege über die Knoten: geradeaus und rechts; links nur an Ampeln; Wenden nur in Sackgassen
    const out = new Map();
    for (const l of this.lanes) {
      if (!out.has(l.from)) out.set(l.from, []);
      out.get(l.from).push(l);
    }
    const a = {}, b = {};
    for (const l of this.lanes) {
      const n = l.to;
      const outs = out.get(n) ?? [];
      l.pl.at(l.pl.length, a);
      const cand = [];
      for (const o of outs) {
        o.pl.at(0, b);
        const cross = a.tx * b.tz - a.tz * b.tx, dot = a.tx * b.tx + a.tz * b.tz;
        const uturn = o.road === l.road;
        let type = dot > 0.8 ? 'straight' : cross > 0 ? 'right' : 'left';
        if (uturn) type = 'uturn';
        cand.push({ o, type });
      }
      let ok = cand.filter((c) => c.type === 'straight' || c.type === 'right' || (c.type === 'left' && n.signal) || (n.roads.length === 2 && c.type !== 'uturn'));
      if (!ok.length) ok = cand.filter((c) => c.type !== 'uturn');
      if (!ok.length) ok = cand;
      for (const { o, type } of ok) {
        const p0 = { x: a.x, z: a.z }, p3 = { x: b.x, z: b.z };
        let pts;
        const d = Math.hypot(p3.x - p0.x, p3.z - p0.z);
        if (d < 0.5) pts = [p0, p3];
        else {
          const k = type === 'uturn' ? 6 : d * 0.45;
          pts = bezier(p0, { x: p0.x + a.tx * k, z: p0.z + a.tz * k }, { x: p3.x - b.tx * k, z: p3.z - b.tz * k }, p3, 1.5);
        }
        l.moves.push({ from: l, to: o, pl: new Polyline(pts), cars: [], type, node: n, speed: type === 'straight' ? l.speed : 6 });
      }
    }
    // keine Fahrwege in Spuren, die selbst nirgendwo hinführen
    for (let it = 0; it < 4; it++) for (const l of this.lanes) l.moves = l.moves.filter((m) => m.to.moves.length > 0);
    // Ampeln: je Knoten eine Liste der Zufahrten, reihum grün
    this.signals = [];
    for (const n of net.nodes) {
      const ins = this.nodeLanes.get(n) ?? [];
      n.box = 0;
      n.approaches = ins;
      if (n.signal && ins.length) {
        n.cycle = ins.length * (GREEN + CLEAR);
        n.offset = rand() * n.cycle;
        this.signals.push(n);
      }
    }

    // Fahrzeuge
    const models = { sedan: carModel('sedan'), hatch: carModel('hatch'), van: carModel('van'), taxi: carModel('taxi'), bus: carModel('bus') };
    this.models = models;
    this.cars = [];
    const lanesBus = this.lanes.filter((l) => l.bus && l.moves.length);
    const lanesAll = this.lanes.filter((l) => l.moves.length);
    const kinds = ['sedan', 'sedan', 'hatch', 'hatch', 'van', 'taxi'];
    const nBus = Math.round(count * 0.07);
    for (let i = 0; i < count; i++) {
      const kind = i < nBus ? 'bus' : kinds[Math.floor(rand() * kinds.length)];
      const pool = kind === 'bus' ? lanesBus : lanesAll;
      for (let tries = 0; tries < 20; tries++) {
        const lane = pool[Math.floor(rand() * pool.length)];
        const s = 3 + rand() * Math.max(0, lane.pl.length - 6);
        if (lane.cars.some((c) => Math.abs(c.s - s) < 14)) continue;
        const color = kind === 'taxi' ? new THREE.Color('#e8b81a') : new THREE.Color(kind === 'bus' ? BUS_PAINT[i % 3] : PAINT[Math.floor(rand() * PAINT.length)]);
        const car = { kind, L: models[kind].L, seg: lane, s, v: lane.speed * 0.6, next: null, color, seed: rand(), x: 0, z: 0, tx: 0, tz: -1 };
        lane.cars.push(car);
        this.pickNext(car, rand);
        this.cars.push(car);
        break;
      }
    }
    for (const l of this.lanes) l.cars.sort((p, q) => p.s - q.s);
    this.rand = rand;

    // Instanzen je Modell: Lack (Instanzfarbe), dunkle Teile, leuchtende Lichter
    this.meshes = {};
    const paintMat = toonMaterial('#ffffff', { rim: 0.25 });
    const darkMat = toonMaterial('#15161c', { rim: 0.1 });
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (const [kind, m] of Object.entries(models)) {
      const n = Math.max(1, this.cars.filter((c) => c.kind === kind).length);
      const mk = (geo, mat) => {
        const im = new THREE.InstancedMesh(geo, mat, n);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false;
        this.group.add(im);
        return im;
      };
      const paint = mk(m.paint, paintMat), dark = mk(m.dark, darkMat), lights = mk(m.lights, lightMat);
      paint.castShadow = true;
      this.meshes[kind] = { paint, dark, lights, n: 0 };
    }
    for (const car of this.cars) {
      const M = this.meshes[car.kind];
      car.slot = M.n++;
      M.paint.setColorAt(car.slot, car.color);
      // Kollisionskörper wie bei Zug und Flugzeug: Kaia kann aufs Dach springen und mitfahren
      const m = models[car.kind], h = car.kind === 'bus' ? 3.05 : car.kind === 'van' ? 2.0 : 1.62;
      car.mover = {
        kind: car.kind === 'bus' ? 'bus' : 'car', pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(),
        boxes: [{ min: new THREE.Vector3(-m.W / 2, 0.15, -m.L / 2), max: new THREE.Vector3(m.W / 2, h, m.L / 2) }],
        worldPoint(local, out) { return out.copy(local).applyQuaternion(this.quat).add(this.pos); },
      };
    }
    this.movers = this.cars.map((c) => c.mover);
    for (const M of Object.values(this.meshes)) {
      M.paint.count = M.dark.count = M.lights.count = M.n;
      if (M.paint.instanceColor) M.paint.instanceColor.needsUpdate = true;
    }
    // Ampelmasten an jeder Zufahrt: Mast + leuchtendes Signal (Farbe je Frame)
    this.heads = [];
    for (const n of this.signals) {
      for (const l of n.approaches) {
        const e = l.pl.at(l.pl.length);
        this.heads.push({ n, l, x: e.x - e.tz * 3.4, z: e.z + e.tx * 3.4, a: Math.atan2(-e.tx, -e.tz) });
      }
    }
    if (this.heads.length) {
      const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 4.2, 0.14).translate(0, 2.1, 0), toonMaterial('#24222c', { rim: 0 }), this.heads.length);
      const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.32, 0.12).translate(0, 4.0, 0.12), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.heads.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      this.heads.forEach((h, i) => {
        m.compose(p.set(h.x, 0, h.z), q.setFromAxisAngle(UP, h.a), one);
        pole.setMatrixAt(i, m);
        lamp.setMatrixAt(i, m);
        lamp.setColorAt(i, new THREE.Color(3, 0.2, 0.1));
      });
      this.group.add(pole, lamp);
      this.lampMesh = lamp;
    }
    this.cGreen = new THREE.Color(0.3, 3.2, 0.9);
    this.cAmber = new THREE.Color(3.4, 1.8, 0.2);
    this.cRed = new THREE.Color(3.2, 0.15, 0.1);

    this.time = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._e = new THREE.Euler();
  }

  pickNext(car, rand) {
    const lane = car.seg;
    let moves = lane.moves;
    if (car.kind === 'bus') {
      const big = moves.filter((m) => m.to.bus);
      if (big.length) moves = big;
    } else {
      const noLocal = moves.filter((m) => m.to.road.kind !== 'local');
      if (noLocal.length && rand() < 0.65) moves = noLocal;
    }
    const straight = moves.filter((m) => m.type === 'straight');
    car.next = straight.length && rand() < 0.55 ? straight[Math.floor(rand() * straight.length)] : moves[Math.floor(rand() * moves.length)];
  }

  // Grün für diese Zufahrt?
  green(node, lane) {
    if (!node.signal) return true;
    const t = (this.time + node.offset) % node.cycle;
    const k = Math.floor(t / (GREEN + CLEAR));
    return node.approaches[k] === lane && t - k * (GREEN + CLEAR) < GREEN;
  }

  canEnter(car) {
    const mv = car.next;
    if (!mv) return false;
    const n = mv.node;
    if (n.roads.length <= 2) return true;
    // Kreuzung nicht blockieren: hinter der Kreuzung muss Platz sein
    const head = mv.to.cars[0];
    if (head && head.s - head.L / 2 < car.L + 3) return false;
    if (n.signal) return this.green(n, car.seg);
    return n.box === 0;
  }

  // Abstand zum Vordermann (oder zur Haltelinie) entlang des eigenen Weges
  gap(car, player) {
    const seg = car.seg;
    const list = seg.cars;
    const i = list.indexOf(car);
    const front = car.s + car.L / 2;
    let gap = Infinity, vl = 0;
    if (i + 1 < list.length) {
      const o = list[i + 1];
      gap = o.s - o.L / 2 - front; vl = o.v;
    } else {
      const rest = seg.pl.length - front;
      const isLane = !!seg.moves;
      if (isLane) {
        if (!car.committed) {
          // einfahren bei Grün/freier Kreuzung – oder wenn Anhalten nicht mehr sanft möglich ist (Gelb)
          if (this.canEnter(car) || (car.v > 4 && rest < (car.v * car.v) / 7 && car.next)) car.committed = true;
        }
        if (!car.committed) { gap = rest - 0.6; vl = 0; }
        else {
          const mv = car.next;
          const tail = mv.cars[mv.cars.length - 1];
          if (tail) { gap = rest + tail.s - tail.L / 2; vl = tail.v; }
          else {
            const t2 = mv.to.cars[0];
            if (t2) { gap = rest + mv.pl.length + t2.s - t2.L / 2; vl = t2.v; }
          }
        }
      } else {
        const t2 = seg.to.cars[0];
        if (t2) { gap = rest + t2.s - t2.L / 2; vl = t2.v; }
      }
    }
    // Spieler auf der Fahrbahn: abbremsen
    if (player) {
      const dx = player.x - car.x, dz = player.z - car.z;
      const ahead = dx * car.tx + dz * car.tz, lat = Math.abs(-dx * car.tz + dz * car.tx);
      if (ahead > 0 && ahead < 25 && lat < 1.9) {
        const g = ahead - car.L / 2 - 1.2;
        if (g < gap) { gap = g; vl = 0; }
      }
    }
    return [gap, vl];
  }

  update(dt, playerPos) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const near = playerPos && playerPos.y < 3 ? { x: playerPos.x, z: playerPos.z } : null;
    const A = 1.5, Bc = 3.0, s0 = 2.2, Th = 1.1;
    for (const car of this.cars) {
      const v0 = car.seg.speed * (car.kind === 'bus' ? 0.85 : 0.9 + car.seed * 0.2);
      const p = near && Math.abs(near.x - car.x) < 30 && Math.abs(near.z - car.z) < 30 ? near : null;
      const [gap, vl] = this.gap(car, p);
      const ss = s0 + Math.max(0, car.v * Th + (car.v * (car.v - vl)) / (2 * Math.sqrt(A * Bc)));
      let acc = A * (1 - (car.v / v0) ** 4 - (gap > 0 ? (ss / gap) ** 2 : 100));
      acc = Math.max(-9, acc);
      car.v = Math.max(0, car.v + acc * dt);
      if (gap < 0.3) car.v = Math.min(car.v, Math.max(0, gap) * 2);
      car.s += car.v * dt;
    }
    // Segmentwechsel
    for (const car of this.cars) {
      let guard = 0;
      while (car.s > car.seg.pl.length && guard++ < 3) {
        const seg = car.seg;
        const over = car.s - seg.pl.length;
        seg.cars.splice(seg.cars.indexOf(car), 1);
        if (seg.moves) {
          // Spur zu Ende → in den Knoten
          const mv = car.next;
          mv.cars.push(car);
          mv.node.box++;
          car.seg = mv;
          car.committed = false;
        } else {
          seg.node.box--;
          const lane = seg.to;
          lane.cars.unshift(car);
          car.seg = lane;
          this.pickNext(car, this.rand);
        }
        car.s = over;
      }
    }
    for (const l of this.lanes) if (l.cars.length > 1) l.cars.sort((a, b) => a.s - b.s);
    this.render();
  }

  render() {
    const m = this._m, q = this._q, p = this._p, s = this._s;
    const at = {};
    for (const car of this.cars) {
      car.seg.pl.at(car.s, at);
      car.x = at.x; car.z = at.z; car.tx = at.tx; car.tz = at.tz;
      p.set(at.x, 0, at.z);
      q.setFromAxisAngle(UP, Math.atan2(-at.tx, -at.tz));
      m.compose(p, q, s);
      car.mover.pos.copy(p);
      car.mover.quat.copy(q);
      car.mover.vel.set(at.tx * car.v, 0, at.tz * car.v);
      const M = this.meshes[car.kind];
      M.paint.setMatrixAt(car.slot, m);
      M.dark.setMatrixAt(car.slot, m);
      M.lights.setMatrixAt(car.slot, m);
    }
    for (const M of Object.values(this.meshes)) {
      M.paint.instanceMatrix.needsUpdate = M.dark.instanceMatrix.needsUpdate = M.lights.instanceMatrix.needsUpdate = true;
    }
    if (this.lampMesh) {
      this.heads.forEach((h, i) => {
        const n = h.n;
        const t = (this.time + n.offset) % n.cycle, k = Math.floor(t / (GREEN + CLEAR)), u = t - k * (GREEN + CLEAR);
        const mine = n.approaches[k] === h.l;
        this.lampMesh.setColorAt(i, mine && u < GREEN - 1.5 ? this.cGreen : mine && u < GREEN ? this.cAmber : this.cRed);
      });
      this.lampMesh.instanceColor.needsUpdate = true;
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
