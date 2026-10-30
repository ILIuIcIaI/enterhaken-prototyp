import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { colored, box } from './mover.js';
import { CONTAINER_LINES, CONTAINER_SIZE, containerMesh } from './container.js';
import { SKY } from './palette.js';

// Containerschiff: Der Plan (shipPlan) legt Rumpfform, Ladung und Aufbauten fest – Kollisionsboxen und Modell entstehen aus
// demselben Plan, also steht man genau dort, wo auch etwas ist. Vorn = −z, die Wasserlinie liegt auf y = 0.
const BOW = 0.27;      // Anteil der Länge, auf dem der Bug spitz zuläuft
const PITCH = 12.8;    // Abstand der Ladebuchten
const COL = 2.56;      // Abstand der Containerreihen
const HATCH = 0.7;     // Höhe der Lukendeckel
const FORE_H = 2.5;    // Höhe der Back (erhöhtes Vordeck)

// halbe Rumpfbreite an der Stelle z in der Höhe y: spitzer, ausfallender Bug, leicht eingezogenes Heck
export function hullHalf(S, z, y = S.deck) {
  const lift = Math.min(1, Math.max(0, (y + 7) / (S.deck + 7)));
  // der Steven fällt nach vorn aus: oben reicht der Rumpf weiter nach vorn als an der Wasserlinie
  const len = 2 * S.half, u = Math.min(1, Math.max(0, (z + S.half - 10 * (1 - lift)) / (len * BOW)));
  const flare = 0.3 + 0.7 * lift;
  let b = S.beam * Math.pow(Math.sin((u * Math.PI) / 2), 0.62 + (1 - flare) * 0.9);
  b = Math.max(b, 0.35);
  const st = Math.max(0, (z - S.half * 0.72) / (S.half * 0.28));
  b *= 1 - 0.1 * st * st * (1.2 - lift);
  if (y < -2 && u >= 1) b *= 0.86 + 0.14 * Math.min(1, (y + 7) / 5);
  return b;
}

export function shipPlan(S, rand) {
  const z0 = -S.half + S.fore + 1.5, z1 = S.bridge[0] - 2, bays = Math.floor((z1 - z0) / PITCH);
  const cols = Math.floor((2 * S.beam - 1.4) / COL), stacks = [], { H } = CONTAINER_SIZE, yBase = S.deck + HATCH;
  for (let bay = 0; bay < bays; bay++) {
    const z = z0 + PITCH * (bay + 0.5), zf = z - PITCH / 2, hw = hullHalf(S, zf) - 0.5;
    for (let col = 0; col < cols; col++) {
      const x = (col - (cols - 1) / 2) * COL;
      if (Math.abs(x) + 1.25 > hw) continue;
      // in der Mitte höher gestapelt, außen und zum Bug hin niedriger
      const mid = 1 - Math.abs(x) / S.beam, fore = Math.min(1, (bay + 1) / 3);
      const tiers = rand() < 0.05 ? 0 : Math.max(1, Math.round(S.tiers * (0.45 + 0.55 * mid) * (0.55 + 0.45 * fore) * (0.72 + 0.28 * rand()) + 0.2));
      const boxes = [];
      for (let t = 0; t < tiers; t++) boxes.push({ line: Math.floor(rand() * CONTAINER_LINES), flip: rand() < 0.5 });
      stacks.push({ bay, col, x, z, y0: yBase, tiers, boxes, top: yBase + tiers * H });
    }
  }
  return { S, z0, z1, bays, cols, stacks, deckTop: yBase };
}

// Kollisionsboxen aus dem Plan
export function shipBoxes(plan) {
  const S = plan.S, out = [], add = (x0, y0, z0, x1, y1, z1) => out.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
  // Rumpf: gerader Mittelteil, Bug in Stufen
  const zBow = -S.half + 2 * S.half * BOW, zs = 3.2;
  add(-S.beam, -7, zBow, S.beam, S.deck, S.half * 0.72);
  for (let z = S.half * 0.72; z < S.half; z += zs) { const b = hullHalf(S, Math.min(S.half, z + zs)); add(-b, -7, z, b, S.deck, Math.min(S.half, z + zs)); }
  for (let z = -S.half; z < zBow; z += zs) {
    const b = hullHalf(S, Math.min(zBow, z + zs * 0.7));
    add(-b, -7, z, b, S.deck, Math.min(zBow, z + zs));
    // Back: das erhöhte Vordeck
    if (z < -S.half + S.fore) add(-b, S.deck, z, b, S.deck + FORE_H, Math.min(-S.half + S.fore, z + zs));
  }
  // Lukendeckel je Bucht und die Containerstapel: benachbarte gleich hohe Stapel einer Bucht zu einer Box zusammengefasst
  for (let bay = 0; bay < plan.bays; bay++) {
    const row = plan.stacks.filter((s) => s.bay === bay).sort((a, b) => a.x - b.x);
    if (!row.length) continue;
    const z = row[0].z, hl = CONTAINER_SIZE.L / 2, hw = CONTAINER_SIZE.W / 2;
    add(row[0].x - hw - 0.1, S.deck, z - hl - 0.15, row[row.length - 1].x + hw + 0.1, plan.deckTop, z + hl + 0.15);
    for (let i = 0; i < row.length;) {
      let j = i;
      while (j + 1 < row.length && row[j + 1].tiers === row[i].tiers) j++;
      if (row[i].tiers > 0) add(row[i].x - hw, plan.deckTop, z - hl, row[j].x + hw, row[i].top, z + hl);
      i = j + 1;
    }
  }
  // Aufbauten
  for (const L of levels(S)) add(-L.hw, L.y0, L.z0, L.hw, L.y1, L.z1);
  const W = wings(S), F = funnel(S);
  add(-S.beam + 0.3, W.y, W.z0, S.beam - 0.3, W.y + 0.35, W.z1);
  add(-F.hw, F.y0, F.z0, F.hw, F.y1, F.z1);
  return out;
}

// Aufbau: Decks über dem Hauptdeck, nach oben schmaler und kürzer
function levels(S) {
  const [b0, b1, bt] = S.bridge, n = S.decks, h = (bt - S.deck - 3.2) / n, out = [];
  for (let k = 0; k < n; k++) {
    const u = k / n;
    out.push({ y0: S.deck + k * h, y1: S.deck + (k + 1) * h, hw: S.beam - 1.6 - u * 2.4, z0: b0 + u * 0.8, z1: b1 - u * (b1 - b0) * 0.42 });
  }
  const top = out[n - 1];
  out.push({ y0: top.y1, y1: top.y1 + 3.2, hw: Math.min(top.hw, 5.4), z0: b0 + 1, z1: b0 + 6.2, bridge: true });
  return out;
}
function wings(S) {
  const [b0, , bt] = S.bridge;
  return { y: bt - 3.45, z0: b0 + 1, z1: b0 + 5.4 };
}
function funnel(S) {
  const [b0, b1, bt] = S.bridge, zc = b1 - (b1 - b0) * 0.3;
  return { hw: S.beam * 0.2, z0: zc - 2, z1: zc + 2, y0: S.deck + (bt - S.deck) * 0.45, y1: bt + 2.2 };
}

// Schrift (Schiffsname am Rumpf, Logo am Schornstein) auf einer transparenten Fläche
function label(text, w, h, ink = '#f0ede4', { font = 'Arial', weight = 800 } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.max(32, Math.round((1024 * h) / w));
  const x = c.getContext('2d');
  x.fillStyle = ink;
  x.font = `${weight} ${Math.round(c.height * 0.72)}px ${font}, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height * 0.54, c.width * 0.98);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMaterial('#ffffff', { map: t, transparent: true, alphaTest: 0.35, rim: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, pbr: { roughness: 0.6 } }));
}

const WIN = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.05, 0.08) });
// Fensterlicht folgt der Tageszeit (Ships.render, HarborTraffic.render)
export function updateShipLights() {
  const n = 1 - SKY.uSunUp.value;
  WIN.color.setRGB(0.03 + 2.2 * n, 0.05 + 1.85 * n, 0.08 + 1.2 * n);
}

// Rumpfschale als Band zwischen zwei Höhen, längs entlang der Stationen
function hullBand(S, y0, y1, zs, side, col) {
  const pos = [];
  const v = (z, y) => [side * hullHalf(S, z, y), y, z];
  for (let i = 0; i < zs.length - 1; i++) {
    const a = v(zs[i], y0), b = v(zs[i + 1], y0), c = v(zs[i + 1], y1), d = v(zs[i], y1);
    if (side > 0) pos.push(...a, ...d, ...c, ...a, ...c, ...b);
    else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return colored(g, col);
}
// waagrechte Fläche in Rumpfform zwischen zwei Stationen
function hullPlate(S, y, z0, z1, col, step = 3) {
  const pos = [];
  for (let z = z0; z < z1 - 1e-3; z += step) {
    const e = Math.min(z1, z + step), a = hullHalf(S, z, y), b = hullHalf(S, e, y);
    pos.push(-a, y, z, -b, y, e, b, y, e, -a, y, z, b, y, e, a, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return colored(g, col);
}

export function shipModel(plan, hullColor, name, rand) {
  const S = plan.S, geos = [], GRAY = '#7c8086', DECK = '#5e6a62', WHITE = '#eceae3', DARK = '#2a2c30', STEEL = '#a7a9a6';
  // Stationen: am Bug dicht
  const zs = [];
  for (let z = -S.half; z < S.half; z += z < -S.half + 2 * S.half * BOW ? 2.2 : 8) zs.push(z);
  zs.push(S.half);
  for (const side of [-1, 1]) {
    geos.push(hullBand(S, -7, -0.5, zs, side, '#7c2a24'));              // Unterwasserschiff und Wasserpass
    geos.push(hullBand(S, -0.5, S.deck - 0.3, zs, side, hullColor));
    geos.push(hullBand(S, S.deck - 0.3, S.deck, zs, side, '#d8d5cc'));   // Schanzkleid
    // Back: Bordwand steigt am Bug an
    const zf = zs.filter((z) => z <= -S.half + S.fore + 1e-3);
    zf.push(-S.half + S.fore);
    geos.push(hullBand(S, S.deck, S.deck + FORE_H - 0.3, zf, side, hullColor));
    geos.push(hullBand(S, S.deck + FORE_H - 0.3, S.deck + FORE_H, zf, side, '#d8d5cc'));
  }
  geos.push(hullPlate(S, S.deck, -S.half + S.fore - 0.5, S.half, DECK, 8));
  geos.push(hullPlate(S, S.deck + FORE_H, -S.half, -S.half + S.fore, '#6b4a3a'));
  // Spiegelheck
  geos.push(colored(box(2 * hullHalf(S, S.half), S.deck + 0.6, 0.2, 0, S.deck / 2 - 0.1, S.half + 0.02), hullColor));
  // Back-Abschluss und Ankerwinden, Poller
  geos.push(colored(box(2 * hullHalf(S, -S.half + S.fore) - 0.2, FORE_H, 0.3, 0, S.deck + FORE_H / 2, -S.half + S.fore), GRAY));
  for (const x of [-3.2, 3.2]) {
    geos.push(colored(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 12).rotateZ(Math.PI / 2).translate(x, S.deck + FORE_H + 0.65, -S.half + 8), '#3e5458'));
    geos.push(colored(box(1.6, 0.4, 1.6, x, S.deck + FORE_H + 0.2, -S.half + 8), DARK));
  }
  // Vormast
  geos.push(colored(new THREE.CylinderGeometry(0.16, 0.24, 8, 8).translate(0, S.deck + FORE_H + 4, -S.half + 12), '#d8d5cc'));
  // Reling: Pfosten und zwei Handläufe beiderseits
  for (const side of [-1, 1]) {
    for (let z = -S.half + S.fore + 2; z < S.half - 1; z += 3.4) {
      const b = hullHalf(S, z) - 0.12;
      geos.push(colored(box(0.06, 1.1, 0.06, side * b, S.deck + 0.55, z), '#cfd1cc'));
      const next = Math.min(S.half - 1, z + 3.4), b2 = hullHalf(S, next) - 0.12, len = Math.hypot(next - z, b2 - b), ang = Math.atan2(side * (b2 - b), next - z);
      for (const y of [0.6, 1.08]) geos.push(colored(box(0.035, 0.035, len, 0, 0, 0).rotateY(ang).translate(side * (b + b2) / 2, S.deck + y, (z + next) / 2), '#cfd1cc'));
    }
  }
  // Lukendeckel und Laschbrücken zwischen den Buchten
  for (let bay = 0; bay < plan.bays; bay++) {
    const row = plan.stacks.filter((s) => s.bay === bay);
    if (!row.length) continue;
    const xs = row.map((s) => s.x), x0 = Math.min(...xs) - 1.32, x1 = Math.max(...xs) + 1.32, z = row[0].z;
    geos.push(colored(box(x1 - x0, HATCH, CONTAINER_SIZE.L + 0.3, (x0 + x1) / 2, S.deck + HATCH / 2, z), '#3f5560'));
    for (let k = 1; k < 5; k++) geos.push(colored(box(x1 - x0, 0.05, 0.08, (x0 + x1) / 2, S.deck + HATCH + 0.02, z - CONTAINER_SIZE.L / 2 + (k * CONTAINER_SIZE.L) / 5), '#2f4048'));
    const lz = z + PITCH / 2;
    if (bay < plan.bays - 1) {
      geos.push(colored(box(x1 - x0, 0.14, 0.34, (x0 + x1) / 2, S.deck + HATCH + 2.7, lz), '#c9a93a'));
      for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 5))) geos.push(colored(box(0.14, 2.75, 0.14, x, S.deck + HATCH + 1.35, lz), '#c9a93a'));
    }
  }
  // Aufbau: Decks, Fensterbänder, Galerien
  const windows = [], LV = levels(S);
  LV.forEach((L, k) => {
    const h = L.y1 - L.y0, zc = (L.z0 + L.z1) / 2, zl = L.z1 - L.z0;
    geos.push(colored(box(2 * L.hw, h, zl, 0, (L.y0 + L.y1) / 2, zc), L.bridge ? '#f2f0ea' : WHITE));
    geos.push(colored(box(2 * L.hw + 0.5, 0.14, zl + 0.5, 0, L.y1, zc), '#c2c0b8'));
    // Fenster vorn und an den Seiten
    if (k === 0) return;
    const wh = L.bridge ? 1.5 : 0.95, wy = L.y0 + h * (L.bridge ? 0.62 : 0.56);
    if (L.bridge) {
      windows.push(box(2 * L.hw - 0.5, wh, 0.06, 0, wy, L.z0 - 0.02));
      windows.push(box(0.06, wh, zl - 1.2, -L.hw - 0.02, wy, zc), box(0.06, wh, zl - 1.2, L.hw + 0.02, wy, zc));
      return;
    }
    const nf = Math.floor((2 * L.hw - 1) / 2.1), ns = Math.floor((zl - 1.4) / 2.1);
    for (let i = 0; i < nf; i++) windows.push(box(1.3, wh, 0.06, ((i - (nf - 1) / 2) * (2 * L.hw - 1)) / nf, wy, L.z0 - 0.02));
    for (let i = 0; i < ns; i++) {
      const z = L.z0 + 1 + ((i + 0.5) * (zl - 2)) / ns;
      windows.push(box(0.06, wh, 1.3, -L.hw - 0.02, wy, z), box(0.06, wh, 1.3, L.hw + 0.02, wy, z));
    }
  });
  // Brückennock über die ganze Breite
  const Wg = wings(S);
  geos.push(colored(box(2 * S.beam - 0.6, 0.3, Wg.z1 - Wg.z0, 0, Wg.y + 0.15, (Wg.z0 + Wg.z1) / 2), '#e0ded6'));
  for (const s of [-1, 1]) {
    geos.push(colored(box(2.4, 1.05, Wg.z1 - Wg.z0, s * (S.beam - 1.6), Wg.y + 0.82, (Wg.z0 + Wg.z1) / 2), '#e0ded6'));
    geos.push(colored(box(0.35, 3.6, 0.5, s * (S.beam - 1.0), Wg.y - 1.8, Wg.z1 - 0.3), '#c2c0b8'));
    windows.push(box(0.06, 0.6, Wg.z1 - Wg.z0 - 0.6, s * (S.beam - 0.38), Wg.y + 0.95, (Wg.z0 + Wg.z1) / 2));
  }
  // Mast mit Radar und Antennen auf der Brücke
  const B = LV[LV.length - 1], mz = (B.z0 + B.z1) / 2;
  geos.push(colored(new THREE.CylinderGeometry(0.14, 0.22, 6.2, 8).translate(0, B.y1 + 3.1, mz), '#d8d5cc'));
  geos.push(colored(box(3.4, 0.14, 0.3, 0, B.y1 + 3.5, mz), DARK), colored(box(2.2, 0.12, 0.26, 0, B.y1 + 5.2, mz), DARK));
  for (const x of [-1.6, 1.6]) geos.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5).translate(x, B.y1 + 1.1, mz + 1.6), '#d8d5cc'));
  // Schornstein mit Reedereistreifen und Abgasrohren
  const F = funnel(S), fy = (F.y0 + F.y1) / 2, fz = (F.z0 + F.z1) / 2;
  const fh = F.y1 - F.y0, fCol = name.funnel ?? '#c8352b';
  geos.push(colored(box(2 * F.hw, fh, F.z1 - F.z0, 0, fy, fz), '#32363c'));
  geos.push(colored(box(2 * F.hw + 0.04, fh * 0.22, F.z1 - F.z0 + 0.04, 0, F.y1 - fh * 0.2, fz), fCol));
  geos.push(colored(box(2 * F.hw + 0.06, 0.28, F.z1 - F.z0 + 0.06, 0, F.y1 - 0.14, fz), '#1a1c20'));
  for (const x of [-0.75, 0.75]) geos.push(colored(new THREE.CylinderGeometry(0.42, 0.42, 2.2, 12).translate(x, F.y1 + 1, fz), '#2a2c30'));
  // Rettungsboote an Davits
  const lb = LV[1], lbz = (lb.z0 + lb.z1) / 2;
  for (const s of [-1, 1]) {
    const x = s * (lb.hw + 1.1), y = lb.y1 + 0.3;
    geos.push(colored(new THREE.CapsuleGeometry(1.0, 4.4, 6, 12).rotateX(Math.PI / 2).scale(1, 0.92, 1).translate(x, y, lbz), '#e0651e'));
    geos.push(colored(box(1.1, 0.5, 2.6, x, y + 1.02, lbz), '#f2f0ea'));
    for (const dz of [-2.4, 2.4]) geos.push(colored(box(1.6, 0.14, 0.14, s * (lb.hw + 0.55), y + 1.6, lbz + dz), STEEL), colored(box(0.14, 2.4, 0.14, s * (lb.hw + 0.05), y + 0.5, lbz + dz), STEEL));
  }
  // Treppe und Kräne an Deck
  for (const s of [-1, 1]) geos.push(colored(box(0.8, 0.1, 5.6, s * (S.beam - 2.1), S.deck + 1.7, S.bridge[0] - 1.2).rotateX(0), STEEL));
  const m = new THREE.Mesh(mergeGeometries(geos), toonMaterial('#ffffff', { vertexColors: true, rim: 0.22, pbr: { roughness: 0.58, metalness: 0.18 } }));
  m.castShadow = true;
  m.receiveShadow = true;
  for (const g of geos) g.dispose();
  const group = new THREE.Group();
  const win = new THREE.Mesh(mergeGeometries(windows), WIN);
  for (const g of windows) g.dispose();
  // Ladung
  const list = [];
  for (const s of plan.stacks) {
    s.boxes.forEach((c, t) => list.push({ x: s.x, y: s.y0 + t * CONTAINER_SIZE.H, z: s.z, line: c.line, flip: c.flip }));
  }
  const load = containerMesh(list);
  // Positions- und Toplicht
  const lights = [
    [new THREE.Color(6, 0.3, 0.2), -S.beam + 0.2, Wg.y + 1.6, Wg.z0 + 0.6],
    [new THREE.Color(0.3, 6, 0.8), S.beam - 0.2, Wg.y + 1.6, Wg.z0 + 0.6],
    [new THREE.Color(8, 8, 8), 0, S.deck + FORE_H + 8.1, -S.half + 12],
    [new THREE.Color(8, 8, 8), 0, B.y1 + 6.3, mz],
  ].map(([c, x, y, z]) => new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6).translate(x, y, z), new THREE.MeshBasicMaterial({ color: c, fog: false })));
  group.add(m, win, load, ...lights);
  // Name an Bug und Heck, Heimathafen darunter
  if (name.text) {
    for (const s of [-1, 1]) {
      const zb = -S.half + 2 * S.half * BOW + 3, L = label(name.text, 22, 2.4);
      L.position.set(s * (hullHalf(S, zb, 3) + 0.06), 2.9, zb);
      L.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(L);
    }
    const st = label(name.text, 18, 2.1);
    st.position.set(0, 3.2, S.half + 0.16);
    group.add(st);
    const home = label(name.home ?? '', 10, 1.2);
    home.position.set(0, 1.5, S.half + 0.16);
    group.add(home);
    for (const s of [-1, 1]) {
      const lg = label(name.logo ?? 'K', 3.4, 2.4, '#f0ede4');
      lg.position.set(s * (F.hw + 0.05), F.y1 - fh * 0.2, fz);
      lg.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(lg);
    }
  }
  return group;
}
