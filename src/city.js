import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { DUSK_GLSL } from './palette.js';
import { gradientMap, toonMaterial } from './toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Die Stadt besteht ausschließlich aus achsenparallelen Boxen (AABBs). Das hält Kollision und
// Raycasts einfach und exakt; Fenster werden komplett im Shader erzeugt.

// Fassadenfarben je Fensterstil (0 Glas, 1 Büro, 2 Wohnhaus) und Viertel
const GLASS = ['#7a86a6', '#6b7898', '#8892b0', '#5f6a8c', '#909ab4', '#6f8fa0'];
const OFFICE = ['#a49aa8', '#928a9c', '#b2a8b0', '#837b8e', '#a8969a'];
const BRICK = ['#7e4c4a', '#8f5450', '#6c4244', '#9a6258', '#844e52'];
const WARM = ['#b0624c', '#c9b08a', '#c98a92', '#8fb5a0', '#c9a052', '#9a6258', '#b9a0c0'];
const PASTEL = ['#d8a7a0', '#e0c79a', '#9fc3b5', '#c7a8d0', '#e8d4b0', '#a8c4d8', '#e0b0c0'];
const PROP_COLOR = '#5e5866';
const NEON = ['#3ff0ff', '#ff3fd2', '#ffd23f', '#ff5a3f', '#8a5cff', '#3fff9a'];
const CELL = 24;
const COAST_F = [1, 2, 3, 5, 7, 11];

// Blocktypen (auch für den Boden-Shader): 0 Wiese/leer, 1 bebaut, 2 Park, 3 Platz, 4 Park mit Teich
export const BLOCK = { EMPTY: 0, BUILT: 1, PARK: 2, PLAZA: 3, POND: 4 };

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

export class City {
  constructor(seed) {
    this.material = createBuildingMaterial();
    this.mesh = null;
    this.decor = new THREE.Group();
    this.glyphs = { v: glyphTexture(128, 512), h: glyphTexture(512, 128) };
    this.stamp = 0;
    this.hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), box: null, ground: false };
    // gemeinsame Uniforms für Boden- und Wasser-Shader (werden bei jeder neuen Stadt aktualisiert)
    this.mapUniforms = {
      uPitch: { value: 0 }, uBlock: { value: 0 }, uOrigin: { value: 0 }, uN: { value: 1 },
      uCoastR0: { value: 400 }, uCoastA: { value: new Array(6).fill(0) }, uCoastP: { value: new Array(6).fill(0) },
      uBlockTex: { value: null },
    };
    this.generate(seed);
  }

  // Radius der Küstenlinie in Richtung (x, z): mehrere überlagerte Wellen → Buchten und Landzungen
  coastR(x, z) {
    const th = Math.atan2(z, x);
    let r = 1;
    for (let i = 0; i < 6; i++) r += this.island.a[i] * Math.sin(COAST_F[i] * th + this.island.p[i]);
    return this.island.r0 * r;
  }

  // > 0 im Meer, < 0 an Land (Meter bis zur Küste)
  coastDist(x, z) {
    return Math.hypot(x, z) - this.coastR(x, z);
  }

  generate(seed) {
    this.seed = seed;
    const rand = mulberry32(seed);
    const N = 18, B = 38, S = 15, P = B + S;
    const half = (N * P) / 2;
    this.layout = { N, B, S, P, half, origin: -half + S / 2 };
    const amps = [0.05, 0.075, 0.055, 0.035, 0.022, 0.012];
    this.island = { r0: 410, a: amps.map((a) => a * (0.75 + rand() * 0.5)), p: amps.map(() => rand() * Math.PI * 2) };
    this.boxes = [];
    this.roofs = [];
    this.towers = [];
    this.antennas = [];
    this.trees = [];
    this.waterTowers = [];
    this.blockTypes = new Uint8Array(N * N);

    // Blöcke nur dort, wo alle Ecken genug Abstand zur Küste haben (Strand + Promenade bleiben frei)
    const blocks = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const bx = this.layout.origin + i * P, bz = this.layout.origin + j * P;
        const corner = Math.max(this.coastDist(bx, bz), this.coastDist(bx + B, bz), this.coastDist(bx, bz + B), this.coastDist(bx + B, bz + B));
        const cx = bx + B / 2, cz = bz + B / 2;
        const dn = Math.hypot(cx, cz) / this.coastR(cx, cz);
        let zone = dn < 0.3 ? 'downtown' : dn < 0.58 ? 'midtown' : 'residential';
        if (corner > -85) zone = 'waterfront';
        if (corner > -50) {
          this.trees.push(...this.scatterTrees(bx, bz, B, rand, 9, 0.45, false));
          continue;
        }
        blocks.push({ i, j, bx, bz, zone });
      }
    }
    // ein großer Stadtpark aus 2×2 Blöcken im mittleren Ring
    const parkAng = rand() * Math.PI * 2;
    const pr = this.coastR(Math.cos(parkAng), Math.sin(parkAng)) * 0.42;
    const pi = Math.floor((Math.cos(parkAng) * pr - this.layout.origin) / P), pj = Math.floor((Math.sin(parkAng) * pr - this.layout.origin) / P);
    const central = new Set([[pi, pj], [pi + 1, pj], [pi, pj + 1], [pi + 1, pj + 1]].map(([a, b]) => a * N + b));

    for (const blk of blocks) {
      const { i, j, bx, bz, zone } = blk;
      const r = rand();
      const parkChance = { downtown: 0.03, midtown: 0.08, residential: 0.15, waterfront: 0.1 }[zone];
      const plazaChance = zone === 'downtown' || zone === 'midtown' ? 0.05 : 0.02;
      let type = BLOCK.BUILT;
      if (central.has(i * N + j)) type = i === pi + 1 && j === pj + 1 ? BLOCK.POND : BLOCK.PARK;
      else if (r < parkChance) type = rand() < 0.3 ? BLOCK.POND : BLOCK.PARK;
      else if (r < parkChance + plazaChance) type = BLOCK.PLAZA;
      this.blockTypes[i * N + j] = type;
      if (type === BLOCK.PARK || type === BLOCK.POND) {
        this.trees.push(...this.scatterTrees(bx, bz, B, rand, 6.5, 0.85, type === BLOCK.POND));
      } else if (type === BLOCK.PLAZA) {
        this.addPlaza(bx, bz, B, rand);
      } else {
        for (const lot of this.splitBlock(bx, bz, B, rand, zone)) this.addBuilding(lot, zone, rand);
        if ((zone === 'residential' || zone === 'waterfront') && rand() < 0.5) this.streetTrees(bx, bz, B, rand);
      }
    }
    this.promenade(rand);

    const mu = this.mapUniforms;
    mu.uPitch.value = P; mu.uBlock.value = B; mu.uOrigin.value = this.layout.origin; mu.uN.value = N;
    mu.uCoastR0.value = this.island.r0;
    mu.uCoastA.value = [...this.island.a];
    mu.uCoastP.value = [...this.island.p];
    if (mu.uBlockTex.value) mu.uBlockTex.value.dispose();
    const tex = new THREE.DataTexture(this.blockTypes, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    mu.uBlockTex.value = tex;

    for (const t of this.trees) this.addBox(t.x - 0.25, 0, t.z - 0.25, t.x + 0.25, 2.6 * t.s, t.z + 0.25, { noRender: true, noWallrun: true, kind: 2, style: 3, seed: 0, color: new THREE.Color('#000') });
    this.buildIndex();
    this.buildMesh();
    this.buildDecor(rand);
  }

  // Bäume locker verteilt (Wege und Teich bleiben frei); Kirschbäume für Farbtupfer
  scatterTrees(bx, bz, B, rand, step, density, pond) {
    const out = [];
    for (let x = bx + 3; x < bx + B - 3; x += step) {
      for (let z = bz + 3; z < bz + B - 3; z += step) {
        if (rand() > density) continue;
        const tx = x + (rand() - 0.5) * step * 0.7, tz = z + (rand() - 0.5) * step * 0.7;
        const lx = tx - bx, lz = tz - bz;
        if (Math.abs(lx - lz) < 3 || Math.abs(lx + lz - B) < 3) continue;
        if (pond && Math.hypot(lx - B / 2, lz - B / 2) < 12) continue;
        if (this.coastDist(tx, tz) > -40) continue;
        out.push({ x: tx, z: tz, s: 0.8 + rand() * 0.6, sakura: rand() < 0.28 });
      }
    }
    return out;
  }

  streetTrees(bx, bz, B, rand) {
    for (let t = 6; t < B - 4; t += 11) {
      for (const [x, z] of [[bx + t, bz + 1.2], [bx + t, bz + B - 1.2], [bx + 1.2, bz + t], [bx + B - 1.2, bz + t]]) {
        if (rand() < 0.7) this.trees.push({ x, z, s: 0.7 + rand() * 0.3, sakura: rand() < 0.15 });
      }
    }
  }

  // Bäume entlang der Uferpromenade
  promenade(rand) {
    const n = 90;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.03;
      const r = this.coastR(Math.cos(a), Math.sin(a)) - 44;
      if (rand() < 0.75) this.trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.85 + rand() * 0.4, sakura: rand() < 0.2 });
    }
  }

  splitBlock(bx, bz, B, rand, zone) {
    const inset = 2.5;
    const x0 = bx + inset, z0 = bz + inset, x1 = bx + B - inset, z1 = bz + B - inset;
    const small = zone === 'residential' || zone === 'waterfront';
    const gap = rand() < (small ? 0.6 : 0.5) ? 0 : 3 + rand() * 3;
    const xs = [x0, x1], zs = [z0, z1];
    if (rand() < (small ? 0.8 : 0.5)) xs.splice(1, 0, x0 + (x1 - x0) * (0.35 + rand() * 0.3));
    if (rand() < (small ? 0.8 : 0.5)) zs.splice(1, 0, z0 + (z1 - z0) * (0.35 + rand() * 0.3));
    const lots = [];
    for (let a = 0; a < xs.length - 1; a++) {
      for (let b = 0; b < zs.length - 1; b++) {
        lots.push({
          x0: xs[a] + (a > 0 ? gap / 2 : 0),
          x1: xs[a + 1] - (a < xs.length - 2 ? gap / 2 : 0),
          z0: zs[b] + (b > 0 ? gap / 2 : 0),
          z1: zs[b + 1] - (b < zs.length - 2 ? gap / 2 : 0),
        });
      }
    }
    return lots;
  }

  // Aussehen je Viertel: Fensterstil + Fassadenfarbe
  look(zone, rand) {
    const r = rand();
    let style, pal;
    if (zone === 'downtown') [style, pal] = r < 0.65 ? [0, GLASS] : [1, OFFICE];
    else if (zone === 'midtown') [style, pal] = r < 0.3 ? [0, GLASS] : r < 0.85 ? [1, OFFICE] : [2, BRICK];
    else if (zone === 'residential') [style, pal] = r < 0.65 ? [2, WARM] : r < 0.85 ? [2, BRICK] : [1, OFFICE];
    else [style, pal] = [2, PASTEL];
    const color = new THREE.Color(pick(pal, rand));
    color.offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.06);
    return { style, color, seed: Math.floor(rand() * 1000), kind: 0 };
  }

  // Bauform je Viertel: Türme, Stufenpyramiden, Zwillingstürme mit Brücke, Spitztürme,
  // Riegel, L-Formen, Reihenhäuser und Innenhof-Blöcke
  addBuilding(lot, zone, rand) {
    const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0, minDim = Math.min(w, d);
    const H = { downtown: [95, 300], midtown: [35, 140], residential: [10, 42], waterfront: [6, 18] }[zone];
    let h = H[0] + (H[1] - H[0]) * rand() ** 1.4;
    if (zone === 'downtown' && rand() < 0.1) h = Math.min(330, h * 1.3);
    const L = this.look(zone, rand);
    const forms = {
      downtown: ['tower', 'tower', 'stepped', 'twin', 'spire'],
      midtown: ['tower', 'slab', 'lshape', 'stepped', 'tower'],
      residential: ['rows', 'court', 'slab', 'block', 'rows'],
      waterfront: ['rows', 'block', 'rows'],
    }[zone];
    let form = pick(forms, rand);
    if ((form === 'twin' || form === 'court' || form === 'lshape') && minDim < 18) form = 'tower';
    if (form === 'stepped' && minDim < 16) form = 'tower';
    const box = (x0, y0, z0, x1, y1, z1, look = L) => this.addBox(x0, y0, z0, x1, y1, z1, look);
    const tops = [];
    let base = null;

    if (form === 'tower') {
      if (minDim < 16 || rand() < 0.4) tops.push((base = box(lot.x0, 0, lot.z0, lot.x1, h, lot.z1)));
      else {
        const h1 = Math.max(8, h * (0.18 + rand() * 0.17)), ins = 2.5 + rand() * (minDim * 0.2 - 2.5);
        base = box(lot.x0, 0, lot.z0, lot.x1, h1, lot.z1);
        tops.push(box(lot.x0 + ins, h1, lot.z0 + ins, lot.x1 - ins, h, lot.z1 - ins));
      }
    } else if (form === 'stepped') {
      let ins = 0, y = 0;
      for (const f of [0.34, 0.58, 0.8, 1.0]) {
        const b = box(lot.x0 + ins, y, lot.z0 + ins, lot.x1 - ins, h * f, lot.z1 - ins);
        base ??= b;
        y = h * f;
        ins += 1.5 + rand() * Math.max(0.5, minDim * 0.06);
        if (f === 1.0) tops.push(b);
      }
    } else if (form === 'twin') {
      const alongX = w > d, gap = 5 + rand() * 3;
      const mid = alongX ? (lot.x0 + lot.x1) / 2 : (lot.z0 + lot.z1) / 2;
      const h2 = h * (0.8 + rand() * 0.15);
      const A = alongX ? [lot.x0, lot.z0, mid - gap / 2, lot.z1] : [lot.x0, lot.z0, lot.x1, mid - gap / 2];
      const Bb = alongX ? [mid + gap / 2, lot.z0, lot.x1, lot.z1] : [lot.x0, mid + gap / 2, lot.x1, lot.z1];
      tops.push((base = box(A[0], 0, A[1], A[2], h, A[3])), box(Bb[0], 0, Bb[1], Bb[2], h2, Bb[3]));
      // Skybridge zwischen den Türmen
      const by = h2 * (0.55 + rand() * 0.2), c = alongX ? (lot.z0 + lot.z1) / 2 : (lot.x0 + lot.x1) / 2;
      if (alongX) box(mid - gap / 2, by, c - 2.5, mid + gap / 2, by + 4, c + 2.5);
      else box(c - 2.5, by, mid - gap / 2, c + 2.5, by + 4, mid + gap / 2);
    } else if (form === 'spire') {
      const ins = minDim * 0.28;
      base = box(lot.x0, 0, lot.z0, lot.x1, h * 0.82, lot.z1);
      const crown = box(lot.x0 + ins, h * 0.82, lot.z0 + ins, lot.x1 - ins, h, lot.z1 - ins);
      tops.push(crown);
      const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
      this.antennas.push(box(cx - 0.4, h, cz - 0.4, cx + 0.4, h + 18 + rand() * 20, cz + 0.4, { ...L, style: 3, kind: 2, color: new THREE.Color('#8a8494') }));
    } else if (form === 'slab' || form === 'block') {
      tops.push((base = box(lot.x0, 0, lot.z0, lot.x1, form === 'slab' ? h * 0.7 : h, lot.z1)));
    } else if (form === 'lshape') {
      const t = minDim * 0.45;
      base = box(lot.x0, 0, lot.z0, lot.x0 + t, h, lot.z1);
      tops.push(base, box(lot.x0 + t, 0, lot.z0, lot.x1, h * (0.55 + rand() * 0.3), lot.z0 + t));
    } else if (form === 'rows') {
      // schmale Häuser nebeneinander, jedes mit eigener Höhe und Farbe
      const alongX = w > d, len = alongX ? w : d;
      const n = Math.max(2, Math.round(len / (6 + rand() * 3)));
      for (let k = 0; k < n; k++) {
        const a = (alongX ? lot.x0 : lot.z0) + (len / n) * k, b = a + len / n;
        const hk = h * (0.7 + rand() * 0.6), lk = this.look(zone, rand);
        const bb = alongX ? box(a, 0, lot.z0, b, hk, lot.z1, lk) : box(lot.x0, 0, a, lot.x1, hk, b, lk);
        base ??= bb;
        tops.push(bb);
      }
    } else if (form === 'court') {
      // Wohnblock mit offenem Innenhof
      const t = Math.min(9, minDim * 0.32);
      base = box(lot.x0, 0, lot.z0, lot.x1, h, lot.z0 + t);
      tops.push(base, box(lot.x0, 0, lot.z1 - t, lot.x1, h * (0.85 + rand() * 0.3), lot.z1));
      tops.push(box(lot.x0, 0, lot.z0 + t, lot.x0 + t, h * 0.9, lot.z1 - t), box(lot.x1 - t, 0, lot.z0 + t, lot.x1, h * 0.95, lot.z1 - t));
    }
    for (const top of tops) {
      this.roofs.push(top);
      this.roofProps(top, zone, rand);
    }
    if (base) this.towers.push({ base, top: tops[0] ?? base, h, style: L.style, zone });
  }

  // Dachaufbauten (Technik, Wassertanks auf Wohnhäusern) – die Dachmitte bleibt frei für den Spawn.
  roofProps(top, zone, rand) {
    const tw = top.maxX - top.minX, td = top.maxZ - top.minZ;
    if (tw < 8 || td < 8) return;
    const cx = (top.minX + top.maxX) / 2, cz = (top.minZ + top.maxZ) / 2;
    const n = Math.floor(rand() * (zone === 'downtown' ? 5 : 3));
    for (let k = 0; k < n; k++) {
      const pw = 2 + rand() * 3, pd = 2 + rand() * 3, ph = 1.5 + rand() * 2;
      const px = top.minX + 1.5 + rand() * (tw - 3 - pw);
      const pz = top.minZ + 1.5 + rand() * (td - 3 - pd);
      if (px < cx + 3 && px + pw > cx - 3 && pz < cz + 3 && pz + pd > cz - 3) continue;
      this.addBox(px, top.maxY, pz, px + pw, top.maxY + ph, pz + pd, { style: 3, color: new THREE.Color(PROP_COLOR), seed: 0, kind: 2 });
    }
    if ((zone === 'residential' || zone === 'midtown') && rand() < 0.35) {
      const x = top.minX + 2.5, z = top.maxZ - 2.5;
      this.waterTowers.push({ x, y: top.maxY, z, r: 1.6 + rand() * 0.6 });
      this.addBox(x - 1.6, top.maxY, z - 1.6, x + 1.6, top.maxY + 6, z + 1.6, { noRender: true, style: 3, kind: 2, seed: 0, color: new THREE.Color('#000') });
    }
    if (top.maxY > 140 && rand() < 0.5) {
      this.antennas.push(this.addBox(top.minX + 2, top.maxY, top.minZ + 2, top.minX + 2.7, top.maxY + 8 + rand() * 14, top.minZ + 2.7, { style: 3, color: new THREE.Color('#77707e'), seed: 0, kind: 2 }));
    }
  }

  // Platz mit Kiosken und Pavillon
  addPlaza(bx, bz, B, rand) {
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const w = 5 + rand() * 7, d = 5 + rand() * 7, h = 3.5 + rand() * 4;
      const x = bx + 4 + rand() * (B - 8 - w), z = bz + 4 + rand() * (B - 8 - d);
      const top = this.addBox(x, 0, z, x + w, h, z + d, { style: 1, color: new THREE.Color(pick(PASTEL, rand)), seed: Math.floor(rand() * 1000), kind: 0 });
      this.roofs.push(top);
    }
  }

  addBox(x0, y0, z0, x1, y1, z1, info) {
    const b = { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, stamp: 0, ...info };
    this.boxes.push(b);
    return b;
  }

  // ---------------------------------------------------------------- räumlicher Index
  buildIndex() {
    this.grid = new Map();
    for (const b of this.boxes) {
      const ix0 = Math.floor(b.minX / CELL), ix1 = Math.floor(b.maxX / CELL);
      const iz0 = Math.floor(b.minZ / CELL), iz1 = Math.floor(b.maxZ / CELL);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = (ix + 2048) * 4096 + (iz + 2048);
          let cell = this.grid.get(key);
          if (!cell) this.grid.set(key, (cell = []));
          cell.push(b);
        }
      }
    }
  }

  // Sammelt alle Boxen, deren Zellen das XZ-Rechteck berühren (ohne Duplikate).
  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const s = ++this.stamp;
    const ix0 = Math.floor(minX / CELL), ix1 = Math.floor(maxX / CELL);
    const iz0 = Math.floor(minZ / CELL), iz1 = Math.floor(maxZ / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const cell = this.grid.get((ix + 2048) * 4096 + (iz + 2048));
        if (!cell) continue;
        for (const b of cell) {
          if (b.stamp !== s) {
            b.stamp = s;
            out.push(b);
          }
        }
      }
    }
    return out;
  }

  // Strahl gegen alle Gebäude (und optional den Boden). Gibt ein wiederverwendetes Ergebnisobjekt zurück.
  raycast(origin, dir, maxDist, includeGround = false) {
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = Math.abs(dir.x) < 1e-9 ? 1e-9 : dir.x;
    const dy = Math.abs(dir.y) < 1e-9 ? 1e-9 : dir.y;
    const dz = Math.abs(dir.z) < 1e-9 ? 1e-9 : dir.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let best = maxDist, bestBox = null, bestAxis = -1;
    for (const b of this.boxes) {
      let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix;
      let tmin = t1 < t2 ? t1 : t2, tmax = t1 < t2 ? t2 : t1, axis = 0;
      t1 = (b.minY - oy) * iy; t2 = (b.maxY - oy) * iy;
      let lo = t1 < t2 ? t1 : t2, hi = t1 < t2 ? t2 : t1;
      if (lo > tmin) { tmin = lo; axis = 1; }
      if (hi < tmax) tmax = hi;
      if (tmax < tmin) continue;
      t1 = (b.minZ - oz) * iz; t2 = (b.maxZ - oz) * iz;
      lo = t1 < t2 ? t1 : t2; hi = t1 < t2 ? t2 : t1;
      if (lo > tmin) { tmin = lo; axis = 2; }
      if (hi < tmax) tmax = hi;
      if (tmax < tmin || tmin < 0 || tmin >= best) continue;
      best = tmin; bestBox = b; bestAxis = axis;
    }
    let ground = false;
    if (includeGround && dy < 0) {
      const tg = -oy / dy;
      if (tg >= 0 && tg < best) { best = tg; bestBox = null; ground = true; }
    }
    if (!bestBox && !ground) return null;
    const h = this.hit;
    h.dist = best; h.box = bestBox; h.ground = ground;
    h.point.set(ox + dir.x * best, oy + dir.y * best, oz + dir.z * best);
    if (ground) h.normal.set(0, 1, 0);
    else h.normal.set(bestAxis === 0 ? -Math.sign(dx) : 0, bestAxis === 1 ? -Math.sign(dy) : 0, bestAxis === 2 ? -Math.sign(dz) : 0);
    return h;
  }

  // ---------------------------------------------------------------- Mesh
  buildMesh() {
    const visible = this.boxes.filter((b) => !b.noRender);
    const nb = visible.length;
    const V = nb * 20;
    const pos = new Float32Array(V * 3), nrm = new Float32Array(V * 3), col = new Float32Array(V * 3);
    const fac = new Float32Array(V * 2), inf = new Float32Array(V * 4);
    const idx = new Uint32Array(nb * 30);
    let v = 0, ii = 0;

    // Ein Quad: Ecken unten-links, unten-rechts, oben-rechts, oben-links (von außen gesehen, CCW).
    const quad = (c, nx, ny, nz, uv, b, width, kind) => {
      for (let k = 0; k < 4; k++) {
        const o = (v + k) * 3;
        pos[o] = c[k * 3]; pos[o + 1] = c[k * 3 + 1]; pos[o + 2] = c[k * 3 + 2];
        nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz;
        col[o] = b.color.r; col[o + 1] = b.color.g; col[o + 2] = b.color.b;
        fac[(v + k) * 2] = uv[k * 2]; fac[(v + k) * 2 + 1] = uv[k * 2 + 1];
        const q = (v + k) * 4;
        inf[q] = b.seed; inf[q + 1] = b.style; inf[q + 2] = width; inf[q + 3] = kind;
      }
      idx[ii++] = v; idx[ii++] = v + 1; idx[ii++] = v + 2;
      idx[ii++] = v; idx[ii++] = v + 2; idx[ii++] = v + 3;
      v += 4;
    };

    for (const b of visible) {
      const { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 } = b;
      const wx = x1 - x0, wz = z1 - z0;
      const side = b.kind === 2 ? 2 : 0;
      const roof = b.kind === 2 ? 2 : 1;
      quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], 1, 0, 0, [0, y0, wz, y0, wz, y1, 0, y1], b, wz, side);
      quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], -1, 0, 0, [0, y0, wz, y0, wz, y1, 0, y1], b, wz, side);
      quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], 0, 0, 1, [0, y0, wx, y0, wx, y1, 0, y1], b, wx, side);
      quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], 0, 0, -1, [0, y0, wx, y0, wx, y1, 0, y1], b, wx, side);
      quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], 0, 1, 0, [x0, z1, x1, z1, x1, z0, x0, z0], b, wx, roof);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aFac', new THREE.BufferAttribute(fac, 2));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(inf, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    } else {
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
    }
  }

  // ---------------------------------------------------------------- Dystopische Details (nur Optik)
  buildDecor(rand) {
    for (const c of this.decor.children) c.geometry.dispose();
    this.decor.clear();
    const signs = [], boards = [], strips = [], beacons = [];
    const neon = () => new THREE.Color(pick(NEON, rand));

    for (const t of this.towers) {
      const { base, top, h } = t;
      // Senkrechte Leuchtschilder, die quer aus der Fassade ragen
      if (h > 25 && rand() < 0.45) {
        const n = 1 + Math.floor(rand() * 2);
        for (let k = 0; k < n; k++) {
          const face = Math.floor(rand() * 4);
          const sh = Math.min(base.maxY - 8, 7 + rand() * 16);
          if (sh < 5) continue;
          const y = 5 + rand() * Math.max(0, Math.min(base.maxY, 70) - sh - 6);
          const out = 1.4 + rand() * 1.2;
          const alongX = face < 2;
          const span = alongX ? base.maxX - base.minX : base.maxZ - base.minZ;
          const u = 2 + rand() * Math.max(0, span - 4);
          let x, z;
          if (face === 0) { x = base.minX + u; z = base.minZ - out / 2; }
          else if (face === 1) { x = base.minX + u; z = base.maxZ + out / 2; }
          else if (face === 2) { x = base.minX - out / 2; z = base.minZ + u; }
          else { x = base.maxX + out / 2; z = base.minZ + u; }
          signs.push({ x, y: y + sh / 2, z, sx: alongX ? 0.35 : out, sy: sh, sz: alongX ? out : 0.35, color: neon() });
        }
      }
      // Werbetafeln auf Dächern
      const tw = top.maxX - top.minX, td = top.maxZ - top.minZ;
      if (h > 30 && h < 150 && tw > 12 && rand() < 0.25) {
        const bw = Math.min(tw - 2, 10 + rand() * 6), bh = 4 + rand() * 3;
        const side = rand() < 0.5 ? -1 : 1;
        boards.push({ x: (top.minX + top.maxX) / 2, y: top.maxY + 1 + bh / 2, z: side < 0 ? top.minZ + 0.6 : top.maxZ - 0.6, w: bw, h: bh, rotY: side < 0 ? Math.PI : 0, color: neon() });
      }
      // Leuchtkanten an Dachrändern hoher Türme
      if (h > 60 && rand() < 0.35) {
        const c = neon(), y = top.maxY - 0.3, e = 0.18;
        strips.push({ x: (top.minX + top.maxX) / 2, y, z: top.minZ - e, sx: tw + 0.4, sy: 0.25, sz: 0.2, color: c });
        strips.push({ x: (top.minX + top.maxX) / 2, y, z: top.maxZ + e, sx: tw + 0.4, sy: 0.25, sz: 0.2, color: c });
        strips.push({ x: top.minX - e, y, z: (top.minZ + top.maxZ) / 2, sx: 0.2, sy: 0.25, sz: td + 0.4, color: c });
        strips.push({ x: top.maxX + e, y, z: (top.minZ + top.maxZ) / 2, sx: 0.2, sy: 0.25, sz: td + 0.4, color: c });
        if (t.style === 0 && rand() < 0.5) {
          for (const [cx, cz] of [[top.minX, top.minZ], [top.maxX, top.minZ], [top.minX, top.maxZ], [top.maxX, top.maxZ]]) {
            strips.push({ x: cx + Math.sign(cx - (top.minX + top.maxX) / 2) * e, y: (top.minY + top.maxY) / 2, z: cz + Math.sign(cz - (top.minZ + top.maxZ) / 2) * e, sx: 0.2, sy: top.maxY - top.minY, sz: 0.2, color: c });
          }
        }
      }
      // Rote Flugwarnlichter auf hohen Türmen
      if (h > 100) {
        for (const [cx, cz] of [[top.minX + 0.5, top.minZ + 0.5], [top.maxX - 0.5, top.maxZ - 0.5]]) beacons.push([cx, top.maxY + 0.5, cz]);
      }
    }
    for (const a of this.antennas) beacons.push([(a.minX + a.maxX) / 2, a.maxY + 0.4, (a.minZ + a.maxZ) / 2]);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const inst = (geo, mat, list, fill) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.count = list.length;
      list.forEach((it, i) => {
        fill(it);
        mesh.setMatrixAt(i, m.compose(p, q, s));
        if (it.color) mesh.setColorAt(i, it.color);
      });
      this.decor.add(mesh);
      return mesh;
    };
    const hdr = (v) => new THREE.Color(v, v, v);
    inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: this.glyphs.v, color: hdr(2.6) }), signs, (it) => {
      p.set(it.x, it.y, it.z); q.identity(); s.set(it.sx, it.sy, it.sz);
    });
    inst(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glyphs.h, color: hdr(2.2), side: THREE.DoubleSide }), boards, (it) => {
      p.set(it.x, it.y, it.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotY); s.set(it.w, it.h, 1);
    });
    inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: hdr(3.2) }), strips, (it) => {
      p.set(it.x, it.y, it.z); q.identity(); s.set(it.sx, it.sy, it.sz);
    });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), fog: false });
    inst(new THREE.SphereGeometry(0.5, 8, 6), this.beaconMat, beacons.map(([x, y, z]) => ({ x, y, z })), (it) => {
      p.set(it.x, it.y, it.z); q.identity(); s.set(1, 1, 1);
    });

    // Bäume: Stamm + Krone aus mehreren Kugeln, dazwischen rosa Kirschbäume
    const Y = new THREE.Vector3(0, 1, 0);
    const blob = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
    const crownGeo = mergeGeometries([blob(1.7, 0, 4.1, 0), blob(1.3, 1.0, 3.6, 0.5), blob(1.25, -0.9, 3.7, -0.5), blob(1.1, 0.2, 4.9, -0.3)]);
    const greens = ['#3f6b45', '#4d7a4a', '#5a7f3c', '#2f5a43', '#46704f'], pinks = ['#e8a0b8', '#f0b8c8', '#d890b0'];
    const treeFill = (t) => { p.set(t.x, 0, t.z); q.setFromAxisAngle(Y, t.x * 0.37 + t.z); s.setScalar(t.s); };
    const trunks = inst(new THREE.CylinderGeometry(0.16, 0.24, 3, 7).translate(0, 1.5, 0), toonMaterial('#4a3530', { rim: 0 }), this.trees, treeFill);
    const crowns = inst(crownGeo, toonMaterial('#ffffff', { rim: 0.25 }), this.trees.map((t) => ({ ...t, color: new THREE.Color(pick(t.sakura ? pinks : greens, rand)) })), treeFill);
    trunks.castShadow = crowns.castShadow = true;

    // Wassertanks auf Wohnhäusern (Tank, Dach, Stelzen)
    const legs = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z]) => new THREE.BoxGeometry(0.15, 3, 0.15).translate(x, 1.5, z));
    const towerGeo = mergeGeometries([new THREE.CylinderGeometry(1, 1, 2.6, 14).translate(0, 4.3, 0), new THREE.ConeGeometry(1.08, 0.9, 14).translate(0, 6.05, 0), ...legs]);
    const tanks = inst(towerGeo, toonMaterial('#6a5048', { rim: 0.2 }), this.waterTowers, (t) => { p.set(t.x, t.y, t.z); q.identity(); s.set(t.r, 1, t.r); });
    tanks.castShadow = true;

    // Straßenlaternen an bebauten Blöcken, Parks und Plätzen sowie entlang der Promenade
    const { N, B, P, origin } = this.layout;
    const spots = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (this.blockTypes[i * N + j] === BLOCK.EMPTY) continue;
        const bx = origin + i * P, bz = origin + j * P;
        for (const f of [0.22, 0.78]) {
          spots.push([bx + B * f, bz + 1.0, 0, -1], [bx + B * f, bz + B - 1.0, 0, 1], [bx + 1.0, bz + B * f, -1, 0], [bx + B - 1.0, bz + B * f, 1, 0]);
        }
      }
    }
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const r = this.coastR(Math.cos(a), Math.sin(a)) - 38.5;
      spots.push([Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
    }
    const lampFill = (off, y) => ([x, z, dx, dz]) => {
      q.setFromAxisAngle(Y, Math.atan2(dx, dz));
      p.set(x + dx * off, y, z + dz * off);
      s.set(1, 1, 1);
    };
    const lampMat = toonMaterial('#262230', { rim: 0 });
    const poles = inst(new THREE.BoxGeometry(0.16, 7, 0.16), lampMat, spots, lampFill(0, 3.5));
    inst(new THREE.BoxGeometry(0.12, 0.12, 1.6), lampMat, spots, lampFill(0.7, 6.95));
    inst(new THREE.BoxGeometry(0.5, 0.18, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.9, 0.8) }), spots, lampFill(1.4, 6.85));
    const pools = inst(
      new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(1.0, 0.45, 0.18), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      spots, lampFill(2.2, 0.03),
    );
    poles.castShadow = true;
    pools.renderOrder = 1;
  }

  updateDecor(time) {
    if (!this.beaconMat) return;
    const on = Math.sin(time * 2.6) > 0.55 ? 1 : 0.08;
    this.beaconMat.color.setRGB(6 * on, 0.3 * on, 0.2 * on);
  }

  // Dach in Zentrumsnähe mit passender Höhe – Startpunkt für den Spieler.
  findSpawn() {
    let best = null, bestScore = Infinity;
    for (const r of this.roofs) {
      if (r.maxY < 45 || r.maxY > 110) continue;
      if (r.maxX - r.minX < 10 || r.maxZ - r.minZ < 10) continue;
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      const score = Math.hypot(cx, cz);
      if (score < bestScore) { bestScore = score; best = r; }
    }
    if (!best) best = this.roofs[0];
    return new THREE.Vector3((best.minX + best.maxX) / 2, best.maxY, (best.minZ + best.maxZ) / 2);
  }
}

// ------------------------------------------------------------------ Fassaden-Shader
// Fenster werden prozedural aus aFac (Meter entlang der Fassade, Weltkoordinate Y) erzeugt.
// aInfo = (seed, style, Fassadenbreite, kind) mit kind 0 = Fassade, 1 = Dach, 2 = Aufbau.
const WINDOW_GLSL = /* glsl */ `
float bKind = vInfo.w;
float bStyle = vInfo.y;
float bSeed = floor(vInfo.x + 0.5); // gerundet: interpoliertes Rauschen würde den Hash zerstückeln
float bWin = 0.0;
float bLit = 0.0;
vec3 bLitCol = vec3(1.0, 0.6, 0.3);
if (bKind < 0.5) {
  vec2 wSize = vec2(2.4, 3.6);
  vec2 wRatio = vec2(0.6, 0.55);
  vec3 glass = vec3(0.03, 0.025, 0.05);
  float litChance = 0.2;
  if (bStyle < 0.5) { wSize = vec2(3.0, 3.8); wRatio = vec2(0.9, 0.74); glass = vec3(0.05, 0.06, 0.12); litChance = 0.12; }
  else if (bStyle > 1.5) { wSize = vec2(3.4, 3.2); wRatio = vec2(0.42, 0.5); glass = vec3(0.03, 0.02, 0.03); litChance = 0.28; }
  float cols = max(1.0, floor(vInfo.z / wSize.x + 0.5));
  vec2 cuv = vec2(vFac.x / (vInfo.z / cols), vFac.y / wSize.y);
  vec2 cid = floor(cuv);
  vec2 cf = fract(cuv);
  vec2 fw = max(fwidth(cuv), vec2(1e-4));
  vec2 m = (1.0 - wRatio) * 0.5;
  vec2 lo = smoothstep(m - fw, m + fw, cf);
  vec2 hi = 1.0 - smoothstep(1.0 - m - fw, 1.0 - m + fw, cf);
  float win = lo.x * hi.x * lo.y * hi.y;
  float detail = 1.0 - smoothstep(0.3, 0.8, max(fw.x, fw.y));
  float coverage = wRatio.x * wRatio.y;
  win = mix(coverage, win, detail);
  float r1 = hash12(cid + bSeed * 1.37);
  float r2 = hash12(cid.yx * 1.7 + bSeed * 0.71);
  float r3 = hash12(cid * 0.37 + bSeed * 2.1);
  if (r3 > 0.88) bLitCol = vec3(0.3, 0.8, 1.0);
  else if (r3 > 0.8) bLitCol = vec3(1.0, 0.3, 0.7);
  bWin = win;
  bLit = mix(coverage * litChance, win * step(1.0 - litChance, r1) * (0.6 + 0.6 * r2), detail);
  vec3 gcol = glass * (0.75 + 0.5 * r2);
  float ao = mix(0.45, 1.0, smoothstep(0.0, 40.0, vFac.y));
  diffuseColor.rgb = mix(diffuseColor.rgb * ao, gcol, win);
} else if (bKind < 1.5) {
  diffuseColor.rgb *= 0.5 + 0.12 * hash12(floor(vFac * 0.5));
}
`;

// Fenster leuchten (warm, vereinzelt Neon-Cyan/Pink) oder spiegeln den Abendhimmel.
const WINDOW_EMISSIVE_GLSL = /* glsl */ `
totalEmissiveRadiance += bLitCol * bLit * uLit;
{
  vec3 vdirV = normalize(vViewPosition);
  vec3 rw = transpose(mat3(viewMatrix)) * reflect(-vdirV, normal);
  float fres = pow(1.0 - max(dot(vdirV, normal), 0.0), 3.0);
  totalEmissiveRadiance += duskSky(rw) * bWin * (1.0 - min(1.0, bLit * 2.0)) * (0.1 + 0.6 * fres) * uReflect;
}
`;

function createBuildingMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap([0.4, 0.72, 1.0]) });
  const uLit = { value: 1.15 };
  const uReflect = { value: 1.0 };
  mat.userData.uLit = uLit;
  mat.userData.uReflect = uReflect;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = uLit;
    shader.uniforms.uReflect = uReflect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aFac;
attribute vec4 aInfo;
varying vec2 vFac;
varying vec4 vInfo;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFac = aFac;
vInfo = aInfo;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLit;
uniform float uReflect;
varying vec2 vFac;
varying vec4 vInfo;
${DUSK_GLSL}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${WINDOW_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${WINDOW_EMISSIVE_GLSL}`);
  };
  return mat;
}

// Leuchtschrift-Textur mit Fantasie-Schriftzeichen für Schilder und Werbetafeln.
function glyphTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#07040a';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'square';
  const cell = Math.min(w, h) * 0.62;
  const vertical = h > w;
  const count = Math.floor((vertical ? h : w) / (cell * 1.15));
  for (let i = 0; i < count; i++) {
    const cx = vertical ? w / 2 : (i + 0.5) * (w / count);
    const cy = vertical ? (i + 0.5) * (h / count) : h / 2;
    g.lineWidth = cell * 0.09;
    const strokes = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < strokes; k++) {
      const x0 = cx + (Math.random() - 0.5) * cell * 0.8, y0 = cy + (Math.random() - 0.5) * cell * 0.8;
      const horiz = Math.random() < 0.5;
      const len = cell * (0.3 + Math.random() * 0.5);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(horiz ? x0 + len : x0 + (Math.random() - 0.5) * cell * 0.3, horiz ? y0 + (Math.random() - 0.5) * cell * 0.2 : y0 + len);
      g.stroke();
    }
  }
  g.lineWidth = Math.min(w, h) * 0.04;
  g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// weicher Lichtkegel für die Laternen
function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
