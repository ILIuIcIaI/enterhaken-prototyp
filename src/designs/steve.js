import * as THREE from 'three';
import { col } from '../charkit.js';

// Steve (Minecraft): bewusst kantig wie im Original – Kopf, Rumpf, Arme und Beine als Quader mit Pixel-Mustern
// (jedes Pixel eine eigene Fläche, scharfe Kanten). Arme und Beine schwingen nur in Schulter und Hüfte.
export const STEVE_B = {
  hips: [0, 0.694, 0], spine: [0, 0.9, 0], chest: [0, 1.12, 0], neck: [0, 1.388, 0], head: [0, 1.388, 0],
  shoulderX: 0.347, shoulderY: 1.272, elbowY: 1.0, wristY: 0.76, hipX: 0.116, hipY: 0.694, kneeY: 0.35, ankleY: 0.05,
};
const PX = 1.85 / 32;

const PAL = {
  H: '#2c1e0e', h: '#3b2914', S: '#c4906c', s: '#b47e5e', t: '#a86e4e', W: '#f4f4f4', E: '#4e3fc0',
  N: '#6e4230', M: '#8a4a3a', B: '#44290f', b: '#56361a',
  C: '#00a9ad', c: '#008f94', d: '#00b9bd', P: '#463aa5', p: '#3a2f8e', G: '#6b6b6e', g: '#59595c',
};

// Quader aus Pixel-Flächen. faces: front/back (Zeilen oben→unten, Spalten rechts→links der Figur von vorne),
// side (Zeilen oben→unten, Spalten vorne→hinten), top/bottom (vorne→hinten). Fehlt eine Fläche, wird fill genutzt.
function pixelBox(w, h, d, faces, fill) {
  const pos = [], colA = [];
  const c = new THREE.Color();
  const grid = (rows, nx, ny, f) => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const ch = rows ? rows[j][i] : fill;
      c.set(PAL[ch] ?? fill);
      const q = f(i, j);
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...q[k]); colA.push(c.r, c.g, c.b); }
    }
  };
  const X = (w * PX) / 2, Y = (h * PX) / 2, Z = (d * PX) / 2;
  // vorne (−Z): Spalte 0 rechts der Figur (+X)
  grid(faces.front, w, h, (i, j) => {
    const x0 = X - i * PX, x1 = x0 - PX, y0 = Y - j * PX, y1 = y0 - PX;
    return [[x0, y1, -Z], [x1, y1, -Z], [x1, y0, -Z], [x0, y0, -Z]];
  });
  // hinten (+Z): Spalte 0 links der Figur (−X)
  grid(faces.back, w, h, (i, j) => {
    const x0 = -X + i * PX, x1 = x0 + PX, y0 = Y - j * PX, y1 = y0 - PX;
    return [[x0, y1, Z], [x1, y1, Z], [x1, y0, Z], [x0, y0, Z]];
  });
  // rechts (+X) und links (−X): Spalte 0 vorne (Umlaufsinn so, dass die Flächen nach außen zeigen)
  grid(faces.side, d, h, (i, j) => {
    const z0 = -Z + i * PX, z1 = z0 + PX, y0 = Y - j * PX, y1 = y0 - PX;
    return [[X, y1, z1], [X, y1, z0], [X, y0, z0], [X, y0, z1]];
  });
  grid(faces.sideL ?? faces.side, d, h, (i, j) => {
    const z0 = -Z + i * PX, z1 = z0 + PX, y0 = Y - j * PX, y1 = y0 - PX;
    return [[-X, y1, z0], [-X, y1, z1], [-X, y0, z1], [-X, y0, z0]];
  });
  grid(faces.top, w, d, (i, j) => {
    const x0 = X - i * PX, x1 = x0 - PX, z0 = -Z + j * PX, z1 = z0 + PX;
    return [[x0, Y, z0], [x1, Y, z0], [x1, Y, z1], [x0, Y, z1]];
  });
  grid(faces.bottom, w, d, (i, j) => {
    const x0 = X - i * PX, x1 = x0 - PX, z0 = -Z + j * PX, z1 = z0 + PX;
    return [[x0, -Y, z1], [x1, -Y, z1], [x1, -Y, z0], [x0, -Y, z0]];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
  g.computeVertexNormals();
  return g;
}

const rep = (ch, n) => ch.repeat(n);

export function buildSteve(K) {
  const { P, B } = K;
  const mat = K.mat('#ffffff', { vertexColors: true, rim: 0.12, levels: [0.55, 1.0] });
  const head = pixelBox(8, 8, 8, {
    front: ['HHHHHHHH', 'HHHHHHHH', 'HSSsSSSH', 'SSSSSSsS', 'SWESSEWS', 'SSsNNsSS', 'SSBMMBSS', 'SsBBBBsS'],
    back: ['HHHHHHHH', 'HHHHHHHH', 'HHhHHHHH', 'HHHHHHhH', 'HHHHHHHH', 'HhHHHHHH', 'HHHHHHHH', 'hHHHHHHh'],
    side: ['HHHHHHHH', 'HHHHHHHH', 'SSHHHHHH', 'SSSHHHHH', 'SSStHHHH', 'SSSsSHHH', 'tSSSSHHH', 'bSSSSShH'],
    top: [rep('H', 8), rep('H', 8), 'HHhHHHHH', rep('H', 8), 'HHHHHhHH', rep('H', 8), rep('H', 8), rep('H', 8)],
    bottom: ['SSBBBBSS', 'SSSSSSSS', rep('S', 8), rep('S', 8), rep('S', 8), rep('S', 8), rep('H', 8), rep('H', 8)],
  }, 'S');
  P.add(K.head, head, mat, { pos: [0, 1.388 + 4 * PX, 0], hull: 0.006 });

  const shirtRows = ['CCCSSCCC', 'CCdcSCCC', 'CCCSccCC', 'CcCCcCCC', 'CCCCcCdC', 'CCcCcCCC', 'CdCCcCCC', 'CCCCcCCc', 'CCCcCCCC', 'CCCCCcCC', 'cCCCCCCC', 'CCCCCCcC'];
  const torso = pixelBox(8, 12, 4, {
    front: shirtRows,
    back: Array.from({ length: 12 }, (_, j) => (j % 3 === 1 ? 'CCcCCCdC' : 'CCCCCCCC')),
    side: Array.from({ length: 12 }, (_, j) => (j % 4 === 2 ? 'CcCC' : 'CCCC')),
    top: ['CCCSSCCC', 'CCCCCCCC', 'CCCCCCCC', 'CCCCCCCC'],
    bottom: ['PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP'],
  }, 'C');
  P.add(K.spine, torso, mat, { pos: [0, 0.694 + 6 * PX, 0], hull: 0.006 });

  const armRows = ['CCCC', 'CdCC', 'CCcC', 'cCCC', 'SSSS', 'SsSS', 'SSSs', 'StSS', 'SSSS', 'sSSt', 'SSsS', 'SSSS'];
  for (const k of ['L', 'R']) {
    const { s, ua, th } = K.side[k];
    const arm = pixelBox(4, 12, 4, { front: armRows, back: armRows, side: armRows, top: ['CCCC', 'CCCC', 'CCCC', 'CCCC'], bottom: ['SSSS', 'SsSS', 'SSSS', 'SSsS'] }, 'S');
    P.add(ua, arm, mat, { pos: [s * B.shoulderX, 1.388 - 6 * PX, 0], hull: 0.006 });
    const legRows = ['PPPP', 'PPpP', 'PPPP', 'pPPP', 'PPPP', 'PPPp', 'PPPP', 'PpPP', 'PPPP', 'PPPP', 'GGgG', 'GGGG'];
    const leg = pixelBox(4, 12, 4, { front: legRows, back: legRows, side: legRows, top: ['PPPP', 'PPPP', 'PPPP', 'PPPP'], bottom: ['GGGG', 'GgGG', 'GGGG', 'GGGG'] }, 'P');
    P.add(th, leg, mat, { pos: [s * B.hipX, 6 * PX, 0], hull: 0.006 });
  }
}
