import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { DUSK_GLSL } from './palette.js';
import { gradientMap } from './toon.js';

// Die Stadt besteht ausschließlich aus achsenparallelen Boxen (AABBs). Das hält Kollision und
// Raycasts einfach und exakt; Fenster werden komplett im Shader erzeugt.

const PALETTES = [
  ['#7a86a6', '#6b7898', '#8892b0', '#5f6a8c', '#909ab4'], // 0: Glas-Türme
  ['#a49aa8', '#928a9c', '#b2a8b0', '#837b8e', '#a8969a'], // 1: Büro / Beton
  ['#7e4c4a', '#8f5450', '#6c4244', '#9a6258', '#844e52'], // 2: Backstein
];
const PROP_COLOR = '#5e5866';
const NEON = ['#3ff0ff', '#ff3fd2', '#ffd23f', '#ff5a3f', '#8a5cff', '#3fff9a'];
const CELL = 24;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class City {
  constructor(seed) {
    this.material = createBuildingMaterial();
    this.mesh = null;
    this.decor = new THREE.Group();
    this.glyphs = { v: glyphTexture(128, 512), h: glyphTexture(512, 128) };
    this.stamp = 0;
    this.hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), box: null, ground: false };
    this.generate(seed);
  }

  generate(seed) {
    this.seed = seed;
    const rand = mulberry32(seed);
    const N = 14, B = 38, S = 15, P = B + S;
    const half = (N * P) / 2;
    this.layout = { N, B, S, P, half, origin: -half + S / 2 };
    this.boxes = [];
    this.roofs = [];
    this.towers = [];
    this.antennas = [];

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const bx = this.layout.origin + i * P;
        const bz = this.layout.origin + j * P;
        const d = Math.hypot(bx + B / 2, bz + B / 2) / half;
        if (rand() < 0.05) {
          this.addPlaza(bx, bz, B, rand);
          continue;
        }
        for (const lot of this.splitBlock(bx, bz, B, rand)) this.addTower(lot, d, rand);
      }
    }
    this.buildIndex();
    this.buildMesh();
    this.buildDecor(rand);
  }

  splitBlock(bx, bz, B, rand) {
    const inset = 2.5;
    const x0 = bx + inset, z0 = bz + inset, x1 = bx + B - inset, z1 = bz + B - inset;
    const gap = rand() < 0.5 ? 0 : 3 + rand() * 3;
    const xs = [x0, x1], zs = [z0, z1];
    if (rand() < 0.55) xs.splice(1, 0, x0 + (x1 - x0) * (0.35 + rand() * 0.3));
    if (rand() < 0.55) zs.splice(1, 0, z0 + (z1 - z0) * (0.35 + rand() * 0.3));
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

  addTower(lot, d, rand) {
    const w = lot.x1 - lot.x0, dep = lot.z1 - lot.z0;
    const center = 1 - smoothstep(0, 1.15, d);
    let h = (35 + 135 * center) * (0.55 + rand() * 0.8);
    if (rand() < 0.05 + 0.08 * center) h *= 1.4 + rand() * 0.4;
    h = Math.min(330, Math.max(18, h));

    const sr = rand();
    let style = sr < 0.4 ? 0 : sr < 0.8 ? 1 : 2;
    if (style === 2 && h > 120) style = 1;
    const pal = PALETTES[style];
    const color = new THREE.Color(pal[Math.floor(rand() * pal.length)]);
    color.offsetHSL(0, 0, (rand() - 0.5) * 0.06);
    const seed = Math.floor(rand() * 1000);

    const tiers = [];
    const form = rand();
    const minDim = Math.min(w, dep);
    if (form < 0.4 || minDim < 16) {
      tiers.push({ ...lot, y0: 0, y1: h });
    } else if (form < 0.75) {
      const h1 = Math.max(8, h * (0.18 + rand() * 0.17));
      const ins = 2.5 + rand() * (minDim * 0.22 - 2.5);
      tiers.push({ ...lot, y0: 0, y1: h1 });
      tiers.push({ x0: lot.x0 + ins, x1: lot.x1 - ins, z0: lot.z0 + ins, z1: lot.z1 - ins, y0: h1, y1: h });
    } else {
      const h1 = h * (0.3 + rand() * 0.15), h2 = h * (0.6 + rand() * 0.2);
      const ins1 = 2 + rand() * Math.max(0, minDim * 0.15 - 2);
      const ins2 = ins1 + 2 + rand() * Math.max(0, minDim * 0.15 - 2);
      tiers.push({ ...lot, y0: 0, y1: h1 });
      tiers.push({ x0: lot.x0 + ins1, x1: lot.x1 - ins1, z0: lot.z0 + ins1, z1: lot.z1 - ins1, y0: h1, y1: h2 });
      tiers.push({ x0: lot.x0 + ins2, x1: lot.x1 - ins2, z0: lot.z0 + ins2, z1: lot.z1 - ins2, y0: h2, y1: h });
    }

    let top = null;
    const parts = [];
    for (const t of tiers) parts.push((top = this.addBox(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, { style, color, seed, kind: 0 })));
    this.roofs.push(top);
    this.towers.push({ base: parts[0], top, h, style });

    // Dachaufbauten (Lüftung, Technik) – die Dachmitte bleibt frei, dort kann gespawnt werden.
    const tw = top.maxX - top.minX, td = top.maxZ - top.minZ;
    if (tw > 10 && td > 10) {
      const n = Math.floor(rand() * 5);
      const cx = (top.minX + top.maxX) / 2, cz = (top.minZ + top.maxZ) / 2;
      for (let k = 0; k < n; k++) {
        const pw = 2 + rand() * 3, pd = 2 + rand() * 3, ph = 1.5 + rand() * 2;
        const px = top.minX + 1.5 + rand() * (tw - 3 - pw);
        const pz = top.minZ + 1.5 + rand() * (td - 3 - pd);
        if (px < cx + 3 && px + pw > cx - 3 && pz < cz + 3 && pz + pd > cz - 3) continue;
        this.addBox(px, top.maxY, pz, px + pw, top.maxY + ph, pz + pd, { style: 3, color: new THREE.Color(PROP_COLOR), seed, kind: 2 });
      }
      if (h > 140 && rand() < 0.6) {
        const ah = 8 + rand() * 14;
        const ant = this.addBox(top.minX + 2, top.maxY, top.minZ + 2, top.minX + 2.7, top.maxY + ah, top.minZ + 2.7, { style: 3, color: new THREE.Color('#77707e'), seed, kind: 2 });
        this.antennas.push(ant);
      }
    }
  }

  addPlaza(bx, bz, B, rand) {
    const n = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const w = 6 + rand() * 8, d = 6 + rand() * 8, h = 4 + rand() * 5;
      const x = bx + 4 + rand() * (B - 8 - w), z = bz + 4 + rand() * (B - 8 - d);
      const top = this.addBox(x, 0, z, x + w, h, z + d, { style: 1, color: new THREE.Color('#a9a49a'), seed: Math.floor(rand() * 1000), kind: 0 });
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
    const nb = this.boxes.length;
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

    for (const b of this.boxes) {
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
    const pick = () => new THREE.Color(NEON[Math.floor(rand() * NEON.length)]);

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
          signs.push({ x, y: y + sh / 2, z, sx: alongX ? 0.35 : out, sy: sh, sz: alongX ? out : 0.35, color: pick() });
        }
      }
      // Werbetafeln auf Dächern
      const tw = top.maxX - top.minX, td = top.maxZ - top.minZ;
      if (h > 30 && h < 150 && tw > 12 && rand() < 0.25) {
        const bw = Math.min(tw - 2, 10 + rand() * 6), bh = 4 + rand() * 3;
        const side = rand() < 0.5 ? -1 : 1;
        boards.push({ x: (top.minX + top.maxX) / 2, y: top.maxY + 1 + bh / 2, z: side < 0 ? top.minZ + 0.6 : top.maxZ - 0.6, w: bw, h: bh, rotY: side < 0 ? Math.PI : 0, color: pick() });
      }
      // Leuchtkanten an Dachrändern hoher Türme
      if (h > 60 && rand() < 0.35) {
        const c = pick(), y = top.maxY - 0.3, e = 0.18;
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
