import * as THREE from 'three';
import { smin, smax, sdEllipsoid, sdRoundCone, sdRoundBox, polygonize, paint } from '../sdf.js';
import { body, bodyField, armFrames, armCoord, legCoord, fitted, shell, frontZ, trousersField, hands, shoes, shoeField, head, faceTexture, hair,
  addCloth, col, smooth, soft, layered, RB, MALE } from '../charkit.js';

// Jonesy (Fortnite, „Jonesy The First“): kräftig, kurzes blondes Haar nach oben gestrichen, blaue Augen, kantiges Kinn.
// Dunkles Trägershirt unter einer olivgrünen Einsatzweste mit Taschen, beiger Schal um Hals und Schultern,
// dunkler Gürtel mit Silberschnalle. Rechter Arm: Tattoo an der Schulter, rotes Bandana über dem Ellbogen
// (die Enden flattern), grüne Armschiene mit blauem Display. Fingerlose Handschuhe. Hellbraune Cargohose mit
// Tarnflecken, zwei Riemen am rechten Oberschenkel, Abzeichen am linken, dunkle Knieschützer, hohe Kampfstiefel.
const C = {
  skin: '#e9b892', tattoo: '#3d4a47', tank: '#2f3233', vest: '#66703f', vestDark: '#4c5530', scarf: '#cdb88f', scarfShade: '#a9946d',
  belt: '#2c2b2a', buckle: '#b9bcc0', pants: '#9a7a53', camoDark: '#7b6043', camoLight: '#b39470', strap: '#3a332b', patch: '#efe7d3',
  pad: '#4d5432', boot: '#4a3b2b', bootDark: '#2a221a', glove: '#3b3128', bracer: '#566e3d', bracerDark: '#3e5230', screen: '#55c3ff',
  bandana: '#c32b22', hair: '#d7b25a', hairTip: '#f1d78d', hairShine: '#fff2c6', hairInner: '#a3803a',
};

export function buildJonesy(K) {
  const { P, B, HC } = K;
  const skin = col(C.skin), tattoo = col(C.tattoo), vest = col(C.vest), vdark = col(C.vestDark), pants = col(C.pants);
  const A = armFrames(K), aR = A[1];
  const shape = {
    ...MALE, legs: false, chest: [0.15, 0.118, 0.1], waist: [0.13, 0.12, 0.09], hips: [0.132, 0.1, 0.09], pecs: 0.036, sh: 0.062,
    neckR: 0.046, arm: [0.057, 0.047, 0.047, 0.032],
  };
  const G = bodyField(K, shape);

  // Körper (nackte, muskulöse Arme): Tattoo außen an der rechten Schulter
  body(K, {
    field: G, res: 122, yMin: 0.8,
    color: (x, y, z, nx, ny, nz, part) => {
      if (part !== 'armR') return skin;
      const c = armCoord(aR, x, y, z);
      const u = c.along - 0.075, v = (c.ang - 1.45) * c.perp, d = Math.hypot(u, v);
      return layered(skin, [[tattoo, soft(Math.abs(d - 0.019) - 0.0028, 0.0012)], [tattoo, soft(d - 0.008, 0.0012)],
        [tattoo, soft(Math.max(Math.abs(u) - 0.0018, Math.abs(v) - 0.013), 0.001)]]);
    },
  });

  // Trägershirt (dunkel) und Weste darüber
  const tank = fitted(K, { ...shape, arms: false, neck: false }, 0.006, { cut: (x, y) => Math.max(0.94 - y, y - 1.315) });
  shell(K, tank.fn, [new THREE.Vector3(-0.21, 0.9, -0.16), new THREE.Vector3(0.21, 1.36, 0.15)], { res: 76, color: () => col(C.tank) });
  const pocket = (x, y, px, py, w, h) => Math.max(Math.abs(x - px) - w, Math.abs(y - py) - h);
  const V = fitted(K, { ...shape, arms: false, neck: false }, 0.02, {
    wrinkle: 0.001,
    cut: (x, y, z) => {
      let c = Math.max(0.965 - y, y - 1.3);
      c = Math.max(c, Math.min(0.03 + 0.012 * smooth(1.05, 1.28, y) - Math.abs(x), -z - 0.01)); // vorne offen
      c = Math.max(c, Math.abs(x) - 0.165); // Armausschnitt
      return c;
    },
  });
  shell(K, V.fn, [new THREE.Vector3(-0.22, 0.92, -0.17), new THREE.Vector3(0.22, 1.34, 0.16)], {
    res: 104,
    color: (x, y, z) => {
      if (z > 0) return layered(vest, [[vdark, soft(Math.abs(y - 1.1) - 0.004, 0.002)]]);
      let o = 1;
      for (const s of [-1, 1]) {
        o = Math.min(o, Math.abs(pocket(x, y, s * 0.075, 1.17, 0.032, 0.032)), Math.abs(pocket(x, y, s * 0.068, 1.035, 0.04, 0.036)));
        o = Math.min(o, Math.max(Math.abs(y - 1.19), Math.abs(x - s * 0.075) - 0.032), Math.max(Math.abs(y - 1.058), Math.abs(x - s * 0.068) - 0.04));
      }
      const edge = Math.abs(Math.abs(x) - (0.03 + 0.012 * smooth(1.05, 1.28, y))) - 0.006;
      return layered(vest, [[vdark, soft(o - 0.0035, 0.0014)], [vdark, soft(edge, 0.002) * 0.8]]);
    },
  });

  // Schal um Hals und Schultern: dicker Wulst, vorne tiefer, Falten, ein Zipfel hängt vorne
  const scarf = (x, y, z) => {
    const yy = y - (1.322 + 0.028 * (z / 0.09));
    const a = Math.atan2(x, z);
    let d = Math.hypot(Math.hypot(x / 1.12, z - 0.004) - 0.09, yy * 1.1) - 0.031 - 0.004 * Math.sin(a * 7);
    d = smin(d, sdEllipsoid(x, y, z, -0.035, 1.262, -0.098, 0.058, 0.045, 0.024), 0.025);
    return d;
  };
  shell(K, scarf, [new THREE.Vector3(-0.17, 1.19, -0.16), new THREE.Vector3(0.17, 1.42, 0.16)], {
    res: 80, rim: 0.3,
    color: (x, y, z, nx, ny) => layered(col(C.scarf), [[col(C.scarfShade), soft(Math.sin(Math.atan2(x, z) * 7) + 0.4, 0.3) * 0.55], [col(C.scarfShade), soft(0.2 + ny, 0.3) * 0.4]]),
  });

  // Gürtel mit Schnalle
  const beltF = fitted(K, { ...shape, arms: false, neck: false }, 0.03, { cut: (x, y) => Math.abs(y - 0.97) - 0.017 });
  shell(K, beltF.fn, [new THREE.Vector3(-0.2, 0.93, -0.16), new THREE.Vector3(0.2, 1.01, 0.15)], { res: 84, color: () => col(C.belt), rim: 0.3, hull: 0.002 });
  P.add(K.hips, RB(0.046, 0.034, 0.012, 0.004), K.mat(C.buckle, { rim: 0.55 }), { pos: [0, 0.97, frontZ(beltF.fn, 0, 0.97) - 0.003], hull: 0.0015 });

  // Cargohose mit Knieschützern, Tarnflecken, Riemen rechts, Abzeichen links
  const T = trousersField(K, { waistY: 0.975, waist: [0.14, 0.102], legTop: 0.099, legBot: 0.07, hemY: 0.17, crotch: 0.05, wrinkle: 0.0022 });
  const knee = (x, y, z) => {
    let d = 1;
    for (const s of [-1, 1]) d = Math.min(d, sdEllipsoid(x, y, z, s * B.hipX * 0.95, B.kneeY + 0.012, -0.058, 0.052, 0.06, 0.03));
    return d;
  };
  const pantsFn = (x, y, z) => smin(T(x, y, z), knee(x, y, z), 0.012);
  const camo = (x, y, z) => Math.sin(x * 47 + Math.sin(y * 21) * 2.2) * Math.sin(y * 33 + z * 27) + 0.5 * Math.sin(z * 51 + x * 19 + y * 7);
  shell(K, pantsFn, [new THREE.Vector3(-0.3, 0.14, -0.17), new THREE.Vector3(0.3, 1.02, 0.16)], {
    res: 118,
    color: (x, y, z) => {
      if (knee(x, y, z) < 0.006) return col(C.pad);
      const n = camo(x, y, z);
      const layers = [[col(C.camoDark), soft(0.55 - n, 0.12) * 0.8], [col(C.camoLight), soft(n + 0.75, 0.12) * 0.7]];
      if (x > 0) layers.push([col(C.strap), soft(Math.min(Math.abs(y - 0.675), Math.abs(y - 0.6)) - 0.011, 0.002)]);
      else {
        const ang = legCoord(K, -1, x, z), u = (ang - 0.75) * 0.1, v = y - 0.63, r = Math.hypot(u, v);
        const star = Math.min(Math.abs(u) - 0.0028, Math.abs(v) - 0.0028, Math.abs(u - v) * 0.7 - 0.0022, Math.abs(u + v) * 0.7 - 0.0022);
        layers.push([col(C.patch), soft(Math.max(star, r - 0.022), 0.0012)]);
      }
      return layered(pants, layers);
    },
  });

  // Kampfstiefel mit hohem Schaft und Schienbeinplatte
  const shoe = shoeField({ len: 1.1, width: 1.08, height: 1.0, toe: 1.05, sole: 0.026 });
  const boot = (x, y, z) => {
    let d = smin(shoe(x, y, z), sdRoundCone(x, y, z, 0, 0.07, 0.012, 0, 0.215, 0.006, 0.057, 0.055), 0.025);
    return smin(d, sdRoundBox(x, y, z, 0, 0.16, -0.052, 0.034, 0.05, 0.01, 0.008), 0.01);
  };
  shoes(K, boot, (x, y, z) => (y < 0.026 ? col(C.bootDark) : layered(col(C.boot), [[col(C.bootDark), soft(Math.abs(y - 0.215) - 0.01, 0.003)]])), { res: 84, top: 0.235 });

  // Hände: fingerlose Handschuhe
  hands(K, (x, y) => (y > 0.762 ? col(C.glove) : skin), { w: 1.12 });

  // Rechter Unterarm: Armschiene mit blauem Display; Teile am Armknochen im Raum des senkrecht hängenden Arms
  const sR = K.side.R;
  const bracerFn = (x, y, z) => {
    const ax = x - B.shoulderX;
    const r = 0.058 - 0.009 * smooth(B.elbowY - 0.06, B.wristY + 0.02, y);
    return smax(Math.hypot(ax / 1.05, z) - r, Math.abs(y - (B.elbowY + B.wristY) / 2 + 0.012) - 0.062, 0.008);
  };
  const bg = polygonize(bracerFn, new THREE.Vector3(B.shoulderX - 0.08, B.wristY - 0.02, -0.08), new THREE.Vector3(B.shoulderX + 0.08, B.elbowY, 0.08), 72);
  paint(bg, (x, y) => layered(col(C.bracer), [[col(C.bracerDark), soft(Math.abs(Math.abs(y - (B.elbowY + B.wristY) / 2 + 0.012) - 0.05) - 0.004, 0.002)]]));
  P.add(sR.fa, bg, K.mat('#ffffff', { vertexColors: true, rim: 0.35 }), { hull: 0.002 });
  P.add(sR.fa, RB(0.04, 0.05, 0.008, 0.003), K.mat(C.screen, { rim: 0.6, emissive: C.screen, emissiveIntensity: 0.6 }), {
    pos: [B.shoulderX + 0.042, (B.elbowY + B.wristY) / 2 - 0.008, -0.042], rot: [0, -Math.PI / 4, 0], hull: 0.0015,
  });

  // Rotes Bandana über dem rechten Ellbogen: Radien am Arm gemessen, die zwei Enden flattern (Stoff)
  const along = aR.lu - 0.035;
  const cx = aR.S[0] + aR.d[0] * along, cy = aR.S[1] + aR.d[1] * along;
  const reach = (ox, oz) => {
    for (let r = 0.03; r < 0.12; r += 0.0005) if (G.fn(cx + aR.n[0] * ox * r, cy + aR.n[1] * ox * r, oz * r) > 0) return r;
    return 0.05;
  };
  const rn = reach(1, 0) + 0.004, rz = Math.max(reach(0, 1), reach(0, -1)) + 0.004;
  const by = B.shoulderY - along;
  P.add(sR.ua, new THREE.CylinderGeometry(1, 1, 0.026, 32, 1, true), K.mat(C.bandana, { rim: 0.35, side: THREE.DoubleSide }), {
    pos: [B.shoulderX, by, 0], scale: [rn, 1, rz], hull: 0.0015,
  });
  P.add(sR.ua, RB(0.024, 0.022, 0.016, 0.006), K.mat(C.bandana, { rim: 0.35 }), { pos: [B.shoulderX + rn * 0.75, by, rz * 0.7], rot: [0, 0.8, 0], hull: 0.0015 });
  const bmat = K.mat(C.bandana, { side: THREE.DoubleSide, rim: 0.3 });
  for (const [ang, len] of [[0.65, 0.085], [0.95, 0.07]]) {
    const rows = 5;
    addCloth(K, {
      anchor: sR.ua, rows, cols: 2,
      grid: (r, c) => {
        const t = r / (rows - 1), a = ang + (c - 0.5) * 0.35;
        const out = 1.08 + 0.4 * t;
        return new THREE.Vector3(B.shoulderX + Math.sin(a) * rn * out, by - 0.004 - len * t, Math.cos(a) * rz * out + 0.01 * t);
      },
      outer: bmat, inner: null, colliders: ['arms'], pad: 0.004,
      shape: 0.03, maxDev: (t) => 0.01 + 0.12 * t, inertia: 0.7, wind: 0.85, gust: 0.6, bend: 0.3,
    });
  }

  // Kopf: blaue Augen, kräftige Kieferlinie, blonde Brauen, leichtes Grinsen
  head(K, faceTexture({
    skin: C.skin, iris: ['#173a66', '#3d77b8', '#9fcdf2'], blush: 0.03,
    eye: { shape: 'sharp', w: 0.8, h: 0.72, lash: 4, tilt: 0.02, tail: false }, lash: '#5a4426',
    brow: { color: '#b48b3e', w: 6, y: -55, arch: 2, angle: 2 }, noseFull: true, noseW: 3,
    mouth: { type: 'smile', w: 12, color: '#9a5a4c', lw: 3 }, shade: 'rgba(150,90,60,0.2)',
  }), { r: 0.1, jaw: 0.34, sy: 1.08, sx: 1.0, ears: true, skin: C.skin });

  // Haare: Seiten kurz, oben nach oben und leicht zur Seite gestrichene Tolle
  hair(K, (H) => {
    const { rnd, v } = H;
    // Tolle: Strähnen vom Scheitel nach vorne, vorne leicht hochgestellt und zur rechten Seite gekämmt (runder Abschluss)
    for (let i = 0; i < 10; i++) {
      const x0 = -0.062 + i * 0.0138, flick = 0.012 * Math.sin((i / 9) * Math.PI) + rnd(0, 0.005);
      H.strand([v(x0 * 0.6 - 0.01, 0.112, 0.035), v(x0 * 0.85 - 0.004, 0.122, -0.015), v(x0, 0.116 + flick * 0.5, -0.058), v(x0 + 0.006, 0.1 + flick, -0.088), v(x0 + 0.012, 0.092 + flick * 1.4, -0.1)], 0.02 + rnd(0, 0.003), 0.007);
    }
    for (let i = 0; i < 6; i++) H.strand(H.path(rnd(-0.9, 0.9), rnd(1.2, 1.4), 0.075, { out: 0.012, curl: 0, rBase: 0.108 }), 0.024, 0.008);
    for (const s of [-1, 1]) for (const az of [1.4, 1.75, 2.1]) H.strand(H.path(Math.PI + s * az, 1.05, 0.05, { out: 0.006, curl: 0, rBase: 0.106 }), 0.018, 0.007);
  }, { cap: { rx: 0.108, ry: 0.11, rz: 0.115, nape: 0.035, faceY: 0.02 }, colors: { base: C.hair, tip: C.hairTip, shine: C.hairShine, inner: C.hairInner }, rim: '#ffe7a8', seed: 23, res: 112, k: 0.012, shineBand: false });
}
