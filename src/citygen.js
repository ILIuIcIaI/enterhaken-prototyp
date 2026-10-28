import * as THREE from 'three';
import { Polyline, bezier, makeBlob, blobRho, rectsOverlap, rectCorners } from './geom2d.js';
import { RoadNet } from './roads.js';
import { pondRadius } from './terrain.js';

// Stadtplan: Raster-Innenstadt, organische Parks über Blockgrenzen hinweg, Wohnviertel mit
// geschwungenen Straßen, Ringstraße entlang der Küste und eine freigeräumte Trasse für die Hochbahn.

export const TRACK_Y = 13; // Oberkante des Viadukts
export const BOULEVARD_D = -53; // Mittellinie der Ringstraße (Küstenabstand)
export const ART_W = 15; // Rasterstraße inkl. Gehwege
export const LOCAL_W = 11; // Wohnstraße inkl. Gehwege
export const BLVD_W = 14;
const TRACK_CLEAR = 7; // Abstand von Gebäuden zur Gleismitte

export function generateLayout(city, rand) {
  const { N, B, S, P, origin } = city.layout;
  const line = (i) => origin - S / 2 + i * P; // Straßenmitte links von Block i
  const bx = (i) => origin + i * P;
  const coast = (x, z) => city.coastDist(x, z);

  // ---------------------------------------------------------------- Blöcke und Viertel
  const blocks = new Map();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = bx(i), z0 = bx(j);
      const corner = Math.max(coast(x0, z0), coast(x0 + B, z0), coast(x0, z0 + B), coast(x0 + B, z0 + B));
      if (corner > -50) continue;
      const cx = x0 + B / 2, cz = z0 + B / 2;
      const dn = Math.hypot(cx, cz) / city.coastR(cx, cz);
      let zone = dn < 0.28 ? 'downtown' : dn < 0.5 ? 'midtown' : 'residential';
      if (corner > -85) zone = 'waterfront';
      blocks.set(i * N + j, { i, j, x0, z0, x1: x0 + B, z1: z0 + B, cx, cz, zone, super: null, built: false });
    }
  }
  const block = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? null : blocks.get(i * N + j) ?? null);
  city.blockList = [...blocks.values()];

  // ---------------------------------------------------------------- Ringstraße und Bahntrasse
  const bpts = [];
  for (let k = 0; k < 1000; k++) {
    const th = (k / 1000) * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th);
    const r = city.coastR(dx, dz) + BOULEVARD_D;
    bpts.push({ x: dx * r, z: dz * r });
  }
  const blvd = (city.boulevard = new Polyline(bpts, true));
  const track = (city.track = makeTrack(city, rand));

  // ---------------------------------------------------------------- Parks
  const parks = (city.parks = []);
  const addPark = (x, z, R, pondChance, central) => {
    const park = { blob: makeBlob(x, z, R, rand, 0.9), pond: null, paths: [], central };
    if (rand() < pondChance) {
      const a = rand() * Math.PI * 2, off = R * 0.16 * rand();
      park.pond = {
        x: x + Math.cos(a) * off, z: z + Math.sin(a) * off,
        R: central ? 17 + rand() * 5 : R * (0.24 + rand() * 0.08),
        a: [0.1 + rand() * 0.08, 0.05 + rand() * 0.05, 0.03 + rand() * 0.03],
        p: [rand() * 6.283, rand() * 6.283, rand() * 6.283],
        level: -0.32, depth: 1.8,
      };
    }
    parks.push(park);
  };
  {
    const a0 = rand() * Math.PI * 2;
    const r = 0.44 * city.coastR(Math.cos(a0), Math.sin(a0));
    addPark(Math.cos(a0) * r, Math.sin(a0) * r, 64, 1, true);
  }
  for (let attempt = 0; attempt < 60 && parks.length < 6; attempt++) {
    const ang = rand() * Math.PI * 2, dn = 0.34 + rand() * 0.42;
    const r = dn * city.coastR(Math.cos(ang), Math.sin(ang));
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r, R = 26 + rand() * 20;
    if (coast(x, z) > -R * 1.3 - 60) continue;
    if (parks.some((p) => Math.hypot(p.blob.x - x, p.blob.z - z) < p.blob.R + R + 55)) continue;
    addPark(x, z, R, 0.45, false);
  }
  const parkRho = (x, z) => {
    let m = Infinity;
    for (const p of parks) m = Math.min(m, blobRho(p.blob, x, z));
    return m;
  };
  city.parkRho = parkRho;

  // ---------------------------------------------------------------- Superblöcke mit geschwungenen Wohnstraßen
  const sbs = (city.superblocks = []);
  const splitsV = new Map(), splitsH = new Map();
  const pushSplit = (m, k, v) => (m.get(k) ?? m.set(k, []).get(k)).push(v);
  // Kandidaten in zufälliger Reihenfolge, gierig belegt (dichter als ein festes 2×2-Raster)
  const cand = [];
  for (let i = 0; i + 1 < N; i++) for (let j = 0; j + 1 < N; j++) cand.push([i, j, rand()]);
  cand.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of cand) {
    {
      const bl = [block(i, j), block(i + 1, j), block(i, j + 1), block(i + 1, j + 1)];
      if (bl.some((b) => !b || b.super || b.zone === 'downtown')) continue;
      if (bl.filter((b) => b.zone !== 'midtown').length < 2) continue;
      const X0 = bx(i), Z0 = bx(j), X1 = bx(i + 1) + B, Z1 = bx(j + 1) + B;
      const pts = [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1], [(X0 + X1) / 2, (Z0 + Z1) / 2]];
      if (pts.some(([x, z]) => parkRho(x, z) < 1.15)) continue;
      if (coast((X0 + X1) / 2, (Z0 + Z1) / 2) > -95) continue;
      if (rand() > 0.9) continue;
      const sb = { i, j, X0, Z0, X1, Z1, W: X1 - X0, curves: [], houses: [] };
      bl.forEach((b) => (b.super = sb));
      sbs.push(sb);
      makeCurves(sb, rand, S);
      for (const c of sb.curves) {
        for (const e of [c.pts[0], c.pts[c.pts.length - 1]]) {
          if (Math.abs(e.x - line(i)) < 0.01) pushSplit(splitsV, i, e.z);
          else if (Math.abs(e.x - line(i + 2)) < 0.01) pushSplit(splitsV, i + 2, e.z);
          else if (Math.abs(e.z - line(j)) < 0.01) pushSplit(splitsH, j, e.x);
          else pushSplit(splitsH, j + 2, e.x);
        }
      }
    }
  }

  // ---------------------------------------------------------------- Straßennetz
  const net = (city.roadNet = new RoadNet());
  const land = (x, z) => coast(x, z) < -47;
  const gridSegment = (vertical, li, k) => {
    // Straße auf Linie li zwischen den Kreuzungen k und k+1
    const a = vertical ? block(li - 1, k) : block(k, li - 1);
    const b = vertical ? block(li, k) : block(k, li);
    if (!a && !b) return;
    if (a && b && a.super && a.super === b.super) return; // Innenkreuz eines Superblocks
    const c = line(li), s0 = line(k), s1 = line(k + 1);
    const P0 = vertical ? [c, s0] : [s0, c], P1 = vertical ? [c, s1] : [s1, c];
    if (!land(...P0) || !land(...P1)) return;
    const mid = vertical ? [c, (s0 + s1) / 2] : [(s0 + s1) / 2, c];
    if (parkRho(...mid) < 0.92) return;
    const cuts = ((vertical ? splitsV : splitsH).get(li) ?? []).filter((v) => v > s0 + 1 && v < s1 - 1).sort((u, v) => u - v);
    const chain = [s0, ...cuts, s1];
    for (let q = 0; q + 1 < chain.length; q++) {
      const A = vertical ? { x: c, z: chain[q] } : { x: chain[q], z: c };
      const Bp = vertical ? { x: c, z: chain[q + 1] } : { x: chain[q + 1], z: c };
      net.add(net.node(A.x, A.z), net.node(Bp.x, Bp.z), [A, Bp], ART_W, 'arterial');
    }
  };
  for (let li = 0; li <= N; li++) for (let k = 0; k < N; k++) { gridSegment(true, li, k); gridSegment(false, li, k); }
  for (const sb of sbs) {
    for (const c of sb.curves) {
      const a = c.pts[0], b = c.pts[c.pts.length - 1];
      c.road = net.add(net.node(a.x, a.z), net.node(b.x, b.z), c.pts, LOCAL_W, 'local');
    }
  }

  // Anbindung an die Ringstraße: vom Stadtrand gerade weiter bis zur Ringstraße
  const blocked = (x, z) => {
    for (const b of blocks.values()) if (x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2) return true;
    return parkRho(x, z) < 1.02;
  };
  const junctions = [];
  for (const n of [...net.nodes]) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (n.roads.some((r) => { const o = r.a === n ? r.b : r.a; return Math.sign(o.x - n.x) === dx && Math.sign(o.z - n.z) === dz; })) continue;
      if (blocked(n.x + dx * 12, n.z + dz * 12)) continue;
      let hit = -1;
      for (let t = 4; t < 85; t += 1) {
        const x = n.x + dx * t, z = n.z + dz * t;
        if (blocked(x, z)) break;
        if (coast(x, z) >= BOULEVARD_D) { hit = t; break; }
      }
      if (hit < 12 || rand() > 0.8) continue;
      const q = { s: 0 };
      blvd.dist(n.x + dx * hit, n.z + dz * hit, q);
      if (junctions.some((jn) => Math.min(Math.abs(jn.s - q.s), blvd.length - Math.abs(jn.s - q.s)) < 50)) continue;
      const p = blvd.at(q.s);
      const jn = { s: q.s, node: net.node(p.x, p.z) };
      junctions.push(jn);
      net.add(n, jn.node, [{ x: n.x, z: n.z }, { x: p.x, z: p.z }], ART_W - 2, 'connector');
    }
  }
  if (junctions.length < 2) {
    for (const s of [0, blvd.length / 2]) { const p = blvd.at(s); junctions.push({ s, node: net.node(p.x, p.z) }); }
  }
  junctions.sort((a, b) => a.s - b.s);
  for (let k = 0; k < junctions.length; k++) {
    const a = junctions[k], b = junctions[(k + 1) % junctions.length];
    const s1 = k + 1 < junctions.length ? b.s : b.s + blvd.length;
    const pts = [];
    for (let s = a.s; s < s1 - 2; s += 4) { const p = blvd.at(s); pts.push({ x: p.x, z: p.z }); }
    pts.push({ x: b.node.x, z: b.node.z });
    pts[0] = { x: a.node.x, z: a.node.z };
    net.add(a.node, b.node, pts, BLVD_W, 'boulevard');
  }
  net.compact();
  for (const n of net.nodes) n.signal = n.roads.length >= 3 && n.roads.every((r) => r.kind === 'arterial' || r.kind === 'connector');
  net.buildClearance();

  // ---------------------------------------------------------------- Bebauung der Rasterblöcke
  const trackDist = (x, z) => (track.near(x, z, 40) ? track.dist(x, z) : 99);
  const lotOK = (lot) => {
    const pts = [[lot.x0, lot.z0], [lot.x1, lot.z0], [lot.x0, lot.z1], [lot.x1, lot.z1], [(lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2],
      [(lot.x0 + lot.x1) / 2, lot.z0], [(lot.x0 + lot.x1) / 2, lot.z1], [lot.x0, (lot.z0 + lot.z1) / 2], [lot.x1, (lot.z0 + lot.z1) / 2]];
    for (const [x, z] of pts) {
      if (parkRho(x, z) < 1.04 || trackDist(x, z) < TRACK_CLEAR || coast(x, z) > BOULEVARD_D - BLVD_W / 2 - 2) return false;
    }
    return true;
  };
  city.plazas = [];
  for (const b of blocks.values()) {
    if (b.super) continue;
    if (parkRho(b.cx, b.cz) < 0.9) continue;
    const plazaChance = b.zone === 'downtown' || b.zone === 'midtown' ? 0.05 : 0.02;
    if (rand() < plazaChance && lotOK(b)) {
      city.plazas.push(b);
      city.addPlaza(b.x0, b.z0, B, rand);
      b.built = true;
      continue;
    }
    for (const lot of city.splitBlock(b.x0, b.z0, B, rand, b.zone)) {
      if (lotOK(lot)) { city.addBuilding(lot, b.zone, rand); b.built = true; }
    }
  }

  // ---------------------------------------------------------------- Häuser an Wohnstraßen und Ringstraße
  const houses = (city.houseRects = []);
  const houseFree = (rect, sbRef) => {
    if (houses.some((h) => Math.abs(h.cx - rect.cx) < 24 && Math.abs(h.cz - rect.cz) < 24 && rectsOverlap(h, rect, 1.6))) return false;
    const pts = rectCorners(rect);
    pts.push({ x: rect.cx, z: rect.cz });
    for (const p of pts) {
      if (net.clearance(p.x, p.z) < 1.3 || trackDist(p.x, p.z) < TRACK_CLEAR || parkRho(p.x, p.z) < 1.06) return false;
      if (sbRef && !(p.x > sbRef.X0 + 1.2 && p.x < sbRef.X1 - 1.2 && p.z > sbRef.Z0 + 1.2 && p.z < sbRef.Z1 - 1.2)) return false;
      if (coast(p.x, p.z) > BOULEVARD_D - BLVD_W / 2 - 1.5 && sbRef) return false;
    }
    if (!sbRef) {
      // nicht in bebaute Rasterblöcke oder Superblöcke ragen
      for (const b of blocks.values()) {
        if ((b.built || b.super) && rect.cx > b.x0 - 14 && rect.cx < b.x1 + 14 && rect.cz > b.z0 - 14 && rect.cz < b.z1 + 14) {
          if (rectsOverlap(rect, { cx: b.cx, cz: b.cz, hx: B / 2 + 1, hz: B / 2 + 1, a: 0 }, 0)) return false;
        }
      }
      if (coast(rect.cx, rect.cz) > BOULEVARD_D) return false;
    }
    return true;
  };
  const place = (at, side, width, sbRef, zone) => {
    const w = 8 + rand() * 4.5, d = 8 + rand() * 3;
    const nx = -at.tz * side, nz = at.tx * side;
    const off = width / 2 + 2.6 + rand() * 1.6 + d / 2;
    const rect = { cx: at.x + nx * off, cz: at.z + nz * off, hx: w / 2, hz: d / 2, a: Math.atan2(at.tz, at.tx), zone, front: { x: at.x, z: at.z } };
    if (!houseFree(rect, sbRef)) return null;
    houses.push(rect);
    if (sbRef) sbRef.houses.push(rect);
    return rect;
  };
  for (const sb of sbs) {
    const zone = 'residential';
    for (const c of sb.curves) {
      const pl = c.road ? c.road.pl : new Polyline(c.pts);
      for (const side of [-1, 1]) {
        for (let s = 8 + rand() * 4; s < pl.length - 8; s += 12 + rand() * 4) place(pl.at(s), side, LOCAL_W, sb, zone);
      }
    }
    // Häuserzeilen entlang der umgebenden Rasterstraßen, Front zur Straße
    const edges = [
      [sb.X0, sb.Z0 - S / 2, 1, 0, 1], [sb.X0, sb.Z1 + S / 2, 1, 0, -1],
      [sb.X0 - S / 2, sb.Z0, 0, 1, -1], [sb.X1 + S / 2, sb.Z0, 0, 1, 1],
    ];
    for (const [x0, z0, tx, tz, side] of edges) {
      for (let s = 7 + rand() * 3; s < sb.W - 6; s += 11.5 + rand() * 3) {
        place({ x: x0 + tx * s, z: z0 + tz * s, tx, tz }, side, ART_W, sb, zone);
      }
    }
  }
  // Ringstraße: Häuser auf der Landseite, teils in zweiter Reihe
  for (let s = 0; s < blvd.length; s += 13 + rand() * 6) {
    const at = blvd.at(s);
    let side = 1;
    if (coast(at.x - at.tz * 10, at.z + at.tx * 10) > coast(at.x, at.z)) side = -1;
    const h = place(at, side, BLVD_W, null, 'waterfront');
    if (h && rand() < 0.35) {
      const back = { x: at.x - at.tz * side * (h.hz * 2 + 5), z: at.z + at.tx * side * (h.hz * 2 + 5), tx: at.tx, tz: at.tz };
      place(back, side, BLVD_W, null, 'waterfront');
    }
  }
  for (const r of houses) city.addHouse(r, rand);

  // ---------------------------------------------------------------- Parks ausgestalten
  for (const park of parks) dressPark(city, park, rand, net, trackDist);

  // ---------------------------------------------------------------- Bäume außerhalb der Parks
  city.buildIndex(); // für solidNear
  const treeOK = (x, z, clear) => net.clearance(x, z) > clear && trackDist(x, z) > 6 && parkRho(x, z) > 1.02 &&
    !houses.some((h) => Math.abs(h.cx - x) < 9 && Math.abs(h.cz - z) < 9 && rectsOverlap(h, { cx: x, cz: z, hx: 1.5, hz: 1.5, a: 0 }, 0.5));
  // Gärten in den Superblöcken
  for (const sb of sbs) {
    for (let k = 0; k < 26; k++) {
      const x = sb.X0 + 3 + rand() * (sb.W - 6), z = sb.Z0 + 3 + rand() * (sb.W - 6);
      if (treeOK(x, z, 2.5)) city.trees.push({ x, z, s: 0.65 + rand() * 0.45, sakura: rand() < 0.22 });
    }
  }
  // freie Flächen am Stadtrand
  for (let x = -520; x < 520; x += 9) {
    for (let z = -520; z < 520; z += 9) {
      const tx = x + (rand() - 0.5) * 6, tz = z + (rand() - 0.5) * 6;
      const d = coast(tx, tz);
      if (d > BOULEVARD_D - BLVD_W / 2 - 2 || d < -260 || rand() > 0.42) continue;
      if ([...blocks.values()].some((b) => tx > b.x0 - 3 && tx < b.x1 + 3 && tz > b.z0 - 3 && tz < b.z1 + 3)) continue;
      if (treeOK(tx, tz, 3)) city.trees.push({ x: tx, z: tz, s: 0.8 + rand() * 0.5, sakura: rand() < 0.2 });
    }
  }
  // Straßenbäume an Rasterstraßen in Wohn- und Uferlage
  for (const r of net.roads) {
    if (r.kind !== 'arterial' && r.kind !== 'boulevard') continue;
    const mid = r.pl.at(r.pl.length / 2);
    const dn = Math.hypot(mid.x, mid.z) / city.coastR(mid.x, mid.z);
    if (dn < 0.5 && r.kind === 'arterial') continue;
    for (let s = 9; s < r.pl.length - 9; s += 11) {
      if (rand() > 0.55) continue;
      const at = r.pl.at(s);
      for (const side of [-1, 1]) {
        const off = r.width / 2 - 1.1;
        const x = at.x - at.tz * side * off, z = at.z + at.tx * side * off;
        if (trackDist(x, z) > 6 && parkRho(x, z) > 1 && !city.solidNear(x, z, 1.2)) city.trees.push({ x, z, s: 0.65 + rand() * 0.3, sakura: rand() < 0.15 });
      }
    }
  }

  buildViaduct(city, net);

  // ---------------------------------------------------------------- Laternen an allen Straßen
  const lamps = (city.lamps = []);
  for (const r of net.roads) {
    const step = r.kind === 'local' ? 24 : 28;
    let side = rand() < 0.5 ? -1 : 1;
    for (let s = 10; s < r.pl.length - 10; s += step) {
      const at = r.pl.at(s);
      const off = r.width / 2 - 0.9;
      const x = at.x - at.tz * side * off, z = at.z + at.tx * side * off;
      if (trackDist(x, z) > 4 && !city.solidNear(x, z, 0.8)) lamps.push([x, 0, z, at.tz * side, -at.tx * side]);
      if (r.kind !== 'boulevard') side = -side;
    }
  }
  for (const park of parks) {
    for (const pl of park.paths) {
      for (let s = 8; s < pl.length - 6; s += 22) {
        const at = pl.at(s);
        const x = at.x - at.tz * 1.9, z = at.z + at.tx * 1.9;
        lamps.push([x, city.terrain.height(x, z), z, at.tz, -at.tx]);
      }
    }
  }
}

// Viadukt der Hochbahn als Kette gedrehter Boxen (Fahrbahnplatte, Brüstungen, Schienen), Pfeiler
// abseits der Fahrbahnen und zwei Bahnhöfe mit Bahnsteigen und Dach.
function buildViaduct(city, net) {
  const tr = city.track, L = tr.length;
  const concrete = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#6e6670') };
  const rail = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#2a272e'), noWallrun: true };
  const seg = 8;
  const a = {}, b = {};
  city.stations = [0.2 * L, 0.7 * L].map((s) => ({ s, len: 56 }));
  const inStation = (s) => city.stations.some((st) => Math.abs(((s - st.s + L * 1.5) % L) - L / 2) < st.len / 2);
  for (let s = 0; s < L; s += seg) {
    tr.at(s, a);
    tr.at(s + seg, b);
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, ang = Math.atan2(b.z - a.z, b.x - a.x);
    const half = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.25;
    const nx = -Math.sin(ang), nz = Math.cos(ang);
    city.addRotatedBox(cx, cz, half, 3.2, ang, TRACK_Y - 1.3, TRACK_Y, { ...concrete, track: true });
    for (const side of [-1, 1]) {
      if (!inStation(s + seg / 2)) city.addRotatedBox(cx + nx * side * 3.05, cz + nz * side * 3.05, half, 0.15, ang, TRACK_Y, TRACK_Y + 0.9, { ...concrete, noWallrun: true });
      city.addRotatedBox(cx + nx * side * 0.75, cz + nz * side * 0.75, half, 0.07, ang, TRACK_Y, TRACK_Y + 0.17, rail);
    }
  }
  // Pfeiler etwa alle 24 m, nie mitten auf der Fahrbahn
  city.pillars = [];
  for (let s = 0; s < L; s += 24) {
    for (const ds of [0, 5, -5, 9, -9]) {
      tr.at(s + ds, a);
      if (net.clearance(a.x, a.z) < 1.0) continue;
      city.addBox(a.x - 0.8, 0, a.z - 0.8, a.x + 0.8, TRACK_Y - 1.3, a.z + 0.8, { ...concrete });
      city.pillars.push({ x: a.x, z: a.z });
      break;
    }
  }
  // Bahnhöfe: Bahnsteige beidseits, Dach auf Stützen
  const roofC = { style: 3, kind: 2, seed: 0, color: new THREE.Color('#3c3a48') };
  for (const st of city.stations) {
    for (let s = st.s - st.len / 2; s < st.s + st.len / 2; s += seg) {
      tr.at(s, a);
      tr.at(s + seg, b);
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, ang = Math.atan2(b.z - a.z, b.x - a.x);
      const half = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.25;
      const nx = -Math.sin(ang), nz = Math.cos(ang);
      for (const side of [-1, 1]) {
        city.addRotatedBox(cx + nx * side * 5.0, cz + nz * side * 5.0, half, 1.8, ang, TRACK_Y - 1.3, TRACK_Y + 0.9, { ...concrete, color: new THREE.Color('#7a7480') });
        city.addRotatedBox(cx + nx * side * 6.6, cz + nz * side * 6.6, 0.15, 0.15, ang, TRACK_Y + 0.9, TRACK_Y + 5.4, roofC);
      }
      city.addRotatedBox(cx, cz, half, 7.2, ang, TRACK_Y + 5.4, TRACK_Y + 5.75, roofC);
    }
  }
}

// Bahntrasse: geschlossene, weich geschwungene Schleife durch Mittelstadt und Wohnviertel
function makeTrack(city, rand) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const cx = (rand() - 0.5) * 70, cz = (rand() - 0.5) * 70;
    const R0 = 195 + rand() * 45, a2 = 0.1 + rand() * 0.1, a3 = 0.04 + rand() * 0.05;
    const p2 = rand() * 6.283, p3 = rand() * 6.283;
    const pts = [];
    let ok = true;
    for (let k = 0; k < 420; k++) {
      const th = (k / 420) * Math.PI * 2;
      const r = R0 * (1 + a2 * Math.sin(2 * th + p2) + a3 * Math.sin(3 * th + p3));
      const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
      if (city.coastDist(x, z) > -108 || Math.hypot(x, z) < 140) { ok = false; break; }
      pts.push({ x, z });
    }
    if (ok) return new Polyline(pts, true);
  }
  const pts = [];
  for (let k = 0; k < 420; k++) { const th = (k / 420) * Math.PI * 2; pts.push({ x: Math.cos(th) * 190, z: Math.sin(th) * 190 }); }
  return new Polyline(pts, true);
}

// Geschwungene Wohnstraße(n) in einem Superblock: S-Kurve, Bogen oder Schleife, in 90°-Schritten gedreht
function makeCurves(sb, rand, S) {
  const W = sb.W, e = S / 2;
  const rot = Math.floor(rand() * 4);
  const toWorld = ([u, v]) => {
    let du = u - W / 2, dv = v - W / 2;
    for (let k = 0; k < rot; k++) [du, dv] = [-dv, du];
    return { x: sb.X0 + W / 2 + du, z: sb.Z0 + W / 2 + dv };
  };
  const r = rand();
  let ctrl;
  if (r < 0.4) {
    const vA = W * (0.3 + 0.4 * rand()), vB = W * (0.3 + 0.4 * rand()), k = (rand() < 0.5 ? -1 : 1) * (16 + rand() * 12);
    ctrl = [[-e, vA], [W * 0.36, vA + k], [W * 0.64, vB - k], [W + e, vB]];
  } else if (r < 0.75) {
    const vA = W * (0.32 + 0.22 * rand()), uB = W * (0.44 + 0.24 * rand());
    ctrl = [[-e, vA], [W * 0.5, vA], [uB, W * 0.5], [uB, W + e]];
  } else {
    const uA = W * (0.2 + 0.08 * rand()), uB = W * (0.72 + 0.08 * rand());
    ctrl = [[uA, W + e], [uA - 6, W * 0.02], [uB + 6, W * 0.02], [uB, W + e]];
  }
  const P = ctrl.map(toWorld);
  sb.curves.push({ pts: bezier(P[0], P[1], P[2], P[3], 3) });
}

// Park: Wege, Teich, Hügel, Baumgruppen
function dressPark(city, park, rand, net, trackDist) {
  const b = park.blob, R = b.R;
  const T = city.terrain;
  const pond = park.pond;
  const edge = (th) => {
    const rr = R * (1 + b.a[0] * Math.sin(2 * th + b.p[0]) + b.a[1] * Math.sin(3 * th + b.p[1]) + b.a[2] * Math.sin(5 * th + b.p[2])) * 0.97;
    return { x: b.x + Math.cos(th) * rr, z: b.z + Math.sin(th) * rr };
  };
  // geschwungene Wege quer durch den Park, um den Teich herum
  const nPaths = park.central ? 3 : 2;
  const th0 = rand() * Math.PI * 2;
  for (let k = 0; k < nPaths; k++) {
    const t1 = th0 + (k * Math.PI) / nPaths, t2 = t1 + Math.PI + (rand() - 0.5) * 1.3;
    const p1 = edge(t1), p2 = edge(t2);
    const c1 = { x: p1.x + (b.x - p1.x) * 0.55 + (rand() - 0.5) * R * 0.5, z: p1.z + (b.z - p1.z) * 0.55 + (rand() - 0.5) * R * 0.5 };
    const c2 = { x: p2.x + (b.x - p2.x) * 0.55 + (rand() - 0.5) * R * 0.5, z: p2.z + (b.z - p2.z) * 0.55 + (rand() - 0.5) * R * 0.5 };
    if (pond) {
      for (const c of [c1, c2]) {
        const dx = c.x - pond.x, dz = c.z - pond.z, d = Math.hypot(dx, dz) || 1;
        if (d < pond.R * 1.9) { c.x = pond.x + (dx / d) * pond.R * 1.9; c.z = pond.z + (dz / d) * pond.R * 1.9; }
      }
    }
    // Wege enden am Teichufer: an den Stellen im Wasser auftrennen statt quer hindurch zu verbinden
    let run = [];
    for (const p of [...bezier(p1, c1, c2, p2, 2), null]) {
      if (p && (!pond || T.pondRho(pond, p.x, p.z) > 1.3)) { run.push(p); continue; }
      if (run.length > 4) park.paths.push(new Polyline(run));
      run = [];
    }
  }
  if (pond) {
    const ring = [];
    for (let k = 0; k < 72; k++) {
      const th = (k / 72) * Math.PI * 2;
      const pr = pondRadius(pond, th) * 1.42;
      ring.push({ x: pond.x + Math.cos(th) * pr, z: pond.z + Math.sin(th) * pr });
    }
    park.paths.push(new Polyline(ring, true));
    T.addPond(pond);
  }
  // sanfte Hügel abseits des Teichs
  const hills = park.central ? 4 : 2;
  for (let k = 0, tries = 0; k < hills && tries < 40; tries++) {
    const a = rand() * Math.PI * 2, rr = R * 0.65 * Math.sqrt(rand());
    const x = b.x + Math.cos(a) * rr, z = b.z + Math.sin(a) * rr, r = 9 + rand() * 11;
    if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.R * 1.5 + r * 1.4) continue;
    if (blobRho(b, x, z) > 0.8 - r / R) continue;
    T.addBump({ x, z, r, h: 1.0 + rand() * 2.0 });
    k++;
  }
  // Baumgruppen und offene Wiesen
  const f1 = rand() * 6.283, f2 = rand() * 6.283;
  for (let x = b.x - R * 1.3; x < b.x + R * 1.3; x += 5.2) {
    for (let z = b.z - R * 1.3; z < b.z + R * 1.3; z += 5.2) {
      const tx = x + (rand() - 0.5) * 3.6, tz = z + (rand() - 0.5) * 3.6;
      if (blobRho(b, tx, tz) > 0.99) continue;
      const g = 0.5 + 0.5 * Math.sin(tx * 0.05 + f1) * Math.cos(tz * 0.055 + f2);
      if (rand() > 0.1 + 0.8 * g ** 1.6) continue;
      if (pond && T.pondRho(pond, tx, tz) < 1.35) continue;
      if (park.paths.some((pl) => pl.near(tx, tz, 3) && pl.dist(tx, tz) < 2.8)) continue;
      if (net.clearance(tx, tz) < 2 || trackDist(tx, tz) < 6) continue;
      city.trees.push({ x: tx, z: tz, s: 0.75 + rand() * 0.6, sakura: rand() < 0.26 });
    }
  }
}
