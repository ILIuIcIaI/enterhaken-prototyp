import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { outlineMaterial } from './toon.js';
import { tubeGeometry, withColor } from './charGeo.js';
import { smin, smax, sdSphere, sdEllipsoid, sdRoundCone, sdRoundBox, sdTorus, ConeSet, polygonize, paint, skin } from './sdf.js';
import { Cloth, Colliders, clothMesh, ropeMesh, toLocal, Barrier } from './cloth.js';

// Baukasten für die Spielfiguren. Alle Figuren teilen dasselbe Skelett (Gelenknamen, Animationen);
// Proportionen, Kleidung, Haare und Gesicht kommen aus den Designs in src/designs/.
// Modellraum: Füße bei y = 0, Blick nach −Z, +X = rechte Körperseite der Figur.

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const col = (hex) => new THREE.Color(hex);

// Gelenkpositionen (Bind-Pose) der Grundfigur; Designs überschreiben einzelne Werte
export const BASE_B = {
  hips: [0, 0.86, 0], spine: [0, 0.96, 0], chest: [0, 1.08, 0], neck: [0, 1.31, 0], head: [0, 1.38, 0],
  shoulderX: 0.155, shoulderY: 1.27, elbowY: 1.03, wristY: 0.825,
  hipX: 0.085, hipY: 0.81, kneeY: 0.43, ankleY: 0.07,
};
export const AP = 0.2; // A-Haltung der Arme beim Binden

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Profil aus Stützstellen [y, rx, rz, ox, oz] (absteigend in y), linear interpoliert.
export function keyed(keys, grow = 0, sx = 1) {
  return (t, y) => {
    let i = 0;
    while (i < keys.length - 2 && y < keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1];
    const u = clamp((a[0] - y) / (a[0] - b[0]), 0, 1);
    return [lerp(a[1], b[1], u) + grow, lerp(a[2], b[2], u) + grow, lerp(a[3] ?? 0, b[3] ?? 0, u) * sx, lerp(a[4] ?? 0, b[4] ?? 0, u)];
  };
}

// Körperprofile (Radien in Metern). Frauen schlank mit Taille, Männer breiter und gerader.
export const TORSO_F = [
  [1.335, 0.046, 0.043, 0, 0.006], [1.3, 0.088, 0.07, 0, 0.008], [1.26, 0.138, 0.084, 0, 0.01],
  [1.18, 0.126, 0.092, 0, -0.004], [1.1, 0.116, 0.088, 0, -0.006], [1.02, 0.1, 0.076, 0, 0],
  [0.94, 0.11, 0.08, 0, 0], [0.86, 0.128, 0.09, 0, 0.004], [0.79, 0.132, 0.092, 0, 0.006],
];
export const TORSO_M = [
  [1.335, 0.052, 0.048, 0, 0.006], [1.3, 0.1, 0.078, 0, 0.008], [1.26, 0.158, 0.09, 0, 0.008],
  [1.18, 0.15, 0.098, 0, -0.002], [1.1, 0.138, 0.094, 0, -0.002], [1.02, 0.128, 0.088, 0, 0],
  [0.94, 0.128, 0.088, 0, 0], [0.86, 0.134, 0.092, 0, 0.004], [0.79, 0.136, 0.094, 0, 0.006],
];
export const LEG_F = [
  [0.86, 0.075, 0.082], [0.78, 0.073, 0.077], [0.68, 0.066, 0.07], [0.56, 0.056, 0.06],
  [0.48, 0.048, 0.052, -0.004, -0.003], [0.43, 0.046, 0.05, -0.006, -0.006], [0.37, 0.048, 0.053, -0.004, 0.004],
  [0.3, 0.05, 0.056, -0.002, 0.01], [0.22, 0.042, 0.047, 0, 0.007], [0.14, 0.033, 0.037, 0, 0.003], [0.055, 0.03, 0.034, 0, 0.002],
];
export const LEG_M = [
  [0.86, 0.082, 0.086], [0.78, 0.078, 0.082], [0.68, 0.07, 0.074], [0.56, 0.061, 0.064],
  [0.48, 0.054, 0.057, -0.003, -0.003], [0.43, 0.052, 0.055, -0.004, -0.004], [0.37, 0.054, 0.058, -0.003, 0.004],
  [0.3, 0.055, 0.06, -0.002, 0.009], [0.22, 0.047, 0.051, 0, 0.006], [0.14, 0.038, 0.041, 0, 0.003], [0.055, 0.035, 0.038, 0, 0.002],
];
export const ARM_F = [
  [1.31, 0.022, 0.024], [1.295, 0.042, 0.044], [1.26, 0.047, 0.047], [1.2, 0.042, 0.043], [1.12, 0.037, 0.038],
  [1.04, 0.032, 0.033], [0.98, 0.034, 0.034], [0.9, 0.029, 0.028], [0.84, 0.024, 0.022], [0.82, 0.023, 0.021],
];
export const ARM_M = [
  [1.31, 0.026, 0.028], [1.295, 0.05, 0.052], [1.26, 0.056, 0.056], [1.2, 0.05, 0.05], [1.12, 0.045, 0.045],
  [1.04, 0.039, 0.04], [0.98, 0.041, 0.041], [0.9, 0.035, 0.033], [0.84, 0.029, 0.026], [0.82, 0.028, 0.025],
];

// ------------------------------------------------------------------ Texturen
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// ------------------------------------------------------------------ starre Teile
// Sammelt starre Teile je Knochen + Material und verschmilzt sie zu wenigen Meshes.
export class PartBuilder {
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
    // gespiegelt (negative Skalierung): Dreiecke umdrehen, sonst zeigen Vorder- und Rückseite (und Umriss) falsch herum
    if (_m.determinant() < 0) {
      for (const at of Object.values(g.attributes)) {
        const n = at.itemSize, arr = at.array;
        for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) {
          const t = arr[(i + 1) * n + k];
          arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
          arr[(i + 2) * n + k] = t;
        }
      }
    }
    if (mat.vertexColors && !g.attributes.color) withColor(g, '#ffffff');
    if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
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

export const RB = (w, h, d, r = 0.008, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
export const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const torus = (R, t, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(R, t, rs, ts, arc);
export const sphere = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);

// Geometrie mit Farbfunktion bemalen (Vertexfarben)
export function painted(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  paint(g, fn);
  return g;
}

// ------------------------------------------------------------------ Körper (gehäutete Röhren)
// colorFn(target, theta, y, s): theta = π vorne, π/2 außen rechts; s = Seite (−1 links, +1 rechts)
export function torso(K, { profile = TORSO_F, grow = 0, yTop = 1.335, yBot = 0.79, color = null, material = null, map = null, hull = 0.005, rings = 40, radial = 28 }) {
  const B = K.B;
  const sk = { bones: [K.bi(K.chest), K.bi(K.spine), K.bi(K.hips)], joints: [B.chest[1], B.spine[1]], blend: 0.06 };
  const g = tubeGeometry({ yTop, yBot, profile: keyed(profile, grow), rings, radial, skin: sk, color: color && ((c, a, t) => color(c, a, lerp(yTop, yBot, t))) });
  K.skinned(g, material ?? K.mat('#ffffff', map ? { map } : { vertexColors: !!color }), hull);
  return g;
}

export function legs(K, { profile = LEG_F, grow = 0, yTop = 0.86, yBot = 0.055, color = null, material = null, hull = 0.005, only = null, rings = 48, radial = 22 }) {
  const B = K.B;
  for (const k of only ?? ['L', 'R']) {
    const { s, th, sn, ft } = K.side[k];
    const sk = { bones: [K.bi(th), K.bi(sn), K.bi(ft)], joints: [B.kneeY, B.ankleY], blend: 0.05 };
    const g = tubeGeometry({
      yTop, yBot, cx: s * B.hipX, profile: keyed(profile, grow, s), rings, radial, skin: sk,
      color: color && ((c, a, t) => color(c, a, lerp(yTop, yBot, t), s)),
    });
    K.skinned(g, material ?? K.mat('#ffffff', { vertexColors: !!color }), hull);
  }
}

// Arme als Röhren entlang −Y, danach um die Schulter in die A-Haltung gedreht (Bind-Pose)
export function arms(K, { profile = ARM_F, grow = 0, yTop = 1.31, yBot = 0.82, color = null, material = null, hull = 0.005, only = null, rings = 40, radial = 18 }) {
  const B = K.B;
  for (const k of only ?? ['L', 'R']) {
    const { s, ua, fa, ha } = K.side[k];
    const cx = s * B.shoulderX;
    const sk = { bones: [K.bi(ua), K.bi(fa), K.bi(ha)], joints: [B.elbowY, B.wristY], blend: 0.04 };
    const g = tubeGeometry({
      yTop, yBot, cx, profile: keyed(profile, grow, s), rings, radial, skin: sk,
      color: color && ((c, a, t) => color(c, a, lerp(yTop, yBot, t), s)),
    });
    aPose(g, B, s, K.AP);
    K.skinned(g, material ?? K.mat('#ffffff', { vertexColors: !!color }), hull);
  }
}

// Geometrie im gestreckten Arm in die A-Haltung drehen (um den Schulterpunkt)
export function aPose(g, B, s, ap = AP) {
  _m.makeTranslation(-s * B.shoulderX, -B.shoulderY, 0);
  g.applyMatrix4(_m);
  g.applyMatrix4(_m.makeRotationZ(s * ap));
  g.applyMatrix4(_m.makeTranslation(s * B.shoulderX, B.shoulderY, 0));
  g.computeVertexNormals();
  return g;
}

// Becken: verbindet Rumpf und Beine (Hose, Shorts, Anzug); starr an der Hüfte
export function pelvis(K, mat, { r = 0.15, y = 0.8, sy = 0.55, sz = 0.68, sx = 0.95, thighs = true, thighR = 0.08 } = {}) {
  const { P, hips, B } = K;
  P.add(hips, sphere(r, 24, 16), mat, { pos: [0, y, 0], scale: [sx, sy, sz] });
  if (thighs) for (const k of ['L', 'R']) P.add(K.side[k].th, cyl(thighR, thighR * 0.96, 0.07, 18), mat, { pos: [K.side[k].s * B.hipX, y - 0.02, 0] });
}

export function neck(K, mat, { r = 0.036, len = 0.1 } = {}) {
  K.P.add(K.neck, cyl(r * 0.94, r * 1.06, len, 18), mat, { pos: [0, 1.34, 0.005] });
}

// ------------------------------------------------------------------ Hände und Schuhe (Abstandsfelder)
function handField(B, s, w = 1) {
  const cx = s * B.shoulderX;
  const fingers = [];
  [0.03, 0.036, 0.034, 0.027].forEach((len, i) => {
    const z = (i - 1.5) * 0.0135 * w;
    const K = [cx - s * 0.001, 0.757, z];
    const M = [K[0] - s * 0.006, K[1] - len * 0.55, z];
    const T = [M[0] - s * 0.012, M[1] - len * 0.45, z * 1.05];
    fingers.push([K, M, T]);
  });
  const fr = 0.0085 * w;
  return (x, y, z) => {
    let d = sdRoundBox(x, y, z, cx, 0.787, 0, 0.0115 * w, 0.033, 0.026 * w, 0.0095);
    d = smin(d, sdRoundCone(x, y, z, cx, 0.84, 0, cx, 0.812, 0, 0.021 * w, 0.019 * w), 0.01);
    for (const [K, M, T] of fingers) {
      d = smin(d, sdRoundCone(x, y, z, K[0], K[1], K[2], M[0], M[1], M[2], fr, fr * 0.92), 0.006);
      d = smin(d, sdRoundCone(x, y, z, M[0], M[1], M[2], T[0], T[1], T[2], fr * 0.92, fr * 0.78), 0.004);
    }
    d = smin(d, sdRoundCone(x, y, z, cx - s * 0.006, 0.79, -0.02 * w, cx - s * 0.012, 0.775, -0.034 * w, 0.0095 * w, 0.0085 * w), 0.006);
    d = smin(d, sdRoundCone(x, y, z, cx - s * 0.012, 0.775, -0.034 * w, cx - s * 0.016, 0.762, -0.04 * w, 0.0085 * w, 0.0072 * w), 0.004);
    return d;
  };
}

// color(x, y, z, k): Farbe je Punkt (Handschuhe, Ärmelbündchen …)
export function hands(K, color, { w = 1, hull = 0.0025 } = {}) {
  const B = K.B;
  for (const k of ['L', 'R']) {
    const { s, ha } = K.side[k];
    const g = polygonize(handField(B, s, w), new THREE.Vector3(s * B.shoulderX - 0.045, 0.69, -0.065), new THREE.Vector3(s * B.shoulderX + 0.045, 0.85, 0.055), 64);
    paint(g, (x, y, z, nx, ny, nz) => color(x, y, z, k, nx, ny, nz));
    K.P.add(ha, g, K.mat('#ffffff', { vertexColors: true }), { hull });
  }
}

// Schuh aus Sohle, Oberteil und optionalem Absatz; o: { len, width, toe, height, heel, round, sole }
export function shoeField(o = {}) {
  const L = o.len ?? 1, W = o.width ?? 1, hh = o.height ?? 1, heel = o.heel ?? 0, toe = o.toe ?? 1;
  return (x, y, z) => {
    // Absatz hebt die Ferse, die Spitze bleibt am Boden
    const lift = heel * smooth(-0.06 * L, 0.04 * L, z);
    const yy = y - lift;
    let sole = sdRoundBox(x, yy, z, 0, (o.sole ?? 0.018) * 0.5 + 0.004, -0.045 * L, 0.05 * W, (o.sole ?? 0.018) * 0.5 + 0.004, 0.13 * L, 0.012);
    sole = smin(sole, sdEllipsoid(x, yy, z, 0, 0.022, -0.155 * L, 0.048 * W, 0.02, 0.05 * L * toe), 0.02);
    let up = smin(sdEllipsoid(x, yy, z, 0, 0.05 * hh, -0.09 * L, 0.044 * W, 0.034 * hh, 0.085 * L * toe), sdEllipsoid(x, yy, z, 0, 0.068 * hh, -0.02 * L, 0.047 * W, 0.048 * hh, 0.07 * L), 0.035);
    up = smin(up, sdEllipsoid(x, yy, z, 0, 0.075 * hh, 0.035 * L, 0.044 * W, 0.054 * hh, 0.05 * L), 0.03);
    up = smax(up, -Math.max(Math.hypot(x, z - 0.008) - 0.03, 0.1 * hh - yy), 0.008);
    let d = smin(sole, up, 0.012);
    if (heel > 0.005) {
      // schlanker Absatz unter der Ferse
      const hb = sdRoundCone(x, y, z, 0, 0.004, 0.06 * L, 0, lift + 0.01, 0.055 * L, 0.012, 0.02);
      d = smin(d, hb, 0.006);
      d = smax(d, -y, 0.002);
    }
    return d;
  };
}

// fertig bemalter Schuh an beiden Füßen
export function shoes(K, field, color, { hull = 0.004, res = 70, top = 0.16 } = {}) {
  const g = polygonize(field, new THREE.Vector3(-0.075, -0.004, -0.215), new THREE.Vector3(0.075, top, 0.11), res);
  paint(g, color);
  for (const k of ['L', 'R']) K.P.add(K.side[k].ft, g, K.mat('#ffffff', { vertexColors: true }), { pos: [K.side[k].s * K.B.hipX, 0, 0], hull });
}

// ------------------------------------------------------------------ Kopf, Ohren, Gesicht
// Kopf mit einstellbarem Kinn: jaw = Verjüngung unten (Anime-Frauen ~0.34, Männer ~0.22), sy = Länge
export function headGeo(r, { jaw = 0.34, chin = 0.14, sy = 1, sx = 1, back = 1 } = {}) {
  const g = new THREE.SphereGeometry(r, 48, 34);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * sx, y = p.getY(i), z = p.getZ(i);
    if (y < 0) {
      const k = Math.pow(-y / r, 1.5);
      x *= 1 - jaw * k;
      z *= 1 - chin * k;
      if (z < 0) z -= 0.012 * k * r * 10 * (1 - Math.abs(x) / r);
      y *= sy;
    }
    if (z < 0) z *= 0.95;
    else z *= back;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export function head(K, faceMap, opts = {}) {
  const { HC } = K;
  const r = opts.r ?? 0.104;
  K.P.add(K.head, headGeo(r, opts), K.mat('#ffffff', { map: faceMap, rim: 0.22 }), { pos: [HC.x, HC.y - 0.002, HC.z - 0.002], hull: 0.004 });
  if (opts.ears) {
    for (const s of [-1, 1]) {
      const e = sdEarGeo();
      K.P.add(K.head, e, K.mat(opts.skin), { pos: [HC.x + s * r * 0.97 * (opts.sx ?? 1), HC.y - 0.012, HC.z + 0.006], rot: [0, s * 0.25, 0], scale: [s, 1, 1], hull: 0.002 });
    }
  }
}

function sdEarGeo() {
  const f = (x, y, z) => {
    let d = sdEllipsoid(x, y, z, 0.006, 0, 0, 0.012, 0.03, 0.019);
    d = smax(d, -sdEllipsoid(x, y, z, 0.013, 0.002, 0, 0.006, 0.02, 0.011), 0.003);
    return d;
  };
  return polygonize(f, new THREE.Vector3(-0.012, -0.036, -0.024), new THREE.Vector3(0.024, 0.036, 0.024), 28);
}

// Gesichtstextur für die Kopfkugel (Vorderseite bei u = 0.75, rechte Gesichtshälfte der Figur bei s = −1).
// o: Hautfarbe, Augenform, Iris, Brauen, Mund, Extras (Muttermal, Falten, Ringe-Iris …)
export function faceTexture(o) {
  const W = 1024, Hh = 512;
  const [c, g] = canvas(W, Hh);
  g.fillStyle = o.skin;
  g.fillRect(0, 0, W, Hh);
  const cx = W * 0.75, ey = Hh * 0.535 + (o.eyeY ?? 0);
  const E = { dx: 60, w: 1, h: 1, tilt: 0, lash: 7.5, ...o.eye };
  if (o.shade) {
    // weiche Schattierung unter dem Kinn/Wangen
    const gr = g.createLinearGradient(0, ey + 70, 0, ey + 140);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, o.shade);
    g.fillStyle = gr;
    g.fillRect(0, ey + 70, W, 120);
  }
  if (o.blush) {
    for (const s of [-1, 1]) {
      const grd = g.createRadialGradient(cx + s * 72, ey + 54, 2, cx + s * 72, ey + 54, 36);
      grd.addColorStop(0, `rgba(255,120,140,${o.blush})`);
      grd.addColorStop(1, 'rgba(255,120,140,0)');
      g.fillStyle = grd;
      g.fillRect(cx + s * 72 - 40, ey + 14, 80, 80);
    }
  }
  if (o.wrinkles) {
    g.strokeStyle = o.wrinkles;
    g.lineWidth = 2;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * 24, ey + 52); g.quadraticCurveTo(cx + s * 34, ey + 74, cx + s * 30, ey + 92); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 86, ey - 6); g.lineTo(cx + s * 98, ey - 12); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 86, ey + 4); g.lineTo(cx + s * 98, ey + 6); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 40, ey + 32); g.quadraticCurveTo(cx + s * 60, ey + 40, cx + s * 80, ey + 32); g.stroke();
    }
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx - 50, ey - 96 - i * 11); g.quadraticCurveTo(cx, ey - 102 - i * 11, cx + 50, ey - 96 - i * 11); g.stroke(); }
  }
  if (o.stubble) {
    g.fillStyle = o.stubble;
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI, r = 70 + Math.random() * 40;
      const x = cx + Math.cos(a) * r * 1.1, y = ey + 40 + Math.sin(a) * r * 0.55;
      g.fillRect(x, y, 1.6, 1.6);
    }
  }
  const eye = (s) => {
    if (o.hide === s || o.eyes === false) return;
    g.save();
    g.translate(cx + s * E.dx, ey);
    g.scale(s * E.w, E.h);
    g.rotate(-E.tilt);
    // Lidform: Oberlid-Bogen und Unterlid; „sharp“ schmal und mandelförmig, „round“ groß, „tired“ halb geschlossen
    const top = E.shape === 'sharp' ? -20 : E.shape === 'tired' ? -12 : E.shape === 'narrow' ? -6 : -30;
    const bot = E.shape === 'narrow' ? 18 : E.shape === 'sharp' ? 28 : 40;
    g.beginPath();
    g.moveTo(-31, -10);
    g.quadraticCurveTo(0, top, 32, -16);
    g.quadraticCurveTo(34, 10, 20, bot - 6);
    g.quadraticCurveTo(-4, bot, -26, bot - 14);
    g.quadraticCurveTo(-34, 8, -31, -10);
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = o.white ?? '#ffffff';
    g.fillRect(-40, -40, 80, 90);
    const ir = g.createLinearGradient(0, -24, 0, 36);
    ir.addColorStop(0, o.iris[0]);
    ir.addColorStop(0.5, o.iris[1]);
    ir.addColorStop(1, o.iris[2]);
    g.fillStyle = ir;
    g.beginPath();
    g.ellipse(2, 8, 21 * (E.iris ?? 1), 26 * (E.iris ?? 1), 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = o.irisLine ?? 'rgba(20,10,30,0.8)';
    g.lineWidth = 2.5;
    g.stroke();
    if (o.rings) {
      // konzentrische Ringe in der Iris
      g.strokeStyle = o.rings;
      g.lineWidth = 2.2;
      for (const rr of [17, 12.5, 8]) { g.beginPath(); g.ellipse(2, 9, rr, rr * 1.22, 0, 0, Math.PI * 2); g.stroke(); }
    } else if (o.sparkles !== false) {
      g.fillStyle = 'rgba(255,230,170,0.45)';
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        g.beginPath();
        g.arc(2 + Math.cos(a) * 12, 12 + Math.sin(a) * 15, 1.7, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = o.pupil ?? '#0b0a14';
    g.beginPath();
    g.ellipse(2, 9, 8 * (E.pupil ?? 1), 11.5 * (E.pupil ?? 1), 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(20,10,40,0.35)';
    g.fillRect(-40, -40, 80, 22);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(-7, -2, 6 * (E.hl ?? 1), 8 * (E.hl ?? 1), -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(10, 22, 3, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = o.lash ?? '#1a1024';
    g.lineCap = 'round';
    g.lineWidth = E.lash;
    g.beginPath();
    g.moveTo(-33, -9);
    g.quadraticCurveTo(0, top - 1, 33, -17);
    if (E.tail !== false) g.lineTo(43, -25);
    g.stroke();
    if (E.crease !== false) {
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-24, top + 2 - 4);
      g.quadraticCurveTo(4, top - 10, 30, top + 0);
      g.stroke();
    }
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-18, bot - 4);
    g.quadraticCurveTo(4, bot + 2, 22, bot - 7);
    g.stroke();
    // Brauen
    const Bw = { y: -60, w: 4, arch: 10, angle: 0, ...o.brow };
    g.strokeStyle = Bw.color ?? o.lash ?? '#1d2341';
    g.lineWidth = Bw.w;
    g.beginPath();
    g.moveTo(-26, Bw.y + Bw.angle);
    g.quadraticCurveTo(4, Bw.y - Bw.arch, 32, Bw.y + 2 - Bw.angle);
    g.stroke();
    g.restore();
  };
  eye(-1);
  eye(1);
  if (o.closed) {
    // geschlossenes Auge (unter Blume oder Strähnen)
    const s = o.closed;
    g.strokeStyle = o.lash ?? '#1a1024';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + s * E.dx - 28, ey + 10);
    g.quadraticCurveTo(cx + s * E.dx, ey + 22, cx + s * E.dx + 30, ey + 8);
    g.stroke();
  }
  // Nase
  g.strokeStyle = o.nose ?? 'rgba(190,120,110,0.7)';
  g.lineWidth = o.noseW ?? 2.5;
  g.beginPath();
  g.moveTo(cx + 3, ey + 42);
  g.lineTo(cx - 1, ey + 51);
  if (o.noseFull) g.lineTo(cx + 7, ey + 54);
  g.stroke();
  // Mund
  const M = { y: 76, w: 11, type: 'smile', color: '#a03a4a', ...o.mouth };
  if (M.type === 'lips') {
    g.fillStyle = M.color;
    g.beginPath();
    g.moveTo(cx - M.w, ey + M.y);
    g.quadraticCurveTo(cx - 4, ey + M.y - 6, cx, ey + M.y - 3);
    g.quadraticCurveTo(cx + 4, ey + M.y - 6, cx + M.w, ey + M.y);
    g.quadraticCurveTo(cx, ey + M.y + 9, cx - M.w, ey + M.y);
    g.fill();
  } else {
    g.strokeStyle = M.color;
    g.lineWidth = M.lw ?? 3.2;
    g.lineCap = 'round';
    g.beginPath();
    const curve = M.type === 'smile' ? 6 : M.type === 'frown' ? -4 : 1.5;
    g.moveTo(cx - M.w, ey + M.y - curve * 0.3);
    g.quadraticCurveTo(cx, ey + M.y + curve, cx + M.w, ey + M.y - curve * 0.4);
    g.stroke();
  }
  if (o.mole) {
    g.fillStyle = '#3a2228';
    g.beginPath();
    g.arc(cx + o.mole[0], ey + o.mole[1], 2.6, 0, Math.PI * 2);
    g.fill();
  }
  if (o.extra) o.extra(g, cx, ey);
  return tex(c);
}

// ------------------------------------------------------------------ Haare (verschmolzene Strähnen)
// spec(H): H.path(az, el, len, opts) liefert Strähnenpunkte, H.strand(pts, r0, r1) fügt sie hinzu.
// cap: { rx, ry, rz, oy, oz } Haarkappe; colors: { base, tip, shine, inner }; back: Hinterkopf schwingt nach
export function hair(K, spec, { cap = {}, colors, res = 108, bounds = null, rim = '#8a90ff', shineBand = true, extraField = null, seed = 11, back = true, hull = 0.0035, k = 0.011 } = {}) {
  const HC = K.HC, R = cap.r ?? 0.117;
  const min = bounds ? bounds[0] : new THREE.Vector3(HC.x - 0.19, HC.y - 0.24, HC.z - 0.18);
  const max = bounds ? bounds[1] : new THREE.Vector3(HC.x + 0.19, HC.y + 0.17, HC.z + 0.22);
  const set = new ConeSet(min, max, 14, k);
  let sd = seed;
  const rnd = (a = 0, b = 1) => {
    sd = (sd * 16807) % 2147483647;
    return a + (b - a) * (sd / 2147483647);
  };
  const H = {
    HC, R, rnd,
    // Strähne vom Ansatz (Azimut az: 0 hinten, π vorne; Elevation el) über die Kopfform nach unten
    path(az, el, len, { out = 0.012, curl = 0.015, sideways = 0, rBase = R - 0.004, droop = 0, flare = 0, steps = 5 } = {}) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const e = el - (len / R) * s;
        const ec = Math.max(e, -0.55);
        const r = rBase + out * Math.sin(Math.PI * Math.min(1, s * 1.25)) + flare * s * s;
        const a = az + sideways * s;
        const p = new THREE.Vector3(Math.cos(ec) * Math.sin(a), Math.sin(ec), Math.cos(ec) * Math.cos(a)).multiplyScalar(r).add(HC);
        if (e < ec) p.y -= (ec - e) * R * (1 + droop);
        if (s > 0.6) {
          const kk = (s - 0.6) / 0.4;
          p.x -= (p.x - HC.x) * curl * kk * 6;
          p.z -= (p.z - HC.z) * curl * kk * 6;
        }
        pts.push(p);
      }
      return pts;
    },
    strand(pts, r0, r1 = 0.004) {
      for (let i = 0; i < pts.length - 1; i++) {
        const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
        set.add(pts[i], pts[i + 1], lerp(r0, r1, t0 ** 0.8), lerp(r0, r1, t1 ** 0.8), t1);
      }
    },
    v: (x, y, z) => new THREE.Vector3(x, y, z).add(HC),
  };
  spec(H);
  set.build();
  const fn = (x, y, z) => {
    let d = 1;
    if (cap.none !== true) {
      d = sdEllipsoid(x, y, z, HC.x, HC.y + (cap.oy ?? 0.01), HC.z + (cap.oz ?? 0.008), cap.rx ?? 0.113, cap.ry ?? 0.113, cap.rz ?? 0.12);
      d = smax(d, -sdEllipsoid(x, y, z, HC.x, HC.y - 0.032 + (cap.faceY ?? 0), HC.z - 0.085, cap.faceRx ?? 0.088, 0.085, 0.075), 0.015);
      d = smax(d, HC.y - (cap.nape ?? 0.07) - y, 0.02);
    }
    d = smin(d, set.eval(x, y, z), 0.012);
    if (extraField) d = smin(d, extraField(x, y, z), 0.01);
    return d;
  };
  const geo = polygonize(fn, min, max, res);
  const cB = col(colors.base), cT = col(colors.tip ?? colors.base), cS = col(colors.shine ?? colors.base), cI = col(colors.inner ?? colors.base);
  const v = new THREE.Vector3();
  paint(geo, (x, y, z, nx, ny, nz) => {
    const ds = set.eval(x, y, z);
    const t = ds < 0.006 && set.lastTag >= 0 ? set.lastTag : 0;
    if (ny < -0.55) return cI;
    const dy = y - HC.y;
    v.set(x - HC.x, y - HC.y, z - HC.z).normalize();
    const ang = Math.atan2(v.x, v.z), wave = 0.007 * Math.sin(ang * 9);
    if (shineBand && dy > 0.036 + wave && dy < 0.052 + wave && v.z > -0.25 && Math.sin(ang * 14 + 1.3) > -0.3 && v.x * nx + v.y * ny + v.z * nz > 0.6) return _c.copy(cB).lerp(cS, 0.75);
    return _c.copy(cB).lerp(cT, t ** 1.5);
  });
  if (back) {
    skin(geo, (x, y, z) => {
      let wb = smooth(HC.y + 0.03, HC.y - 0.07, y) * smooth(HC.z - 0.02, HC.z + 0.07, z);
      if (z > HC.z + 0.1) wb = 1;
      return [[K.bi(K.head), 1 - wb], [K.bi(K.hairBack), wb]];
    });
  } else skin(geo, () => [[K.bi(K.head), 1]]);
  K.skinned(geo, K.mat('#ffffff', { vertexColors: true, rim: 0.32, rimColor: rim }), hull);
  return { set, fn };
}

// ------------------------------------------------------------------ Kleidung (Abstandsfelder)
// Rumpf als Kette runder Kegel mit Ärmeln in A-Haltung; Teile in comp (für Farben und Gewichte).
// o: { stations: [[y, r], …] von unten nach oben, zs (Tiefe), shoulders: [rx, ry, rz], sleeve: { len, r0, r1, rE }, extra(x,y,z) → d }
export function garmentField(B, o, ap = AP) {
  const st = o.stations, zs = o.zs ?? 1.33;
  const arms = [-1, 1].map((s) => {
    const d = [s * Math.sin(ap), -Math.cos(ap)];
    const S = [s * B.shoulderX, B.shoulderY];
    const len = o.sleeve ? o.sleeve.len : 0;
    const E = [S[0] + d[0] * 0.24, S[1] + d[1] * 0.24];
    const W = [S[0] + d[0] * len, S[1] + d[1] * len];
    return { s, d, S, E, W };
  });
  const comp = { torso: 1, sl: 1, sr: 1, extra: 1 };
  const fn = (x, y, z) => {
    const zz = z * zs;
    let t = 1;
    for (let i = 0; i + 1 < st.length; i++) {
      const c = sdRoundCone(x, y, zz, 0, st[i][0], 0, 0, st[i + 1][0], 0, st[i][1], st[i + 1][1]);
      t = i ? smin(t, c, 0.04) : c;
    }
    if (o.shoulders) {
      const [rx, ry, rz] = o.shoulders;
      for (const s of [-1, 1]) t = smin(t, sdEllipsoid(x, y, z, s * (B.shoulderX - 0.03), B.shoulderY - 0.032, 0.004, rx, ry, rz), 0.05);
    }
    if (o.folds) t += o.folds * Math.sin(Math.atan2(x, z) * 11 + y * 9) * smooth(1.18, 0.84, y);
    comp.torso = t;
    let dd = t;
    if (o.sleeve) {
      const S = o.sleeve;
      for (const a of arms) {
        const Ep = [a.S[0] + a.d[0] * Math.min(0.24, S.len), a.S[1] + a.d[1] * Math.min(0.24, S.len)];
        let sl = sdRoundCone(x, y, z, a.S[0], a.S[1] + 0.012, 0, Ep[0], Ep[1], 0, S.r0, S.rE ?? S.r1);
        if (S.len > 0.24) sl = smin(sl, sdRoundCone(x, y, z, a.E[0], a.E[1], 0, a.W[0], a.W[1], 0, S.rE ?? S.r1, S.r1), 0.03);
        const along = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
        if (S.wrinkle) sl += S.wrinkle * Math.sin(along * 110 + Math.atan2(z, (x - a.S[0]) * a.s) * 2) * smooth(0.15, 0.3, along);
        sl = smax(sl, along - S.len, 0.008);
        if (a.s < 0) comp.sl = sl;
        else comp.sr = sl;
        dd = smin(dd, sl, 0.035);
      }
    }
    if (o.extra) {
      const e = o.extra(x, y, z);
      comp.extra = e;
      dd = smin(dd, e, 0.02);
    }
    let shell = o.solid ? dd : Math.abs(dd) - (o.thick ?? 0.008);
    if (o.open) shell = smax(shell, -Math.max(Math.abs(x) - o.open(y), z + 0.03), 0.012);
    if (o.hemY !== undefined) shell = smax(shell, o.hemY - y, 0.008);
    if (o.neckR) shell = smax(shell, -Math.max(Math.hypot(x, z - (o.neckZ ?? 0.008)) - o.neckR, (o.neckY ?? 1.255) - y), 0.01);
    if (o.cut) shell = smax(shell, o.cut(x, y, z), 0.008);
    return shell;
  };
  return { fn, comp, arms };
}

// Kleidungsstück polygonisieren, bemalen und auf Rumpf/Ärmel gewichten.
// paint(x, y, z, nx, ny, nz, part, along) mit part = 'torso' | 'sl' | 'sr' | 'extra'
export function garment(K, G, { bounds, res = 100, color, rim = 0.28, hem = false, hemTop = 0.86, hemBot = 0.77, hull = 0.005, extraBone = null }) {
  const geo = polygonize(G.fn, bounds[0], bounds[1], res);
  const near = (x, y, z) => {
    G.fn(x, y, z);
    const c = G.comp;
    const d = { torso: Math.abs(c.torso), sl: Math.abs(c.sl), sr: Math.abs(c.sr), extra: Math.abs(c.extra) };
    let best = 'torso';
    for (const k of ['sl', 'sr', 'extra']) if (d[k] < d[best]) best = k;
    return { best, d };
  };
  const along = (x, y, part) => {
    if (part !== 'sl' && part !== 'sr') return 0;
    const a = G.arms[part === 'sl' ? 0 : 1];
    return (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
  };
  paint(geo, (x, y, z, nx, ny, nz) => {
    const { best } = near(x, y, z);
    return color(x, y, z, nx, ny, nz, best, along(x, y, best));
  });
  const B = K.B;
  skin(geo, (x, y, z) => {
    const { d } = near(x, y, z);
    const dm = Math.min(d.torso, d.sl, d.sr, d.extra);
    const w = (v) => Math.exp(-(v - dm) / 0.015);
    const out = [];
    const wt = w(d.torso) + (extraBone ? 0 : w(d.extra));
    const wc = smooth(1.02, 1.12, y), wh = smooth(0.99, 0.9, y), ws = Math.max(0, 1 - wc - wh);
    const wHem = hem ? smooth(hemTop, hemBot, y) * 0.85 : 0;
    out.push([K.bi(K.chest), wt * wc], [K.bi(K.spine), wt * ws], [K.bi(K.hips), wt * wh * (1 - wHem)], [K.bi(K.hem), wt * wh * wHem]);
    if (extraBone) out.push([K.bi(extraBone), w(d.extra)]);
    G.arms.forEach((a, i) => {
      const wa = w(i === 0 ? d.sl : d.sr);
      const al = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
      const arm = smooth(-0.02, 0.06, al), fore = smooth(0.2, 0.28, al), hand = smooth(0.42, 0.46, al) * 0.5;
      const sb = K.side[i === 0 ? 'L' : 'R'];
      out.push([K.bi(K.chest), wa * (1 - arm)], [K.bi(sb.ua), wa * arm * (1 - fore)], [K.bi(sb.fa), wa * arm * fore * (1 - hand)], [K.bi(sb.ha), wa * arm * fore * hand]);
    });
    const m = new Map();
    for (const [b, v] of out) m.set(b, (m.get(b) ?? 0) + v);
    return [...m.entries()];
  });
  K.skinned(geo, K.mat('#ffffff', { vertexColors: true, rim }), hull);
  return geo;
}

// ------------------------------------------------------------------ Stoff und Seile
// Kapseln um Beine, Becken und Rumpf (Radien bezogen auf die Grundfigur, mit Figurmaßstab skaliert)
// Kapseln: Oberschenkel beginnen etwas unter dem Hüftgelenk (oben deckt die Beckenkapsel ab), das Becken ist
// eine kurze, querliegende Kapsel am Hüftknochen – so bleibt der Stoff an Hüfte und Po anliegend statt abzustehen.
export function bodyColliders(K, names, { thigh = 0.085, shin = 0.058, hip = 0.1, hipW = 0.045, torso = 0.14, head = 0.12 } = {}) {
  const sc = K.scale, list = [];
  const J = K.joints, B = K.B;
  for (const n of names) {
    if (n === 'legs') {
      for (const k of ['L', 'R']) {
        list.push({ from: J['thigh' + k], to: J['shin' + k], r: thigh * sc, r2: thigh * 0.72 * sc, offA: new THREE.Vector3(0, -0.06, 0) });
        list.push({ from: J['shin' + k], to: J['foot' + k], r: shin * sc, r2: shin * 0.72 * sc });
      }
    } else if (n === 'hips') {
      const y = B.hipY - B.hips[1] + 0.035;
      list.push({ from: J.hips, to: J.hips, r: hip * sc, offA: new THREE.Vector3(-hipW, y, 0.008), offB: new THREE.Vector3(hipW, y, 0.008) });
    }
    else if (n === 'torso') list.push({ from: J.hips, to: J.neck, r: torso * sc, offA: new THREE.Vector3(0, 0.04, 0.01), offB: new THREE.Vector3(0, -0.06, 0.01) });
    else if (n === 'shoulders') list.push({ from: J.upperArmL, to: J.upperArmR, r: 0.06 * sc });
    else if (n === 'head') list.push({ from: J.head, r: head * sc, offA: new THREE.Vector3(0, 0.1, 0.005), offB: new THREE.Vector3(0, 0.1, 0.005) });
    else if (n === 'arms') for (const k of ['L', 'R']) list.push({ from: J['upperArm' + k], to: J['forearm' + k], r: 0.05 * sc });
  }
  return new Colliders(list);
}

// Stoffbahn: grid(r, c) → Punkt im Modellraum (Bind-Pose); anchor = Knochen, an dem die obere Reihe sitzt
// clear: SDF der Kleidung darunter (Hose, Körper) – die Ruheform wird radial so weit nach außen geschoben, dass sie
// mit Abstand pad darüber liegt; weiter unten in derselben Spalte bleibt mindestens dieser Abstand (fällt glatt).
// barriers: [{ anchor, x, y: [y0, y1], z: [z0, z1], sides }] – undurchdringliche Quader im Modellraum (Bind-Pose), etwas
// kleiner als der Körper; der Stoff kann sie nicht durchqueren (siehe Barrier in cloth.js). An der Hüfte nur vorne/hinten hinaus.
export function addCloth(K, { anchor, rows, cols, wrap = false, grid, outer, inner, colors, uvs, colliders = ['legs', 'hips'], colliderOpts, pinned, clear = null, barriers = [], ...sim }) {
  const pts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push(grid(r, c));
  if (clear) {
    const pad = (sim.pad ?? 0.012) + 0.004;
    for (let c = 0; c < cols; c++) {
      let carry = 0;
      for (let r = 1; r < rows; r++) {
        const p = pts[r * cols + c], r0 = Math.hypot(p.x, p.z);
        if (r0 < 1e-6) continue;
        const ux = p.x / r0, uz = p.z / r0;
        let d = carry;
        while (d < 0.2 && clear(ux * (r0 + d), p.y, uz * (r0 + d)) < pad) d += 0.002;
        carry = d;
        p.x = ux * (r0 + d);
        p.z = uz * (r0 + d);
      }
    }
  }
  const rest = toLocal(pts, K.origins.get(anchor));
  const bars = barriers.map((b) => {
    const o = K.origins.get(b.anchor);
    return new Barrier(b.anchor, new THREE.Vector3(-b.x - o.x, b.y[0] - o.y, b.z[0] - o.z), new THREE.Vector3(b.x - o.x, b.y[1] - o.y, b.z[1] - o.z), b.sides ?? b.anchor !== K.hips);
  });
  const cloth = new Cloth({ anchor, rest, rows, cols, wrap, pinned, colliders: colliders ? bodyColliders(K, colliders, colliderOpts) : null, barriers: bars, ...sim });
  const mesh = clothMesh(cloth, { outer, inner, colors, uvs });
  K.cloths.push({ sim: cloth, mesh });
  return cloth;
}

// Kette (Zopf, Krawatte, Band): points im Modellraum, oberster Punkt fest
export function addRope(K, { anchor, points, radius, material, colliders = ['torso'], colliderOpts, radial = 10, ...sim }) {
  const rest = toLocal(points, K.origins.get(anchor));
  const cloth = new Cloth({ anchor, rest, rows: points.length, cols: 1, colliders: colliders ? bodyColliders(K, colliders, colliderOpts) : null, ...sim });
  const mesh = ropeMesh(cloth, { material, radius, radial });
  K.cloths.push({ sim: cloth, mesh });
  return cloth;
}

// Materialien für Stoffbahnen (Außenseite / Futter); vertexColors optional
export function clothMats(K, outer, inner, { vertexColors = false, map = null, rim = 0.25 } = {}) {
  const o = K.mat(outer, { side: THREE.FrontSide, vertexColors, map, rim });
  const i = inner ? K.mat(inner, { side: THREE.BackSide, rim: 0 }) : null;
  return [o, i];
}

// ------------------------------------------------------------------ Körper aus einem Stück
// Ein durchgehender Körper aus weich verschmolzenen Formen (Rumpf, Brust, Hüfte, Beine mit Waden,
// Arme mit Deltamuskel in A-Haltung, Hals): runde Übergänge statt Nähte an Schultern, Achseln und Hüfte.
// shape überschreibt Maße; extra(x, y, z) liefert Anbauten (Schulterkappen, Muskeln …).
export const FEMALE = {
  neckR: 0.033, sh: 0.043, chest: [0.118, 0.104, 0.08], chestY: 1.19, bust: 0.05, pecs: 0,
  waist: [0.096, 0.12, 0.072], waistY: 1.0, hips: [0.136, 0.104, 0.09], hipsY: 0.856, glute: 0.066,
  thigh: [0.078, 0.05], calf: 0.045, calfR: [0.047, 0.03], arm: [0.041, 0.032, 0.033, 0.023],
};
export const MALE = {
  neckR: 0.041, sh: 0.055, chest: [0.142, 0.115, 0.095], chestY: 1.18, bust: 0, pecs: 0.03,
  waist: [0.12, 0.12, 0.085], waistY: 1.0, hips: [0.13, 0.1, 0.088], hipsY: 0.86, glute: 0.058,
  thigh: [0.085, 0.055], calf: 0.05, calfR: [0.053, 0.035], arm: [0.05, 0.04, 0.041, 0.029],
};

export function armFrames(K) {
  const B = K.B, ap = K.AP;
  return [-1, 1].map((s) => {
    const d = [s * Math.sin(ap), -Math.cos(ap)];
    const n = [s * Math.cos(ap), Math.sin(ap)]; // nach außen
    const S = [s * B.shoulderX, B.shoulderY];
    const lu = B.shoulderY - B.elbowY, lt = B.shoulderY - B.wristY;
    return { s, d, n, S, E: [S[0] + d[0] * lu, S[1] + d[1] * lu], W: [S[0] + d[0] * lt, S[1] + d[1] * lt], lu, lt };
  });
}

// Lage eines Punkts am Arm: along ab Schultergelenk, ang 0 vorne / +π/2 außen / π hinten, perp Abstand zur Achse
export function armCoord(a, x, y, z) {
  const rx = x - a.S[0], ry = y - a.S[1];
  const along = rx * a.d[0] + ry * a.d[1];
  const out = rx * a.n[0] + ry * a.n[1];
  return { along, ang: Math.atan2(out, -z), perp: Math.hypot(out, z) };
}

// Lage eines Punkts am Bein (ang 0 vorne, +π/2 außen, π hinten)
export function legCoord(K, s, x, z) {
  return Math.atan2((x - s * K.B.hipX * 0.95) * s, -z);
}

export function bodyField(K, shape = {}) {
  const B = K.B;
  const F = { legs: true, arms: true, neck: true, ...FEMALE, ...shape };
  const arms = armFrames(K);
  const comp = { torso: 1, legL: 1, legR: 1, armL: 1, armR: 1, extra: 1 };
  const [c0, c1, c2] = F.chest, [w0, w1, w2] = F.waist, [h0, h1, h2] = F.hips;
  const fn = (x, y, z) => {
    let t;
    if (y < F.hipsY - 0.2 || Math.abs(x) > 0.3) t = Math.max(F.hipsY - 0.16 - y, Math.abs(x) - 0.22, 0.06);
    else {
    t = sdEllipsoid(x, y, z, 0, F.chestY, 0.002, c0, c1, c2);
    t = smin(t, sdEllipsoid(x, y, z, 0, F.waistY, 0, w0, w1, w2), 0.07);
    t = smin(t, sdEllipsoid(x, y, z, 0, F.hipsY, 0.006, h0, h1, h2), 0.07);
    for (const s of [-1, 1]) {
      t = smin(t, sdRoundCone(x, y, z, s * 0.03, B.shoulderY + 0.03, 0.012, s * (B.shoulderX - 0.012), B.shoulderY - 0.004, 0.004, F.sh, F.sh * 0.92), 0.04);
      if (F.bust) t = smin(t, sdEllipsoid(x, y, z, s * 0.053, F.chestY - 0.028, -0.05, F.bust * 1.08, F.bust, F.bust * 0.9), 0.035);
      if (F.pecs) t = smin(t, sdEllipsoid(x, y, z, s * 0.062, F.chestY + 0.012, -0.062, 0.07, 0.05, F.pecs), 0.045);
      if (F.glute) t = smin(t, sdEllipsoid(x, y, z, s * 0.058, F.hipsY - 0.045, 0.034, F.glute, F.glute * 1.1, F.glute * 0.85), 0.04);
    }
    if (F.neck) t = smin(t, sdRoundCone(x, y, z, 0, B.shoulderY + 0.01, 0.012, 0, B.head[1] + 0.035, 0.006, F.neckR * 1.18, F.neckR), 0.035);
    }
    comp.torso = t;
    let d = t;
    for (const s of [-1, 1]) {
      const hx = s * B.hipX;
      // Bereichsprüfung: weit weg vom Bein → nur grober Abstand (spart den Großteil der Rechenzeit)
      if (!F.legs || y > B.hipY + 0.14 || Math.abs(x - hx) > 0.17) {
        const l = Math.max(y - B.hipY - 0.1, Math.abs(x - hx) - 0.1, 0.06);
        comp[s < 0 ? 'legL' : 'legR'] = l;
        continue;
      }
      let l = sdRoundCone(x, y, z, hx, B.hipY + 0.01, 0.004, hx * 0.94, B.kneeY + 0.02, -0.004, F.thigh[0], F.thigh[1]);
      l = smin(l, sdEllipsoid(x, y, z, hx * 0.94, B.kneeY, -0.012, F.thigh[1] * 0.98, F.thigh[1] * 1.05, F.thigh[1] * 0.95), 0.03);
      l = smin(l, sdRoundCone(x, y, z, hx * 0.94, B.kneeY, 0, hx * 0.97, B.ankleY + 0.03, 0.004, F.calfR[0], F.calfR[1]), 0.03);
      l = smin(l, sdEllipsoid(x, y, z, hx * 0.95, B.kneeY - 0.12, 0.014, F.calf, F.calf * 1.7, F.calf * 1.05), 0.04);
      l = smin(l, sdRoundCone(x, y, z, hx * 0.97, B.ankleY + 0.03, 0.004, hx * 0.97, 0.035, 0, F.calfR[1], F.calfR[1] * 0.96), 0.02);
      comp[s < 0 ? 'legL' : 'legR'] = l;
      d = smin(d, l, 0.045);
    }
    for (const a of arms) {
      const [r0, rE, rF, rW] = F.arm;
      const ac = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
      const ao = (x - a.S[0]) * a.n[0] + (y - a.S[1]) * a.n[1];
      if (!F.arms || ac < -0.12 || ac > a.lt + 0.1 || Math.abs(ao) > 0.14 || Math.abs(z) > 0.14) {
        const m = Math.max(-0.12 - ac, ac - a.lt - 0.08, Math.abs(ao) - 0.1, Math.abs(z) - 0.1, 0.05);
        comp[a.s < 0 ? 'armL' : 'armR'] = m;
        continue;
      }
      let m = sdRoundCone(x, y, z, a.S[0], a.S[1], 0, a.E[0], a.E[1], 0, r0, rE);
      m = smin(m, sdEllipsoid(x, y, z, a.S[0] + a.d[0] * 0.035 + a.n[0] * 0.006, a.S[1] + a.d[1] * 0.035 + a.n[1] * 0.006, 0, r0 * 1.15, r0 * 1.35, r0 * 1.12), 0.03);
      m = smin(m, sdRoundCone(x, y, z, a.E[0], a.E[1], 0, a.W[0], a.W[1], 0, rF, rW), 0.02);
      m = smin(m, sdEllipsoid(x, y, z, a.E[0] + a.d[0] * 0.065, a.E[1] + a.d[1] * 0.065, -0.004, rF * 1.12, rF * 1.7, rF * 1.08), 0.03);
      comp[a.s < 0 ? 'armL' : 'armR'] = m;
      d = smin(d, m, 0.028);
    }
    if (F.extra) {
      const e = F.extra(x, y, z);
      comp.extra = e;
      d = smin(d, e, F.extraK ?? 0.012);
    }
    if (F.cut) d = smax(d, F.cut(x, y, z), 0.006);
    return d;
  };
  return { fn, comp, arms, F };
}

// Gewichte aus der Lage im Körper (Bind-Pose mit Armen in A-Haltung)
// seg: Körperfeld (bodyField), aus dem das Kleidungsstück aufgeweitet wurde – dann entscheidet die Form selbst,
// ob ein Punkt zum Arm oder zum Rumpf gehört (dicke Ärmel folgen dem Arm vollständig, die Achsel bleibt am Rumpf).
export function bodyWeights(K, x, y, z, { hem = false, hemTop = 0.86, hemBot = 0.77, arms = null, seg = null } = {}) {
  const B = K.B, out = [];
  const A = arms ?? armFrames(K);
  if (seg) seg.fn(x, y, z);
  let rest = 1;
  for (const a of A) {
    const c = armCoord(a, x, y, z);
    const near = seg ? smooth(0.012, -0.012, seg.comp[a.s < 0 ? 'armL' : 'armR'] - seg.comp.torso) * smooth(0.16, 0.13, c.perp) : smooth(0.085, 0.062, c.perp);
    const m = smooth(-0.06, 0.075, c.along) * near * (a.s * x > 0.05 ? 1 : 0);
    if (m <= 0) continue;
    const sd = K.side[a.s < 0 ? 'L' : 'R'];
    const fore = smooth(a.lu - 0.035, a.lu + 0.035, c.along), hand = smooth(a.lt - 0.015, a.lt + 0.02, c.along);
    out.push([K.bi(sd.ua), m * (1 - fore)], [K.bi(sd.fa), m * fore * (1 - hand)], [K.bi(sd.ha), m * fore * hand]);
    rest -= m;
  }
  for (const s of [-1, 1]) {
    const m = smooth(B.hipY + 0.045, B.hipY - 0.085, y) * smooth(-0.004, 0.03, s * x) * rest;
    if (m <= 0) continue;
    const sd = K.side[s < 0 ? 'L' : 'R'];
    const shin = smooth(B.kneeY + 0.05, B.kneeY - 0.05, y), foot = smooth(B.ankleY + 0.03, B.ankleY - 0.02, y);
    out.push([K.bi(sd.th), m * (1 - shin)], [K.bi(sd.sn), m * shin * (1 - foot)], [K.bi(sd.ft), m * shin * foot]);
    rest -= m;
  }
  if (rest > 0) {
    const wHead = smooth(B.head[1] - 0.01, B.head[1] + 0.03, y), wNeck = smooth(B.neck[1] - 0.02, B.neck[1] + 0.03, y) * (1 - wHead);
    const r2 = rest * (1 - wNeck - wHead);
    const wc = smooth(1.02, 1.12, y), wh = smooth(0.99, 0.9, y), ws = Math.max(0, 1 - wc - wh);
    const wHem = hem ? smooth(hemTop, hemBot, y) * 0.85 : 0;
    out.push([K.bi(K.head), rest * wHead], [K.bi(K.neck), rest * wNeck], [K.bi(K.chest), r2 * wc], [K.bi(K.spine), r2 * ws], [K.bi(K.hips), r2 * wh * (1 - wHem)], [K.bi(K.hem), r2 * wh * wHem]);
  }
  const m = new Map();
  for (const [b, v] of out) m.set(b, (m.get(b) ?? 0) + v);
  return [...m.entries()];
}

// Körper polygonisieren, bemalen und gewichten.
// color(x, y, z, nx, ny, nz, part, G): part = 'torso' | 'legL' | 'legR' | 'armL' | 'armR' | 'extra'
export function body(K, { shape = {}, color, res = 172, hull = 0.005, rim = 0.22, hem = false, field = null, yMin = 0.02 } = {}) {
  const G = field ?? bodyField(K, shape);
  const A = G.arms;
  const ext = Math.max(...A.map((a) => Math.abs(a.W[0]))) + 0.06;
  const geo = polygonize(G.fn, new THREE.Vector3(yMin > 1 ? -0.2 : -ext, yMin, -0.17), new THREE.Vector3(yMin > 1 ? 0.2 : ext, K.B.head[1] + 0.06, 0.16), res, 400000);
  paint(geo, (x, y, z, nx, ny, nz) => {
    G.fn(x, y, z);
    const c = G.comp;
    let part = 'torso', best = Math.abs(c.torso);
    for (const k of ['legL', 'legR', 'armL', 'armR', 'extra']) if (Math.abs(c[k]) < best) { best = Math.abs(c[k]); part = k; }
    return color(x, y, z, nx, ny, nz, part, G);
  });
  skin(geo, (x, y, z) => bodyWeights(K, x, y, z, { hem, arms: A }));
  K.skinned(geo, K.mat('#ffffff', { vertexColors: true, rim }), hull);
  return G;
}

// beliebige Geometrie (Kleidungsstück als Abstandsfeld) wie den Körper gewichten
export function autoSkin(K, geo, opts) {
  return skin(geo, (x, y, z) => bodyWeights(K, x, y, z, opts));
}

// Kleidungsschale als Abstandsfeld, gewichtet wie der Körper
export function shell(K, fn, bounds, { color, res = 110, hull = 0.004, rim = 0.25, hem = false, seg = null } = {}) {
  const geo = polygonize(fn, bounds[0], bounds[1], res, 300000);
  paint(geo, color);
  autoSkin(K, geo, { hem, seg });
  K.skinned(geo, K.mat('#ffffff', { vertexColors: true, rim }), hull);
  return geo;
}

// ------------------------------------------------------------------ weiche Farbkanten
// soft(d): 1 innen (d < 0), 0 außen, mit weicher Kante der Breite w (gegen Treppenstufen)
export const soft = (d, w = 0.0045) => smooth(w, -w, d);
const _mc = new THREE.Color();
// Grundfarbe mit Lagen [Farbe, Deckkraft] überdecken
export function layered(base, layers) {
  _mc.copy(base);
  for (const [c, t] of layers) if (t > 0.001) _mc.lerp(c, Math.min(1, t));
  return _mc;
}

// ------------------------------------------------------------------ Kleidung aus der Körperform
// Gehört der zuletzt ausgewertete Punkt eher zum Arm als zum Rumpf? (für Schnitte, die nur den Rumpf betreffen sollen,
// z. B. den Saum – im A-Pose reichen die Ärmel unter die Saumhöhe)
export const onArm = (G) => Math.min(G.comp.armL, G.comp.armR) < G.comp.torso;

// Körperform ohne Beine (oder ohne Arme), um inflate aufgeweitet: sitzt passgenau und bewegt sich mit.
export function fitted(K, shape, inflate, { wrinkle = 0, cut = null } = {}) {
  const G = bodyField(K, shape);
  const fn = (x, y, z) => {
    let d = G.fn(x, y, z) - inflate;
    if (wrinkle) d += wrinkle * Math.sin(Math.atan2(x, z) * 9 + y * 41) * Math.sin(y * 23 + x * 30);
    if (cut) d = smax(d, cut(x, y, z, G), 0.006);
    return d;
  };
  return { fn, G };
}

// Hose: Gesäß und zwei gerade Hosenbeine (bis hemY), oben am Bund waistY flach abgeschnitten
export function trousersField(K, o = {}) {
  const B = K.B;
  const wy = o.waistY ?? 0.98, r0 = o.legTop ?? 0.092, r1 = o.legBot ?? 0.062, hem = o.hemY ?? 0.055;
  const [wx, wz] = o.waist ?? [0.13, 0.095];
  const seatY = (wy + 0.74) / 2, seatR = (wy - 0.74) / 2 + 0.05;
  return (x, y, z) => {
    if (y > wy + 0.04 || Math.abs(x) > 0.3 || y < hem - 0.03) return Math.max(y - wy - 0.03, hem - 0.02 - y, Math.abs(x) - 0.26, 0.04);
    let d = sdEllipsoid(x, y, z, 0, seatY, 0.006, wx, seatR, wz);
    for (const s of [-1, 1]) {
      const hx = s * B.hipX;
      d = smin(d, sdRoundCone(x, y, z, hx * 1.04, B.hipY + 0.02, 0.004, hx * (o.toeIn ?? 0.98), hem, 0.006, r0, r1), o.crotch ?? 0.05);
    }
    if (o.wrinkle) d += o.wrinkle * Math.sin(y * 70 + Math.atan2(x, z) * 3) * smooth(0.5, 0.1, y);
    d = smax(d, y - wy, 0.006);
    d = smax(d, hem - y, 0.004);
    return d;
  };
}

// Vorderseite einer Fläche bei (x, y) suchen (z < 0), z. B. für Krawatten auf der Brust
export function frontZ(fn, x, y, from = -0.25) {
  let z = from;
  while (z < 0.05 && fn(x, y, z) > 0) z += 0.002;
  return z;
}
