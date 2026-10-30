import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { DUSK_GLSL } from './palette.js';
import { gradientMap, toonMaterial } from './toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Terrain } from './terrain.js';
import { generateLayout, TRACK_Y } from './citygen.js';
import { buildGrinds } from './grind.js';
import { buildLandmarks, landmarkMeshes } from './landmarks.js';
import { pierMeshes } from './pier.js';
import { neonMeshes, placeNeonRings } from './neon.js';
import { stadiumMeshes } from './stadium.js';
import { FACADE_PARS, FACADE_COLOR } from './facade.js';
import { leafHook, barkHook } from './foliage.js';

const _rockG = new THREE.Vector2();

// Die Stadt besteht aus Boxen: achsenparallel im Raster, um die Hochachse gedreht an geschwungenen
// Straßen. Das hält Kollision und Raycasts einfach und exakt; Fenster entstehen komplett im Shader.
// Den Stadtplan (Straßen, Parks, Wohnviertel, Bahntrasse) erzeugt citygen.js.

// Fassadenfarben je Fensterstil (0 Glas, 1 Büro, 2 Wohnhaus) und Viertel
const GLASS = ['#7a86a6', '#6b7898', '#8892b0', '#5f6a8c', '#909ab4', '#6f8fa0'];
const OFFICE = ['#a49aa8', '#928a9c', '#b2a8b0', '#837b8e', '#a8969a'];
const BRICK = ['#7e4c4a', '#8f5450', '#6c4244', '#9a6258', '#844e52'];
const WARM = ['#b0624c', '#c9b08a', '#c98a92', '#8fb5a0', '#c9a052', '#9a6258', '#b9a0c0'];
const PASTEL = ['#d8a7a0', '#e0c79a', '#9fc3b5', '#c7a8d0', '#e8d4b0', '#a8c4d8', '#e0b0c0'];
const ROOF = ['#7a3b34', '#5d3a3a', '#3f4656', '#6b4a3a', '#4c5a5e', '#8a4a38', '#4a3a4e'];
const PROP_COLOR = '#5e5866';
const NEON = ['#3ff0ff', '#ff3fd2', '#ffd23f', '#ff5a3f', '#8a5cff', '#3fff9a'];
const CELL = 24;
const COAST_F = [1, 2, 3, 5, 7, 11];

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
      uCoastR0: { value: 400 }, uCoastA: { value: new Array(6).fill(0) }, uCoastP: { value: new Array(6).fill(0) },
      uLayout: { value: null }, uLayoutExt: { value: 560 },
      // Kanal: dort schneidet der Boden-Shader die Fläche aus (außer unter den Brücken)
      uCanal: { value: new THREE.Vector4(1e6, 1e6, -1e6, -1e6) }, uCanalBr: { value: new THREE.Vector4(1e6, 1e6, 1e6, 1e6) }, uCanalBrHalf: { value: 7.5 },
      // Felsinsel: Höhenkarte (rock.js) und ihre Lage (x, z, halbe Kantenlänge) – Schaum und Flachwasser im Meer
      tRock: { value: null }, uRock: { value: new THREE.Vector3(0, 0, 1) },
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
    const N = 22, B = 38, S = 15, P = B + S;
    const half = (N * P) / 2;
    this.layout = { N, B, S, P, half, origin: -half + S / 2 };
    const amps = [0.05, 0.075, 0.055, 0.035, 0.022, 0.012];
    this.island = { r0: 500, a: amps.map((a) => a * (0.75 + rand() * 0.5)), p: amps.map(() => rand() * Math.PI * 2) };
    this.boxes = [];
    this.seats = []; // Sitzplätze (Bänke, Hocker): { x, y, z, nx, nz, half, depth } – y = Sitzfläche, n = Blickrichtung
    this.roofs = [];
    this.towers = [];
    this.antennas = [];
    this.trees = [];
    this.waterTowers = [];
    this.houses = [];
    this.mega = null;
    this.site = null;
    this.lighthouse = null;
    this.holeTower = null;
    this.stadiumData = null;
    this.neonMat = null;
    this.terrain = new Terrain((x, z) => this.coastDist(x, z));

    generateLayout(this, rand);
    this.promenade(rand);
    buildLandmarks(this, rand); // Hafen, Leuchtturm-Insel (landmarks.js)
    this.placeFans();

    const mu = this.mapUniforms;
    mu.uCoastR0.value = this.island.r0;
    mu.uCoastA.value = [...this.island.a];
    mu.uCoastP.value = [...this.island.p];
    const cn = this.canal, cw = cn ? cn.hw + cn.wall : 0;
    if (cn) mu.uCanal.value.set(cn.x - cw, cn.z0 - cn.wall, cn.x + cw, cn.z1 + cn.wall);
    else mu.uCanal.value.set(1e6, 1e6, -1e6, -1e6);
    mu.uCanalBr.value.set(...[0, 1, 2, 3].map((k) => cn?.bridges[k] ?? 1e6));
    if (cn) mu.uCanalBrHalf.value = cn.half;

    for (const t of this.trees) {
      t.y = this.terrain.height(t.x, t.z);
      this.addBox(t.x - 0.25, t.y, t.z - 0.25, t.x + 0.25, t.y + 2.6 * t.s, t.z + 0.25, { noRender: true, noWallrun: true, kind: 2, style: 3, seed: 0, color: new THREE.Color('#000') });
    }
    this.buildIndex();
    placeNeonRings(this); // Neon-Grindringe um einige Häuserblöcke (braucht den Index)
    this.buildMesh();
    this.buildDecor(rand);
    // Grind-Linien (Viadukt, Kabel zwischen Dächern) – die Kabel gehören zur Deko
    const g = buildGrinds(this, rand);
    this.grinds = g.net;
    if (g.mesh) this.decor.add(g.mesh);
    this.decor.add(landmarkMeshes(this));
    this.decor.add(pierMeshes(this)); // Jahrmarkt auf dem Pier
    this.decor.add(neonMeshes(this)); // Neon-Röhre der Hochbahn, Rahmen am Turm mit Durchbruch
    this.decor.add(stadiumMeshes(this)); // Rasen, Laufbahn, Flutlicht, Anzeigetafel
  }

  // Bäume und Laternen entlang der Uferpromenade
  promenade(rand) {
    const n = 90;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.03;
      const r = this.coastR(Math.cos(a), Math.sin(a)) - 43;
      if (rand() < 0.75) this.trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.85 + rand() * 0.4, sakura: rand() < 0.2 });
    }
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const r = this.coastR(Math.cos(a), Math.sin(a)) - 38.5;
      this.lamps.push([Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
    }
  }

  // Gibt es hier schon etwas Festes (Gebäude, Haus, Kiosk)?
  solidNear(x, z, r) {
    const out = this.query(x - r, z - r, x + r, z + r, this._near ?? (this._near = []));
    for (const b of out) {
      if (b.noRender && !b.house) continue;
      if (b.rot) {
        const ox = x - b.rot.cx, oz = z - b.rot.cz;
        const lx = ox * b.rot.c + oz * b.rot.s, lz = -ox * b.rot.s + oz * b.rot.c;
        if (Math.abs(lx) < b.rot.hx + r && Math.abs(lz) < b.rot.hz + r) return true;
      } else if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
    }
    return false;
  }

  // Wohnhaus an geschwungener Straße oder Ringstraße: gedrehter Baukörper mit Satteldach (+ Schornstein)
  addHouse(r, rand) {
    const floors = r.zone === 'waterfront' ? 1 + (rand() < 0.55 ? 1 : 0) : 1 + Math.floor(rand() * 2.6);
    const h = floors * 3.2 + 0.5;
    const L = this.look(r.zone === 'waterfront' ? 'waterfront' : 'residential', rand);
    L.style = 2;
    this.addRotatedBox(r.cx, r.cz, r.hx, r.hz, r.a, 0, h, { ...L, noTop: true, house: true });
    const roofH = 2.0 + rand() * 1.8;
    const along = r.hx >= r.hz;
    this.addRotatedBox(r.cx, r.cz, r.hx * 0.82, r.hz * 0.82, r.a, h, h + roofH * 0.55, { noRender: true, noWallrun: true, style: 3, kind: 2, seed: 0, color: L.color });
    const house = { r, h, roofH, along, wall: L.color.clone(), roof: new THREE.Color(pick(ROOF, rand)).offsetHSL(0, 0, (rand() - 0.5) * 0.06) };
    if (rand() < 0.45) {
      // Schornstein seitlich der First, ragt aus der Dachfläche
      const c = Math.cos(r.a), s = Math.sin(r.a);
      const ha = along ? r.hx : r.hz, hb = (along ? r.hz : r.hx) + 0.4;
      const ua = (rand() < 0.5 ? -1 : 1) * ha * 0.55, vb = (rand() < 0.5 ? -1 : 1) * hb * 0.4;
      const lu = along ? ua : vb, lv = along ? vb : ua;
      const top = h + roofH * (1 - Math.abs(vb) / hb) + 0.9;
      this.addRotatedBox(r.cx + c * lu - s * lv, r.cz + s * lu + c * lv, 0.38, 0.38, r.a, h, top, { style: 3, kind: 2, seed: 0, color: new THREE.Color('#5a4a4c') });
    }
    this.houses.push(house);
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

  // Mega-Tower nahe der Inselmitte: Sockel über den ganzen Block, darüber ein Schaft mit fünf Rücksprüngen bis 432 m
  // (jede Stufe ein Dach zum Landen und Sitzen), oben eine Antenne bis 525 m. Dunkles Glas, Leuchtringe an den
  // Rücksprüngen (buildDecor) – von überall auf der Insel zu sehen und der höchste Ankerpunkt der Stadt.
  addMegaTower(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0;
    const glass = { style: 0, kind: 0, seed: 77, color: new THREE.Color('#5a7f9e') };
    const box = (hw, y0, y1, look = glass) => this.addBox(cx - hw, y0, cz - hw, cx + hw, y1, cz + hw, look);
    const base = box(W / 2, 0, 34, { ...glass, color: new THREE.Color('#4a5a6e') });
    this.roofs.push(base);
    const segs = [];
    for (const [hw, y0, y1] of [[15.5, 34, 150], [14, 150, 262], [12.5, 262, 352], [10.5, 352, 410], [8.5, 410, 432]]) {
      const s = box(hw, y0, y1);
      segs.push(s);
      this.roofs.push(s);
    }
    const top = segs[segs.length - 1];
    this.antennas.push(this.addBox(cx - 0.9, 432, cz - 0.9, cx + 0.9, 525, cz + 0.9, { style: 3, kind: 2, seed: 0, color: new THREE.Color('#8a8494') }));
    this.towers.push({ base, top, h: 432, style: 0, zone: 'downtown' });
    this.mega = { cx, cz, segs };
  }

  // Lüfter auf etwa jedem fünften Flachdach unter 40 m (die Dachmitte hält roofProps frei): das Gehäuse ist eine Box,
  // oben dreht der Ventilator (fans.js). Wer darauf landet oder läuft, fliegt hoch; im Gleitflug darüber trägt der
  // Aufwind (player.js). Raster für die schnelle Suche.
  placeFans() {
    this.fans = [];
    this.fanGrid = new Map();
    let k = 0;
    for (const r of this.roofs) {
      const cx = r.rot ? r.rot.cx : (r.minX + r.maxX) / 2, cz = r.rot ? r.rot.cz : (r.minZ + r.maxZ) / 2;
      const w = r.rot ? 2 * Math.min(r.rot.hx, r.rot.hz) : Math.min(r.maxX - r.minX, r.maxZ - r.minZ);
      if (r.maxY < 6 || r.maxY > 40 || w < 8) continue;
      if (k++ % 5 !== 2) continue; // nur jedes fünfte passende Dach
      const y = r.maxY + 1;
      this.addBox(cx - 1.5, r.maxY, cz - 1.5, cx + 1.5, y, cz + 1.5, { style: 3, kind: 2, seed: 0, color: new THREE.Color('#6e6a78'), fan: true });
      const f = { x: cx, z: cz, y, i: this.fans.length };
      this.fans.push(f);
      const key = (Math.floor(cx / 40) + 512) * 1024 + Math.floor(cz / 40) + 512;
      let cell = this.fanGrid.get(key);
      if (!cell) this.fanGrid.set(key, (cell = []));
      cell.push(f);
    }
  }

  // nächster Lüfter in waagrechtem Abstand r (oder null)
  fanNear(x, z, r) {
    let best = null, bd = r * r;
    const ix = Math.floor(x / 40), iz = Math.floor(z / 40);
    for (let a = ix - 1; a <= ix + 1; a++) {
      for (let b = iz - 1; b <= iz + 1; b++) {
        for (const f of this.fanGrid.get((a + 512) * 1024 + b + 512) ?? []) {
          const d = (f.x - x) ** 2 + (f.z - z) ** 2;
          if (d < bd) { bd = d; best = f; }
        }
      }
    }
    return best;
  }

  // Rohbau-Wolkenkratzer: fertiger Sockel, darüber Betondecken bis gut zwei Drittel der Höhe, oben nur noch das offene
  // Stahlskelett aus Stützen und Trägern (zum Durchschwingen; die Randträger der oberen Etagen sind Grind-Linien).
  // Zwei Turmdrehkräne stehen daneben am Boden – die Ausleger drehen sich (harbor.js: RoofCranes).
  addConstructionSite(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, H = 150, half = 15, podium = 14, slabTop = 100, lvl = 8;
    const steel = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#c0582e'), noWallrun: true };
    const concrete = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#9a949e') };
    this.roofs.push(this.addBox(cx - half - 2, 0, cz - half - 2, cx + half + 2, podium, cz + half + 2, { ...concrete, color: new THREE.Color('#7e7884') }));
    const cols = [-half, -half / 3, half / 3, half];
    for (const x of cols) for (const z of cols) this.addBox(cx + x - 0.45, podium, cz + z - 0.45, cx + x + 0.45, H, cz + z + 0.45, steel);
    const grind = [];
    for (let y = podium + lvl; y <= H; y += lvl) {
      if (y <= slabTop) this.roofs.push(this.addBox(cx - half - 0.4, y - 0.35, cz - half - 0.4, cx + half + 0.4, y, cz + half + 0.4, concrete));
      for (const z of cols) this.addBox(cx - half, y - 0.7, cz + z - 0.3, cx + half, y, cz + z + 0.3, steel);   // Träger in x
      for (const x of cols) this.addBox(cx + x - 0.3, y - 0.7, cz - half, cx + x + 0.3, y, cz + half, steel);   // Träger in z
      if (y > slabTop) {
        // äußere Randträger vor den Stützen – frei zum Grinden, eine Seite nach der anderen
        const e = half + 1;
        for (const s of [-1, 1]) {
          this.addBox(cx - e, y - 0.5, cz + s * e - 0.25, cx + e, y, cz + s * e + 0.25, steel);
          this.addBox(cx + s * e - 0.25, y - 0.5, cz - e, cx + s * e + 0.25, y, cz + e, steel);
          grind.push([{ x: cx - e, y, z: cz + s * e }, { x: cx + e, y, z: cz + s * e }]);
          grind.push([{ x: cx + s * e, y, z: cz - e }, { x: cx + s * e, y, z: cz + e }]);
        }
      }
    }
    // Kräne stehen am Boden in zwei gegenüberliegenden Blockecken, verschieden hoch (die Ausleger kreuzen sich nicht)
    const yellow = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#e0b81e'), noWallrun: true };
    const cranes = [[b.x0 + 2.2, b.z0 + 2.2, H + 26, 52, 0.6, 0.07], [b.x1 - 2.2, b.z1 - 2.2, H + 12, 44, 2.4, -0.09]];
    for (const [x, z, y] of cranes) this.addBox(x - 1.2, 0, z - 1.2, x + 1.2, y, z + 1.2, yellow);
    this.site = {
      cx, cz, top: H, grind,
      cranes: cranes.map(([x, z, y, reach, phase, omega]) => ({ x, z, y, reach, phase, omega })),
    };
  }

  // Turm mit Durchbruch: hoch oben ein gewaltiges Loch quer durch das ganze Gebäude zum Durchfliegen (Neon-Rahmen:
  // neon.js). Das Loch schaut zur Neon-Röhre der Hochbahn.
  addHoleTower(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, half = 16, wall = 6.5, y0 = 118, y1 = 168, H = 222; // Loch über der Mittelstadt (≤ 140 m)
    const T = this.neonTube, alongX = Math.abs(T.cx - cx) > Math.abs(T.cz - cz);
    const glass = { style: 0, kind: 0, seed: 141, color: new THREE.Color('#465a7a') };
    const dark = { ...glass, color: new THREE.Color('#3a4660') };
    const box = (x0, ya, z0, x1, yb, z1, look = glass) => this.addBox(cx + x0, ya, cz + z0, cx + x1, yb, cz + z1, look);
    const base = box(-half - 2, 0, -half - 2, half + 2, 18, half + 2, dark);
    this.roofs.push(base, box(-half, 18, -half, half, y0, half));
    // Lochgeschoss: nur die beiden Seitenwände (Lochachse x: Wände bei ±z, sonst bei ±x)
    for (const s of [-1, 1]) {
      const a0 = s > 0 ? half - wall : -half, a1 = s > 0 ? half : -half + wall;
      if (alongX) box(-half, y0, a0, half, y1, a1);
      else box(a0, y0, -half, a1, y1, half);
    }
    const top = box(-half, y1, -half, half, H, half), crown = box(-half + 5, H, -half + 5, half - 5, H + 14, half - 5, dark);
    this.roofs.push(top, crown);
    this.antennas.push(this.addBox(cx - 0.8, H + 14, cz - 0.8, cx + 0.8, H + 52, cz + 0.8, { style: 3, kind: 2, seed: 0, color: new THREE.Color('#8a8494') }));
    this.towers.push({ base, top: crown, h: H + 14, style: 0, zone: 'midtown' });
    this.holeTower = { cx, cz, half, wall, y0, y1, H, alongX };
  }

  // Stadion in einem Superblock ohne Innenstraßen: ovale Ränge in vier Stufen (Sitzfarben in Blöcken), an den
  // Stirnseiten Tore unter den oberen Rängen, Dachring auf Stützen (Innen- und Außenkante sind Grind-Linien), vier
  // Flutlichtmasten, eine Anzeigetafel. Rasen, Laufbahn, Linien und Lichter: stadium.js
  addStadium(sb) {
    const cx = (sb.X0 + sb.X1) / 2, cz = (sb.Z0 + sb.Z1) / 2, A = sb.W / 2 - 3, Bz = sb.W / 2 - 7, n = 44;
    const P = (th, s) => ({ x: cx + Math.cos(th) * A * s, z: cz + Math.sin(th) * Bz * s });
    const look = (hex, extra = {}) => ({ style: 3, kind: 2, seed: 0, color: new THREE.Color(hex), ...extra });
    const SEATS = ['#c8352b', '#f4f0ea', '#2f6fb0', '#f4f0ea'];
    // Ringstück zwischen den Maßstäben s0..s1 (vom Mittelpunkt aus) im Abschnitt k, Höhe y0..y1
    const ringBox = (k, s0, s1, y0, y1, info) => {
      const ta = (k / n) * Math.PI * 2, tb = ((k + 1) / n) * Math.PI * 2, tm = (ta + tb) / 2, sm = (s0 + s1) / 2;
      const a = P(ta, sm), b = P(tb, sm), c = P(tm, sm), r = Math.hypot(c.x - cx, c.z - cz) / sm;
      return this.addRotatedBox(c.x, c.z, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.5, ((s1 - s0) * r) / 2, Math.atan2(b.z - a.z, b.x - a.x), y0, y1, info);
    };
    for (let k = 0; k < n; k++) {
      const tm = ((k + 0.5) / n) * Math.PI * 2, gate = Math.abs(Math.sin(tm)) < Math.sin(Math.PI / n) * 1.2; // Tore an den Stirnseiten
      const seat = look(SEATS[Math.floor(k / 4) % SEATS.length]);
      for (let t = 0; t < 4; t++) {
        const y1 = 1.6 + t * 3.2;
        if (gate && y1 < 5.5) continue;
        ringBox(k, 0.66 + t * 0.085, 1.0, gate ? 5 : 0, y1, seat);
      }
      ringBox(k, 0.965, 1.0, gate ? 5 : 0, 15, look('#8a8494'));                                   // Rückwand
      ringBox(k, 0.86, 1.06, 19.5, 20.3, look('#f4f0ea', { noWallrun: true }));                   // Dachring
      if (k % 2 === 0 && Math.abs(Math.cos(tm)) > 0.2) { const p = P(tm, 0.982); this.addBox(p.x - 0.45, 15, p.z - 0.45, p.x + 0.45, 19.5, p.z + 0.45, look("#d8d4ce")); }
    }
    // Grind-Linien an der Innen- und Außenkante des Dachs
    const ring = (s) => { const pts = []; for (let k = 0; k < n * 2; k++) { const p = P((k / (n * 2)) * Math.PI * 2, s); pts.push({ x: p.x, y: 20.3, z: p.z }); } return pts; };
    // Flutlichtmasten in den Ecken, Anzeigetafel auf der Längsseite
    const masts = [[sb.X0 + 4, sb.Z0 + 4], [sb.X1 - 4, sb.Z0 + 4], [sb.X0 + 4, sb.Z1 - 4], [sb.X1 - 4, sb.Z1 - 4]];
    for (const [x, z] of masts) {
      this.addBox(x - 0.7, 0, z - 0.7, x + 0.7, 44, z + 0.7, look('#9a949e'));
      this.addBox(x - 3.5, 44, z - 3.5, x + 3.5, 47.5, z + 3.5, look('#2a2630', { noWallrun: true }));
    }
    const sc = P(Math.PI / 2, 1.0);
    this.addBox(sc.x - 8, 15, sc.z - 0.6, sc.x + 8, 19.4, sc.z + 0.6, look('#1a1820'));
    this.stadiumData = { cx, cz, A, Bz, n, masts, board: { x: sc.x, z: sc.z }, rings: [ring(0.86), ring(1.06)] };
  }

  // Kanal durch die Innenstadt (Lage: citygen.js): Kaimauern beiderseits und an den Enden, dunkles Bett, flache Brücken
  // knapp unter der Straßenoberfläche (die Fahrbahn zeichnet das Bodennetz darüber), niedrige Geländer an den
  // Brückenrändern und an den Kanalenden. Wasser: world.js
  addCanal(c) {
    const stone = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#8a8490') };
    const bridge = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#7a7480') };
    const rail = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#2a2630'), noWallrun: true };
    const w = c.hw + c.wall;
    for (const s of [-1, 1]) this.addBox(c.x + (s < 0 ? -w : c.hw), c.bottom, c.z0 - c.wall, c.x + (s < 0 ? -c.hw : w), 0.05, c.z1 + c.wall, stone);
    this.addBox(c.x - c.hw, c.bottom, c.z0 - c.wall, c.x + c.hw, 0.05, c.z0, stone);
    this.addBox(c.x - c.hw, c.bottom, c.z1, c.x + c.hw, 0.05, c.z1 + c.wall, stone);
    this.addBox(c.x - w, c.bottom - 0.4, c.z0 - c.wall, c.x + w, c.bottom, c.z1 + c.wall, { ...stone, color: new THREE.Color('#2e343c') });
    for (const zb of c.bridges) {
      this.addBox(c.x - w, -0.6, zb - c.half, c.x + w, -0.02, zb + c.half, bridge);
      for (const s of [-1, 1]) this.addBox(c.x - w, -0.02, zb + s * c.half - (s > 0 ? 0.25 : 0), c.x + w, 1.0, zb + s * c.half + (s < 0 ? 0.25 : 0), rail);
    }
    this.addBox(c.x - w, 0.05, c.z0 - c.wall - 0.25, c.x + w, 1.0, c.z0 - c.wall, rail);
    this.addBox(c.x - w, 0.05, c.z1 + c.wall, c.x + w, 1.0, c.z1 + c.wall + 0.25, rail);
  }

  // Neon-Röhre: ein langes Glasgebäude umschließt die Hochbahn auf ihrem Viadukt – Wände, seitliche Laufstege, Dach
  // (begehbar, die Kanten sind Grind-Linien) und Portalrahmen an beiden Enden; innen und außen leuchten Neonbögen und
  // -streifen (neon.js). Am Boden braucht sie keinen Platz, sie ruht auf dem Viadukt.
  addNeonTube(T) {
    const tr = this.track, a = {}, b = {}, seg = 6, Y = TRACK_Y, { hw, h } = T;
    const glass = { style: 0, kind: 0, seed: 99, color: new THREE.Color('#34345a') };
    const frame = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#2a2838') };
    for (let s = T.s0; s < T.s1 - 1e-6; s += seg) {
      tr.at(s, a);
      tr.at(s + seg, b);
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, ang = Math.atan2(b.z - a.z, b.x - a.x);
      const half = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.3, nx = -Math.sin(ang), nz = Math.cos(ang);
      for (const side of [-1, 1]) {
        this.addRotatedBox(cx + nx * side * (hw + 0.3), cz + nz * side * (hw + 0.3), half, 0.3, ang, Y - 1.3, Y + h, glass);
        this.addRotatedBox(cx + nx * side * (hw + 3.2) / 2, cz + nz * side * (hw + 3.2) / 2, half, (hw - 3.2) / 2, ang, Y - 1.3, Y, frame);
      }
      this.addRotatedBox(cx, cz, half, hw + 0.7, ang, Y + h, Y + h + 0.7, frame);
    }
    T.edges = [[], []];
    for (let s = T.s0; s <= T.s1 + 1e-6; s += 3) {
      tr.at(s, a);
      [-1, 1].forEach((side, k) => T.edges[k].push({ x: a.x - a.tz * side * (hw + 0.7), y: Y + h + 0.7, z: a.z + a.tx * side * (hw + 0.7) }));
    }
    for (const s of [T.s0, T.s1]) {
      tr.at(s, a);
      const ang = Math.atan2(a.tz, a.tx), nx = -a.tz, nz = a.tx;
      for (const side of [-1, 1]) this.addRotatedBox(a.x + nx * side * (hw + 0.6), a.z + nz * side * (hw + 0.6), 0.6, 0.7, ang, Y - 2.5, Y + h + 1.2, frame);
      this.addRotatedBox(a.x, a.z, 0.6, hw + 1.3, ang, Y + h, Y + h + 1.2, frame);
    }
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

  // Bodenhöhe für die Physik: Gelände, im Wasser steht man knietief auf dem Grund (waten)
  groundY(x, z) {
    const h = this.terrain.height(x, z);
    const w = this.terrain.waterLevel(x, z);
    return w > h ? Math.max(h, w - 0.55) : h;
  }

  // Wassertiefe an den Füßen (0 = trocken)
  waterDepth(x, z, feetY) {
    const w = this.terrain.waterLevel(x, z);
    return w > feetY ? w - feetY : 0;
  }

  // Gedrehte Box (Häuser an geschwungenen Straßen, Viaduktsegmente). Achse x der Box zeigt in
  // Richtung (cos a, sin a); die umschließende AABB dient dem Raster-Index und der Grobprüfung.
  addRotatedBox(cx, cz, hx, hz, a, y0, y1, info) {
    const c = Math.cos(a), s = Math.sin(a);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const b = this.addBox(cx - ex, y0, cz - ez, cx + ex, y1, cz + ez, info);
    b.rot = { cx, cz, c, s, hx, hz };
    return b;
  }

  // Strahl gegen alle Gebäude (oder eine Vorauswahl davon) und optional den Boden. Gibt ein wiederverwendetes
  // Ergebnisobjekt zurück.
  raycast(origin, dir, maxDist, includeGround = false, boxes = this.boxes) {
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = Math.abs(dir.x) < 1e-9 ? 1e-9 : dir.x;
    const dy = Math.abs(dir.y) < 1e-9 ? 1e-9 : dir.y;
    const dz = Math.abs(dir.z) < 1e-9 ? 1e-9 : dir.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let best = maxDist, bestBox = null, bestAxis = -1, bestN = null;
    for (const b of boxes) {
      if (b.rot) {
        const t = this.rayRotated(b, ox, oy, oz, dx, dy, dz, best);
        if (t !== null) { best = t; bestBox = b; bestAxis = 3; bestN = this._rn; }
        continue;
      }
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
    let ground = false, rock = false;
    if (includeGround && dy < 0) {
      const tg = this.rayGround(ox, oy, oz, dx, dy, dz, best);
      if (tg !== null) { best = tg; bestBox = null; ground = true; }
    }
    // Felsinsel: fest wie ein Gebäude, Normale aus dem Höhenfeld
    const R = this.terrain.rock, tr = R ? R.ray(ox, oy, oz, dx, dy, dz, best) : null;
    if (tr !== null) {
      best = tr;
      bestBox = null;
      ground = false;
      rock = true;
      R.gradient(ox + dx * tr, oz + dz * tr, _rockG);
      (this._rn ??= new THREE.Vector3()).set(-_rockG.x, 1, -_rockG.y).normalize();
      bestN = this._rn;
    }
    if (!bestBox && !ground && !rock) return null;
    const h = this.hit;
    h.dist = best; h.box = bestBox; h.ground = ground;
    h.point.set(ox + dir.x * best, oy + dir.y * best, oz + dir.z * best);
    if (ground) h.normal.set(0, 1, 0);
    else if (rock || bestAxis === 3) h.normal.copy(bestN);
    else h.normal.set(bestAxis === 0 ? -Math.sign(dx) : 0, bestAxis === 1 ? -Math.sign(dy) : 0, bestAxis === 2 ? -Math.sign(dz) : 0);
    return h;
  }

  // Strahl gegen eine gedrehte Box: im lokalen System der Box als Slab-Test
  rayRotated(b, ox, oy, oz, dx, dy, dz, best) {
    const r = b.rot;
    const px = ox - r.cx, pz = oz - r.cz;
    const lx = px * r.c + pz * r.s, lz = -px * r.s + pz * r.c;
    let ldx = dx * r.c + dz * r.s, ldz = -dx * r.s + dz * r.c;
    if (Math.abs(ldx) < 1e-9) ldx = 1e-9;
    if (Math.abs(ldz) < 1e-9) ldz = 1e-9;
    let t1 = (-r.hx - lx) / ldx, t2 = (r.hx - lx) / ldx;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
    t1 = (b.minY - oy) / dy; t2 = (b.maxY - oy) / dy;
    let lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; axis = 1; }
    if (hi < tmax) tmax = hi;
    if (tmax < tmin) return null;
    t1 = (-r.hz - lz) / ldz; t2 = (r.hz - lz) / ldz;
    lo = Math.min(t1, t2); hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; axis = 2; }
    if (hi < tmax) tmax = hi;
    if (tmax < tmin || tmin < 0 || tmin >= best) return null;
    const n = (this._rn ??= new THREE.Vector3());
    if (axis === 1) n.set(0, -Math.sign(dy), 0);
    else if (axis === 0) { const s = -Math.sign(ldx); n.set(r.c * s, 0, r.s * s); }
    else { const s = -Math.sign(ldz); n.set(-r.s * s, 0, r.c * s); }
    return tmin;
  }

  // Strahl gegen das Gelände: grob abtasten, dann per Bisektion verfeinern
  rayGround(ox, oy, oz, dx, dy, dz, maxT) {
    const f = (t) => oy + dy * t - this.groundY(ox + dx * t, oz + dz * t);
    if (f(0) <= 0) return 0;
    const flat = -oy / dy; // Schnitt mit y = 0 als Startschätzung (Stadt ist flach)
    const end = Math.min(maxT, Math.max(flat * 1.6, flat + 40, 60));
    let t0 = 0;
    for (let i = 1; i <= 24; i++) {
      const t1 = (end * i) / 24;
      if (f(t1) <= 0) return this._refine(f, t0, t1);
      t0 = t1;
    }
    return null;
  }

  _refine(f, a, b) {
    for (let k = 0; k < 14; k++) {
      const m = (a + b) / 2;
      if (f(m) > 0) a = m; else b = m;
    }
    return b;
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
      const side = b.kind === 2 ? 2 : 0;
      const roof = b.kind === 2 ? 2 : 1;
      if (b.rot) {
        // gedrehte Box: vier Seiten mit gedrehten Normalen, Fassadenkoordinaten wie bei achsenparallelen
        const { cx, cz, c, s, hx, hz } = b.rot;
        for (const [lx, lz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = lx * c - lz * s, nz = lx * s + lz * c;
          const hn = lx ? hx : hz, ht = lx ? hz : hx;
          const tx = nz, tz = -nx; // cross(up, n)
          const mx = cx + nx * hn, mz = cz + nz * hn;
          const ax = mx - tx * ht, az = mz - tz * ht, bx2 = mx + tx * ht, bz2 = mz + tz * ht;
          quad([ax, y0, az, bx2, y0, bz2, bx2, y1, bz2, ax, y1, az], nx, 0, nz, [0, y0, ht * 2, y0, ht * 2, y1, 0, y1], b, ht * 2, side);
        }
        if (!b.noTop) {
          const P = [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]].map(([u, w]) => [cx + c * u - s * w, cz + s * u + c * w]);
          quad([P[0][0], y1, P[0][1], P[1][0], y1, P[1][1], P[2][0], y1, P[2][1], P[3][0], y1, P[3][1]], 0, 1, 0,
            [P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]], b, hx * 2, roof);
        }
        continue;
      }
      const wx = x1 - x0, wz = z1 - z0;
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
    this.decor.traverse((o) => o.geometry?.dispose());
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
    // Neon auf Straßenhöhe in der Innenstadt: senkrechte Schilder und Ladenschilder über dem Erdgeschoss, darunter fällt
    // farbiges Licht auf den Boden – nachts und bei Regen spiegelt sich das alles in den nassen Straßen
    const rs = mulberry32(this.seed + 77), spill = [];
    // das Licht fällt nur auf festen Boden (nicht über dem offenen Kanal)
    const shop = (x, z, nx, nz) => spill.push({ x: x + nx * 3.2, z: z + nz * 3.2 });
    for (const t of this.towers) {
      const b = t.base;
      if (b.rot || b.maxY < 12 || Math.hypot((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) > 340) continue;
      for (let face = 0; face < 4; face++) {
        const alongX = face < 2, span = alongX ? b.maxX - b.minX : b.maxZ - b.minZ, nx = face === 2 ? -1 : face === 3 ? 1 : 0, nz = face === 0 ? -1 : face === 1 ? 1 : 0;
        const at = (u, out) => [face === 2 ? b.minX - out : face === 3 ? b.maxX + out : b.minX + u, face === 0 ? b.minZ - out : face === 1 ? b.maxZ + out : b.minZ + u];
        if (rs() < 0.5 && span > 7) {
          const sh = 4 + rs() * 7.5, out = 0.9 + rs() * 0.9, y = 4.6 + rs() * Math.min(9, b.maxY - sh - 5), u = 1.5 + rs() * (span - 3), [x, z] = at(u, out / 2);
          signs.push({ x, y: y + sh / 2, z, sx: alongX ? 0.3 : out, sy: sh, sz: alongX ? out : 0.3, color: neon2(rs) });
          shop(x, z, nx, nz);
          spill[spill.length - 1].color = signs[signs.length - 1].color;
        }
        if (rs() < 0.55 && span > 9) {
          const w = 5 + rs() * Math.min(9, span - 6), h = 1.3 + rs() * 0.8, u = w / 2 + 0.5 + rs() * (span - w - 1), [x, z] = at(u, 0.14);
          const rotY = face === 0 ? Math.PI : face === 1 ? 0 : face === 2 ? -Math.PI / 2 : Math.PI / 2;
          boards.push({ x, y: 4.6 + h / 2, z, w, h, rotY, color: neon2(rs) });
          shop(x, z, nx, nz);
          spill[spill.length - 1].color = boards[boards.length - 1].color;
        }
      }
    }
    // Mega-Tower: Leuchtring an jedem Rücksprung, die obersten Stufen mit leuchtenden Kanten
    if (this.mega) {
      const c = new THREE.Color('#3cf2ff'), e = 0.2;
      this.mega.segs.forEach((top, k) => {
        const tw = top.maxX - top.minX, y = top.maxY - 0.4, mx = (top.minX + top.maxX) / 2, mz = (top.minZ + top.maxZ) / 2;
        strips.push({ x: mx, y, z: top.minZ - e, sx: tw + 0.4, sy: 0.5, sz: 0.25, color: c });
        strips.push({ x: mx, y, z: top.maxZ + e, sx: tw + 0.4, sy: 0.5, sz: 0.25, color: c });
        strips.push({ x: top.minX - e, y, z: mz, sx: 0.25, sy: 0.5, sz: tw + 0.4, color: c });
        strips.push({ x: top.maxX + e, y, z: mz, sx: 0.25, sy: 0.5, sz: tw + 0.4, color: c });
        if (k >= 3) {
          for (const [x, z] of [[top.minX, top.minZ], [top.maxX, top.minZ], [top.minX, top.maxZ], [top.maxX, top.maxZ]]) {
            strips.push({ x: x + Math.sign(x - mx) * e, y: (top.minY + top.maxY) / 2, z: z + Math.sign(z - mz) * e, sx: 0.25, sy: top.maxY - top.minY, sz: 0.25, color: c });
          }
        }
      });
    }

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
    // Leuchtreklame: [Material, Grundhelligkeit] – tagsüber gedimmt (setDaylight)
    this.neon = [
      [new THREE.MeshBasicMaterial({ map: this.glyphs.v, color: hdr(2.6) }), 2.6],
      [new THREE.MeshBasicMaterial({ map: this.glyphs.h, color: hdr(2.2), side: THREE.DoubleSide }), 2.2],
      [new THREE.MeshBasicMaterial({ color: hdr(3.2) }), 3.2],
    ];
    inst(new THREE.BoxGeometry(1, 1, 1), this.neon[0][0], signs, (it) => {
      p.set(it.x, it.y, it.z); q.identity(); s.set(it.sx, it.sy, it.sz);
    });
    inst(new THREE.PlaneGeometry(1, 1), this.neon[1][0], boards, (it) => {
      p.set(it.x, it.y, it.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotY); s.set(it.w, it.h, 1);
    });
    inst(new THREE.BoxGeometry(1, 1, 1), this.neon[2][0], strips, (it) => {
      p.set(it.x, it.y, it.z); q.identity(); s.set(it.sx, it.sy, it.sz);
    });
    this.neonPools = inst(
      new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
      spill.filter((it) => !this.terrain.inCanal(it.x, it.z, 7)), (it) => { p.set(it.x, 0.04, it.z); q.identity(); s.set(1, 1, 1); },
    );
    this.neonPools.renderOrder = 1;
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), fog: false });
    inst(new THREE.SphereGeometry(0.5, 8, 6), this.beaconMat, beacons.map(([x, y, z]) => ({ x, y, z })), (it) => {
      p.set(it.x, it.y, it.z); q.identity(); s.set(1, 1, 1);
    });

    // Bäume: Stamm + Krone aus mehreren Kugeln, dazwischen rosa Kirschbäume
    const Y = new THREE.Vector3(0, 1, 0);
    const blob = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
    const crownGeo = mergeGeometries([blob(1.7, 0, 4.1, 0), blob(1.3, 1.0, 3.6, 0.5), blob(1.25, -0.9, 3.7, -0.5), blob(1.1, 0.2, 4.9, -0.3)]);
    const greens = ['#3f6b45', '#4d7a4a', '#5a7f3c', '#2f5a43', '#46704f'], pinks = ['#e8a0b8', '#f0b8c8', '#d890b0'];
    const treeFill = (t) => { p.set(t.x, t.y ?? 0, t.z); q.setFromAxisAngle(Y, t.x * 0.37 + t.z); s.setScalar(t.s); };
    const trunks = inst(new THREE.CylinderGeometry(0.16, 0.24, 3, 7).translate(0, 1.5, 0), toonMaterial('#4a3530', { rim: 0, pbr: { roughness: 0.95, hook: barkHook, key: 'bark' } }), this.trees, treeFill);
    const crowns = inst(crownGeo, toonMaterial('#ffffff', { rim: 0.25, pbr: { roughness: 0.85, physical: true, sheen: 0.5, sheenRoughness: 0.7, sheenColor: '#c8e0a0', hook: leafHook, key: 'leaf', a2c: true } }), this.trees.map((t) => ({ ...t, color: new THREE.Color(pick(t.sakura ? pinks : greens, rand)) })), treeFill);
    trunks.castShadow = crowns.castShadow = true;

    // Wassertanks auf Wohnhäusern (Tank, Dach, Stelzen)
    const legs = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z]) => new THREE.BoxGeometry(0.15, 3, 0.15).translate(x, 1.5, z));
    const towerGeo = mergeGeometries([new THREE.CylinderGeometry(1, 1, 2.6, 14).translate(0, 4.3, 0), new THREE.ConeGeometry(1.08, 0.9, 14).translate(0, 6.05, 0), ...legs]);
    const tanks = inst(towerGeo, toonMaterial('#6a5048', { rim: 0.2 }), this.waterTowers, (t) => { p.set(t.x, t.y, t.z); q.identity(); s.set(t.r, 1, t.r); });
    tanks.castShadow = true;

    // Dächer der Wohnhäuser: Satteldach mit Überstand, Giebel in Wandfarbe
    this.decor.add(this.buildRoofs());

    // Straßenlaternen entlang aller Straßen, der Parkwege und der Promenade: [x, y, z, Richtung zur Straße]
    const spots = this.lamps;
    const lampFill = (off, y) => ([x, y0, z, dx, dz]) => {
      q.setFromAxisAngle(Y, Math.atan2(dx, dz));
      p.set(x + dx * off, y0 + y, z + dz * off);
      s.set(1, 1, 1);
    };
    const lampMat = toonMaterial('#262230', { rim: 0, pbr: { roughness: 0.45, metalness: 0.7 } });
    const poles = inst(new THREE.BoxGeometry(0.16, 7, 0.16), lampMat, spots, lampFill(0, 3.5));
    inst(new THREE.BoxGeometry(0.12, 0.12, 1.6), lampMat, spots, lampFill(0.7, 6.95));
    this.lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.9, 0.8) });
    inst(new THREE.BoxGeometry(0.5, 0.18, 0.7), this.lampHead, spots, lampFill(1.4, 6.85));
    const pools = (this.lampPools = inst(
      new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture(), color: new THREE.Color(1.0, 0.45, 0.18), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      spots, lampFill(2.2, 0.03),
    ));
    poles.castShadow = true;
    pools.renderOrder = 1;
  }

  buildRoofs() {
    const pos = [], col = [];
    const tri = (a, b, c, color) => {
      pos.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
    };
    const shade = new THREE.Color();
    for (const H of this.houses) {
      const { cx, cz, hx, hz, a } = H.r;
      const c = Math.cos(a), s = Math.sin(a);
      // lokales System mit First entlang u
      const ha = H.along ? hx : hz, hb = H.along ? hz : hx;
      const A = ha + 0.35, Bw = hb + 0.45, y0 = H.h - 0.12, y1 = H.h + H.roofH;
      const w = (u, v, y) => {
        const lu = H.along ? u : v, lv = H.along ? v : -u;
        return [cx + c * lu - s * lv, y, cz + s * lu + c * lv];
      };
      const e = [w(-A, -Bw, y0), w(A, -Bw, y0), w(A, Bw, y0), w(-A, Bw, y0)];
      const rA = w(-A, 0, y1), rB = w(A, 0, y1);
      shade.copy(H.roof);
      tri(e[3], e[2], rB, shade); tri(e[3], rB, rA, shade);
      shade.copy(H.roof).multiplyScalar(0.82);
      tri(e[1], e[0], rA, shade); tri(e[1], rA, rB, shade);
      // Giebel (Wandfarbe) bündig mit der Fassade
      const g0 = [w(-ha, -hb, H.h - 0.15), w(-ha, hb, H.h - 0.15), w(-ha, 0, y1 - (H.roofH * 0.35) / Bw)];
      const g1 = [w(ha, hb, H.h - 0.15), w(ha, -hb, H.h - 0.15), w(ha, 0, y1 - (H.roofH * 0.35) / Bw)];
      tri(g0[0], g0[1], g0[2], H.wall);
      tri(g1[0], g1[1], g1[2], H.wall);
      // Unterseite des Überstands
      shade.copy(H.roof).multiplyScalar(0.45);
      tri(e[0], e[1], e[2], shade); tri(e[0], e[2], e[3], shade);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, toonMaterial('#ffffff', { vertexColors: true, rim: 0.15 }));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  updateDecor(time) {
    if (this.lighthouse) this.lighthouse.beam.rotation.y = time * 0.8; // Lichtkegel des Leuchtturms kreist
    if (this.neonMat) { const k = 2.1 + 0.45 * Math.sin(time * 1.7); this.neonMat.color.setRGB(k, k, k); } // Neon pulsiert sanft
    if (!this.beaconMat) return;
    const on = Math.sin(time * 2.6) > 0.55 ? 1 : 0.08;
    this.beaconMat.color.setRGB(6 * on, 0.3 * on, 0.2 * on);
  }

  // Tageslicht und Wetter (environment.js): Fensterlicht, Himmelsspiegelung, Laternen (tagsüber aus, dunkles Glas),
  // gedimmte Leuchtreklame, nasse Dächer
  setDaylight({ lit, reflect, lamps, neon, wet = 0, night = 0, real = false }) {
    this.material.userData.uLit.value = lit;
    this.material.userData.uReflect.value = reflect;
    this.material.userData.uWet.value = wet;
    if (this.lighthouse) { // der Leuchtturm brennt nur nachts (ab Sonnenuntergang), tagsüber ist er ganz aus
      this.lighthouse.beam.visible = night > 0.01;
      this.lighthouse.beamMat.uniforms.uOpacity.value = (real ? 0.3 : 0.75) * night;
      this.lighthouse.lampMat.color.setRGB(0.25 + 2.75 * night, 0.25 + 2.35 * night, 0.28 + 1.32 * night);
    }
    if (!this.lampHead) return;
    this.lampHead.color.setRGB(4.0 * lamps + 0.1 * (1 - lamps), 1.9 * lamps + 0.1 * (1 - lamps), 0.8 * lamps + 0.12 * (1 - lamps));
    // Hyper-Realistic-Mode: nur ein Hauch – die Augenadaption hellt die Nacht ohnehin auf, nasser Asphalt spiegelt statt zu streuen
    this.lampPools.material.opacity = (real ? 0.13 * (1 - 0.5 * wet) : 0.55) * lamps;
    this.lampPools.visible = lamps > 0.01;
    this.neonPools.material.opacity = (real ? 0.075 * (1 - 0.35 * wet) : 0.2) * neon * night;
    this.neonPools.visible = neon * night > 0.01;
    for (const [m, v] of this.neon) m.color.setScalar(v * neon);
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
  diffuseColor.rgb *= (0.5 + 0.12 * hash12(floor(vFac * 0.5))) * (1.0 - 0.4 * uWet);
}
`;

// Fenster leuchten (warm, vereinzelt Neon-Cyan/Pink) oder spiegeln den Himmel: dunkles Glas, aber kein Spiegel – die
// Glastürme (Stil 0) etwas stärker, dazu ein Sonnenglanz auf den Scheiben. Bei Regen glänzen die Dächer nass.
const WINDOW_EMISSIVE_GLSL = /* glsl */ `
totalEmissiveRadiance += bLitCol * bLit * uLit;
{
  vec3 vdirV = normalize(vViewPosition);
  vec3 rw = transpose(mat3(viewMatrix)) * reflect(-vdirV, normal);
  float fres = pow(clamp(1.0 - dot(vdirV, normal), 0.0, 1.0), 3.0); // geklemmt: pow einer negativen Basis = NaN
  // nur ein Fenster, dessen Licht gerade wirklich brennt, spiegelt nicht – tagsüber spiegeln alle
  float glass = bWin * (1.0 - min(1.0, bLit * uLit * 1.8)) * (bStyle < 0.5 ? 1.35 : 1.0) * uReflect;
  totalEmissiveRadiance += duskSky(rw) * glass * (0.22 + 0.65 * fres);
  totalEmissiveRadiance += DUSK_SUN * pow(max(dot(rw, DUSK_SUN_DIR), 0.0), 160.0) * 2.2 * uSunUp * glass;
  if (bKind > 0.5 && bKind < 1.5) totalEmissiveRadiance += duskSky(rw) * uWet * (0.14 + 0.6 * fres);
}
`;

function createBuildingMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap([0.4, 0.72, 1.0]) });
  const uLit = { value: 1.15 };
  const uReflect = { value: 1.0 };
  const uWet = { value: 0 };
  mat.userData.uLit = uLit;
  mat.userData.uReflect = uReflect;
  mat.userData.uWet = uWet;
  // Hyper-Realistic-Mode: Der PBR-Zwilling (realism.js) nutzt denselben Hook – unter STANDARD rechnet facade.js
  // echte Fassadenmaterialien, Rauheit, Metall, Reflexionsgrad und Relief, sonst bleibt der Cel-Look
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = uLit;
    shader.uniforms.uReflect = uReflect;
    shader.uniforms.uWet = uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aFac;
attribute vec4 aInfo;
varying vec2 vFac;
varying vec4 vInfo;
#ifdef STANDARD
varying vec3 vBWorld;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFac = aFac;
vInfo = aInfo;
#ifdef STANDARD
vBWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLit;
uniform float uReflect;
uniform float uWet;
varying vec2 vFac;
varying vec4 vInfo;
${DUSK_GLSL}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
#ifdef STANDARD
${FACADE_PARS}
#endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef STANDARD
${FACADE_COLOR}
#else
${WINDOW_GLSL}
#endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = bRough;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = bMetal;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef STANDARD
normal = normalize((viewMatrix * vec4(bNw, 0.0)).xyz);
#endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.specularColor = mix(material.specularColor, vec3(bF0), bWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef STANDARD
totalEmissiveRadiance += bEmit;
#else
${WINDOW_EMISSIVE_GLSL}
#endif`);
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

// Neonfarbe für die Schilder auf Straßenhöhe (eigener Zufall: der Verlauf des Stadt-Zufalls bleibt unverändert)
function neon2(r) {
  return new THREE.Color(NEON[Math.floor(r() * NEON.length)]);
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
