import * as THREE from 'three';
import { sdEllipsoid } from '../sdf.js';
import { body, armFrames, armCoord, legCoord, hands, shoes, shoeField, head, faceTexture, hair, col, smooth, soft, layered, RB } from '../charkit.js';

// Rei Ayanami (Neon Genesis Evangelion) im weißen Plugsuit: hellblauer Bob, rote Augen, enger Anzug mit
// dunkelblauen Seitenfeldern, Schulterkappen mit runden Anschlüssen, Streifen an Armen und Oberschenkeln,
// hoher Kragen mit rotem Ring, rote Akzente an den Schultern, graues Brustmodul, grünes Licht unter der Brust,
// weiße Handschuhe und Stiefel, weiße Nervenclips (A10) seitlich im Haar.
const C = {
  skin: '#f6e1d8', suit: '#f4f3ef', shade: '#cfd0d4', panel: '#26315c', black: '#1c2344', module: '#4a4c56', red: '#d23a2a', green: '#6fb44e', clip: '#ecebef', clipDark: '#3c3e48', sole: '#17171c',
  hair: '#8fb3ec', hairTip: '#7396d8', hairShine: '#e2eeff', hairInner: '#5a70b8',
};

export function buildRei(K) {
  const suit = col(C.suit), shade = col(C.shade), panel = col(C.panel), black = col(C.black), red = col(C.red), green = col(C.green), skinC = col(C.skin), module = col(C.module), sole = col(C.sole);
  const { P, HC } = K;
  const A = armFrames(K);
  // Schulterkappen: aufgesetzte, runde Schalen über dem Deltamuskel
  const caps = A.map((a) => [a.S[0] + a.d[0] * 0.03 + a.n[0] * 0.012, a.S[1] + a.d[1] * 0.03 + a.n[1] * 0.012 + 0.006, -0.002]);
  const capDir = A.map((a) => new THREE.Vector3(a.n[0] * 0.55, a.n[1] * 0.55 + 0.5, -0.66).normalize());
  const v = new THREE.Vector3();

  body(K, {
    shape: {
      hips: [0.124, 0.1, 0.086], waist: [0.094, 0.12, 0.07], glute: 0.06, thigh: [0.074, 0.048],
      extra: (x, y, z) => Math.min(sdEllipsoid(x, y, z, caps[0][0], caps[0][1], caps[0][2], 0.06, 0.054, 0.058), sdEllipsoid(x, y, z, caps[1][0], caps[1][1], caps[1][2], 0.06, 0.054, 0.058)),
      extraK: 0.008,
    },
    color: (x, y, z, nx, ny, nz, part) => {
      if (part === 'extra') {
        const i = x < 0 ? 0 : 1, c = caps[i];
        const d = v.set(x - c[0], y - c[1], z - c[2]).normalize().dot(capDir[i]);
        return layered(suit, [[shade, soft(0.9 - d, 0.01)], [panel, soft(0.945 - d, 0.008)]]);
      }
      if (part === 'armL' || part === 'armR') {
        const a = A[part === 'armL' ? 0 : 1], c = armCoord(a, x, y, z);
        const fore = Math.max(a.lu + 0.025 - c.along, Math.abs(c.ang - 1.7) * 0.04 - 0.036);
        const upper = Math.max(Math.abs(c.along - (a.lu * 0.55 + 0.03)) - a.lu * 0.32, Math.abs(c.ang - 1.6) * 0.04 - 0.014);
        return layered(suit, [
          [shade, soft(Math.abs(c.along - a.lu) - 0.008, 0.003) * (c.ang > 0.6 ? 1 : 0)],
          [panel, soft(Math.min(fore, upper), 0.003)],
          [black, soft(a.lt - 0.032 - c.along, 0.003)],
        ]);
      }
      if (part === 'legL' || part === 'legR') {
        const s = part === 'legL' ? -1 : 1, ang = legCoord(K, s, x, z);
        let slash = 1;
        for (const y0 of [0.745, 0.69, 0.635]) slash = Math.min(slash, Math.max(Math.abs(y - y0 - (ang - 0.9) * 0.03) - 0.009, Math.abs(ang - 0.95) * 0.06 - 0.03));
        const seam = Math.max(Math.abs(ang - 1.57) * 0.06 - 0.006, Math.abs(y - 0.48) - 0.12);
        const knee = Math.max(Math.abs(Math.hypot((y - 0.445) / 1.2, ang * 0.05) - 0.044) - 0.004, 0);
        return layered(suit, [
          [shade, soft(knee, 0.003)],
          [panel, soft(Math.min(slash, seam), 0.003)],
          [black, soft(Math.max(0.15 - y, 2.35 - Math.abs(ang)) * -1 < 0 ? Math.max(y - 0.15, (2.3 - Math.abs(ang)) * 0.05) : 1, 0.004)],
          [black, soft(y - 0.07, 0.004)],
        ]);
      }
      // Rumpf und Hals
      const ang = Math.atan2(x, -z), side = Math.abs(Math.abs(ang) - Math.PI / 2);
      const oval = Math.hypot(x / 1.3, y - 1.255) - 0.014 + (z > 0 ? 1 : 0);
      const front = 0.95 - 0.5 * smooth(1.12, 0.92, y);
      const sidePanel = Math.max(Math.abs(y - 1.065) - 0.14, (front - Math.abs(ang)) * 0.09, (Math.abs(ang) - 2.15) * 0.09, (side - 0.78) * 0.09);
      return layered(suit, [
        [shade, soft(Math.abs(x) - 0.002, 0.0015) * (z < 0 && y > 0.79 && y < 1.3 ? 1 : 0)],
        [panel, soft(sidePanel, 0.003)],
        [module, soft(oval, 0.002)],
        [red, soft(Math.max(Math.abs(Math.abs(x) - 0.078) - 0.024, Math.abs(y - 1.31) - 0.013) + (z > 0.01 ? 1 : 0), 0.002)],
        [panel, soft(Math.max(Math.abs(x) - 0.011, Math.abs(y - 1.35) - 0.045) + (z > 0 ? 1 : 0), 0.002)],
        [red, soft(Math.abs(y - 1.36) - 0.008, 0.002)],
        [green, soft(Math.hypot((x + 0.022) / 1.7, y - 1.095) - 0.011 + (z > 0 ? 1 : 0), 0.002)],
        [skinC, soft(1.398 - y, 0.003)],
      ]);
    },
  });

  hands(K, (x, y) => (y > 0.835 ? black : suit));
  shoes(K, shoeField({ len: 0.94, width: 0.92, height: 1.05, toe: 0.85, sole: 0.012 }), (x, y, z) => (y < 0.016 || z > 0.035 ? sole : suit));

  // Kopf: rote, ruhige Augen, kleiner neutraler Mund
  head(K, faceTexture({
    skin: C.skin, iris: ['#4a0710', '#b8202c', '#ff8d7e'], blush: 0.12,
    eye: { shape: 'tired', w: 0.98, h: 1.0, lash: 6.5, iris: 0.95 }, lash: '#2a1a30',
    brow: { color: '#7a8cc0', w: 3, y: -58, arch: 6 },
    mouth: { type: 'neutral', w: 8, color: '#b0606a', lw: 2.6 },
  }), { r: 0.102 });

  // A10-Nervenclips: weiße, schräg sitzende Clips oben seitlich am Kopf
  for (const s of [-1, 1]) {
    P.add(K.head, RB(0.018, 0.05, 0.026, 0.007), K.mat(C.clip, { rim: 0.35 }), { pos: [HC.x + s * 0.121, HC.y + 0.04, HC.z - 0.035], rot: [0.2, 0, s * 0.5], hull: 0.002 });
    P.add(K.head, RB(0.02, 0.014, 0.028, 0.005), K.mat(C.clipDark, { rim: 0.3 }), { pos: [HC.x + s * 0.126, HC.y + 0.03, HC.z - 0.037], rot: [0.2, 0, s * 0.5], hull: 0.0015 });
  }

  // Kurzer Bob: stufiger Pony mit deutlichen Spitzen bis über die Augen, spitze Seitensträhnen bis zum Kinn
  hair(K, (H) => {
    const { rnd } = H;
    for (const [off, len] of [[-0.62, 0.096], [-0.47, 0.122], [-0.31, 0.135], [-0.16, 0.118], [-0.02, 0.142], [0.13, 0.122], [0.28, 0.136], [0.44, 0.118], [0.6, 0.1]]) {
      H.strand(H.path(Math.PI + off + rnd(-0.02, 0.02), 1.07, len * rnd(0.95, 1.04), { out: 0.003, rBase: 0.112, sideways: rnd(-0.05, 0.05), curl: 0.002 }), 0.015, 0.002);
    }
    for (const s of [-1, 1]) {
      H.strand(H.path(Math.PI + s * 0.9, 0.8, 0.205, { out: 0.005, curl: 0.022, sideways: -s * 0.06, rBase: 0.112 }), 0.018, 0.002);
      H.strand(H.path(Math.PI + s * 1.1, 0.84, 0.19, { out: 0.007, curl: 0.026, rBase: 0.112 }), 0.02, 0.002);
      for (const off of [1.36, 1.62, 1.9, 2.18, 2.48, 2.8]) {
        H.strand(H.path(Math.PI + s * (off + rnd(-0.04, 0.04)), rnd(0.86, 0.96), rnd(0.165, 0.185), { out: rnd(0.005, 0.01), curl: 0.03, sideways: s * rnd(0.01, 0.05), rBase: 0.111 }), rnd(0.021, 0.025), 0.002);
      }
    }
    H.strand(H.path(0, 0.92, 0.17, { out: 0.009, curl: 0.03, rBase: 0.111 }), 0.025, 0.002);
    for (let i = 0; i < 6; i++) H.strand(H.path((i / 6) * Math.PI * 2 + rnd(0, 0.4), rnd(1.3, 1.42), rnd(0.07, 0.09), { out: 0.005, curl: 0, rBase: 0.109 }), 0.024);
  }, { cap: { rx: 0.112, ry: 0.112, rz: 0.118 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#c4d2ff', seed: 7, res: 132, k: 0.008 });
}
