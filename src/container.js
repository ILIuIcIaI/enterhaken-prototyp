import * as THREE from 'three';
import { toonMaterial } from './toon.js';

// Seefracht-Container (40 Fuß, 12,2 × 2,44 × 2,6 m) für die Schiffe und den Hafen: ein gemeinsamer, gezeichneter Atlas
// statt einfarbiger Kästen. Je Reederei eine Zeile: Längsseite mit Sicke und Rahmen, Logo und Containernummer,
// Türseite mit zwei Flügeln, Verriegelungsstangen und Scharnieren, Stirnseite, Dach; dazu Rost, Schmutz und ausgeblichene
// Stellen. Der Reliefplan (Rippen, Rahmen) wirkt nur im Hyper-Realistic-Mode. Alle Namen sind erfunden.
export const CONTAINER_SIZE = { L: 12.19, W: 2.44, H: 2.59 };

const LINES = [
  ['#1f4e79', 'KOBALT', '#e9eef2', 'KBLU'],
  ['#2f6a4f', 'BOREAL', '#e6efe6', 'BRLU'],
  ['#a8392c', 'TIDEWAY', '#f2e9e2', 'TDWU'],
  ['#c77a27', 'MERIDIAN', '#201a14', 'MRDU'],
  ['#6d7178', 'PELAGOS', '#e9e9e6', 'PLGU'],
  ['#b5b0a4', 'ORCA LINE', '#233044', 'ORCU'],
  ['#1b7f88', 'HALCYON', '#eef4f4', 'HLCU'],
  ['#6e2f5e', 'NORDLICHT', '#efe6ee', 'NRDU'],
  ['#c9ad36', 'SEAWAY', '#22201a', 'SWYU'],
  ['#7a4a32', 'FARROW', '#ece3da', 'FRWU'],
];
export const CONTAINER_LINES = LINES.length;

const SIZE = 2048, RH = Math.floor(SIZE / LINES.length);
const X = { side: [0, 1400], door: [1400, 1620], end: [1620, 1840], roof: [1840, 2048] };

function hash(a, b) {
  const s = Math.sin(a * 91.17 + b * 47.53) * 24634.6345;
  return s - Math.floor(s);
}

// Rippen über eine Breite: helle und dunkle Streifen (Farbbild) bzw. Höhenwerte (Reliefplan)
function ribs(c, x, y, w, h, n, base, relief) {
  const p = w / n;
  for (let i = 0; i < n; i++) {
    const a = x + i * p;
    if (relief) {
      c.fillStyle = '#6a6a6a';
      c.fillRect(a, y, p, h);
      c.fillStyle = '#b4b4b4';
      c.fillRect(a + p * 0.22, y, p * 0.56, h);
    } else {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(a, y, p * 0.18, h);
      c.fillStyle = 'rgba(255,255,255,0.09)';
      c.fillRect(a + p * 0.26, y, p * 0.46, h);
      c.fillStyle = 'rgba(0,0,0,0.1)';
      c.fillRect(a + p * 0.76, y, p * 0.24, h);
    }
  }
}

function frame(c, x, y, w, h, relief) {
  c.fillStyle = relief ? '#e4e4e4' : 'rgba(0,0,0,0.26)';
  c.fillRect(x, y, w, h * 0.055);
  c.fillRect(x, y + h * 0.93, w, h * 0.07);
  c.fillRect(x, y, w * 0.012 * (1400 / w > 2 ? 4 : 1), h);
  c.fillRect(x + w - w * 0.012 * (1400 / w > 2 ? 4 : 1), y, w * 0.012 * (1400 / w > 2 ? 4 : 1), h);
}

// Rost, Schlieren und Schmutz
function weather(c, x, y, w, h, seed) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const n = Math.round(w / 34);
  for (let i = 0; i < n; i++) {
    const px = x + hash(seed, i) * w, py = y + hash(seed + 3, i) * h * 0.8, len = 12 + hash(seed + 5, i) * h * 0.5, a = 0.05 + hash(seed + 7, i) * 0.16;
    const g = c.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, `rgba(96,52,26,${a})`);
    g.addColorStop(1, 'rgba(96,52,26,0)');
    c.fillStyle = g;
    c.fillRect(px, py, 1.5 + hash(seed + 9, i) * 4, len);
  }
  for (let i = 0; i < n / 2; i++) {
    c.fillStyle = `rgba(255,255,255,${0.012 + hash(seed + 13, i) * 0.03})`;
    c.fillRect(x + hash(seed + 11, i) * w, y + hash(seed + 12, i) * h, 40 + hash(seed + 14, i) * 160, 8 + hash(seed + 15, i) * 40);
  }
  const g = c.createLinearGradient(0, y + h * 0.6, 0, y + h);
  g.addColorStop(0, 'rgba(30,24,20,0)');
  g.addColorStop(1, 'rgba(30,24,20,0.22)');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.restore();
}

let atlas = null;
function buildAtlas() {
  if (atlas) return atlas;
  const col = document.createElement('canvas'), rel = document.createElement('canvas');
  col.width = col.height = rel.width = rel.height = SIZE;
  const c = col.getContext('2d'), r = rel.getContext('2d');
  r.fillStyle = '#808080';
  r.fillRect(0, 0, SIZE, SIZE);
  LINES.forEach(([base, name, ink, code], k) => {
    const y = k * RH, h = RH;
    c.fillStyle = base;
    c.fillRect(0, y, SIZE, h);
    // Längsseite
    const [s0, s1] = X.side, sw = s1 - s0;
    ribs(c, s0, y + h * 0.055, sw, h * 0.875, 56, base, false);
    ribs(r, s0, y + h * 0.055, sw, h * 0.875, 56, base, true);
    c.save();
    c.globalAlpha = 0.86;
    c.fillStyle = ink;
    c.font = `800 ${Math.round(h * 0.34)}px "Arial Black", Arial, sans-serif`;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillText(name, s0 + sw * 0.5, y + h * 0.5);
    c.globalAlpha = 0.72;
    c.font = `700 ${Math.round(h * 0.075)}px Arial, sans-serif`;
    c.textAlign = 'right';
    c.fillText(`${code} ${String(100000 + Math.floor(hash(k, 1) * 899999))} ${Math.floor(hash(k, 2) * 10)}`, s1 - sw * 0.035, y + h * 0.16);
    c.textAlign = 'left';
    c.fillText('45G1', s0 + sw * 0.035, y + h * 0.16);
    c.restore();
    weather(c, s0, y, sw, h, k + 1);
    frame(c, s0, y, sw, h, false);
    frame(r, s0, y, sw, h, true);
    // Türseite: zwei Flügel, vier Stangen, Scharniere, Griffe
    const [d0, d1] = X.door, dw = d1 - d0;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(d0 + dw * 0.495, y, dw * 0.012, h);
    ribs(c, d0 + dw * 0.05, y + h * 0.08, dw * 0.9, h * 0.84, 6, base, false);
    ribs(r, d0 + dw * 0.05, y + h * 0.08, dw * 0.9, h * 0.84, 6, base, true);
    for (const u of [0.17, 0.36, 0.64, 0.83]) {
      c.fillStyle = 'rgba(205,205,200,0.85)';
      c.fillRect(d0 + dw * u, y + h * 0.04, dw * 0.022, h * 0.92);
      r.fillStyle = '#f4f4f4';
      r.fillRect(d0 + dw * u, y + h * 0.04, dw * 0.022, h * 0.92);
      c.fillStyle = 'rgba(40,40,40,0.8)';
      c.fillRect(d0 + dw * (u - 0.025), y + h * 0.58, dw * 0.075, h * 0.03);
    }
    for (const v of [0.14, 0.42, 0.7, 0.9]) {
      c.fillStyle = 'rgba(30,30,30,0.6)';
      c.fillRect(d0 + dw * 0.03, y + h * v, dw * 0.04, h * 0.05);
      c.fillRect(d0 + dw * 0.93, y + h * v, dw * 0.04, h * 0.05);
    }
    c.save();
    c.fillStyle = ink;
    c.globalAlpha = 0.8;
    c.font = `700 ${Math.round(h * 0.055)}px Arial, sans-serif`;
    c.textAlign = 'center';
    c.fillText(code, d0 + dw * 0.26, y + h * 0.2);
    c.fillText(name.slice(0, 8), d0 + dw * 0.74, y + h * 0.2);
    c.restore();
    weather(c, d0, y, dw, h, k + 21);
    frame(c, d0, y, dw, h, false);
    frame(r, d0, y, dw, h, true);
    // Stirnseite
    const [e0, e1] = X.end, ew = e1 - e0;
    ribs(c, e0, y + h * 0.055, ew, h * 0.875, 9, base, false);
    ribs(r, e0, y + h * 0.055, ew, h * 0.875, 9, base, true);
    weather(c, e0, y, ew, h, k + 41);
    frame(c, e0, y, ew, h, false);
    frame(r, e0, y, ew, h, true);
    // Dach: leicht gewellte Bleche, schmutzig
    const [t0, t1] = X.roof, tw = t1 - t0;
    c.fillStyle = 'rgba(40,36,32,0.2)';
    c.fillRect(t0, y, tw, h);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      c.fillRect(t0, y + (i * h) / 8, tw, h / 8);
      r.fillStyle = i % 2 ? '#969696' : '#6e6e6e';
      r.fillRect(t0, y + (i * h) / 8, tw, h / 8);
    }
    weather(c, t0, y, tw, h, k + 61);
  });
  const map = new THREE.CanvasTexture(col), bump = new THREE.CanvasTexture(rel);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, bump]) {
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  atlas = { map, bump };
  return atlas;
}

export function containerMaterial() {
  const { map, bump } = buildAtlas();
  return toonMaterial('#ffffff', { map, rim: 0.12, pbr: { roughness: 0.58, metalness: 0.3, bumpMap: bump, bumpScale: 1.4 } });
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
// Zusammengefügte Container: list = [{ x, y (Unterkante), z, ry (Drehung um y: 0 = Längsseite entlang z), line, flip }]
export function containerGeometry(list) {
  const { L, W, H } = CONTAINER_SIZE, n = list.length * 36;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const uvOf = (line, [a, b], u, v) => {
    const px = a + 1.5 + (b - a - 3) * u, py = line * RH + 1.5 + (RH - 3) * v;
    return [px / SIZE, 1 - py / SIZE];
  };
  // Fläche: Ecken a, b, c, d gegen den Uhrzeigersinn von außen, u läuft a → b, v läuft von oben nach unten
  const face = (a, b, c, d, nx, ny, nz, line, slot, swap = false) => {
    const corners = [[a, 0, 1], [b, 1, 1], [c, 1, 0], [a, 0, 1], [c, 1, 0], [d, 0, 0]];
    for (const [P, u, v] of corners) {
      _v.set(P[0], P[1], P[2]).applyMatrix4(m);
      _n.set(nx, ny, nz).applyQuaternion(q);
      pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      nrm[o * 3] = _n.x; nrm[o * 3 + 1] = _n.y; nrm[o * 3 + 2] = _n.z;
      const [tu, tv] = swap ? uvOf(line, slot, v, u) : uvOf(line, slot, u, v);
      uv[o * 2] = tu; uv[o * 2 + 1] = tv;
      o++;
    }
  };
  for (const C of list) {
    q.setFromAxisAngle(UP, C.ry ?? 0);
    m.makeRotationFromQuaternion(q).setPosition(C.x, C.y, C.z);
    const x = W / 2, z = L / 2, t = H, k = C.line;
    const A = [-x, 0, z], B = [x, 0, z], Cc = [x, t, z], D = [-x, t, z], E = [-x, 0, -z], F = [x, 0, -z], G = [x, t, -z], I = [-x, t, -z];
    face(B, F, G, Cc, 1, 0, 0, k, X.side);
    face(E, A, D, I, -1, 0, 0, k, X.side);
    face(A, B, Cc, D, 0, 0, 1, k, C.flip ? X.end : X.door);
    face(F, E, I, G, 0, 0, -1, k, C.flip ? X.door : X.end);
    face(D, Cc, G, I, 0, 1, 0, k, X.roof);
    face(E, F, B, A, 0, -1, 0, k, X.roof);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function containerMesh(list) {
  const mesh = new THREE.Mesh(containerGeometry(list), containerMaterial());
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
