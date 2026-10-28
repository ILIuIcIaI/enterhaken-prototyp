import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone, polygonize, paint } from '../sdf.js';
import { body, bodyField, armFrames, armCoord, legCoord, fitted, shell, frontZ, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, col, smooth, soft, layered, canvas, tex, sphere, cyl, onArm } from '../charkit.js';

// 2B (NieR:Automata): weiß-silberner Bob mit schwarzem Haarreif, schwarze Augenbinde, rote Lippen mit
// Muttermal. Schwarzes Gothic-Kleid: Stehkragen, rautenförmiges Brustfenster mit beiger Stickerei,
// Puffärmel, Federbesatz an den Manschetten, schwarze Handschuhe, ausgestellter Rock vorne offen mit grauer
// Stickerei am Saum, kniehohe schwarze Absatzstiefel und durchscheinende Strümpfe. Ohne Schwert.
const C = {
  skin: '#f6e2d8', black: '#1e1c23', blackSoft: '#2d2a33', beige: '#c8b48c', gray: '#6c6a72', white: '#f2f1ee',
  sheer: '#5b4c4c', hair: '#e8e8ec', hairTip: '#cfcfd8', hairShine: '#ffffff', hairInner: '#a4a4b4', lips: '#b02a3a',
};

function skirtTexture() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = C.black;
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = 'rgba(120,118,128,0.85)';
  g.lineWidth = 3;
  // Rankenband über dem Saum
  for (let x = 0; x < 1024; x += 64) {
    g.beginPath();
    g.moveTo(x, 200);
    g.bezierCurveTo(x + 16, 150, x + 48, 150, x + 64, 200);
    g.stroke();
    g.beginPath();
    g.arc(x + 32, 168, 10, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = C.white;
  g.fillRect(0, 236, 1024, 5);
  return tex(c);
}

export function buildTwoB(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), black = col(C.black), blackSoft = col(C.blackSoft), beige = col(C.beige), white = col(C.white), sheer = col(C.sheer);
  const A = armFrames(K);
  const shape = { bust: 0.051, hips: [0.13, 0.102, 0.088], waist: [0.092, 0.12, 0.069], thigh: [0.076, 0.047] };
  const G = bodyField(K, shape);

  // Körper: Stiefel bis übers Knie, darüber durchscheinende Strümpfe, schwarzer Body unter dem Rock
  body(K, {
    field: G,
    color: (x, y, z, nx, ny, nz, part) => {
      if (part === 'legL' || part === 'legR') return layered(skin, [[sheer, soft(y - 0.7, 0.006) * 0.75], [black, soft(y - 0.555, 0.003)]]);
      if (part === 'torso') return layered(skin, [[black, soft(y - 0.96, 0.004) * (y > 0.7 ? 1 : 0)]]);
      return skin;
    },
  });
  // Stiefelschaft etwas weiter als das Bein
  const boot = fitted(K, { ...shape, arms: false, neck: false }, 0.006, { cut: (x, y) => y - 0.56 });
  shell(K, boot.fn, [new THREE.Vector3(-0.2, 0.03, -0.11), new THREE.Vector3(0.2, 0.6, 0.11)], {
    res: 96, color: (x, y) => layered(black, [[blackSoft, soft(Math.abs(y - 0.545) - 0.012, 0.002)]]),
  });
  shoes(K, shoeField({ len: 1.0, width: 0.82, height: 0.95, toe: 1.2, heel: 0.055, sole: 0.01 }), () => black);

  // Oberteil: Stehkragen, Rautenfenster, enge Unterärmel bis zum Handgelenk
  const diamond = (x, y) => Math.abs(x) / 0.034 + Math.abs(y - 1.2) / 0.05 - 1;
  const top = fitted(K, { ...shape, legs: false }, 0.007, {
    cut: (x, y, z, G) => {
      let c = Math.max(onArm(G) ? -1 : 0.9 - y, y - 1.405);
      for (const a of A) if (a.s * x > 0.12) c = Math.max(c, (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1] - a.lt - 0.004);
      c = Math.max(c, Math.min(-diamond(x, y) * 0.03, -z - 0.02));
      return c;
    },
  });
  shell(K, top.fn, [new THREE.Vector3(-0.37, 0.78, -0.15), new THREE.Vector3(0.37, 1.42, 0.13)], {
    res: 124, seg: top.G,
    color: (x, y, z) => {
      const ring = Math.abs(diamond(x, y)) - 0.28;
      const orn = z < 0 && Math.abs(y - 1.2) < 0.075 && Math.abs(x) < 0.075 ? soft(Math.abs(Math.sin(x * 140) * Math.cos(y * 120)) - 0.25, 0.08) * 0.6 : 0;
      return layered(black, [[beige, soft(ring, 0.004) * (z < 0 ? 1 : 0)], [beige, orn * soft(Math.abs(diamond(x, y)) - 0.6, 0.02)], [blackSoft, soft(Math.abs(y - 0.92) - 0.01, 0.002)]]);
    },
  });
  // Puffärmel: gebauschte Oberarme mit Raffungen
  const puff = (x, y, z) => {
    let d = 1;
    for (const a of A) {
      const c = armCoord(a, x, y, z);
      if (c.along < -0.04 || c.along > a.lu + 0.03 || a.s * x < 0.08) continue;
      const t = (c.along - 0.01) / (a.lu + 0.01);
      const r = 0.048 + 0.03 * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.95 + 0.05))) + 0.004 * Math.sin(Math.atan2(c.ang, 1) * 9 + c.along * 60);
      d = Math.min(d, Math.max(c.perp - r, -0.005 - c.along, c.along - a.lu - 0.01));
    }
    return d;
  };
  shell(K, puff, [new THREE.Vector3(-0.32, 0.95, -0.1), new THREE.Vector3(0.32, 1.32, 0.1)], { res: 100, color: () => blackSoft, rim: 0.35 });
  // Federbesatz an den Manschetten
  const featherMat = K.mat(C.black, { rim: 0.4 });
  for (const k of ['L', 'R']) {
    const { s, fa } = K.side[k];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      P.add(fa, sphere(0.013, 10, 6), featherMat, {
        pos: [s * B.shoulderX + Math.cos(a) * 0.038, B.wristY + 0.012, Math.sin(a) * 0.036],
        rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], scale: [0.6, 2.4, 0.25], hull: 0.0015,
      });
    }
  }
  hands(K, () => blackSoft);

  // Rock: ausgestellt, vorne offen (Stoffsimulation, kollidiert mit den Beinen)
  const rows = 9, cols = 28;
  const skirtMap = skirtTexture();
  addCloth(K, {
    anchor: K.hips, rows, cols, wrap: true,
    grid: (r, c) => {
      const t = r / (rows - 1);
      const a = Math.PI + (c / cols) * Math.PI * 2;
      const len = 0.3 + 0.08 * Math.min(1, Math.abs(Math.cos(a / 2)) * 1.6);
      const y = 0.925 - len * t;
      const rx = 0.128 + 0.1 * t ** 0.9, rz = 0.098 + 0.085 * t ** 0.9;
      return new THREE.Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz + 0.006);
    },
    uvs: (r, c) => [(c / cols) * 3, 1 - r / (rows - 1)],
    outer: K.mat('#ffffff', { map: skirtMap, side: THREE.FrontSide, rim: 0.3 }), inner: K.mat(C.blackSoft, { side: THREE.BackSide, rim: 0 }),
    colliders: ['legs', 'hips'], colliderOpts: { thigh: 0.084, shin: 0.058, hip: 0.098, hipW: 0.065 }, pad: 0.012, clear: G.fn,
    shape: 0.03, maxDev: (t) => 0.01 + 0.24 * t, inertia: 0.5, wind: 0.55, gust: 0.4, stretch: 1, bend: 0.3,
  });
  skirtMap.wrapS = THREE.RepeatWrapping;

  // Kopf: Augenbinde, rote Lippen, Muttermal links unter dem Mund
  head(K, faceTexture({
    skin: C.skin, iris: ['#333', '#555', '#777'], eyes: false, blush: 0.08,
    mouth: { type: 'lips', w: 10, color: C.lips, y: 78 }, mole: [24, 92], nose: 'rgba(190,130,120,0.6)',
  }), { r: 0.101 });
  // Augenbinde: schwarzes Band rund um den Kopf auf Augenhöhe
  const band = (x, y, z) => {
    const dx = x - HC.x, dz = (z - HC.z) * 1.0, dy = y - (HC.y - 0.008);
    const r = Math.hypot(dx / 1.0, dz / 1.04);
    return Math.max(Math.abs(r - 0.1055) - 0.0035, Math.abs(dy) - 0.015 - 0.003 * Math.max(0, -dz / 0.1));
  };
  const bg = polygonize(band, new THREE.Vector3(HC.x - 0.12, HC.y - 0.04, HC.z - 0.125), new THREE.Vector3(HC.x + 0.12, HC.y + 0.03, HC.z + 0.125), 72);
  paint(bg, () => black);
  P.add(K.head, bg, K.mat('#ffffff', { vertexColors: true, rim: 0.3 }), { hull: 0.002 });

  // Bob mit geradem Pony bis zur Augenbinde, Seiten bis zum Kinn, schwarzer Haarreif
  hair(K, (H) => {
    const { rnd } = H;
    for (let i = 0; i < 11; i++) {
      const off = -0.68 + (1.36 * i) / 10;
      H.strand(H.path(Math.PI + off + rnd(-0.02, 0.02), 1.12, 0.122 + rnd(-0.008, 0.008), { out: 0.003, rBase: 0.113, sideways: rnd(-0.04, 0.04) + off * 0.05, curl: 0.002 }), 0.016, 0.003);
    }
    for (const s of [-1, 1]) {
      H.strand(H.path(Math.PI + s * 0.92, 0.82, 0.19, { out: 0.006, curl: 0.03, sideways: -s * 0.08, rBase: 0.113 }), 0.022, 0.003);
      for (const az of [1.15, 1.45, 1.75, 2.05, 2.35, 2.65, 2.92]) {
        H.strand(H.path(Math.PI + s * (az + rnd(-0.03, 0.03)), rnd(0.84, 0.92), rnd(0.17, 0.185), { out: rnd(0.006, 0.01), curl: 0.035, sideways: s * rnd(0, 0.04), rBase: 0.112 }), rnd(0.022, 0.026), 0.003);
      }
    }
    H.strand(H.path(0, 0.9, 0.17, { out: 0.009, curl: 0.035, rBase: 0.112 }), 0.026, 0.003);
  }, { cap: { rx: 0.113, ry: 0.113, rz: 0.12 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#d6e0ff', seed: 5, res: 128, k: 0.009 });
  // Haarreif: schmaler schwarzer Bogen von Ohr zu Ohr
  const hb = (x, y, z) => {
    const dx = x - HC.x, dy = y - HC.y - 0.004, dz = z - HC.z - 0.018;
    const r = Math.hypot(dx, dy);
    return Math.max(Math.abs(r - 0.124) - 0.005, Math.abs(dz) - 0.009, -dy - 0.03);
  };
  const hg = polygonize(hb, new THREE.Vector3(HC.x - 0.14, HC.y - 0.04, HC.z - 0.01), new THREE.Vector3(HC.x + 0.14, HC.y + 0.14, HC.z + 0.05), 64);
  paint(hg, () => black);
  P.add(K.head, hg, K.mat('#ffffff', { vertexColors: true, rim: 0.3 }), { hull: 0.0015 });
}
