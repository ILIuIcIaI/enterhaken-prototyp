import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { Mover, colored, box } from './mover.js';
import { WIND } from './cloth.js';

// Bewegte Ziele in der Luft und am Stadtrand (Teil von Transit, gleiche Zeitbasis):
//   Luftschiff: zieht in großer Höhe einen weiten Kreis über den Stadtrand – mit Landedeck obendrauf und leuchtenden
//   Werbetafeln; der höchste bewegte Ankerpunkt, Startrampe für lange Gleitflüge.
//   Riesenballons: drei Paradefiguren (Stern, Katze, Wal) schweben an langen Leinen über dem Jahrmarkt auf dem Pier,
//   treiben ein wenig im Wind und wippen sachte – man kann sich daran festhaken.
//   Windräder: Türme an der Küste und in Parks (landmarks.js), die Rotoren stehen im Wind und drehen sich – die Blätter
//   sind bewegte Ankerpunkte, oben loslassen schleudert.
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const BLADE = 30, OMEGA = 0.5; // Rotorblattlänge (m), Drehzahl der Windräder (rad/s)

const mesh = (geos, opts = {}) => {
  const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.3, ...opts }));
  m.castShadow = true;
  for (const g of geos) g.dispose();
  return m;
};

// Pose entlang eines Kreises um die Inselmitte, Nase (lokal −z) in Fahrtrichtung; lokal +x zeigt dann dir-fach zur Mitte
function circlePose(m, t, { r, y, speed, dir, phase, bob = 0, bobF = 0.3 }, dt) {
  const a = phase + (dir * speed * t) / r, px = m.pos.x, py = m.pos.y, pz = m.pos.z;
  m.pos.set(Math.cos(a) * r, y + bob * Math.sin(t * bobF + phase), Math.sin(a) * r);
  _v.set(-Math.sin(a) * dir, 0, Math.cos(a) * dir);
  _m.lookAt(_o.set(0, 0, 0), _v, UP);
  m.quat.setFromRotationMatrix(_m);
  if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
}

export class Airship {
  constructor(scene, planes) {
    this.group = new THREE.Group();
    scene.add(this.group);
    // mitten zwischen den beiden unteren Flugzeug-Ebenen (transit.js: Planes, 55 m Abstand) – deren Höhe hängt nur vom
    // Radius ab, so berühren sich die Bahnen nie, auch wo sie sich im Grundriss kreuzen
    const R = 380;
    this.path = { r: R, y: planes.height(R, 0) + 29.5, speed: 7, dir: 1, phase: 1.1, bob: 1.5, bobF: 0.12 };
    this.mover = new Mover('airship', [
      { min: V3(-11, -11, -32), max: V3(11, 11, 32) },
      { min: V3(-8, -8, -48), max: V3(8, 8, -32) },
      { min: V3(-8, -8, 32), max: V3(8, 8, 48) },
      { min: V3(-4.5, -4.5, -57), max: V3(4.5, 4.5, -48) },
      { min: V3(-4.5, -4.5, 48), max: V3(4.5, 4.5, 57) },
      { min: V3(-4.5, 11, -14), max: V3(4.5, 13.4, 14) },   // Landedeck obendrauf
      { min: V3(-3, -15, -7), max: V3(3, -11, 7) },          // Gondel
    ]);
    this.mover.radius = 70;
    this.movers = [this.mover];
    const geos = [
      colored(new THREE.SphereGeometry(1, 32, 16).scale(12.5, 12.5, 60), '#c9ccd6'),
      colored(new THREE.SphereGeometry(1, 32, 6, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.08).scale(12.7, 12.7, 60.4), '#c8352b'), // Zierstreifen
      colored(box(9, 2.4, 28, 0, 12.2, 0), '#5e5866'),                       // Deck
      colored(box(9.4, 0.9, 0.3, 0, 13.85, -14), '#e8e4dc'), colored(box(9.4, 0.9, 0.3, 0, 13.85, 14), '#e8e4dc'),
      colored(box(0.3, 0.9, 28, -4.6, 13.85, 0), '#e8e4dc'), colored(box(0.3, 0.9, 28, 4.6, 13.85, 0), '#e8e4dc'),
      colored(box(6, 4, 14, 0, -13, 0), '#2a2630'),                          // Gondel
      colored(box(6.2, 1.2, 12, 0, -12.6, 0), '#e8e4dc'),
    ];
    for (const [rx, ry, w, h] of [[1, 0, 14, 0.8], [-1, 0, 14, 0.8], [0, 1, 0.8, 14], [0, -1, 0.8, 14]]) {
      geos.push(colored(box(w, h, 12, rx * 12, ry * 12, 49), '#c8352b'));   // Leitwerk
    }
    const g = (this.model = new THREE.Group());
    g.add(mesh(geos));
    // Werbetafeln an beiden Seiten (leuchten, abends deutlich), Fensterband an der Gondel
    this.signMat = new THREE.MeshBasicMaterial({ map: signTexture(), color: new THREE.Color(1.5, 1.5, 1.5) });
    const frameMat = new THREE.MeshBasicMaterial({ color: '#1a1820' });
    for (const s of [-1, 1]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 35), frameMat);
      fr.position.set(s * 12.6, 1, -4);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(33.6, 6.6).rotateY((s * Math.PI) / 2), this.signMat);
      p.position.set(s * 12.77, 1, -4);
      g.add(fr, p);
    }
    const win = new THREE.Mesh(box(6.1, 0.9, 11, 0, -13.6, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.2) }));
    g.add(win);
    this.group.add(g);
  }

  update(t, dt) {
    circlePose(this.mover, t, this.path, dt);
  }

  render(t) {
    this.model.position.copy(this.mover.pos);
    this.model.quaternion.copy(this.mover.quat);
    const k = 1.5 + 0.3 * Math.sin(t * 2.2);
    this.signMat.color.setRGB(k, k, k);
  }
}

// Leuchtschrift der Werbetafel: Verlauf, Schriftzug, Sterne
function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 200;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, '#0a5fa8');
  gr.addColorStop(0.5, '#17b4d8');
  gr.addColorStop(1, '#0a5fa8');
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 200);
  g.fillStyle = '#ffffff';
  g.font = 'bold 128px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FLY HIGH', 512, 106);
  g.fillStyle = '#ffd84a';
  for (const x of [70, 954]) {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 22 : 52;
      g.lineTo(x + Math.cos(a) * r, 100 + Math.sin(a) * r);
    }
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// dunkles Auge mit Glanzpunkt, flach auf die Oberfläche gesetzt (Blick nach +z)
const eye = (geos, x, y, z, r) => {
  geos.push(colored(new THREE.SphereGeometry(r, 12, 8).scale(1, 1.15, 0.45).translate(x, y, z), '#1a1820'));
  geos.push(colored(new THREE.SphereGeometry(r * 0.3, 8, 6).translate(x + r * 0.3, y + r * 0.4, z + r * 0.4), '#ffffff'));
};

// Riesenballons über dem Jahrmarkt (Ankerblöcke: landmarks.js buildPier): je drei Leinen zu einem Block auf dem Deck,
// der Ballon treibt etwas mit dem Wind ab, kreist langsam um seinen Platz und wippt. Stern und Katze schauen zur
// Promenade, der Wal schwimmt in dieselbe Richtung. Hakenziele wie Flugzeuge – nur viel gemütlicher.
const BALLOON_BOXES = {
  star: [{ min: V3(-10, -10, -3.6), max: V3(10, 12, 3.6) }],
  cat: [{ min: V3(-8.5, -8, -8), max: V3(8.5, 10, 8) }],
  whale: [{ min: V3(-7, -6, -17), max: V3(7, 9, 22) }],
};
const TETHER_Y = { star: -8, cat: -7, whale: -6 };
const TETHER_AT = [[-3, -3], [3, -3], [0, 3]];

export class Balloons {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.movers = [];
    const P = city.landmarkData?.pier;
    if (!P) return;
    const F = P.F, tether = new THREE.CylinderGeometry(0.07, 0.07, 1, 4).translate(0, 0.5, 0), tetherMat = toonMaterial('#3a3644', { rim: 0.1 });
    for (const b of P.balloons) {
      const a = F.at(b.d, b.s), anchor = V3(a.x, P.top + 1.15, a.z);
      const yaw = b.kind === 'whale' ? Math.atan2(F.ux, F.uz) : Math.atan2(-F.ux, -F.uz);
      const mover = new Mover('balloon', BALLOON_BOXES[b.kind]);
      mover.radius = 30;
      mover.omega = V3(0, 0, 0);
      const model = this.model(b.kind), lines = TETHER_AT.map(() => new THREE.Mesh(tether, tetherMat));
      this.group.add(model, ...lines);
      this.items.push({ kind: b.kind, h: b.h, anchor, yaw, mover, model, lines, ph: b.d * 0.07 });
      this.movers.push(mover);
    }
  }

  // Figuren mit Gesicht nach +z (der Wal mit der Nase nach −z)
  model(kind) {
    const geos = [];
    if (kind === 'star') {
      geos.push(colored(new THREE.SphereGeometry(6.5, 20, 14).scale(1, 1, 0.55), '#f2c230'));
      for (let k = 0; k < 5; k++) {
        geos.push(colored(new THREE.ConeGeometry(3.4, 8, 12).scale(1, 1, 0.5).translate(0, 9, 0).rotateZ((k / 5) * Math.PI * 2), '#f2c230'));
      }
      eye(geos, -2, 1.6, 3.5, 0.95);
      eye(geos, 2, 1.6, 3.5, 0.95);
      geos.push(colored(new THREE.TorusGeometry(2, 0.35, 6, 16, Math.PI).rotateZ(Math.PI).translate(0, -1, 3.5), '#c8352b'));
      geos.push(colored(new THREE.SphereGeometry(1.1, 10, 8).scale(1, 0.7, 0.4).translate(-4, -1, 3.1), '#f08a6a'), colored(new THREE.SphereGeometry(1.1, 10, 8).scale(1, 0.7, 0.4).translate(4, -1, 3.1), '#f08a6a'));
    } else if (kind === 'cat') {
      geos.push(colored(new THREE.SphereGeometry(8.5, 24, 16).scale(1, 0.9, 0.85), '#f4f0ea'));
      geos.push(colored(new THREE.ConeGeometry(3.6, 6, 12).translate(-5, 9, 0).rotateZ(0.25), '#f4f0ea'), colored(new THREE.ConeGeometry(3.6, 6, 12).translate(5, 9, 0).rotateZ(-0.25), '#f4f0ea'));
      geos.push(colored(new THREE.ConeGeometry(1.8, 3.2, 10).translate(-5, 9.6, 1).rotateZ(0.25), '#f29aa8'), colored(new THREE.ConeGeometry(1.8, 3.2, 10).translate(5, 9.6, 1).rotateZ(-0.25), '#f29aa8'));
      eye(geos, -3, 1.5, 6.75, 1.35);
      eye(geos, 3, 1.5, 6.75, 1.35);
      geos.push(colored(new THREE.SphereGeometry(0.8, 8, 6).translate(0, -1, 7.3), '#f29aa8'));
      geos.push(colored(new THREE.SphereGeometry(1.2, 10, 8).scale(1, 0.6, 0.35).translate(-5.2, -1.4, 5.75), '#f6b8c0'), colored(new THREE.SphereGeometry(1.2, 10, 8).scale(1, 0.6, 0.35).translate(5.2, -1.4, 5.75), '#f6b8c0'));
      for (const s of [-1, 1]) for (const yy of [-1.6, -0.4]) geos.push(colored(box(4.2, 0.18, 0.18, s * 5.6, yy, 6.2).rotateZ(s * (yy + 1) * 0.12), '#3a3644')); // Schnurrhaare
      geos.push(colored(new THREE.SphereGeometry(8.7, 24, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.12).scale(1, 0.9, 0.85), '#e08a1e')); // Halsband
    } else {
      geos.push(colored(new THREE.SphereGeometry(1, 28, 16).scale(7, 6.5, 17), '#3f7fd0'));
      geos.push(colored(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45).scale(7.1, 6.6, 17.1), '#e8eef6'));
      // Schwanz: Stiel und zwei Fluken
      geos.push(colored(new THREE.ConeGeometry(2.8, 7, 14).rotateX(Math.PI / 2).translate(0, 0.8, 16.5), '#3f7fd0'));
      for (const s of [-1, 1]) geos.push(colored(new THREE.SphereGeometry(1, 14, 8).scale(4.6, 0.55, 2.2).rotateY(s * 0.45).translate(s * 3.6, 1.2, 20.6), '#3f7fd0'));
      // Augen seitlich (Blick zur Seite), Brustflossen schräg nach unten, Wasserfontäne aus dem Blasloch
      for (const s of [-1, 1]) {
        const e = [];
        eye(e, 0, 0, 0, 1.05);
        for (const g of e) geos.push(g.rotateY((s * Math.PI) / 2).translate(s * 5.35, 1.6, -10));
        geos.push(colored(new THREE.SphereGeometry(1, 12, 8).scale(3.4, 0.4, 1.7).rotateZ(s * -0.6).translate(s * 7.6, -2.8, -3.5), '#3f7fd0'));
      }
      geos.push(colored(new THREE.CylinderGeometry(0.5, 0.9, 3, 8).translate(0, 7.0, -9), '#bfe6ff'));
      for (let k = 0; k < 5; k++) {
        const a = ((k - 2) / 2) * 0.9;
        geos.push(colored(new THREE.SphereGeometry(0.9, 8, 6).translate(Math.sin(a) * 2.2, 9.0 - Math.abs(k - 2) * 0.6, -9 + Math.cos(a) * 0.2), '#d8f0ff'));
      }
    }
    const g = new THREE.Group();
    g.add(mesh(geos, { rim: 0.35 }));
    return g;
  }

  update(t, dt) {
    for (const it of this.items) {
      const m = it.mover, px = m.pos.x, py = m.pos.y, pz = m.pos.z, ph = it.ph, drift = it.h * 0.22;
      m.pos.set(
        it.anchor.x + WIND.dir.x * drift + 2.6 * Math.sin(t * 0.21 + ph),
        it.anchor.y + it.h + 1.6 * Math.sin(t * 0.47 + ph * 2),
        it.anchor.z + WIND.dir.z * drift + 2.6 * Math.cos(t * 0.17 + ph),
      );
      m.quat.setFromAxisAngle(UP, it.yaw + 0.3 * Math.sin(t * 0.13 + ph));
      m.omega.set(0, 0.039 * Math.cos(t * 0.13 + ph), 0);
      if (dt > 0) m.vel.set((m.pos.x - px) / dt, (m.pos.y - py) / dt, (m.pos.z - pz) / dt);
    }
  }

  render(t) {
    for (const it of this.items) {
      it.model.position.copy(it.mover.pos);
      it.model.quaternion.copy(it.mover.quat).multiply(_q.setFromAxisAngle(_o.set(0, 0, 1), 0.05 * Math.sin(t * 0.6 + it.ph)));
      // Leinen: vom Ballonbauch straff zum Ankerblock
      TETHER_AT.forEach(([x, z], k) => {
        _v.set(x, TETHER_Y[it.kind], z).applyQuaternion(it.model.quaternion).add(it.model.position).sub(it.anchor);
        const len = _v.length(), line = it.lines[k];
        line.position.copy(it.anchor);
        line.quaternion.setFromUnitVectors(UP, _v.divideScalar(len));
        line.scale.set(1, len, 1);
      });
    }
  }
}

export class WindTurbines {
  constructor(scene, city) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.movers = [];
    const list = city.landmarkData?.turbines ?? [];
    // Rotor steht im Wind: Achse gegen die Windrichtung, Blattebene quer dazu
    const axis = (this.axis = WIND.dir.clone().negate());
    const side = V3(-WIND.dir.z, 0, WIND.dir.x);
    const base = (this.base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, UP, axis)));
    const towerGeos = [], rotorGeo = this.rotorGeo();
    const rotorMat = toonMaterial('#ffffff', { vertexColors: true, rim: 0.3 });
    for (const t of list) {
      const top = t.base + t.h;
      towerGeos.push(colored(new THREE.CylinderGeometry(1.1, 1.7, t.h, 14).translate(t.x, t.base + t.h / 2, t.z), '#eceae6'));
      towerGeos.push(colored(new THREE.CylinderGeometry(2.1, 2.1, 0.5, 14).translate(t.x, t.base + 0.25, t.z), '#9a949e'));
      const nac = new THREE.BoxGeometry(3, 3.2, 9).translate(0, 0, -1.5);
      nac.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(base)).translate(t.x, top + 1.2, t.z);
      towerGeos.push(colored(nac, '#d8d6d2'));
      const hub = axis.clone().multiplyScalar(4.2).add(V3(t.x, top + 1.2, t.z));
      const rotor = new THREE.Mesh(rotorGeo, rotorMat);
      rotor.castShadow = true;
      rotor.position.copy(hub);
      this.group.add(rotor);
      const blades = [0, 1, 2].map(() => {
        const m = new Mover('blade', [{ min: V3(2, -1.2, -0.5), max: V3(BLADE, 1.2, 0.5) }]);
        m.radius = BLADE + 6;
        m.pos.copy(hub);
        m.omega = axis.clone().multiplyScalar(OMEGA);
        return m;
      });
      this.movers.push(...blades);
      this.items.push({ hub, rotor, blades, phase: (t.x * 0.13 + t.z * 0.07) % 6.283, angle: 0 });
    }
    if (towerGeos.length) this.group.add(mesh(towerGeos, { rim: 0.2 }));
  }

  // drei Blätter in der lokalen xy-Ebene, Spitzen rot markiert
  rotorGeo() {
    const geos = [colored(new THREE.SphereGeometry(1.6, 12, 8), '#d8d6d2')];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      geos.push(colored(box(BLADE - 4, 1.8, 0.5, (BLADE - 4) / 2 + 2, 0, 0).rotateZ(a), '#eceae6'));
      geos.push(colored(box(4, 1.4, 0.55, BLADE - 2, 0, 0).rotateZ(a), '#c8352b'));
    }
    const g = mergeGeometries(geos);
    for (const x of geos) x.dispose();
    return g;
  }

  update(t) {
    for (const it of this.items) {
      it.angle = it.phase + OMEGA * t;
      it.blades.forEach((m, k) => m.quat.copy(this.base).multiply(_q.setFromAxisAngle(_o.set(0, 0, 1), it.angle + (k * Math.PI * 2) / 3)));
    }
  }

  render() {
    for (const it of this.items) it.rotor.quaternion.copy(this.base).multiply(_q.setFromAxisAngle(_o.set(0, 0, 1), it.angle));
  }
}
