import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone } from '../sdf.js';
import { body, armFrames, armCoord, fitted, trousersField, shell, frontZ, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, addRope, col, smooth, soft, layered, RB, MALE, FEMALE, onArm } from '../charkit.js';

// Makima (Chainsaw Man): lachsrotes langes Haar mit geradem Pony, Seitensträhnen bis zur Schulter und einem
// Zopf, der über den Rücken fällt; goldene Augen mit Ringen; weißes Hemd mit Kragen und schmaler schwarzer
// Krawatte, hoch geschnittene anthrazitfarbene Stoffhose, braune Lederschuhe.
const C = {
  skin: '#f7e0d4', shirt: '#eee8d8', shirtShade: '#d3ccba', pants: '#2f3237', pantsDark: '#222429', tie: '#16161a',
  shoe: '#5e3b25', shoeDark: '#36221a', hair: '#d9706a', hairTip: '#c25a55', hairShine: '#ffc0b0', hairInner: '#a5504a',
};

export function buildMakima(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), shirt = col(C.shirt), shade = col(C.shirtShade), pants = col(C.pants), dark = col(C.pantsDark);
  const A = armFrames(K);
  const shape = { bust: 0.045, hips: [0.128, 0.102, 0.088], waist: [0.092, 0.12, 0.07], thigh: [0.074, 0.047], calfR: [0.045, 0.029] };

  // Körper (sichtbar: Hals, Hände; der Rest liegt unter der Kleidung)
  body(K, { shape, res: 64, yMin: 1.24, color: () => skin });

  // Hemd: Körperform ohne Beine, leicht weit, mit feinen Falten; in die Hose gesteckt, Ärmel bis zum Handgelenk
  const S = fitted(K, { ...shape, legs: false, neck: false }, 0.011, {
    wrinkle: 0.0009,
    cut: (x, y, z, G) => {
      let c = onArm(G) ? -1 : 0.94 - y; // in der Hose (Ärmel ausgenommen)
      for (const a of A) {
        const al = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
        if (a.s * x > 0.12) c = Math.max(c, al - (a.lt + 0.006));
      }
      c = Math.max(c, -(B.shoulderY + 0.055 - y)); // oben offen für den Hals
      c = Math.max(c, -Math.max(Math.hypot(x, z - 0.006) - 0.05, 1.28 - y));
      return c;
    },
  });
  const collar = (x, y, z) => {
    let d = Math.abs(Math.hypot(x / 1.08, z - 0.006) - 0.047) - 0.0065;
    d = smax(d, Math.abs(y - 1.335) - 0.03, 0.004);
    d = smax(d, -(Math.abs(x) - 0.014 - (1.365 - y) * 0.25) + (z > -0.02 ? 1 : 0), 0.004);
    for (const s of [-1, 1]) d = smin(d, sdRoundCone(x, y, (z + 0.066) * 2.6 - 0.066, s * 0.012, 1.33, -0.06, s * 0.046, 1.288, -0.075, 0.011, 0.004), 0.004);
    return d;
  };
  const shirtFn = (x, y, z) => smin(S.fn(x, y, z), collar(x, y, z), 0.006);
  shell(K, shirtFn, [new THREE.Vector3(-0.37, 0.78, -0.17), new THREE.Vector3(0.37, 1.4, 0.16)], {
    res: 124, seg: S.G,
    color: (x, y, z, nx, ny) => {
      let cuff = 1;
      for (const a of A) if (a.s * x > 0.12) cuff = Math.min(cuff, Math.abs(armCoord(a, x, y, z).along - (a.lt - 0.035)) - 0.02);
      const placket = Math.abs(Math.abs(x) - 0.011) - 0.0012 + (z > 0 || y > 1.29 ? 1 : 0);
      return layered(shirt, [[shade, soft(cuff + 0.016, 0.002) * 0.9], [shade, soft(placket, 0.001)], [shade, soft(0.25 + ny, 0.2) * 0.25]]);
    },
  });

  // Hose: hoher Bund in Nabelhöhe, gerade Beine, Bügelfalte
  const T = trousersField(K, { waistY: 1.0, waist: [0.112, 0.086], legTop: 0.082, legBot: 0.057, hemY: 0.05, wrinkle: 0.0015, crotch: 0.04 });
  shell(K, T, [new THREE.Vector3(-0.27, 0.03, -0.14), new THREE.Vector3(0.27, 1.05, 0.14)], {
    res: 118,
    color: (x, y, z) => {
      const crease = Math.abs(Math.abs(x) - B.hipX) - 0.0015 + (z > -0.03 || y > 0.82 ? 1 : 0);
      return layered(pants, [[dark, soft(Math.abs(y - 0.985) - 0.014, 0.002)], [dark, soft(crease, 0.001) * 0.7]]);
    },
  });

  hands(K, () => skin);
  const sh = col(C.shoe), sd = col(C.shoeDark);
  shoes(K, shoeField({ len: 1.02, width: 0.9, height: 0.82, toe: 1.12, sole: 0.014 }), (x, y, z) => {
    if (y < 0.016) return sd;
    if (y > 0.06 && z < -0.03 && z > -0.1 && Math.abs(x) < 0.02) return ((z * 70) % 1 + 1) % 1 < 0.35 ? sd : sh;
    return sh;
  });

  // Krawatte: Knoten fest am Kragen, Blatt frei schwingend über dem Hemd
  P.add(K.chest, RB(0.026, 0.024, 0.014, 0.006), K.mat(C.tie), { pos: [0, 1.298, frontZ(shirtFn, 0, 1.298) - 0.004], hull: 0.002 });
  const tieRows = 11, tieTop = 1.285, tieBot = 1.0;
  addCloth(K, {
    anchor: K.chest, rows: tieRows, cols: 3,
    grid: (r, c) => {
      const y = tieTop - ((tieTop - tieBot) * r) / (tieRows - 1);
      const w = 0.011 + 0.011 * (r / (tieRows - 1)) + (r === tieRows - 1 ? -0.008 : 0);
      const x = (c - 1) * w;
      return new THREE.Vector3(x, y - (r === tieRows - 1 && c !== 1 ? -0.012 : 0), frontZ(shirtFn, x, y) - 0.004);
    },
    pinned: (r) => r === 0,
    outer: K.mat(C.tie, { side: THREE.DoubleSide, rim: 0.2 }), inner: null,
    colliders: ['torso'], colliderOpts: { torso: 0.088 }, pad: 0.004,
    shape: 0.06, maxDev: (t) => 0.03 + 0.12 * t, inertia: 0.5, wind: 0.35, gust: 0.4, stretch: 1, bend: 0.5,
  });

  // Kopf: goldene Augen mit Ringen, sanftes Lächeln
  head(K, faceTexture({
    skin: C.skin, iris: ['#94600f', '#e0aa2e', '#fbe08a'], rings: 'rgba(120,70,10,0.75)', sparkles: false, blush: 0.14,
    eye: { shape: 'tired', w: 1.02, h: 0.96, lash: 7, tilt: 0.04, iris: 1.02 }, lash: '#3a1a1a',
    brow: { color: '#b2483a', w: 3.2, y: -60, arch: 7 },
    mouth: { type: 'smile', w: 10, color: '#b2505a', lw: 2.8 },
  }), { r: 0.102 });

  // Haare: gerader Pony, lange Seitensträhnen, hinten glatt zum Nacken gekämmt
  const nape = new THREE.Vector3(HC.x - 0.012, HC.y - 0.1, HC.z + 0.098);
  hair(K, (H) => {
    const { rnd } = H;
    for (let i = 0; i < 11; i++) {
      const off = -0.7 + (1.4 * i) / 10;
      H.strand(H.path(Math.PI + off + rnd(-0.02, 0.02), 1.08, 0.125 + rnd(-0.006, 0.006) - Math.abs(off) * 0.01, { out: 0.003, rBase: 0.113, sideways: off * 0.08, curl: 0 }), 0.016, 0.003);
    }
    for (const s of [-1, 1]) {
      H.strand(H.path(Math.PI + s * 0.9, 0.82, 0.25, { out: 0.007, curl: 0.016, sideways: -s * 0.05, rBase: 0.113, droop: 0.25 }), 0.024, 0.004);
      H.strand(H.path(Math.PI + s * 1.1, 0.88, 0.24, { out: 0.01, curl: 0.016, rBase: 0.113, droop: 0.22 }), 0.026, 0.005);
      // Seiten und Hinterkopf glatt nach hinten zum Zopfansatz
      for (const az of [1.4, 1.75, 2.1, 2.45, 2.8]) {
        const a = Math.PI + s * az, top = H.v(Math.cos(0.9) * Math.sin(a) * 0.113, Math.sin(0.9) * 0.113, Math.cos(0.9) * Math.cos(a) * 0.113);
        const mid = H.v(Math.sin(a) * 0.112, -0.035, Math.cos(a) * 0.112 + 0.01);
        H.strand([top, mid, nape.clone()], 0.024, 0.016);
      }
    }
    H.strand([H.v(0, 0.085, 0.08), H.v(0, 0.02, 0.118), nape.clone()], 0.028, 0.02);
  }, { cap: { rx: 0.114, ry: 0.114, rz: 0.12, nape: 0.1 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#ffb08a', seed: 21, res: 128, k: 0.009, back: false });

  // Zopf über den Rücken (Kette mit Flechtmuster), am Ende ein Haargummi
  const braidPts = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    braidPts.push(new THREE.Vector3(nape.x - 0.014 * t, nape.y - 0.015 - t * 0.36, nape.z + 0.014 + 0.024 * Math.sin(t * Math.PI)));
  }
  addRope(K, {
    anchor: K.head, points: braidPts, radial: 12,
    radius: (t, a) => (t > 0.9 ? 0.014 * (1 - (t - 0.9) * 6) + 0.005 : (0.03 - 0.01 * t) * (0.84 + 0.2 * Math.abs(Math.sin(a + t * 40)))),
    material: K.mat(C.hair, { rim: 0.3, rimColor: '#ffb08a' }),
    colliders: ['torso', 'shoulders'], colliderOpts: { torso: 0.1 }, pad: 0.02,
    pinned: (r) => r === 0, shape: 0.02, maxDev: (t) => 0.06 + 0.3 * t, inertia: 0.45, wind: 0.4, gust: 0.3, bend: 0.6,
  });
}
