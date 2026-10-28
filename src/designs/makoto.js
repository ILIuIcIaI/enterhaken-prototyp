import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone } from '../sdf.js';
import { body, bodyField, armFrames, armCoord, fitted, shell, frontZ, trousersField, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, col, smooth, soft, layered, canvas, tex, cyl, sphere, RB, torus, MALE, onArm } from '../charkit.js';

// Makoto Yuki (Persona 3): dunkelblaues Haar mit langem Pony über dem rechten Auge, graublaue Augen.
// Schuluniform: offenes schwarzes Sakko mit petrolgrünem Futter, weißes Hemd mit schmaler schwarzer Schleife,
// rote Armbinde „S.E.E.S.“ am linken Oberarm, weißer Gürtel, schwarze Hose, Handschuhe und Schuhe.
// Ohne Schwert und ohne Waffe am Gürtel.
const C = {
  skin: '#f3dccd', shirt: '#e6ebf1', shirtShade: '#c3cbd6', blazer: '#272733', blazerEdge: '#383846', lining: '#16161b',
  ribbon: '#15151a', red: '#c8302c', belt: '#e8e8e8', buckle: '#a8acb4', pants: '#262630', shoe: '#1c1c22', glove: '#23232e', badge: '#a9adb8', phones: '#353a47', phonesRim: '#9aa6c0',
  hair: '#27355f', hairTip: '#394c88', hairShine: '#7f93d4', hairInner: '#171f3d',
};

function armbandTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = C.red;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#141414';
  g.fillRect(0, 0, 256, 6);
  g.fillRect(0, 58, 256, 6);
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('S.E.E.S', 64, 34);
  g.fillText('S.E.E.S', 192, 34);
  return tex(c);
}

export function buildMakoto(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), shirt = col(C.shirt), sshade = col(C.shirtShade), blazer = col(C.blazer), edge = col(C.blazerEdge);
  const A = armFrames(K);
  const shape = { ...MALE, chest: [0.125, 0.108, 0.086], waist: [0.108, 0.12, 0.077], hips: [0.122, 0.098, 0.085], arm: [0.045, 0.036, 0.037, 0.026] };
  const G = bodyField(K, shape);
  body(K, { field: G, res: 64, yMin: 1.26, color: () => skin });

  // Hose mit weißem Gürtel, Schuhe
  const T = trousersField(K, { waistY: 0.95, waist: [0.122, 0.088], legTop: 0.083, legBot: 0.06, hemY: 0.05, crotch: 0.04 });
  shell(K, T,
    [new THREE.Vector3(-0.27, 0.03, -0.14), new THREE.Vector3(0.27, 1.0, 0.14)], { res: 112, color: (x, y) => (y > 0.915 ? col(C.belt) : col(C.pants)) });
  P.add(K.hips, RB(0.04, 0.03, 0.012, 0.004), K.mat(C.buckle, { rim: 0.5 }), { pos: [0, 0.933, -0.094], hull: 0.002 });
  shoes(K, shoeField({ len: 1.05, width: 0.9, height: 0.85, toe: 1.1, sole: 0.012 }), (x, y) => (y < 0.014 ? col('#0c0c0f') : col(C.shoe)));

  // Hemd (am Hals sichtbar und unter dem offenen Sakko)
  const S = fitted(K, { ...shape, legs: false, arms: false, neck: false }, 0.008, { cut: (x, y) => Math.max(0.9 - y, y - 1.31) });
  const shirtCollar = (x, y, z) => smax(Math.abs(Math.hypot(x / 1.06, z - 0.004) - 0.052) - 0.006, Math.abs(y - 1.325) - 0.026, 0.004);
  const shirtFn = (x, y, z) => smin(S.fn(x, y, z), shirtCollar(x, y, z), 0.006);
  shell(K, shirtFn, [new THREE.Vector3(-0.2, 0.88, -0.14), new THREE.Vector3(0.2, 1.36, 0.13)], {
    res: 96, color: (x, y, z) => layered(shirt, [[sshade, soft(Math.abs(x) - 0.002, 0.001) * (z < 0 ? 1 : 0)]]),
  });
  // schmale Schleife am Kragen mit zwei Bändern
  const kz = frontZ(shirtFn, 0, 1.3) - 0.004;
  for (const s of [-1, 1]) P.add(K.chest, sphere(0.011, 10, 8), K.mat(C.ribbon), { pos: [s * 0.012, 1.3, kz], scale: [1.4, 0.7, 0.5], hull: 0.0015 });
  for (const s of [-1, 1]) {
    const x0 = s * 0.006, x1 = s * 0.016, y0 = 1.292, y1 = 1.215;
    const z0 = frontZ(shirtFn, x0, y0) - 0.003, z1 = frontZ(shirtFn, x1, y1) - 0.003;
    const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    P.add(K.chest, RB(0.0065, L, 0.003, 0.002), K.mat(C.ribbon), { pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], rot: [Math.atan2(z0 - z1, y0 - y1), 0, Math.atan2(x1 - x0, y0 - y1)], hull: 0.001 });
  }

  // Sakko oben: vorne offen, Ärmel bis zum Handgelenk; unten schwingender Saum (Stoff)
  const open = (y) => 0.045 + 0.04 * smooth(1.22, 0.96, y);
  const J = fitted(K, { ...shape, legs: false, neck: false, arm: [0.034, 0.028, 0.029, 0.022] }, 0.02, {
    wrinkle: 0.0012,
    cut: (x, y, z, G) => {
      let c = onArm(G) ? -1 : 0.93 - y;
      for (const a of A) if (a.s * x > 0.13) c = Math.max(c, (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1] - a.lt - 0.004);
      c = Math.max(c, Math.min(open(y) - Math.abs(x), -z - 0.01));
      c = Math.max(c, Math.min(y - 1.29, 0.072 - Math.hypot(x, z - 0.01))); // Halsausschnitt
      return c;
    },
  });
  const jacketCollar = (x, y, z) => {
    let d = Math.abs(Math.hypot(x / 1.08, z - 0.012) - 0.07) - 0.008;
    d = smax(d, Math.abs(y - 1.315) - 0.03, 0.004);
    return smax(d, -(z + 0.03), 0.006);
  };
  shell(K, (x, y, z) => smin(J.fn(x, y, z), jacketCollar(x, y, z), 0.01), [new THREE.Vector3(-0.38, 0.78, -0.18), new THREE.Vector3(0.38, 1.38, 0.18)], {
    res: 132, seg: J.G,
    color: (x, y, z) => {
      const lap = Math.abs(Math.abs(x) - open(y)) - 0.01 + (z < 0 ? 0 : 1);
      let cuff = 1;
      for (const a of A) if (a.s * x > 0.13) cuff = Math.min(cuff, Math.abs(armCoord(a, x, y, z).along - (a.lt - 0.03)) - 0.015);
      return layered(blazer, [[edge, soft(lap, 0.004)], [edge, soft(cuff, 0.003)]]);
    },
  });
  // Saum des Sakkos bis zur Oberschenkelmitte, vorne offen
  const rows = 6, cols = 21, gap = 0.36;
  addCloth(K, {
    anchor: K.hips, rows, cols,
    grid: (r, c) => {
      const t = r / (rows - 1);
      const a = Math.PI + gap + (c / (cols - 1)) * (Math.PI * 2 - gap * 2);
      const y = 0.945 - 0.22 * t;
      const rx = 0.142 + 0.012 * t, rz = 0.106 + 0.008 * t;
      return new THREE.Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz + 0.008);
    },
    outer: K.mat(C.blazer, { side: THREE.FrontSide, rim: 0.4 }), inner: K.mat(C.lining, { side: THREE.BackSide, rim: 0 }),
    colliders: ['legs', 'hips'], colliderOpts: { thigh: 0.088, hip: 0.096, hipW: 0.077 }, pad: 0.012, clear: T,
    shape: 0.028, maxDev: (t) => 0.01 + 0.17 * t, inertia: 0.68, wind: 0.5, gust: 0.35, stretch: 1, bend: 0.4,
  });
  // Armbinde links: Radien am Ärmel gemessen (liegt eng an)
  const aL = A[0], along = 0.115;
  const cx = aL.S[0] + aL.d[0] * along, cy = aL.S[1] + aL.d[1] * along;
  const reach = (ox, oz) => {
    for (let r = 0.03; r < 0.12; r += 0.0005) if (J.fn(cx + aL.n[0] * ox * r, cy + aL.n[1] * ox * r, oz * r) > 0) return r;
    return 0.06;
  };
  const rn = reach(1, 0) + 0.003, rz = Math.max(reach(0, 1), reach(0, -1)) + 0.003;
  // Teile am Armknochen liegen im Raum des senkrecht hängenden Arms (der Knochen dreht sie in die A-Pose)
  P.add(K.side.L.ua, new THREE.CylinderGeometry(1, 0.97, 0.05, 40, 1, true), K.mat('#ffffff', { map: armbandTexture(), rim: 0.3 }), {
    pos: [aL.s * B.shoulderX, B.shoulderY - along, 0], scale: [rn, 1, rz], hull: 0.002,
  });
  // Schulabzeichen auf der linken Brust
  const bx = -0.088, by = 1.205, bz = frontZ(J.fn, bx, by) - 0.001;
  P.add(K.chest, cyl(0.017, 0.017, 0.004, 24), K.mat('#3a3c44', { rim: 0.3 }), { pos: [bx, by, bz], rot: [Math.PI / 2 - 0.25, 0, 0], hull: 0.0012 });
  P.add(K.chest, cyl(0.012, 0.012, 0.004, 24), K.mat(C.badge, { rim: 0.5 }), { pos: [bx, by, bz - 0.0015], rot: [Math.PI / 2 - 0.25, 0, 0], hull: 0 });
  // Kopfhörer um den Hals: Bügel hinten, Muscheln liegen vorne seitlich auf dem Kragen
  const R = 0.096, hy = 1.335, arcStart = -0.6;
  P.add(K.chest, torus(R, 0.0075, 8, 40, Math.PI - 2 * arcStart), K.mat(C.phones, { rim: 0.4 }), { pos: [0, hy + 0.012, 0.006], rot: [Math.PI / 2, 0, arcStart], hull: 0.0015 });
  for (const phi of [arcStart, Math.PI - arcStart]) {
    const dir = new THREE.Vector3(Math.cos(phi) * 0.88, 0.48, Math.sin(phi) * 0.88).normalize();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    const c0 = new THREE.Vector3(Math.cos(phi) * R, hy - 0.004, Math.sin(phi) * R + 0.006);
    P.add(K.chest, cyl(0.027, 0.025, 0.02, 24), K.mat(C.phones, { rim: 0.45 }), { pos: c0.toArray(), rot: [e.x, e.y, e.z], hull: 0.0015 });
    P.add(K.chest, cyl(0.017, 0.017, 0.004, 24), K.mat(C.phonesRim, { rim: 0.5 }), { pos: c0.addScaledVector(dir, 0.0105).toArray(), rot: [e.x, e.y, e.z], hull: 0 });
  }
  hands(K, () => col(C.glove));

  // Kopf: graublaue Augen (rechtes unter dem Pony), ruhiger Blick
  head(K, faceTexture({
    skin: C.skin, iris: ['#1f2b46', '#4f6791', '#9db3d8'], blush: 0.04,
    eye: { shape: 'tired', w: 0.95, h: 0.9, lash: 5, tail: false }, lash: '#141a2a',
    brow: { color: '#26325a', w: 4.2, y: -57, arch: 4, angle: 2 },
    mouth: { type: 'neutral', w: 8, color: '#9a5a5a', lw: 2.4 },
  }), { r: 0.1, jaw: 0.27, ears: true, skin: C.skin });

  // Haare: stufig mit spitzen Strähnen, oben voll; langer Pony fällt über das rechte Auge (von vorne gesehen links),
  // Mitte und linke Seite kürzer und zur Seite gekämmt; Seiten decken die Ohren halb, hinten spitz bis zum Nacken
  hair(K, (H) => {
    const { rnd } = H;
    for (const [off, len] of [[-0.5, 0.2], [-0.36, 0.215], [-0.22, 0.2], [-0.08, 0.165]]) {
      H.strand(H.path(Math.PI + off, 1.2, len + rnd(0, 0.01), { out: 0.014, rBase: 0.114, sideways: -0.16, curl: 0.01, steps: 7 }), 0.03, 0.004);
    }
    for (const [off, len] of [[0.08, 0.125], [0.24, 0.115], [0.4, 0.11], [0.56, 0.1]]) {
      H.strand(H.path(Math.PI + off, 1.25, len, { out: 0.014, rBase: 0.114, sideways: -0.34, curl: 0.004, steps: 6 }), 0.027, 0.004);
    }
    for (const s of [-1, 1]) {
      for (const az of [1.05, 1.3, 1.55, 1.8, 2.05, 2.3]) {
        H.strand(H.path(Math.PI + s * (az + rnd(-0.05, 0.05)), rnd(0.8, 0.95), rnd(0.14, 0.17), { out: rnd(0.016, 0.022), flare: 0.012, curl: 0.006, sideways: s * rnd(-0.06, 0.06), rBase: 0.112, steps: 6 }), rnd(0.022, 0.026), 0.0035);
      }
    }
    for (const az of [-0.8, -0.48, -0.16, 0.16, 0.48, 0.8]) H.strand(H.path(az + rnd(-0.05, 0.05), rnd(0.7, 0.85), rnd(0.16, 0.19), { out: 0.02, flare: 0.012, curl: 0.006, rBase: 0.112, steps: 6 }), 0.026, 0.0035);
    for (let i = 0; i < 9; i++) H.strand(H.path((i / 9) * Math.PI * 2 + 0.3, rnd(1.3, 1.45), rnd(0.1, 0.13), { out: 0.022, curl: 0, rBase: 0.11 }), 0.026, 0.004);
  }, { cap: { rx: 0.113, ry: 0.115, rz: 0.12, nape: 0.05 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#8aa0ff', seed: 77, res: 140, k: 0.009 });
}
