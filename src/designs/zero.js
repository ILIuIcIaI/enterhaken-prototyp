import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone, sdRoundBox, polygonize, paint } from '../sdf.js';
import { body, bodyField, armFrames, armCoord, legCoord, fitted, shell, frontZ, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, addRope, col, smooth, soft, layered, canvas, tex, RB, sphere, torus } from '../charkit.js';

// Zero (Drakengard 3): langes weiß-silbernes Haar mit seitlichem Zopf und schwarzer Schleife, eine weiße Lilie
// wächst aus dem rechten Auge. Weißes Kleid mit tiefem Ausschnitt, schwarzem Band unter der Brust, bestickten
// Vorder- und Rückbahnen (seitlich offen), langer weißer Umhang mit grauem Futter, lose Ärmel, schwarzer
// Panzerhandschuh links, hellgraue Strümpfe, schwarzes Strumpfband links, schwarze Riemchen-Absatzschuhe.
// Das Schwert gehört nicht zur Figur.
const C = {
  skin: '#f5ded4', dress: '#efedea', dressShade: '#cfcbc6', pattern: '#a9a6a6', black: '#18171c', metal: '#3a3a44', silver: '#b8b4b8',
  stocking: '#c9c8ce', stockShade: '#a7a6ae', hair: '#e9e7ec', hairTip: '#cfcbd6', hairShine: '#ffffff', hairInner: '#a9a4b6',
  lining: '#bcb8b6', petal: '#f7f4ee', petalShade: '#d9dccb', stamen: '#e3c46a',
};

// Stickerei: verschlungene graue Ranken auf Weiß, schwarzer Saum unten
function embroidery(seed, hem = true) {
  const [c, g] = canvas(512, 1024);
  g.fillStyle = C.dress;
  g.fillRect(0, 0, 512, 1024);
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.strokeStyle = 'rgba(140,136,138,0.75)';
  g.lineWidth = 2.2;
  for (let k = 0; k < 70; k++) {
    const x = rnd() * 512, y = 120 + rnd() * 860, s = 18 + rnd() * 34;
    g.beginPath();
    g.arc(x, y, s, rnd() * 6, rnd() * 6 + 3.5);
    g.stroke();
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + s, y - s * 0.6, x + s * 1.6, y + s * 0.8, x + s * 2.2, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,116,118,0.9)';
  g.lineWidth = 3;
  for (let y = 980; y > 820; y -= 28) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.quadraticCurveTo(x + 16, y - 12, x + 32, y); g.stroke(); }
  if (hem) { g.fillStyle = C.black; g.fillRect(0, 1004, 512, 20); }
  return tex(c);
}

export function buildZero(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), dress = col(C.dress), shade = col(C.dressShade), black = col(C.black), stock = col(C.stocking), stockShade = col(C.stockShade), metal = col(C.metal);
  const A = armFrames(K);
  const shape = { bust: 0.052, hips: [0.13, 0.102, 0.088], waist: [0.093, 0.12, 0.07], thigh: [0.075, 0.047] };
  const G = bodyField(K, shape);

  // Körper: Haut, Strümpfe bis zur Oberschenkelmitte, schwarzes Strumpfband links
  body(K, {
    field: G,
    color: (x, y, z, nx, ny, nz, part) => {
      if (part === 'legL' || part === 'legR') {
        const garter = part === 'legL' ? soft(Math.abs(y - 0.665) - 0.022, 0.002) : 0;
        return layered(skin, [[stock, soft(y - 0.6, 0.004)], [stockShade, soft(Math.abs(y - 0.592) - 0.008, 0.002)], [black, garter]]);
      }
      return skin;
    },
  });

  // Oberteil: anliegend, tiefer V-Ausschnitt bis zum Nabel, schulterfrei; schwarzes Band unter der Brust
  const top = fitted(K, { ...shape, legs: false, arms: false, neck: false }, 0.006, {
    cut: (x, y, z) => {
      const vw = 0.012 + 0.05 * smooth(0.98, 1.26, y);
      let c = Math.max(0.93 - y, y - 1.27);
      c = Math.max(c, Math.min(vw - Math.abs(x), -z - 0.02)); // Ausschnitt vorne
      c = Math.max(c, Math.min(y - 1.19, Math.abs(x) - 0.1 + (z < 0 ? 0 : 0.3))); // schulterfrei: oben nur Träger vorne
      return c;
    },
  });
  shell(K, top.fn, [new THREE.Vector3(-0.2, 0.9, -0.15), new THREE.Vector3(0.2, 1.3, 0.13)], {
    res: 100,
    color: (x, y, z) => layered(dress, [[black, soft(Math.abs(y - 1.092) - 0.009, 0.002)], [black, soft(Math.abs(Math.abs(x) - (0.012 + 0.05 * smooth(0.98, 1.26, y))) - 0.004, 0.002) * (z < 0 ? 1 : 0)]]),
  });
  // Halsband mit Schließe, Schleife unter der Brust, Gürtelkordel
  P.add(K.neck, torus(0.037, 0.009, 8, 28).rotateX(Math.PI / 2), K.mat(C.dress), { pos: [0, 1.36, 0.004], scale: [1, 1, 1], hull: 0.003 });
  P.add(K.neck, RB(0.02, 0.022, 0.008, 0.004), K.mat(C.silver, { rim: 0.4 }), { pos: [0, 1.355, -0.044], hull: 0.002 });
  const bz = frontZ(top.fn, 0, 1.09);
  for (const s of [-1, 1]) P.add(K.chest, sphere(0.013, 12, 8), K.mat(C.black), { pos: [s * 0.012, 1.09, bz - 0.004], scale: [1.4, 0.8, 0.6], hull: 0.002 });
  P.add(K.hips, torus(0.128, 0.004, 6, 48).rotateX(Math.PI / 2), K.mat(C.black), { pos: [0, 0.925, 0.006], scale: [1, 1, 0.72], hull: 0 });

  // Lose weiße Ärmel (Oberarm, rechter Unterarm), schwarzer Panzerhandschuh am linken Unterarm
  const sleeve = fitted(K, { ...shape, legs: false, neck: false }, 0.012, {
    wrinkle: 0.0012,
    cut: (x, y, z) => {
      let c = 1;
      for (const a of A) {
        if (a.s * x < 0.1 || a.s < 0) continue;
        const al = (x - a.S[0]) * a.d[0] + (y - a.S[1]) * a.d[1];
        c = Math.min(c, Math.max(0.11 - al, al - a.lt - 0.004));
      }
      return c;
    },
  });
  shell(K, sleeve.fn, [new THREE.Vector3(-0.36, 0.78, -0.12), new THREE.Vector3(0.36, 1.3, 0.12)], {
    res: 112, seg: sleeve.G,
    color: (x, y, z) => {
      const a = A[x < 0 ? 0 : 1], al = armCoord(a, x, y, z).along;
      return layered(dress, [[black, soft(al - 0.135, 0.003)], [black, soft(Math.abs(al - (a.lt - 0.02)) - 0.012, 0.003) * (a.s > 0 ? 1 : 0)], [shade, soft(Math.abs(al - a.lu) - 0.01, 0.003) * 0.5]]);
    },
  });
  const aL = A[0];
  const gaunt = (x, y, z) => {
    const c = armCoord(aL, x, y, z);
    if (c.along < aL.lu - 0.04 || c.along > aL.lt + 0.03 || x > -0.1) return Math.max(aL.lu - 0.04 - c.along, c.along - aL.lt - 0.03, 0.03);
    // Platten: Ringe mit Wülsten, zum Ellbogen hin breiter
    const t = (c.along - aL.lu) / (aL.lt - aL.lu);
    const r = 0.044 - 0.012 * t + 0.004 * Math.max(0, Math.sin(c.along * 160));
    return Math.max(c.perp - r, -0.01);
  };
  shell(K, gaunt, [new THREE.Vector3(-0.36, 0.8, -0.08), new THREE.Vector3(-0.1, 1.08, 0.08)], { res: 80, color: () => metal, rim: 0.45 });
  hands(K, (x, y, z, k) => (k === 'L' ? metal : skin));

  // Riemchen-Absatzschuhe: schwarz, spitze Kappe, Riemen über dem Rist
  shoes(K, shoeField({ len: 0.98, width: 0.8, height: 0.62, toe: 1.25, heel: 0.05, sole: 0.008 }), (x, y, z) => {
    if (y > 0.06 && Math.abs(((z * 40) % 1 + 1) % 1 - 0.5) > 0.3) return stock;
    return black;
  });

  // Stoffbahnen: bestickte Vorder- und Rückbahn, langer Umhang
  const [embF, embB, embC] = [embroidery(17), embroidery(41), embroidery(73, false)];
  const panel = (sideZ, rows, cols, top, len, w0, w1, flare) => (r, c) => {
    const t = r / (rows - 1), u = c / (cols - 1) - 0.5;
    const y = top - len * t, w = w0 + (w1 - w0) * t;
    const x = u * 2 * w;
    let z = sideZ * (Math.abs(frontZ((xx, yy, zz) => G.fn(xx, yy, sideZ * zz), x, Math.max(y, 0.5))) + 0.014 + flare * t) + sideZ * 0.6 * x * x + sideZ * 0.012 * Math.sin(u * Math.PI * 5) * t;
    return new THREE.Vector3(x, y, z);
  };
  const dressMat = (map) => [K.mat('#ffffff', { map, side: THREE.FrontSide, rim: 0.25 }), K.mat(C.lining, { side: THREE.BackSide, rim: 0 })];
  for (const [sz, map, len, w1] of [[-1, embF, 0.5, 0.15], [1, embB, 0.54, 0.16]]) {
    const [outer, inner] = dressMat(map);
    addCloth(K, {
      anchor: K.hips, rows: 11, cols: 7, grid: panel(sz, 11, 7, 0.975, len + 0.04, 0.1, w1, 0.03), outer, inner,
      colliders: ['legs', 'hips'], colliderOpts: { thigh: 0.084, shin: 0.06, hip: 0.098, hipW: 0.065 }, pad: 0.012,
      shape: 0.035, maxDev: (t) => 0.01 + 0.3 * t, inertia: 0.5, wind: 0.5, gust: 0.35, stretch: 1, bend: 0.4,
    });
  }
  // Umhang von den Schultern bis zu den Waden
  const capeRows = 16, capeCols = 13;
  const [cOuter, cInner] = [K.mat('#ffffff', { map: embC, side: THREE.FrontSide, rim: 0.25 }), K.mat(C.lining, { side: THREE.BackSide, rim: 0 })];
  addCloth(K, {
    anchor: K.chest, rows: capeRows, cols: capeCols,
    grid: (r, c) => {
      const t = r / (capeRows - 1), u = c / (capeCols - 1) - 0.5;
      const y = 1.275 - 1.04 * t, w = 0.19 + 0.17 * t;
      const x = u * 2 * w;
      const zBack = Math.max(0.07, frontZ((xx, yy, zz) => G.fn(xx, yy, -zz), x * 0.7, Math.max(0.6, y)) * -1);
      const z = zBack + 0.03 + 0.07 * t - 0.12 * (1 - t) * (2 * u) ** 2 * (1 - smooth(0, 0.25, t)) + 0.028 * Math.sin(u * Math.PI * 7) * smooth(0.05, 0.6, t);
      return new THREE.Vector3(x, y, z);
    },
    outer: cOuter, inner: cInner,
    pinned: (r, c) => r === 0 || (r === 1 && Math.abs(c - (capeCols - 1) / 2) < 3),
    colliders: ['torso', 'hips', 'legs', 'shoulders'], colliderOpts: { torso: 0.12, hip: 0.1, hipW: 0.065, thigh: 0.086, shin: 0.062 }, pad: 0.014,
    shape: 0.02, maxDev: (t) => 0.02 + 0.42 * t, inertia: 0.45, wind: 0.55, gust: 0.4, stretch: 1, bend: 0.3,
  });
  // Schließe auf der linken Schulter
  P.add(K.chest, RB(0.05, 0.05, 0.016, 0.008), K.mat(C.silver, { rim: 0.45 }), { pos: [-0.14, 1.27, -0.02], rot: [0.3, 0.2, 0.5], hull: 0.002 });

  // Kopf: linkes Auge rosa-violett, rechtes unter der Lilie geschlossen
  head(K, faceTexture({
    skin: C.skin, iris: ['#5a1f4e', '#b55fa0', '#f2b6e4'], blush: 0.1, hide: -1, closed: -1,
    eye: { shape: 'sharp', w: 1.0, h: 0.95, lash: 6.5, tilt: 0.06 }, lash: '#3a2a34',
    brow: { color: '#c9c3cc', w: 3, y: -58, arch: 5, angle: 3 },
    mouth: { type: 'neutral', w: 8.5, color: '#c08a8a', lw: 2.4 },
  }), { r: 0.101 });
  // Lilie: sechs Blütenblätter um das rechte Auge, Staubgefäße in der Mitte
  const fl = new THREE.Vector3(HC.x + 0.038, HC.y - 0.006, HC.z - 0.094);
  const lily = (x, y, z) => {
    let d = 1;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const tip = [fl.x + Math.cos(a) * 0.034, fl.y + Math.sin(a) * 0.034, fl.z - 0.024];
      d = Math.min(d, sdRoundCone(x, y, (z - fl.z) * 2.4 + fl.z, fl.x, fl.y, fl.z - 0.004, tip[0], tip[1], (tip[2] - fl.z) * 2.4 + fl.z, 0.0085, 0.0035) - 0.004);
    }
    return d;
  };
  const lg = polygonize(lily, new THREE.Vector3(fl.x - 0.07, fl.y - 0.07, fl.z - 0.06), new THREE.Vector3(fl.x + 0.07, fl.y + 0.07, fl.z + 0.02), 60);
  paint(lg, (x, y, z) => {
    const r = Math.hypot(x - fl.x, y - fl.y);
    return r < 0.007 ? col(C.stamen) : r < 0.016 ? col(C.petalShade) : col(C.petal);
  });
  P.add(K.head, lg, K.mat('#ffffff', { vertexColors: true, rim: 0.3 }), { hull: 0.0025 });

  // Haare: Pony nach rechts gekämmt, lange Strähnen vorne, Zopf an der rechten Seite, Schleife links oben
  hair(K, (H) => {
    const { rnd } = H;
    for (let i = 0; i < 9; i++) {
      const off = -0.55 + (1.1 * i) / 8;
      H.strand(H.path(Math.PI + off, 1.15, 0.13 + rnd(-0.01, 0.015), { out: 0.004, rBase: 0.113, sideways: 0.35, curl: 0.004 }), 0.017, 0.003);
    }
    for (const s of [-1, 1]) {
      H.strand(H.path(Math.PI + s * 0.95, 0.85, 0.24, { out: 0.008, curl: 0.01, sideways: -s * 0.04, rBase: 0.113, droop: 0.3 }), 0.022, 0.006);
      for (const az of [1.35, 1.75, 2.2, 2.65]) H.strand(H.path(Math.PI + s * az, 0.9, 0.17, { out: 0.006, curl: 0.004, rBase: 0.113, droop: 0.4 }), 0.024, 0.016);
    }
    H.strand(H.path(0, 0.9, 0.2, { out: 0.01, curl: 0.004, rBase: 0.113, droop: 0.5 }), 0.028, 0.016);
    // Zopf: von der rechten Schläfe über den Kopf nach hinten
    const braid = [];
    for (let k = 0; k <= 9; k++) {
      const a = Math.PI - 0.85 + k * 0.2, el = 0.55 + 0.35 * Math.sin((k / 9) * Math.PI);
      braid.push(H.v(Math.cos(el) * Math.sin(a) * 0.118 + 0.01, Math.sin(el) * 0.118, Math.cos(el) * Math.cos(a) * 0.118));
    }
    for (let k = 0; k + 1 < braid.length; k++) H.strand([braid[k], braid[k + 1]], 0.014 + 0.004 * Math.abs(Math.sin(k * 1.7)), 0.014);
  }, { cap: { rx: 0.114, ry: 0.115, rz: 0.121, nape: 0.12 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#ffd6f0', seed: 33, res: 128, k: 0.009, back: false, shineBand: false });
  // schwarze Schleife links oben
  for (const s of [-1, 1]) P.add(K.head, sphere(0.022, 14, 10), K.mat(C.black), { pos: [HC.x - 0.075 + s * 0.022, HC.y + 0.085, HC.z + 0.01], scale: [1.3, 0.75, 0.5], rot: [0, 0, s * 0.4], hull: 0.002 });
  P.add(K.head, sphere(0.011, 10, 8), K.mat(C.black), { pos: [HC.x - 0.075, HC.y + 0.085, HC.z + 0.01], hull: 0.002 });

  // langes Haar am Rücken als Stoffbahn (schwingt beim Laufen und Schwingen mit)
  const hRows = 12, hCols = 9;
  const hairCol = col(C.hair), hairTip = col(C.hairTip);
  addCloth(K, {
    anchor: K.head, rows: hRows, cols: hCols,
    grid: (r, c) => {
      const t = r / (hRows - 1), u = c / (hCols - 1) - 0.5;
      const y = HC.y + 0.02 - 0.58 * t, w = 0.085 + 0.03 * t;
      const x = u * 2 * w;
      const z = (t < 0.2 ? HC.z + 0.112 + t * 0.15 : Math.max(HC.z + 0.13, -frontZ((xx, yy, zz) => G.fn(xx, yy, -zz), x * 0.8, Math.max(0.9, y)) + 0.035)) - u * u * 0.16 + 0.007 * Math.sin(u * Math.PI * 9) * smooth(0.1, 0.5, t);
      return new THREE.Vector3(x, y, z);
    },
    colors: (r, c, cc) => cc.copy(hairCol).lerp(hairTip, (r / (hRows - 1)) ** 1.5 * (0.6 + 0.4 * Math.sin(c * 2.3))),
    outer: K.mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, rim: 0.3, rimColor: '#ffd6f0' }), inner: null,
    pinned: (r) => r <= 1,
    colliders: ['torso', 'shoulders'], colliderOpts: { torso: 0.105 }, pad: 0.018,
    shape: 0.03, maxDev: (t) => 0.02 + 0.25 * t, inertia: 0.5, wind: 0.45, gust: 0.35, stretch: 1, bend: 0.5,
  });
  // zwei lange Strähnen vorne über den Schultern
  for (const s of [-1, 1]) {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const t = k / 7;
      pts.push(new THREE.Vector3(s * (0.09 + 0.03 * t), HC.y - 0.06 - 0.36 * t, HC.z - 0.04 - 0.05 * Math.sin(t * 1.6)));
    }
    addRope(K, {
      anchor: K.head, points: pts, radial: 8,
      radius: (t, a) => (0.018 - 0.012 * t) * (1 + 0.5 * Math.cos(a) ** 2),
      material: K.mat(C.hair, { rim: 0.3, rimColor: '#ffd6f0' }),
      colliders: ['torso', 'shoulders'], colliderOpts: { torso: 0.1 }, pad: 0.03,
      pinned: (r) => r === 0, shape: 0.03, maxDev: (t) => 0.03 + 0.2 * t, inertia: 0.5, wind: 0.4, bend: 0.6,
    });
  }
}
