import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone, polygonize, paint } from '../sdf.js';
import { RB, body, bodyField, armFrames, armCoord, fitted, shell, frontZ, trousersField, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, col, smooth, soft, layered, sphere, MALE, onArm } from '../charkit.js';

// Joker (Persona 5): schwarzes, lockiges Haar, weiße Maske, schwarzer Frack mit hohem, aufgestelltem Kragen
// und langen Schößen, graue gemusterte Weste mit Goldknöpfen, rote Handschuhe, schwarze Hose, spitze
// dunkle Stiefel. Ohne Messer.
const C = {
  skin: '#f2d9c8', coat: '#1c1b22', coatEdge: '#2c2a33', lining: '#2a2a31', vest: '#34333c', vestLine: '#4a4955', gold: '#c9a24a',
  glove: '#c41f2c', belt: '#2e2d35', buckle: '#8a8c94', pants: '#1c1c22', boot: '#2b1e1b', mask: '#f4f4f2', maskLine: '#15141a',
  hair: '#17171d', hairTip: '#262634', hairShine: '#5a5c84', hairInner: '#0c0c10',
};

export function buildJoker(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), coat = col(C.coat), edge = col(C.coatEdge), vest = col(C.vest), vline = col(C.vestLine), mask = col(C.mask), mline = col(C.maskLine);
  const A = armFrames(K);
  const shape = { ...MALE, chest: [0.135, 0.112, 0.09], waist: [0.112, 0.12, 0.08], arm: [0.046, 0.037, 0.038, 0.027] };
  const G = bodyField(K, shape);
  body(K, { field: G, res: 64, yMin: 1.26, color: () => skin });

  // Hose und Stiefel
  const T = trousersField(K, { waistY: 0.97, waist: [0.125, 0.09], legTop: 0.084, legBot: 0.058, hemY: 0.05, crotch: 0.04 });
  shell(K, T,
    [new THREE.Vector3(-0.27, 0.03, -0.14), new THREE.Vector3(0.27, 1.02, 0.14)], { res: 112, color: () => col(C.pants) });
  shoes(K, shoeField({ len: 1.08, width: 0.88, height: 1.05, toe: 1.3, heel: 0.02, sole: 0.012 }), () => col(C.boot));

  // Weste (unter dem offenen Frack sichtbar): Rautenmuster, Goldknöpfe
  const V = fitted(K, { ...shape, legs: false, arms: false, neck: false }, 0.008, { cut: (x, y) => Math.max(0.88 - y, y - 1.3) });
  shell(K, V.fn, [new THREE.Vector3(-0.2, 0.85, -0.14), new THREE.Vector3(0.2, 1.32, 0.13)], {
    res: 96, color: (x, y) => layered(vest, [[vline, soft(Math.abs(Math.sin((x + y) * 90)) - 0.1, 0.06) * 0.6], [vline, soft(Math.abs(Math.sin((x - y) * 90)) - 0.1, 0.06) * 0.6]]),
  });
  // hoher, dunkelgrauer Stehkragen unter dem Frack (deckt den Hals)
  const neckRing = (x, y, z) => smax(Math.abs(Math.hypot(x / 1.04, z - 0.006) - 0.05) - 0.007, Math.abs(y - 1.325) - 0.045, 0.006);
  shell(K, neckRing, [new THREE.Vector3(-0.08, 1.26, -0.08), new THREE.Vector3(0.08, 1.39, 0.08)], { res: 72, color: () => vest, rim: 0.3, hull: 0.002 });
  for (let i = 0; i < 4; i++) {
    const y = 1.17 - i * 0.065;
    P.add(K.chest, sphere(0.007, 10, 8), K.mat(C.gold, { rim: 0.5 }), { pos: [0.018, y, frontZ(V.fn, 0.018, y) - 0.002], hull: 0.001 });
  }

  // Frack oben: weit, vorne offen bis zum Kragen, Ärmel bis zum Handgelenk
  const open = (y) => 0.012 + 0.032 * smooth(1.0, 1.27, y); // oben V-Ausschnitt, zur Taille hin geschlossen
  const coatF = fitted(K, { ...shape, legs: false, neck: false, arm: [0.036, 0.03, 0.031, 0.024] }, 0.02, {
    wrinkle: 0.0015,
    cut: (x, y, z, G) => {
      let c = onArm(G) ? -1 : 0.9 - y + (z < -0.02 ? -0.06 : 0); // vorne bis zur Hüfte, hinten Schoßansatz
      for (const a of A) if (a.s * x > 0.13) c = Math.max(c, (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1] - a.lt - 0.004);
      c = Math.max(c, Math.min(open(y) - Math.abs(x), -z - 0.01));
      return c;
    },
  });
  // aufgestellter, nach außen gebogener Kragen (hinten und an den Seiten)
  const collar = (x, y, z) => {
    if (y < 1.26 || y > 1.56) return Math.max(1.26 - y, y - 1.56, 0.02);
    const r = 0.068 + 0.3 * Math.max(0, y - 1.3) ** 1.4;
    let d = Math.abs(Math.hypot(x / 1.05, z - 0.012) - r) - 0.007;
    d = smax(d, -(z + 0.035 - (y - 1.3) * 0.5), 0.01);
    return smax(d, Math.max(1.27 - y, y - 1.52 + 0.06 * Math.abs(x) / 0.1), 0.01);
  };
  const coatFn = (x, y, z) => smin(coatF.fn(x, y, z), collar(x, y, z), 0.012);
  shell(K, coatFn, [new THREE.Vector3(-0.38, 0.8, -0.18), new THREE.Vector3(0.38, 1.58, 0.2)], {
    res: 132, seg: coatF.G,
    color: (x, y, z) => {
      const lap = Math.abs(Math.abs(x) - open(y)) - 0.012 + (z < 0 ? 0 : 1);
      let cuff = 1;
      for (const a of A) if (a.s * x > 0.13) cuff = Math.min(cuff, Math.abs(armCoord(a, x, y, z).along - (a.lt - 0.03)) - 0.018);
      return layered(coat, [[edge, soft(lap, 0.004)], [edge, soft(cuff, 0.003)], [edge, soft(Math.abs(y - 1.4) - 0.2, 0.01) * (y > 1.3 && z > -0.03 ? 0.5 : 0)]]);
    },
  });
  // Gürtel über dem Frack an der Taille mit Schnalle
  const belt = fitted(K, { ...shape, legs: false, neck: false, arms: false }, 0.027, { cut: (x, y) => Math.abs(y - 0.99) - 0.015 });
  shell(K, belt.fn, [new THREE.Vector3(-0.2, 0.95, -0.15), new THREE.Vector3(0.2, 1.03, 0.14)], { res: 100, color: () => col(C.belt), rim: 0.35, hull: 0.002 });
  P.add(K.spine, RB(0.034, 0.03, 0.01, 0.004), K.mat(C.buckle, { rim: 0.5 }), { pos: [0, 0.99, frontZ(belt.fn, 0, 0.99) - 0.002], hull: 0.0015 });
  hands(K, () => col(C.glove));

  // Frackschöße: drei lange Bahnen (links, Mitte hinten, rechts), schwingen beim Laufen und Schwingen
  const rows = 13, cols = 7;
  for (const [a0, a1] of [[-2.25, -0.95], [-0.62, 0.62], [0.95, 2.25]]) {
    const s = Math.sign(a0 + a1);
    addCloth(K, {
      anchor: K.hips, rows, cols,
      grid: (r, c) => {
        const t = r / (rows - 1);
        const a = a0 + (c / (cols - 1)) * (a1 - a0);
        const y = 0.935 - (s === 0 ? 0.68 : 0.6) * t;
        const rx = 0.142 + 0.07 * t, rz = 0.11 + 0.06 * t;
        return new THREE.Vector3(Math.sin(a) * rx + s * 0.02 * t, y, Math.cos(a) * rz + 0.01 + 0.012 * Math.sin(c * 1.6) * t);
      },
      outer: K.mat(C.coat, { side: THREE.FrontSide, rim: 0.35 }), inner: K.mat(C.lining, { side: THREE.BackSide, rim: 0 }),
      colliders: ['legs', 'hips'], colliderOpts: { thigh: 0.09, shin: 0.064, hip: 0.098, hipW: 0.078 }, pad: 0.012, clear: T,
      shape: 0.009, maxDev: (t) => 0.01 + 0.75 * t, inertia: 0.82, wind: 0.72, gust: 0.45, stretch: 1, bend: 0.28,
    });
  }

  // Kopf: graue Augen, schmales Lächeln, Ohren
  head(K, faceTexture({
    skin: C.skin, iris: ['#2b2d38', '#5d6072', '#a5a9bd'], blush: 0.04,
    eye: { shape: 'sharp', w: 0.95, h: 0.88, lash: 5, tilt: 0.05, tail: false }, lash: '#15141a',
    brow: { color: '#17171d', w: 5, y: -56, arch: 4, angle: 4 },
    mouth: { type: 'smile', w: 9, color: '#8f4a4a', lw: 2.6 },
  }), { r: 0.1, jaw: 0.27, ears: true, skin: C.skin });
  // Maske: weiße Schale vor den Augen mit spitzen Flügeln nach oben außen, schwarz umrandete Augenlöcher
  const ym = HC.y - 0.004;
  const maskShape = (x, y) => {
    const ax = Math.abs(x);
    let d = Math.hypot((ax - 0.045) / 0.056, (y - ym) / 0.036) - 1;
    d = Math.min(d, Math.max(ax - 0.02, Math.abs(y - ym - 0.004) - 0.018) / 0.03);
    const tip = Math.max(0.07 - ax, ax - 0.11, ym - 0.012 - y, y - (ym + 0.016 + (ax - 0.07) * 1.7)) / 0.02;
    return Math.min(d, tip);
  };
  const holes = (x, y) => Math.hypot((Math.abs(x) - 0.042) / 0.024, (y - ym + 0.001) / 0.015) - 1;
  const mfn = (x, y, z) => {
    const shellD = Math.abs(Math.hypot(x - HC.x, y - HC.y, (z - HC.z) * 1.02) - 0.107) - 0.0035;
    return Math.max(shellD, maskShape(x, y) * 0.02, -holes(x, y) * 0.012, z - HC.z + 0.035);
  };
  const mg = polygonize(mfn, new THREE.Vector3(HC.x - 0.125, ym - 0.05, HC.z - 0.12), new THREE.Vector3(HC.x + 0.125, ym + 0.09, HC.z - 0.02), 88);
  paint(mg, (x, y) => layered(mask, [[mline, soft(holes(x, y) - 0.25, 0.08)]]));
  P.add(K.head, mg, K.mat('#ffffff', { vertexColors: true, rim: 0.3 }), { hull: 0.002 });

  // Lockiges, volles schwarzes Haar: Locken in die Stirn, über den Ohren, hinten wuschelig
  hair(K, (H) => {
    const { rnd } = H;
    for (let i = 0; i < 12; i++) {
      const off = -0.75 + (1.5 * i) / 11 + rnd(-0.04, 0.04);
      H.strand(H.path(Math.PI + off, 1.2, 0.09 + rnd(0, 0.03), { out: 0.02, rBase: 0.114, sideways: rnd(-0.25, 0.25), curl: -0.03 }), rnd(0.02, 0.026), 0.005);
    }
    for (const s of [-1, 1]) {
      for (const az of [0.95, 1.25, 1.55, 1.85, 2.15, 2.45, 2.75]) {
        H.strand(H.path(Math.PI + s * (az + rnd(-0.06, 0.06)), rnd(0.75, 1.0), rnd(0.12, 0.16), { out: rnd(0.02, 0.03), curl: rnd(-0.05, 0.02), sideways: rnd(-0.3, 0.3), rBase: 0.112 }), rnd(0.025, 0.032), 0.006);
      }
    }
    for (let i = 0; i < 14; i++) H.strand(H.path(rnd(0, Math.PI * 2), rnd(1.0, 1.45), rnd(0.07, 0.11), { out: rnd(0.02, 0.035), curl: rnd(-0.06, 0.03), sideways: rnd(-0.5, 0.5), rBase: 0.112 }), rnd(0.026, 0.034), 0.008);
    for (const az of [-0.35, 0, 0.35]) H.strand(H.path(az, 0.6, 0.1, { out: 0.025, curl: -0.04, rBase: 0.11 }), 0.028, 0.006);
  }, { cap: { rx: 0.118, ry: 0.118, rz: 0.124 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#8088c0', seed: 51, res: 128, k: 0.012, shineBand: false });
}
