import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone, sdRoundBox, polygonize, paint } from '../sdf.js';
import { body, bodyField, armFrames, armCoord, fitted, shell, frontZ, trousersField, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, col, smooth, soft, layered, RB, cyl, torus, MALE, onArm } from '../charkit.js';

// Scientist (Half-Life): Glatze mit grauem Haarkranz, dicke schwarze Brille, älteres Gesicht.
// Offener weißer Laborkittel bis zum Knie (Saum schwingt), hellblaues Hemd, rot-dunkelblau gestreifte
// Krawatte, khakifarbene Hose, dunkelbraune Schuhe.
const C = {
  skin: '#e7c1a4', coat: '#eeeeea', coatShade: '#c9c9c4', shirt: '#86a6d2', shirtShade: '#6f8fbd', tieA: '#a8232c', tieB: '#1d2650',
  pants: '#8e826a', shoe: '#3e2b1f', shoeDark: '#271a12', frame: '#141416', hair: '#b9b3ac', hairTip: '#9d968f', hairInner: '#7c766f',
};

export function buildScientist(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), coat = col(C.coat), cshade = col(C.coatShade), shirt = col(C.shirt), sshade = col(C.shirtShade);
  const A = armFrames(K);
  const shape = { ...MALE, chest: [0.138, 0.112, 0.094], waist: [0.124, 0.12, 0.092], hips: [0.13, 0.1, 0.09], pecs: 0.022 };
  const G = bodyField(K, shape);
  body(K, { field: G, res: 64, yMin: 1.26, color: () => skin });

  // Hose und Schuhe
  const T = trousersField(K, { waistY: 0.96, waist: [0.13, 0.096], legTop: 0.088, legBot: 0.064, hemY: 0.05, crotch: 0.045 });
  shell(K, T,
    [new THREE.Vector3(-0.27, 0.03, -0.14), new THREE.Vector3(0.27, 1.01, 0.14)], { res: 108, color: () => col(C.pants) });
  const sh = col(C.shoe), sd = col(C.shoeDark);
  shoes(K, shoeField({ len: 1.05, width: 0.95, height: 0.85, toe: 1.0, sole: 0.016 }), (x, y) => (y < 0.018 ? sd : sh));

  // Hemd mit Kragen
  const S = fitted(K, { ...shape, legs: false, arms: false, neck: false }, 0.008, { cut: (x, y) => Math.max(0.9 - y, y - 1.31) });
  const shirtCollar = (x, y, z) => {
    let d = smax(Math.abs(Math.hypot(x / 1.06, z - 0.004) - 0.055) - 0.006, Math.abs(y - 1.322) - 0.024, 0.004);
    for (const s of [-1, 1]) d = smin(d, sdRoundCone(x, y, (z + 0.07) * 2.4 - 0.07, s * 0.012, 1.33, -0.066, s * 0.05, 1.29, -0.08, 0.011, 0.004), 0.004);
    return d;
  };
  const shirtFn = (x, y, z) => smin(S.fn(x, y, z), shirtCollar(x, y, z), 0.006);
  shell(K, shirtFn, [new THREE.Vector3(-0.2, 0.88, -0.15), new THREE.Vector3(0.2, 1.36, 0.14)], { res: 96, color: (x, y, z) => layered(shirt, [[sshade, soft(Math.abs(x) - 0.002, 0.001) * (z < 0 ? 1 : 0)]]) });

  // gestreifte Krawatte (frei schwingend), Knoten am Kragen
  const stripe = (r, c, cc) => cc.copy(((r * 2 + c) % 4) < 1 ? col(C.tieB) : col(C.tieA));
  P.add(K.chest, RB(0.028, 0.026, 0.016, 0.006), K.mat(C.tieA), { pos: [0, 1.3, frontZ(shirtFn, 0, 1.3) - 0.004], hull: 0.002 });
  const rows = 11;
  addCloth(K, {
    anchor: K.chest, rows, cols: 3,
    grid: (r, c) => {
      const y = 1.285 - (0.33 * r) / (rows - 1);
      const w = 0.012 + 0.016 * (r / (rows - 1));
      const x = (c - 1) * w;
      return new THREE.Vector3(x, y + (r === rows - 1 && c !== 1 ? 0.014 : 0), frontZ(shirtFn, x, y) - 0.005);
    },
    colors: stripe, outer: K.mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, rim: 0.2 }), inner: null,
    colliders: ['torso'], colliderOpts: { torso: 0.124 }, pad: 0.004,
    shape: 0.035, maxDev: (t) => 0.03 + 0.2 * t, inertia: 0.68, wind: 0.45, gust: 0.4, bend: 0.5,
  });

  // Laborkittel oben: weit, offen mit Revers, Brusttasche, Ärmel bis zum Handgelenk
  const open = (y) => 0.05 + 0.05 * smooth(1.24, 1.0, y);
  const coatF = fitted(K, { ...shape, legs: false, neck: false, arm: [0.038, 0.033, 0.034, 0.028] }, 0.022, {
    wrinkle: 0.0015,
    cut: (x, y, z, G) => {
      let c = onArm(G) ? -1 : 0.92 - y;
      for (const a of A) if (a.s * x > 0.13) c = Math.max(c, (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1] - a.lt - 0.004);
      c = Math.max(c, Math.min(open(y) - Math.abs(x), -z - 0.01));
      c = Math.max(c, Math.min(y - 1.29, 0.075 - Math.hypot(x, z - 0.012))); // Halsausschnitt
      return c;
    },
  });
  const coatCollar = (x, y, z) => smax(smax(Math.abs(Math.hypot(x / 1.08, z - 0.014) - 0.074) - 0.008, Math.abs(y - 1.315) - 0.03, 0.004), -(z + 0.035), 0.006);
  shell(K, (x, y, z) => smin(coatF.fn(x, y, z), coatCollar(x, y, z), 0.01), [new THREE.Vector3(-0.38, 0.78, -0.19), new THREE.Vector3(0.38, 1.37, 0.19)], {
    res: 128, seg: coatF.G,
    color: (x, y, z, nx, ny) => {
      const pocket = Math.max(Math.abs(x + 0.085) - 0.03, Math.abs(y - 1.15) - 0.035) + (z < 0 ? 0 : 1);
      const lap = Math.abs(Math.abs(x) - open(y)) - 0.01 + (z < 0 ? 0 : 1);
      return layered(coat, [[cshade, soft(Math.abs(pocket) - 0.002, 0.0015)], [cshade, soft(lap, 0.003) * 0.6], [cshade, soft(0.3 + ny, 0.25) * 0.3]]);
    },
  });
  // Kittelsaum bis zum Knie, vorne offen (Stoffsimulation)
  const crows = 10, ccols = 21, gap = 0.4;
  addCloth(K, {
    anchor: K.hips, rows: crows, cols: ccols,
    grid: (r, c) => {
      const t = r / (crows - 1);
      const a = Math.PI + gap + (c / (ccols - 1)) * (Math.PI * 2 - gap * 2);
      const y = 0.935 - 0.47 * t;
      const rx = 0.158 + 0.045 * t, rz = 0.122 + 0.03 * t;
      return new THREE.Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz + 0.008);
    },
    outer: K.mat(C.coat, { side: THREE.FrontSide, rim: 0.25 }), inner: K.mat(C.coatShade, { side: THREE.BackSide, rim: 0 }),
    colliders: ['legs', 'hips'], colliderOpts: { thigh: 0.092, shin: 0.066, hip: 0.104, hipW: 0.078 }, pad: 0.014, clear: T,
    barriers: [{ anchor: K.hips, x: 0.11, y: [0.76, 0.92], z: [-0.06, 0.06] }],
    shape: 0.0015, maxDev: (t) => 0.02 + 0.7 * t, inertia: 1, damping: 0.995, wind: 0.62, gust: 0.38, bend: 0.35, iterations: 6,
  });
  hands(K, () => skin, { w: 1.08 });

  // Kopf: älteres Gesicht mit Falten, kleine Augen, graue Brauen, längeres Kinn, Ohren
  head(K, faceTexture({
    skin: C.skin, iris: ['#2b2a24', '#5a5440', '#9a9070'], blush: 0.06, wrinkles: 'rgba(150,95,75,0.45)', sparkles: false,
    eye: { shape: 'narrow', w: 0.8, h: 0.75, lash: 4, tail: false, iris: 0.8, crease: true }, lash: '#3a2a24',
    brow: { color: '#a8a29c', w: 6, y: -54, arch: 3, angle: 3 }, noseFull: true, noseW: 3,
    mouth: { type: 'neutral', w: 13, color: '#8a5048', lw: 3 }, shade: 'rgba(120,70,60,0.25)',
  }), { r: 0.1, jaw: 0.18, sy: 1.12, sx: 0.98, ears: true, skin: C.skin });
  // Haarkranz: an den Seiten und hinten, oben kahl
  hair(K, (H) => {
    const { rnd } = H;
    for (const s of [-1, 1]) for (const az of [1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75]) H.strand(H.path(Math.PI + s * (az + rnd(-0.06, 0.06)), rnd(0.38, 0.5), rnd(0.07, 0.09), { out: rnd(0.012, 0.02), curl: 0.02, sideways: rnd(-0.15, 0.15), rBase: 0.105 }), rnd(0.02, 0.025), 0.007);
    H.strand(H.path(0, 0.42, 0.075, { out: 0.008, curl: 0.02, rBase: 0.105 }), 0.022, 0.008);
  }, { cap: { none: true }, colors: { base: C.hair, tip: C.hairTip, inner: C.hairInner }, rim: '#ffe6cc', seed: 9, res: 96, back: false, shineBand: false, k: 0.014 });
  // Brille: dicke schwarze Rahmen, Steg, Bügel zu den Ohren
  const ey = HC.y - 0.008, ez = HC.z - 0.104;
  const glasses = (x, y, z) => {
    let d = 1;
    for (const s of [-1, 1]) {
      const fx = x - s * 0.04, fy = y - ey;
      const ring = Math.abs(Math.hypot(Math.max(Math.abs(fx) - 0.012, 0), Math.max(Math.abs(fy) - 0.006, 0)) - 0.014) - 0.0035;
      d = Math.min(d, Math.max(ring, Math.abs(z - ez) - 0.004));
      d = Math.min(d, sdRoundCone(x, y, z, s * 0.068, ey + 0.004, ez + 0.002, s * 0.1, ey + 0.002, HC.z - 0.005, 0.0028, 0.0024));
    }
    d = Math.min(d, sdRoundCone(x, y, z, -0.012, ey + 0.004, ez - 0.002, 0.012, ey + 0.004, ez - 0.002, 0.003, 0.003));
    return d;
  };
  const gg = polygonize(glasses, new THREE.Vector3(HC.x - 0.115, ey - 0.03, ez - 0.012), new THREE.Vector3(HC.x + 0.115, ey + 0.03, HC.z + 0.01), 96);
  paint(gg, () => col(C.frame));
  P.add(K.head, gg, K.mat('#ffffff', { vertexColors: true, rim: 0.3 }), { hull: 0.0015 });
}
