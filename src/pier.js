import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { colored, box } from './mover.js';
import { WIND } from './cloth.js';

// Optik des Jahrmarkts auf dem Pier (feste Teile, nach buildDecor): Planken, Eingangsbogen mit Leuchtschrift, Kioske mit
// gestreiften Markisen, Laternen und Lichterketten über der Flaniermeile, Palmen, Bänke, Tische mit Sonnenschirmen,
// Fernrohre, Fahnen am Geländer, die Gestelle der Fahrgeschäfte und der Rutschturm mit seiner Spiralrutsche. Lage und
// Kollision: landmarks.js (buildPier); was sich bewegt: amusement.js. Gebaut wird im Pier-System (x = d hinaus aufs Meer,
// z = s entlang der Küste, y = Höhe) und am Ende einmal in die Welt gedreht.
const UP = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _q = new THREE.Quaternion();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const WARM = ['#ffd27a', '#ff8a5a', '#8ad8ff', '#ffe9b0', '#ff7ab8', '#b8ff8a'];
const FLAG = ['#c8352b', '#f2c230', '#2f6fb0', '#2c8a4e', '#f4f0ea', '#e08a1e', '#8a3a7a'];
const PARASOL = ['#c8352b', '#2f6fb0', '#2c8a4e', '#e08a1e'];

// Stab zwischen zwei Punkten
export function strut(a, b, w, col) {
  const len = _a.subVectors(b, a).length();
  const g = new THREE.BoxGeometry(w, len, w);
  g.applyQuaternion(_q.setFromUnitVectors(UP, _a.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return colored(g, col);
}
// Zylinder mit dem Fuß bei y
export const cyl = (r0, r1, h, seg, x, y, z, col, open = false) => colored(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open).translate(x, y + h / 2, z), col);
// Kegeldach aus abwechselnd gefärbten Keilen, Fuß bei y
export function stripedCone(r, h, n, cols, x, y, z) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(colored(new THREE.ConeGeometry(r, h, 2, 1, false, (k / n) * Math.PI * 2, (Math.PI * 2) / n).translate(x, y + h / 2, z), cols[k % cols.length]));
  return out;
}
export const bulb = (x, y, z, col, r = 0.13) => colored(new THREE.OctahedronGeometry(r, 0).translate(x, y, z), col);
export function starGeo(R, r, depth) {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2, rad = k % 2 ? r : R;
    if (k) s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

// Schilder: ein Atlas mit allen Schriftzügen [x0, y0, x1, y1, Grund, Schrift]
const ATLAS = {
  PIER: [0, 0, 1024, 176, '#16306e', '#ffd84a'],
  AUTOSCOOTER: [0, 176, 1024, 304, '#4a1a6a', '#ff8ae0'],
  KASSE: [0, 304, 340, 408, '#1c4f8a', '#ffffff'],
  EIS: [342, 304, 682, 408, '#a8541a', '#ffffff'],
  POPCORN: [684, 304, 1024, 408, '#1c6a3a', '#ffffff'],
  CHURROS: [0, 408, 340, 512, '#8a1f1a', '#ffffff'],
  LIMO: [342, 408, 682, 512, '#0f6a72', '#ffffff'],
  LOSE: [684, 408, 1024, 512, '#5a1f5a', '#ffe28a'],
  DOSENWERFEN: [0, 512, 510, 616, '#1c3f8a', '#ffffff'],
  ENTENANGELN: [514, 512, 1024, 616, '#0f5a62', '#ffe28a'],
  ZUCKERWATTE: [0, 616, 510, 720, '#a83a78', '#ffffff'],
  MANDELN: [514, 616, 1024, 720, '#7a3a12', '#ffe28a'],
};
const AH = 768;
let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = AH;
  const g = c.getContext('2d');
  for (const [name, [x0, y0, x1, y1, bg, fg]] of Object.entries(ATLAS)) {
    const w = x1 - x0, h = y1 - y0, label = name === 'PIER' ? '★ PIER ★' : name;
    g.fillStyle = bg;
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(x0 + 9, y0 + 9, w - 18, h - 18);
    let size = h * 0.6;
    const font = () => `900 ${size}px "Arial Black", Arial, sans-serif`;
    g.font = font();
    while (g.measureText(label).width > w - 56 && size > 10) { size -= 2; g.font = font(); }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x0 + w / 2, y0 + h / 2 + size * 0.05);
  }
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  return atlasTex;
}
// Schild (Fläche zeigt nach +z, yaw dreht um die Hochachse)
function sign(name, w, h, x, y, z, yaw = 0) {
  const [x0, y0, x1, y1] = ATLAS[name], g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 1024, 1 - (y1 - uv.getY(i) * (y1 - y0)) / AH);
  return g.rotateY(yaw).translate(x, y, z);
}

// kleiner Zufall nur für die Optik
function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dekoration auf den Kiosk-Dächern
function topper(out, k, T) {
  const x = k.d + k.hd - 1.1, y = T + k.h + 0.35, z = k.s - k.face * k.hz * 0.35;
  if (k.label === 'EIS') {
    out.push(colored(new THREE.ConeGeometry(0.42, 1.3, 10).rotateX(Math.PI).translate(x, y + 0.65, z), '#d8a060'));
    out.push(colored(new THREE.SphereGeometry(0.5, 12, 8).translate(x, y + 1.45, z), '#f6b8c0'));
    out.push(colored(new THREE.SphereGeometry(0.42, 12, 8).translate(x, y + 2.05, z), '#bff0d8'));
  } else if (k.label === 'POPCORN') {
    for (let i = 0; i < 4; i++) out.push(colored(box(0.25, 1.1, 0.95, x - 0.375 + i * 0.25, y + 0.55, z), i % 2 ? '#f4f0ea' : '#c8352b'));
    for (let i = 0; i < 9; i++) out.push(colored(new THREE.IcosahedronGeometry(0.17, 0).translate(x + ((i % 3) - 1) * 0.28, y + 1.18 + (i % 2) * 0.12, z + (Math.floor(i / 3) - 1) * 0.28), '#f8e08a'));
  } else if (k.label === 'LIMO') {
    out.push(cyl(0.36, 0.36, 1.1, 12, x, y, z, '#2c8a4e'), cyl(0.13, 0.36, 0.5, 12, x, y + 1.1, z, '#2c8a4e'), cyl(0.13, 0.13, 0.3, 8, x, y + 1.6, z, '#2c8a4e'));
    out.push(cyl(0.37, 0.37, 0.36, 12, x, y + 0.42, z, '#f4f0ea', true), cyl(0.15, 0.15, 0.09, 8, x, y + 1.9, z, '#c8352b'));
  } else if (k.label === 'CHURROS') {
    for (let i = 0; i < 3; i++) out.push(strut(V3(x - 0.3 + i * 0.3, y, z), V3(x - 0.55 + i * 0.55, y + 1.5, z + 0.18 * (i - 1)), 0.17, '#c88a4a'));
  } else if (k.label === 'DOSENWERFEN') {
    for (const [i, j] of [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1], [0, 2]]) out.push(cyl(0.2, 0.2, 0.5, 10, x + i * 0.44, y + j * 0.5, z, j % 2 ? '#c8352b' : '#e8e4dc'));
  } else if (k.label === 'ENTENANGELN') {
    out.push(colored(new THREE.SphereGeometry(0.55, 12, 8).scale(1.25, 0.8, 1).translate(x, y + 0.45, z), '#f2c230'));
    out.push(colored(new THREE.SphereGeometry(0.36, 12, 8).translate(x + 0.5, y + 1.05, z), '#f2c230'));
    out.push(colored(new THREE.ConeGeometry(0.14, 0.4, 8).rotateZ(-Math.PI / 2).translate(x + 0.98, y + 1.0, z), '#e08a1e'));
  } else if (k.label === 'ZUCKERWATTE') {
    out.push(cyl(0.05, 0.05, 1.0, 5, x, y, z, '#e8e4dc'));
    for (const [i, j, kk] of [[0, 0, 0], [0.3, 0.2, 0.2], [-0.3, 0.15, -0.2], [0.1, 0.45, -0.15], [-0.15, 0.35, 0.25]]) out.push(colored(new THREE.SphereGeometry(0.42, 10, 8).translate(x + i, y + 1.25 + j, z + kk), '#f6b8d8'));
  } else {
    out.push(colored(starGeo(0.7, 0.3, 0.16).translate(x + 0.4, y + 0.9, z), '#f2c230'));
  }
}

export function pierMeshes(city) {
  const P = city.landmarkData?.pier, group = new THREE.Group();
  if (!P) return group;
  const { F, top: T, L, hs, walk } = P, rr = rng(23);
  const solid = [], glow = [], flat = [], signs = [], ribbon = { pos: [], col: [] };
  let wk = 0;
  const warm = () => WARM[wk++ % WARM.length];

  // ---- Planken: an den Seiten längs (versetzte Stücke), auf der Flaniermeile quer. Fugenlos – nur die Holztöne
  // wechseln (eine Stufe zwischen den Brettern würde die Tusche-Kontur als Strichelmuster nachzeichnen)
  const tones = ['#b48c60', '#a6805a', '#bf9868', '#ab8458', '#b89064'];
  const plank = (d0, d1, s0, s1) => flat.push(colored(new THREE.PlaneGeometry(d1 - d0, s1 - s0).rotateX(-Math.PI / 2).translate((d0 + d1) / 2, T + 0.012, (s0 + s1) / 2), tones[Math.floor(rr() * tones.length)]));
  for (const [sa, sb] of [[-hs, walk.s0], [walk.s1, hs]]) {
    for (let s = sa; s < sb - 0.01; s += 1.2) {
      for (let d = 0; d < L - 0.01;) {
        const len = Math.min(L - d, 5 + rr() * 7);
        plank(d, d + len, s, Math.min(sb, s + 1.2));
        d += len;
      }
    }
  }
  for (let d = 0; d < L - 0.01; d += 1.0) plank(d, Math.min(L, d + 1.0), walk.s0, walk.s1);

  // ---- Eingangsbogen: gestreifte Säulen, Balken mit Leuchtschrift vorn und hinten, Glühbirnen, Stern obendrauf
  const A = P.arch, am = (A.sa + A.sb) / 2;
  for (const s of [A.sa, A.sb]) {
    for (let k = 0; k < 6; k++) solid.push(cyl(0.55, 0.55, A.h / 6, 12, A.d, T + (k * A.h) / 6, s, k % 2 ? '#f4f0ea' : '#c8352b'));
    solid.push(colored(new THREE.SphereGeometry(0.75, 12, 8).translate(A.d, T + A.h + 0.45, s), '#f2c230'));
  }
  solid.push(colored(box(0.9, 1.9, A.sb - A.sa + 1.4, A.d, T + A.h - 0.95, am), '#2f6fb0'));
  for (const side of [-1, 1]) signs.push(sign('PIER', A.sb - A.sa - 1.2, 1.45, A.d + side * 0.52, T + A.h - 0.95, am, side < 0 ? -Math.PI / 2 : Math.PI / 2));
  for (let s = A.sa - 0.5; s <= A.sb + 0.5; s += 0.75) for (const y of [T + A.h - 1.98, T + A.h + 0.04]) for (const side of [-1, 1]) glow.push(bulb(A.d + side * 0.5, y, s, warm()));
  solid.push(colored(starGeo(1.1, 0.45, 0.3).rotateY(Math.PI / 2).translate(A.d, T + A.h + 1.25, am), '#f2c230'));

  // ---- Kioske: Markise in Streifen mit Saum, Theke, Leuchtschild auf dem Dach, Birnen an der Dachkante, Deko obendrauf
  for (const k of P.kiosks) {
    const f = k.face, front = k.s + f * k.hz, n = Math.max(4, Math.round((2 * k.hd + 0.4) / 0.7)), w = (2 * k.hd + 0.4) / n;
    for (let i = 0; i < n; i++) {
      const x = k.d - k.hd - 0.2 + w * (i + 0.5);
      solid.push(colored(new THREE.BoxGeometry(w, 0.06, 1.5).rotateX(f * 0.34).translate(x, T + k.h - 0.42, front + f * 0.7), i % 2 ? '#f4f0ea' : k.col));
      solid.push(colored(box(w * 0.82, 0.28, 0.04, x, T + k.h - 0.82, front + f * 1.42), i % 2 ? k.col : '#f4f0ea'));
    }
    solid.push(colored(box(2 * k.hd - 0.5, 1.0, 0.45, k.d, T + 0.5, front + f * 0.22), '#f4f0ea'));
    solid.push(colored(box(2 * k.hd - 0.3, 0.08, 0.62, k.d, T + 1.04, front + f * 0.25), '#b48c60'));
    solid.push(colored(box(2 * k.hd, 1.1, 0.12, k.d, T + k.h + 0.95, front - f * 0.25), '#1a1820'));
    signs.push(sign(k.label, 2 * k.hd - 0.25, 0.9, k.d, T + k.h + 0.95, front - f * 0.12, f < 0 ? Math.PI : 0));
    for (let x = k.d - k.hd; x <= k.d + k.hd + 0.01; x += 0.6) glow.push(bulb(x, T + k.h + 0.17, front + f * 0.37, warm(), 0.11));
    topper(solid, k, T);
  }

  // ---- Autoscooter: Lichtdecke, Birnen an der Dachkante, Leuchtschild
  const H = P.hall, hm = (H.d0 + H.d1) / 2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) glow.push(colored(new THREE.PlaneGeometry(1.8, 1.8).rotateX(Math.PI / 2).translate(H.d0 + 4 + i * 6, T + H.h - 0.03, H.s0 + 5 + j * 7), '#fff2c8'));
  for (let d = H.d0 - 0.3; d <= H.d1 + 0.3; d += 0.9) for (const s of [H.s0 - 0.48, H.s1 + 0.48]) glow.push(bulb(d, T + H.h + 0.1, s, warm(), 0.12));
  for (let s = H.s0; s <= H.s1; s += 0.9) for (const d of [H.d0 - 0.48, H.d1 + 0.48]) glow.push(bulb(d, T + H.h + 0.1, s, warm(), 0.12));
  solid.push(colored(box(18.4, 2.6, 0.4, hm, T + H.h + 1.9, H.s1 - 0.25), '#1a1820'));
  signs.push(sign('AUTOSCOOTER', 17.6, 2.2, hm, T + H.h + 1.9, H.s1 + 0.02));
  for (let d = hm - 9; d <= hm + 9.01; d += 0.75) for (const y of [T + H.h + 0.65, T + H.h + 3.15]) glow.push(bulb(d, y, H.s1 + 0.05, warm(), 0.12));

  // ---- Karussell-Sockel, Kettenkarussell-Turm mit Sicherheitsring, Schiffschaukel-Gestell
  const C = P.carousel;
  solid.push(cyl(8.4, 8.4, 0.25, 40, C.d, T, C.s, '#e8e4dc'), cyl(8.46, 8.46, 0.09, 40, C.d, T + 0.1, C.s, '#c8352b', true));
  const SW = P.swing;
  solid.push(cyl(0.7, 1.0, SW.h, 14, SW.d, T, SW.s, '#e8e4dc'));
  for (const [y, c] of [[2.2, '#c8352b'], [5.4, '#2f6fb0'], [8.6, '#d6c84a']]) solid.push(cyl(1.03, 1.03, 0.45, 14, SW.d, T + y, SW.s, c));
  for (let k = 0; k < 40; k++) flat.push(colored(new THREE.RingGeometry(14.6, 15.2, 2, 1, (k / 40) * Math.PI * 2, (Math.PI * 2) / 40).rotateX(-Math.PI / 2).translate(SW.d, T + 0.02, SW.s), k % 2 ? '#2a2630' : '#e8c22a'));
  const S = P.ship;
  for (const dd of [-3.7, 3.7]) {
    for (const ss of [-10, 10]) {
      solid.push(strut(V3(S.d + dd, T, S.s + ss), V3(S.d + dd, T + S.h, S.s), 0.55, '#5e5866'));
      solid.push(colored(box(1.2, 0.3, 1.2, S.d + dd, T + 0.15, S.s + ss), '#3a3644'));
    }
    solid.push(strut(V3(S.d + dd, T + 4, S.s - 7.3), V3(S.d + dd, T + 4, S.s + 7.3), 0.35, '#5e5866'));
  }
  for (const dd of [-4.7, 4.7]) solid.push(colored(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 14).rotateZ(Math.PI / 2).translate(S.d + dd, T + S.h, S.s), '#d6c84a'));

  // ---- Freifallturm: Schaft mit Ringen und Leuchtstreifen, Krone mit Birnen, Warnlicht
  const D = P.drop;
  solid.push(colored(box(2.6, D.H, 2.6, D.d, T + D.H / 2, D.s), '#3a3644'));
  for (let y = 6; y < D.H - 2; y += 6) solid.push(colored(box(2.86, 0.22, 2.86, D.d, T + y, D.s), '#9a949e'));
  for (const [ox, oz] of [[1.33, 0], [-1.33, 0], [0, 1.33], [0, -1.33]]) glow.push(colored(box(ox ? 0.06 : 0.24, D.H - 6, oz ? 0.06 : 0.24, D.d + ox, T + 3 + (D.H - 6) / 2, D.s + oz), '#ff5ad8'));
  solid.push(colored(box(5.2, 3, 5.2, D.d, T + D.H + 1.5, D.s), '#c8352b'), colored(box(5.3, 0.5, 5.3, D.d, T + D.H + 1.5, D.s), '#f4f0ea'));
  for (let u = -2.4; u <= 2.41; u += 0.8) for (const [ox, oz] of [[u, -2.66], [u, 2.66], [-2.66, u], [2.66, u]]) glow.push(bulb(D.d + ox, T + D.H + 0.1, D.s + oz, warm(), 0.14));
  solid.push(cyl(0.12, 0.12, 4, 6, D.d, T + D.H + 3, D.s, '#9a949e'));
  glow.push(bulb(D.d, T + D.H + 7.2, D.s, '#ff2a1a', 0.35));

  // ---- Rutschturm: gestreifter Turm, Hütte mit Spitzdach und Fahne, Spiralrutsche mit Bande und Stützen
  const SL = P.slide, rIn = 2.4, rOut = 5.3;
  for (let y = 0, k = 0; y < SL.h; y += 2, k++) solid.push(cyl(rIn, rIn, Math.min(2, SL.h - y), 20, SL.d, T + y, SL.s, k % 2 ? '#f4f0ea' : '#c8352b'));
  solid.push(cyl(3.0, 3.0, 3, 20, SL.d, T + SL.h, SL.s, '#f2c230'));
  solid.push(colored(box(0.2, 2.2, 1.6, SL.d + 2.98, T + SL.h + 1.1, SL.s), '#2a2630'));
  solid.push(...stripedCone(3.7, 4.2, 12, ['#c8352b', '#f4f0ea'], SL.d, T + SL.h + 3, SL.s));
  solid.push(cyl(0.05, 0.05, 2, 5, SL.d, T + SL.h + 7.1, SL.s, '#e8e4dc'), colored(box(0.03, 0.6, 1, SL.d, T + SL.h + 8.75, SL.s + 0.5), '#2f6fb0'));
  const N = 144, RUN = 4;
  const at = (k, r) => {
    if (k <= N) { const u = k / N, ph = SL.end - (1 - u) * SL.turns * Math.PI * 2; return V3(SL.d + Math.cos(ph) * r, T + SL.h - u * (SL.h - 0.75), SL.s + Math.sin(ph) * r); }
    return V3(SL.d - (k - N), T + 0.75 - (k - N) * 0.07, SL.s + r);
  };
  const quad = (a, b, c, d, hex) => {
    const cc = new THREE.Color(hex);
    for (const p of [a, b, c, a, c, d]) { ribbon.pos.push(p.x, p.y, p.z); ribbon.col.push(cc.r, cc.g, cc.b); }
  };
  for (let k = 0; k < N + RUN; k++) {
    const col = Math.floor(k / 6) % 2 ? '#c8352b' : '#f2c230';
    const i0 = at(k, rIn), o0 = at(k, rOut), i1 = at(k + 1, rIn), o1 = at(k + 1, rOut);
    quad(i0, o0, o1, i1, col);
    const up = V3(0, 0.7, 0);
    quad(o0, o0.clone().add(up), o1.clone().add(up), o1, '#f4f0ea');
    quad(i0, i0.clone().add(up), i1.clone().add(up), i1, '#f4f0ea');
  }
  for (let k = 6; k <= N; k += 12) { const p = at(k, (rIn + rOut) / 2 + 0.6); if (p.y - T > 1.2) solid.push(strut(V3(p.x, T, p.z), V3(p.x, p.y - 0.05, p.z), 0.24, '#9a949e')); }

  // ---- Laternen und Lichterketten
  for (const p of P.poles) {
    solid.push(cyl(0.26, 0.3, 0.35, 10, p.d, T, p.s, '#2a2630'), cyl(0.08, 0.1, 6.7, 8, p.d, T, p.s, '#2a2630'));
    solid.push(colored(new THREE.SphereGeometry(0.16, 8, 6).translate(p.d, T + 6.78, p.s), '#d6c84a'));
    solid.push(colored(new THREE.ConeGeometry(0.42, 0.3, 10).translate(p.d, T + 5.85, p.s), '#2a2630'));
    glow.push(colored(new THREE.SphereGeometry(0.33, 10, 8).translate(p.d, T + 5.45, p.s), '#ffe2a8'));
  }
  for (const pts of P.festoons) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => { const l = F.local(p.x, p.z); return V3(l.d, p.y, l.s); }));
    solid.push(colored(new THREE.TubeGeometry(curve, 24, 0.025, 3), '#2a2630'));
    const n = Math.round(curve.getLength() / 1.0);
    for (const p of curve.getSpacedPoints(n).slice(1, -1)) glow.push(bulb(p.x, p.y - 0.12, p.z, warm(), 0.12));
  }

  // ---- Palmen: Erde im Kübel, leicht geneigter Stamm, hängende Wedel, Kokosnüsse
  for (const p of P.palms) {
    solid.push(colored(box(1.4, 0.1, 1.4, p.d, T + 0.85, p.s), '#4a3a2a'));
    const lean = rr() * Math.PI * 2, lx = Math.cos(lean) * 0.16, lz = Math.sin(lean) * 0.16;
    let x = p.d, y = T + 0.85, z = p.s;
    for (let k = 0; k < 7; k++) {
      const nx = x + lx * (k * 0.35 + 0.2), nz = z + lz * (k * 0.35 + 0.2), ny = y + 0.8;
      solid.push(strut(V3(x, y, z), V3(nx, ny, nz), 0.32 - k * 0.02, k % 2 ? '#8a6a4a' : '#7a5c40'));
      x = nx; y = ny; z = nz;
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + rr() * 0.3;
      solid.push(colored(new THREE.ConeGeometry(0.55, 3.4, 4).scale(0.18, 1, 1).translate(0, 1.7, 0).rotateZ(-1.9).rotateY(a).translate(x, y, z), k % 2 ? '#3f8a3a' : '#4fa04a'));
    }
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; solid.push(colored(new THREE.SphereGeometry(0.17, 6, 4).translate(x + Math.cos(a) * 0.25, y - 0.22, z + Math.sin(a) * 0.25), '#6a4a2a')); }
  }

  // ---- Bänke (Rücken bei +z, man sitzt Richtung −z), Tische mit Hockern und Sonnenschirmen, Fernrohre, Fahnen, Ballonanker
  for (const b of P.benches) {
    const g = [];
    for (const w of [-0.15, 0, 0.15]) g.push(colored(box(2.3, 0.05, 0.12, 0, 0.45, w), '#a07850'));
    for (const y of [0.62, 0.78, 0.94]) g.push(colored(box(2.3, 0.1, 0.05, 0, y, 0.25), '#a07850'));
    for (const u of [-1.0, 1.0]) g.push(colored(box(0.08, 0.45, 0.5, u, 0.225, 0), '#2a2630'), colored(box(0.08, 0.6, 0.06, u, 0.72, 0.25), '#2a2630'));
    const yaw = b.along ? (b.face < 0 ? 0 : Math.PI) : b.face > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const x of g) solid.push(x.rotateY(yaw).translate(b.d, T, b.s));
  }
  P.tables.forEach((t, i) => {
    solid.push(cyl(0.4, 0.45, 0.05, 12, t.d, T, t.s, '#3a3644'), cyl(0.07, 0.07, 0.72, 6, t.d, T, t.s, '#3a3644'), cyl(0.8, 0.8, 0.06, 18, t.d, T + 0.72, t.s, '#f4f0ea'));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4, x = t.d + Math.cos(a) * 1.2, z = t.s + Math.sin(a) * 1.2;
      solid.push(cyl(0.05, 0.05, 0.42, 5, x, T, z, '#3a3644'), cyl(0.27, 0.27, 0.07, 10, x, T + 0.42, z, PARASOL[(i + k) % 4]));
    }
    solid.push(cyl(0.045, 0.045, 2.3, 6, t.d, T + 0.78, t.s, '#e8e4dc'), ...stripedCone(2.2, 0.75, 12, [PARASOL[i % 4], '#f4f0ea'], t.d, T + 2.75, t.s));
  });
  for (const [d, s] of P.scopes) {
    solid.push(cyl(0.12, 0.16, 1.15, 8, d, T, s, '#2f6fb0'));
    solid.push(colored(new THREE.CylinderGeometry(0.2, 0.27, 0.95, 10).rotateZ(-Math.PI / 2 + 0.2).translate(d + 0.1, T + 1.3, s), '#2f6fb0'));
    solid.push(colored(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 10).rotateZ(-Math.PI / 2 + 0.2).translate(d + 0.55, T + 1.39, s), '#d6c84a'));
  }
  const wd = WIND.dir.x * F.ux + WIND.dir.z * F.uz, ws = WIND.dir.x * F.tx + WIND.dir.z * F.tz, fyaw = Math.atan2(-ws, wd);
  P.flags.forEach((f, i) => {
    solid.push(cyl(0.05, 0.06, 5, 6, f.d, T, f.s, '#e8e4dc'));
    solid.push(colored(box(1.2, 0.72, 0.03, 0.62, 0, 0).rotateY(fyaw).translate(f.d, T + 4.55, f.s), FLAG[i % FLAG.length]));
  });
  for (const b of P.balloons) {
    solid.push(colored(box(1.4, 0.9, 1.4, b.d, T + 0.45, b.s), '#3a3644'), colored(box(1.46, 0.16, 1.46, b.d, T + 0.62, b.s), '#d6c84a'));
    solid.push(colored(new THREE.TorusGeometry(0.28, 0.07, 6, 12).translate(b.d, T + 1.15, b.s), '#9a949e'));
  }

  // ---- in die Welt: Pier-System → Welt
  const o = F.at(0, 0), M = new THREE.Matrix4().makeBasis(V3(F.ux, 0, F.uz), UP, V3(F.tx, 0, F.tz)).setPosition(o.x, 0, o.z);
  const add = (geos, mat, shadow, receive = false) => {
    if (!geos.length) return;
    const g = mergeGeometries(geos);
    for (const x of geos) x.dispose();
    g.applyMatrix4(M);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    group.add(m);
  };
  add(solid, toonMaterial('#ffffff', { vertexColors: true, rim: 0.25 }), true);
  add(flat, toonMaterial('#ffffff', { vertexColors: true, rim: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), false, true);
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }), false);
  add(signs, new THREE.MeshBasicMaterial({ map: atlas(), color: new THREE.Color(1.3, 1.3, 1.3) }), false);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(ribbon.pos, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(ribbon.col, 3));
  rg.computeVertexNormals();
  rg.applyMatrix4(M);
  const slideMesh = new THREE.Mesh(rg, toonMaterial('#ffffff', { vertexColors: true, rim: 0.2, side: THREE.DoubleSide }));
  slideMesh.castShadow = true;
  group.add(slideMesh);
  return group;
}
