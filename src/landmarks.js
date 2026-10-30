import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { colored } from './mover.js';
import { WALL_D } from './terrain.js';
import { leafHook } from './foliage.js';
import { buildIslet, isletMeshes } from './islet.js';
import { CONTAINER_LINES, CONTAINER_SIZE, containerMesh } from './container.js';

// Wahrzeichen an der Küste und auf den Dächern – alles Feste sind gewöhnliche Stadtboxen (Kollision, Haken, Grinden),
// die Optik dazu entsteht in landmarkMeshes (und pier.js für den Jahrmarkt):
//   Hafen: Kai ins Meer, Containerstapel, drei Containerbrücken mit Ausleger über dem Wasser.
//   Vergnügungspier: Jahrmarkt auf einem Deck vor dem Strand (buildPier).
//   Leuchtturm-Insel: Felsmassiv für sich, mit Abstand zur Küste und weit weg vom Hafen; rot-weißer Leuchtturm (nachts
//   kreist der Lichtkegel), Wärterhaus, Felsweg und Bootssteg (islet.js, rock.js).
// Die fahrenden Containerschiffe (harbor.js) ziehen ihre Runde draußen jenseits der Leuchtturm-Insel.
const plain = (hex, extra = {}) => ({ style: 3, kind: 2, seed: 0, color: new THREE.Color(hex), ...extra });

export const SHIP_LOOPS = [255, 320]; // Küstenabstand der Schiffsrunden (draußen jenseits der Leuchtturm-Insel)

export function buildLandmarks(city, rand) {
  const D = (city.landmarkData = {});
  // Hafen an der geradesten Küste in einer der vier Achsrichtungen – der Kai liegt dann parallel zum Straßenraster
  const straight = (th) => {
    const F = frame(city, th);
    let lo = Infinity, hi = -Infinity;
    for (let s = -110; s <= 120; s += 10) {
      const p = F.at(0, s), d = city.coastDist(p.x, p.z);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return hi - lo;
  };
  const dirs = [0, 1, 2, 3].map((k) => ({ th: (k * Math.PI) / 2, r: straight((k * Math.PI) / 2) })).sort((a, b) => a.r - b.r);
  const thH = dirs[0].th;
  D.harbor = buildHarbor(city, rand, thH);
  D.pier = buildPier(city, pierSite(city, thH));
  // Leuchtturm-Insel: auf der Seite des Hafens, die weiter vom Pier entfernt liegt
  const thP = Math.atan2(D.pier.center.z, D.pier.center.x), off = 2.2 + rand() * 0.5;
  const away = (th) => Math.abs(Math.atan2(Math.sin(th - thP), Math.cos(th - thP)));
  D.islet = buildIslet(city, frame(city, away(thH + off) >= away(thH - off) ? thH + off : thH - off), plain, mulberryLite(99));
  D.turbines = placeTurbines(city, [thH, thP]);
  D.tree = placeGiantTree(city, D.turbines);
  D.cranes = city.site?.cranes ?? []; // Turmdrehkräne am Rohbau-Wolkenkratzer (city.js: addConstructionSite)
}

// Küstenkoordinaten: d = Abstand von der Küste (> 0 im Meer), s = seitlich entlang der Küste; shift verschiebt den
// Nullpunkt aufs Meer hinaus, s0 setzt ihn seitlich versetzt an die Küste (die Linie läuft weiter in Richtung th)
function frame(city, th, shift = 0, s0 = 0) {
  const ux = Math.cos(th), uz = Math.sin(th), tx = -uz, tz = ux;
  let R = city.coastR(ux, uz);
  for (let k = 0; s0 && k < 6; k++) R -= city.coastDist(ux * R + tx * s0, uz * R + tz * s0);
  R += shift;
  const at = (d, s) => ({ x: ux * (R + d) + tx * (s + s0), z: uz * (R + d) + tz * (s + s0) });
  const local = (x, z) => {
    const dx = x - ux * R - tx * s0, dz = z - uz * R - tz * s0;
    return { d: dx * ux + dz * uz, s: dx * tx + dz * tz };
  };
  return { th, ux, uz, tx, tz, R, s0, at, local };
}

// Pierstelle: die Küste soll über die ganze Pierbreite gerade und genau quer zu einer Achsrichtung laufen – dann liegt der
// Pier im Straßenraster und zugleich parallel zur Promenade (nirgends ragt eine Ecke Richtung Straße)
function pierSite(city, thH) {
  let best = null;
  for (let k = 0; k < 4; k++) {
    const th = (k * Math.PI) / 2;
    if (Math.abs(Math.atan2(Math.sin(th - thH), Math.cos(th - thH))) < 0.1) continue; // dort liegt der Hafen
    for (let s0 = -220; s0 <= 220; s0 += 10) {
      const F = frame(city, th, 0, s0);
      let lo = Infinity, hi = -Infinity;
      for (let s = -54; s <= 54; s += 6) {
        const p = F.at(0, s), d = city.coastDist(p.x, p.z);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      const score = hi - lo + Math.abs(s0) * 0.004;
      if (!best || score < best.score) best = { th, s0, score };
    }
  }
  return best;
}

// Promenadenbäume und Laternen, die im Weg stehen, entfernen
function clearArea(city, inside) {
  city.trees = city.trees.filter((t) => !inside(t.x, t.z));
  if (city.lamps) city.lamps = city.lamps.filter((l) => !inside(l[0], l[2]));
}

function buildHarbor(city, rand, th) {
  // so weit hinaus, dass die Landseite des Kais überall vor der Promenade liegt (die Küste ist nicht ganz gerade)
  const F0 = frame(city, th);
  let shift = 0;
  for (let s = -100; s <= 110; s += 5) {
    const p = F0.at(0, s);
    shift = Math.max(shift, -2 - city.coastDist(p.x, p.z));
  }
  const F = frame(city, th, shift), a = th;
  const rbox = (d, s, hd, hs, y0, y1, look) => { const p = F.at(d, s); return city.addRotatedBox(p.x, p.z, hd, hs, a, y0, y1, look); };
  const local = (x, z) => { const dx = x - F.ux * F.R, dz = z - F.uz * F.R; return { d: dx * F.ux + dz * F.uz, s: dx * F.tx + dz * F.tz }; };
  clearArea(city, (x, z) => { const l = local(x, z); return l.d > -48 && l.d < 50 && Math.abs(l.s) < 100; });
  // Kai: von der Promenade bis 40 m ins Meer, 180 m breit
  const quayTop = 1.0;
  rbox(3, 0, 37, 90, -14, quayTop, plain('#8a8490'));
  rbox(39.4, 0, 0.6, 90, quayTop, quayTop + 0.22, plain('#d6c84a', { noWallrun: true })); // niedrige gelbe Kaikante: zum Hinsetzen, die Füße baumeln überm Wasser
  // Containerstapel in Blöcken (je 3 Reihen × 3 Plätze, 1–4 hoch); die lange Seite läuft entlang der Küste
  const C_LEN = CONTAINER_SIZE.L, C_W = CONTAINER_SIZE.W, C_H = CONTAINER_SIZE.H, stacked = [];
  for (const d0 of [-26, -12]) {
    for (const s0 of [-80, -40, 0, 40]) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (rand() < 0.12) continue;
          const n = 1 + Math.floor(rand() * 4);
          for (let k = 0; k < n; k++) {
            const y0 = quayTop + k * C_H;
            const dc = d0 + r * (C_W + 0.4), sc = s0 + c * (C_LEN + 0.6) + C_LEN / 2, p = F.at(dc, sc);
            rbox(dc, sc, C_W / 2, C_LEN / 2, y0, y0 + C_H, plain('#6d7178', { noRender: true }));
            stacked.push({ x: p.x, y: y0, z: p.z, ry: -a, line: Math.floor(rand() * CONTAINER_LINES), flip: (r + c + k) % 2 === 0 });
          }
        }
      }
    }
  }
  // Containerbrücken an der Kaikante: vier Beine, Querträger, Ausleger weit übers Wasser, Maschinenhaus, Spitze
  const cranes = [];
  for (const [s, col] of [[-55, '#c8352b'], [0, '#2f6fb0'], [55, '#c8352b']]) {
    const steel = plain(col, { noWallrun: true }), H = 44;
    for (const dd of [14, 30]) for (const ss of [-7, 7]) rbox(dd, s + ss, 0.7, 0.7, quayTop, H, steel);
    for (const dd of [14, 30]) rbox(dd, s, 0.8, 8, H - 3, H, steel);           // Querträger
    rbox(22, s - 7, 8.7, 0.8, H - 3, H, steel);
    rbox(22, s + 7, 8.7, 0.8, H - 3, H, steel);
    rbox(46, s, 32, 1.6, H, H + 2.4, steel);                                     // Ausleger (bis 78 m übers Wasser)
    rbox(4, s, 10, 1.6, H, H + 2.4, steel);                                      // Rückausleger
    rbox(24, s, 4.5, 3.2, H + 2.4, H + 7.5, plain('#e8e6e0'));                  // Maschinenhaus
    rbox(22, s, 0.9, 0.9, H + 2.4, H + 18, steel);                               // Spitze (A-Rahmen)
    cranes.push(F.at(22, s));
  }
  // Hafenbecken: Molen fassen das Wasser vor der Kaikante ein, in der äußeren Mole eine Einfahrt, über die eine
  // Klappbrücke führt (harbor.js) – der Feeder-Frachter legt hier an und fährt regelmäßig hinaus
  const mole = plain('#8a8490'), M = { d0: 140, d1: 148, s0: 40, s1: 100 };   // Einfahrt zwischen s0 und s1
  rbox((40 + M.d1) / 2, -94, (M.d1 - 40) / 2, 4, -14, quayTop, mole);           // westliche Mole
  rbox((40 + M.d1) / 2, 104, (M.d1 - 40) / 2, 4, -14, quayTop, mole);           // östliche Mole
  rbox((M.d0 + M.d1) / 2, (-98 + M.s0) / 2, (M.d1 - M.d0) / 2, (M.s0 + 98) / 2, -14, quayTop, mole); // äußere Mole
  for (const [s, col] of [[M.s0 - 3, '#c8352b'], [M.s1 + 3, '#2c8a4e']]) {     // Maschinenhäuschen, rot / grün
    rbox((M.d0 + M.d1) / 2, s, 3, 3, quayTop, quayTop + 5, plain('#e8e4dc'));
    rbox((M.d0 + M.d1) / 2, s, 3.2, 3.2, quayTop + 5, quayTop + 5.8, plain(col, { noWallrun: true }));
  }
  return { F, cranes, quayTop, mole: M, stacked };
}

// Vergnügungspier (Jahrmarkt): breites Deck auf Pfählen. Es beginnt erst ein Stück vor der Ufermauer auf dem Strand –
// eine kurze Treppe führt von der Promenade hinauf, nichts ragt auf Promenade oder Straße. Mittig die Flaniermeile mit
// Laternen, Lichterketten, Kiosken, Palmen und Bänken; westlich Autoscooter, Karussell, Kettenkarussell, Schiffschaukel
// und Freifallturm, östlich die Achterbahn, hinten Riesenrad, Rutschturm, Tische mit Sonnenschirmen und Aussichtsbänke,
// darüber an langen Leinen drei Riesenballons. Feste Teile sind Stadtboxen (Kollision, Haken, Grinden); ihre Optik baut
// pier.js, alles Bewegte amusement.js und aerial.js. Koordinaten: d von der Landkante des Decks aufs Meer hinaus,
// s entlang der Küste.
function buildPier(city, { th, s0 }) {
  const top = 2.2, L = 190, hs = 46, walk = { s0: -8, s1: 6 }, mid = (walk.s0 + walk.s1) / 2;
  // die Landkante des Decks liegt überall mindestens 6,4 m vor der Ufermauer
  const F0 = frame(city, th, 0, s0);
  let shift = -Infinity;
  for (let s = -hs; s <= hs; s += 4) { const p = F0.at(0, s); shift = Math.max(shift, WALL_D + 6.4 - city.coastDist(p.x, p.z)); }
  const F = frame(city, th, shift, s0), a = th;
  const rbox = (d, s, hd, hz, y0, y1, look) => { const p = F.at(d, s); return city.addRotatedBox(p.x, p.z, hd, hz, a, y0, y1, look); };
  const span = (da, db, sa, sb, y0, y1, look) => rbox((da + db) / 2, (sa + sb) / 2, (db - da) / 2, (sb - sa) / 2, y0, y1, look);
  const pE = F.at(0, mid), gap = Math.max(4, city.coastDist(pE.x, pE.z) - WALL_D);
  clearArea(city, (x, z) => {
    const l = F.local(x, z);
    return (l.d > -2 && l.d < L + 8 && Math.abs(l.s) < hs + 6) || (l.d > -gap - 7 && l.d < 0 && Math.abs(l.s - mid) < 11);
  });

  // Deck (die Planken zeichnet pier.js), Pfähle, Treppe über den Strandstreifen
  span(0, L, -hs, hs, top - 1, top, plain('#a98257'));
  for (let d = 4; d < L; d += 11) for (let s = -hs + 3; s <= hs - 3; s += 11.5) rbox(d, s, 0.45, 0.45, -14, top - 1, plain('#5e5058'));
  for (let k = 0; k < 8; k++) span(-gap + (k * gap) / 8, -gap + ((k + 1) * gap) / 8, walk.s0 + 1, walk.s1 - 1, -2.6, 0.275 * (k + 1), plain('#8a8490', { noWallrun: true }));
  // Geländer ringsum (auch Grind-Linien), an der Landseite nur neben der Treppe
  const railY = top + 1.1, rails = [], railLook = plain('#e8e4dc', { noWallrun: true });
  const rail = (da, sa, db, sb) => {
    span(Math.min(da, db) - 0.12, Math.max(da, db) + 0.12, Math.min(sa, sb) - 0.12, Math.max(sa, sb) + 0.12, top, railY, railLook);
    rails.push([F.at(da, sa), F.at(db, sb)].map((p) => ({ x: p.x, y: railY, z: p.z })));
  };
  rail(0.4, -hs + 0.3, L - 0.4, -hs + 0.3);
  rail(0.4, hs - 0.3, L - 0.4, hs - 0.3);
  rail(L - 0.3, -hs + 0.4, L - 0.3, hs - 0.4);
  rail(0.3, -hs + 0.4, 0.3, walk.s0 + 0.6);
  rail(0.3, walk.s1 - 0.6, 0.3, hs - 0.4);
  // Eingangsbogen über der Flaniermeile (Optik und Leuchtschrift: pier.js)
  const arch = { d: 2.6, sa: walk.s0 - 1.4, sb: walk.s1 + 1.4, h: 8.6 };
  for (const s of [arch.sa, arch.sb]) rbox(arch.d, s, 0.6, 0.6, top, top + arch.h, plain('#e8e4dc', { noRender: true }));
  span(arch.d - 0.45, arch.d + 0.45, arch.sa - 0.7, arch.sb + 0.7, top + arch.h - 1.9, top + arch.h, plain('#2f6fb0', { noRender: true, noWallrun: true }));

  // Riesenrad: Achse quer zur Küste (das Rad schaut zur Stadt), zwei Stützen bis zur Nabe
  const W = { d: 140, s: -16, y: top + 33.2, R: 29, n: 16 };
  for (const dd of [-3.5, 3.5]) rbox(W.d + dd, W.s, 0.9, 0.9, top, W.y + 1, plain('#d8d4ce'));
  rbox(W.d, W.s, 4.2, 0.7, W.y - 0.7, W.y + 0.7, plain('#9a949e'));                       // Achse
  rbox(W.d, W.s, 4, 3, top, top + 1.2, plain('#c8352b'));                                  // Einstieg
  // Achterbahn: Kontrollpunkte (d, s, y) einer geschlossenen Kurve – Bahnhof, Lifthügel, steile Abfahrt, Steilkurve,
  // Kamelhöcker, Kehre zurück
  const ctrl = [
    [22, 32, 6], [42, 32, 6], [58, 32, 9], [88, 32, 34], [102, 32, 40], [112, 33, 37], [130, 34, 10], [148, 36, 12],
    [160, 30, 18], [158, 20, 22], [144, 19, 24], [122, 16, 14], [102, 10, 26], [82, 8, 9], [64, 10, 18], [50, 16, 8],
    [34, 12, 11], [16, 18, 9], [12, 30, 7],
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([d, s, y]) => { const p = F.at(d, s); return new THREE.Vector3(p.x, top + y, p.z); }), true, 'centripetal');
  const pts = curve.getSpacedPoints(360).slice(0, -1);
  // Stützen alle paar Meter vom Deck bis unter die Schiene
  const supports = [];
  for (let k = 0; k < pts.length; k += 7) {
    const p = pts[k];
    if (p.y - top < 3) continue;
    city.addBox(p.x - 0.3, top, p.z - 0.3, p.x + 0.3, p.y - 0.9, p.z + 0.3, plain('#e8e4dc', { noWallrun: true }));
    supports.push(F.local(p.x, p.z));
  }
  const free = (d, s, r) => supports.every((q) => Math.hypot(q.d - d, q.s - s) > r);
  rbox(32, 38, 11, 2.5, top, top + 5.2, plain('#2f6fb0'));                                 // Bahnsteig
  rbox(32, 38, 11.5, 3, top + 9, top + 9.6, plain('#d6c84a'));                             // Bahnhofsdach

  // Autoscooter: Halle mit flachem Dach (begehbar), Fahrfläche, Bande, Leuchtschild zur Flaniermeile
  const hall = { d0: 10, d1: 36, s0: -44, s1: -20, h: 6 };
  span(hall.d0 + 0.6, hall.d1 - 0.6, hall.s0 + 0.6, hall.s1 - 0.6, top, top + 0.2, plain('#3a3644'));
  for (const d of [hall.d0 + 0.4, (hall.d0 + hall.d1) / 2, hall.d1 - 0.4]) for (const s of [hall.s0 + 0.4, hall.s1 - 0.4]) rbox(d, s, 0.4, 0.4, top, top + hall.h, plain('#e8e4dc'));
  span(hall.d0 - 0.4, hall.d1 + 0.4, hall.s0 - 0.4, hall.s1 + 0.4, top + hall.h, top + hall.h + 0.7, plain('#c8352b'));
  const band = plain('#d6c84a', { noWallrun: true }), b0 = top + 0.2, b1 = top + 0.9;
  span(hall.d0 + 0.6, hall.d1 - 0.6, hall.s0 + 0.6, hall.s0 + 0.9, b0, b1, band);
  span(hall.d0 + 0.6, hall.d0 + 0.9, hall.s0 + 0.9, hall.s1 - 0.9, b0, b1, band);
  span(hall.d1 - 0.9, hall.d1 - 0.6, hall.s0 + 0.9, hall.s1 - 0.9, b0, b1, band);
  span(hall.d0 + 0.6, 20, hall.s1 - 0.9, hall.s1 - 0.6, b0, b1, band);
  span(26, hall.d1 - 0.6, hall.s1 - 0.9, hall.s1 - 0.6, b0, b1, band);
  span(14, 32, hall.s1 - 0.5, hall.s1, top + hall.h + 0.7, top + hall.h + 3.1, plain('#1a1820', { noRender: true, noWallrun: true }));
  // Karussell: fester Sockel (Achteck) und Mittelsäule – Plattform, Dach und Pferde drehen sich (amusement.js)
  const carousel = { d: 52, s: -30, R: 8 };
  rbox(carousel.d, carousel.s, 1.1, 1.1, top, top + 7.2, plain('#d8c23a', { noRender: true }));
  for (const r of [0, Math.PI / 4]) { const p = F.at(carousel.d, carousel.s); city.addRotatedBox(p.x, p.z, 7.7, 7.7, a + r, top, top + 0.25, plain('#e8e4dc', { noRender: true, noWallrun: true })); }
  // Kettenkarussell: Turm fest, Krone und Sessel drehen sich
  const swing = { d: 84, s: -30, a: 5.2, l: 9.2, h: 11 };
  rbox(swing.d, swing.s, 0.9, 0.9, top, top + swing.h + 0.3, plain('#e8e4dc', { noRender: true }));
  rbox(swing.d, swing.s, 1.7, 1.7, top, top + 0.6, plain('#2f6fb0'));
  // Schiffschaukel: Achse oben im A-Gestell (Beine: pier.js), Einstieg darunter
  const ship = { d: 116, s: -30, h: 15, L: 12.6 };
  span(ship.d - 4.6, ship.d + 4.6, ship.s - 0.55, ship.s + 0.55, top + ship.h - 0.6, top + ship.h + 0.6, plain('#9a949e', { noWallrun: true }));
  span(ship.d - 3, ship.d + 3, ship.s - 6.5, ship.s + 6.5, top, top + 0.45, plain('#2f6fb0'));
  // Freifallturm: Schaft und Krone (oben landen, einhaken), die Gondel fährt am Schaft (amusement.js)
  const drop = { d: 172, s: -36, H: 58 };
  rbox(drop.d, drop.s, 1.3, 1.3, top, top + drop.H, plain('#3a3644', { noRender: true }));
  rbox(drop.d, drop.s, 2.6, 2.6, top + drop.H, top + drop.H + 3, plain('#c8352b', { noRender: true }));
  rbox(drop.d, drop.s, 5.2, 5.2, top, top + 0.5, plain('#9a949e'));
  // Rutschturm: oben eine Hütte, die Rutsche windet sich gegen die Uhr 2¼-mal hinunter und endet Richtung Riesenrad;
  // ihre Mittellinie ist eine Grind-Linie
  const slide = { d: 172, s: -15, r: 3.8, turns: 2.25, h: 16.6, end: Math.PI / 2, pts: [] };
  rbox(slide.d, slide.s, 2.3, 2.3, top, top + slide.h + 3, plain('#e8e4dc', { noRender: true }));
  for (let k = 0; k <= 144; k++) {
    const u = k / 144, ph = slide.end - (1 - u) * slide.turns * Math.PI * 2, y = top + slide.h - u * (slide.h - 0.75);
    const p = F.at(slide.d + Math.cos(ph) * slide.r, slide.s + Math.sin(ph) * slide.r);
    slide.pts.push({ x: p.x, y: y + 0.12, z: p.z });
  }
  for (let k = 1; k <= 4; k++) { const p = F.at(slide.d - k, slide.s + slide.r); slide.pts.push({ x: p.x, y: top + 0.87 - k * 0.07, z: p.z }); }

  // Kioske an der Flaniermeile (Front zur Meile hin, +s) und Spielbuden am Ostgeländer unter der Achterbahn (Front −s)
  const kiosks = [];
  const kiosk = (d, s, hd, hz, h, col, label, face = 1) => {
    if (face < 0 && !free(d, s, hd + 1.2)) return;
    span(d - hd, d + hd, s - hz, s + hz, top, top + h, plain(col));
    span(d - hd - 0.3, d + hd + 0.3, s - hz - 0.3, s + hz + 0.3, top + h, top + h + 0.35, plain('#e8e4dc', { noWallrun: true }));
    kiosks.push({ d, s, hd, hz, h, col, label, face });
  };
  kiosk(6.6, -12, 2, 2, 3, '#2f6fb0', 'KASSE');
  kiosk(36, -11.6, 3.5, 2.4, 3.4, '#e08a1e', 'EIS');
  kiosk(68, -11.6, 3.5, 2.4, 3.4, '#2c8a4e', 'POPCORN');
  kiosk(100, -11.6, 3.5, 2.4, 3.4, '#c8352b', 'CHURROS');
  kiosk(128, -11.6, 3.5, 2.4, 3.4, '#1f9aa6', 'LIMO');
  [['LOSE', '#8a3a7a'], ['DOSENWERFEN', '#2f6fb0'], ['ENTENANGELN', '#1f9aa6'], ['ZUCKERWATTE', '#e86aa8'], ['MANDELN', '#a8541a']].forEach(([label, col], k) => kiosk(60 + 16 * k, hs - 3.4, 3.5, 2.4, 3.4, col, label, -1));
  // Laternen beiderseits der Meile, dazwischen Lichterketten über Kreuz (die Ketten sind Grind-Linien)
  const poles = [], festoons = [], PH = top + 6.5;
  for (let k = 0; k < 8; k++) for (const s of [walk.s0 - 0.4, walk.s1 + 0.4]) poles.push({ d: 12 + 16 * k, s });
  for (let k = 0; k < 7; k++) {
    for (const [sa, sb, dy] of [[walk.s0 - 0.4, walk.s1 + 0.4, 0], [walk.s1 + 0.4, walk.s0 - 0.4, -0.3]]) {
      const A = F.at(12 + 16 * k, sa), B = F.at(28 + 16 * k, sb), sag = 0.05 * Math.hypot(B.x - A.x, B.z - A.z), line = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20; line.push({ x: A.x + (B.x - A.x) * u, y: PH + dy - sag * 4 * u * (1 - u), z: A.z + (B.z - A.z) * u }); }
      festoons.push(line);
    }
  }
  // Palmen in Kübeln, Bänke an der Meile und am Pierende (nicht in den Achterbahnstützen)
  const palms = [], benches = [];
  // Sitzplatz bei (d, s), Blick in Richtung (nd, ns): Bänke und Hocker (player.js: findSeat)
  const seat = (d, s, nd, ns, half, depth, y) => {
    const p = F.at(d, s);
    city.seats.push({ x: p.x, y: top + y, z: p.z, nx: F.ux * nd + F.tx * ns, nz: F.uz * nd + F.tz * ns, half, depth, floor: top });
  };
  for (const [d, s] of [[52, walk.s0 - 0.9], [84, walk.s0 - 0.9], [116, walk.s0 - 0.9], [36, walk.s1 + 0.9], [68, walk.s1 + 0.9], [100, walk.s1 + 0.9]]) {
    if (!free(d, s, 1.6)) continue;
    rbox(d, s, 0.8, 0.8, top, top + 0.8, plain('#8a8490'));
    palms.push({ d, s });
  }
  const bench = (d, s, along, face) => {
    if (!free(d, s, 1.8)) return;
    rbox(d, s, along ? 1.2 : 0.35, along ? 0.35 : 1.2, top, top + 0.5, plain('#7a5a40', { noRender: true, noWallrun: true }));
    benches.push({ d, s, along, face });
    seat(d, s, along ? 0 : face, along ? face : 0, 1.0, 0.42, 0.48);
  };
  for (const d of [20, 52, 84, 116]) bench(d, walk.s1 + 0.9, true, -1);
  for (const s of [-26, -4, 14, 32]) bench(L - 2.2, s, false, 1);
  // Sitzplätze hinter dem Riesenrad, Fernrohre am Ende, Fahnen am Geländer
  const tables = [];
  for (const d of [154, 164, 174, 184]) {
    for (const s of [1, 10]) {
      rbox(d, s, 0.7, 0.7, top, top + 0.78, plain('#e8e4dc', { noRender: true, noWallrun: true }));
      tables.push({ d, s });
      for (let k = 0; k < 4; k++) { // die Hocker rund um den Tisch (pier.js)
        const a = (k / 4) * Math.PI * 2 + 0.4;
        seat(d + Math.cos(a) * 1.2, s + Math.sin(a) * 1.2, -Math.cos(a), -Math.sin(a), 0.03, 0.34, 0.46);
      }
    }
  }
  const scopes = [[L - 1.6, -14], [L - 1.6, 23]];
  for (const [d, s] of scopes) rbox(d, s, 0.25, 0.25, top, top + 1.3, plain('#2f6fb0', { noRender: true, noWallrun: true }));
  const flags = [];
  for (let d = 8; d < L; d += 12) for (const s of [-hs + 0.5, hs - 0.5]) flags.push({ d, s });
  for (let s = -hs + 8; s < hs; s += 12) flags.push({ d: L - 0.5, s });
  // Riesenballons: Ankerblöcke auf dem Deck, die Ballons schweben an Leinen darüber (aerial.js)
  const balloons = [
    { kind: 'star', d: 24, s: -16.5, h: 30 },
    { kind: 'cat', d: 88, s: -1, h: 40 },
    { kind: 'whale', d: 178, s: 6, h: 46 },
  ];
  for (const b of balloons) rbox(b.d, b.s, 0.7, 0.7, top, top + 0.9, plain('#3a3644', { noRender: true }));

  const c = F.at(L / 2, 0);
  return {
    F, top, L, hs, walk, gap, center: { x: c.x, z: c.z }, rails, wheel: W, station: [ctrl[0], ctrl[1]],
    coaster: pts.map((p) => ({ x: p.x, y: p.y + 0.45, z: p.z })), track: pts,
    arch, hall, carousel, swing, ship, drop, slide, kiosks, poles, festoons, palms, benches, tables, scopes, flags, balloons,
  };
}

// Windräder: auf dem Strand rund um die Insel (nicht bei Hafen und Pier) und in Parks der Wohnviertel. Der Turm ist eine
// unsichtbare Stadtbox (Kollision, Haken) – Turm, Gondel und Rotor zeichnet aerial.js, die Blätter drehen sich dort als
// bewegte Ankerpunkte.
function placeTurbines(city, avoid) {
  const out = [];
  for (let k = 0; k < 16; k += 2) {
    const th = (k / 16) * Math.PI * 2 + 0.2;
    if (avoid.some((a) => Math.abs(Math.atan2(Math.sin(th - a), Math.cos(th - a))) < 0.36)) continue;
    const ux = Math.cos(th), uz = Math.sin(th), r = city.coastR(ux, uz) - 18;
    out.push({ x: ux * r, z: uz * r, h: 72 });
  }
  let inPark = 0;
  for (const p of city.parks) {
    const b = p.blob, dn = Math.hypot(b.x, b.z) / city.coastR(b.x, b.z);
    if (p.central || dn < 0.55 || inPark >= 3) continue;
    const x = b.x + b.R * 0.42, z = b.z - b.R * 0.28;
    if (city.terrain.waterLevel(x, z) > city.terrain.height(x, z) - 0.2) continue;
    out.push({ x, z, h: 64 });
    inPark++;
  }
  for (const t of out) {
    clearArea(city, (x, z) => Math.hypot(x - t.x, z - t.z) < 5);
    t.base = city.terrain.height(t.x, t.z);
    city.addBox(t.x - 1.4, t.base, t.z - 1.4, t.x + 1.4, t.base + t.h, t.z + 1.4, plain('#e8e4dc', { noWallrun: true, noRender: true }));
  }
  return out;
}

// Riesenbaum im größten Park der Wohnviertel (ohne Windrad): dicker Stamm (Kollision als Achtecke), fünf fast waagrechte
// Äste zum Draufstehen und Entlanggrinden, oben große Laubkugeln mit unsichtbaren Boxen darin (einhaken, landen). Die
// Optik baut treeMeshes.
function placeGiantTree(city, turbines) {
  let park = null;
  for (const p of city.parks) {
    const b = p.blob, dn = Math.hypot(b.x, b.z) / city.coastR(b.x, b.z);
    if (p.central || dn < 0.5 || b.R < 28) continue;
    if (turbines.some((t) => Math.hypot(t.x - b.x, t.z - b.z) < b.R + 40)) continue;
    if (!park || b.R > park.blob.R) park = p;
  }
  if (!park) return null;
  const b = park.blob, rr = mulberryLite(31);
  let pos = null;
  for (let k = 0; k < 16 && !pos; k++) {
    const a = (k / 16) * Math.PI * 2, x = b.x + Math.cos(a) * b.R * 0.22, z = b.z + Math.sin(a) * b.R * 0.22;
    if (park.pond && Math.hypot(x - park.pond.x, z - park.pond.z) < park.pond.R + 16) continue;
    pos = { x, z };
  }
  if (!pos) return null;
  const { x, z } = pos, base = city.terrain.height(x, z), bark = plain('#6a4a32', { noRender: true });
  clearArea(city, (px, pz) => Math.hypot(px - x, pz - z) < 30);
  // Stamm: vier Ringe, je zwei um 45° gedrehte Quadrate
  const trunk = [[0, 12, 5.0], [12, 26, 4.3], [26, 40, 3.6], [40, 52, 3.0]];
  for (const [y0, y1, r] of trunk) for (const a of [0, Math.PI / 4]) city.addRotatedBox(x, z, r * 0.93, r * 0.93, a, base + y0, base + y1, bark);
  // Äste (Oberkante begehbar und als Grind-Linie), Laubkugeln an den Spitzen und oben
  const branches = [], blobs = [], a0 = rr() * Math.PI * 2;
  [24, 29, 33, 37, 41].forEach((y, k) => {
    const ang = a0 + k * 2.4 + (rr() - 0.5) * 0.5, len = 20 + rr() * 7, ux = Math.cos(ang), uz = Math.sin(ang);
    const r0 = 4.6 - y * 0.035, yb = base + y;
    city.addRotatedBox(x + ux * (r0 + len / 2), z + uz * (r0 + len / 2), len / 2, 1.3, ang, yb - 1.0, yb + 1.0, plain('#6a4a32', { noRender: true }));
    branches.push({ ang, y: yb, r0, len, grind: [{ x: x + ux * r0, y: yb + 1.0, z: z + uz * r0 }, { x: x + ux * (r0 + len), y: yb + 1.0, z: z + uz * (r0 + len) }] });
    blobs.push({ x: x + ux * (r0 + len - 2), y: yb + 7, z: z + uz * (r0 + len - 2), r: 11 + rr() * 3 });
    blobs.push({ x: x + ux * (r0 + len * 0.45), y: yb + 13, z: z + uz * (r0 + len * 0.45), r: 9 + rr() * 2 });
  });
  for (let k = 0; k < 3; k++) { const a = a0 + k * 2.1; blobs.push({ x: x + Math.cos(a) * 7, y: base + 56 + k * 3, z: z + Math.sin(a) * 7, r: 15 + rr() * 3 }); }
  for (const f of blobs) { const h = f.r * 0.55; city.addBox(f.x - h, f.y - h, f.z - h, f.x + h, f.y + h, f.z + h, plain('#3f8a3a', { noRender: true, noWallrun: true })); }
  return { x, z, base, trunk, branches, blobs };
}

// Optik des Riesenbaums: Stamm mit Borke und Wurzeln, Äste, Laubkugeln, Laternen unter den Ästen
function treeMeshes(T, group) {
  const rr = mulberryLite(53), wood = [], leaves = [], lights = [];
  // Unebenheit als Funktion des Ortes (doppelte Ecken an Nähten bekommen denselben Wert – keine Risse)
  const bump = (x, y, z, amp) => 1 + amp * ((Math.abs(Math.sin(x * 12.99 + y * 78.23 + z * 37.72) * 43758.55) % 1) - 0.5);
  const g = new THREE.CylinderGeometry(2.9, 5.3, 54, 18, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = bump(pos.getX(i), pos.getY(i), pos.getZ(i), 0.08); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k); }
  wood.push(colored(g.translate(T.x, T.base + 27, T.z), '#6a4a32'));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rr() * 0.4;
    wood.push(colored(new THREE.ConeGeometry(2.3, 10, 7).translate(0, 5, 0).rotateZ(-1.77).rotateY(-a).translate(T.x + Math.cos(a) * 3.2, T.base + 1.2, T.z + Math.sin(a) * 3.2), '#5e4230'));
  }
  for (const b of T.branches) {
    const ux = Math.cos(b.ang), uz = Math.sin(b.ang);
    // drei Stücke, die Oberkante bleibt auf der Lauf- und Grind-Höhe (b.y + 1), unten verjüngt sich der Ast
    for (let s = 0; s < 3; s++) {
      const u0 = s / 3, u1 = (s + 1) / 3, rA = 1.45 - s * 0.32, rB = rA - 0.3;
      const A = new THREE.Vector3(T.x + ux * (b.r0 - 1 + b.len * u0), b.y + 1.0 - rA, T.z + uz * (b.r0 - 1 + b.len * u0));
      const B = new THREE.Vector3(T.x + ux * (b.r0 - 1 + b.len * u1), b.y + 1.0 - rB, T.z + uz * (b.r0 - 1 + b.len * u1));
      const d = B.clone().sub(A), len = d.length();
      const c = new THREE.CylinderGeometry(rB, rA, len + 0.5, 10).translate(0, len / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate(A.x, A.y, A.z);
      wood.push(colored(c, s % 2 ? '#6a4a32' : '#634530'));
    }
    // Laterne an einer kurzen Schnur unter dem Ast
    const lx = T.x + ux * (b.r0 + b.len * 0.6), lz = T.z + uz * (b.r0 + b.len * 0.6);
    wood.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4).translate(lx, b.y - 1.6, lz), '#2a2630'));
    lights.push(colored(new THREE.SphereGeometry(0.45, 10, 8).translate(lx, b.y - 3.0, lz), '#ffcf7a'));
  }
  const greens = ['#3f8a3a', '#4f9e44', '#357a34', '#5aa84a'];
  for (const f of T.blobs) {
    for (let k = 0; k < 3; k++) {
      const s = f.r * (k ? 0.62 : 1), ox = k ? (rr() - 0.5) * f.r : 0, oy = k ? rr() * f.r * 0.4 : 0, oz = k ? (rr() - 0.5) * f.r : 0;
      // runde Laubkugel mit sanften Beulen (glatte Normalen statt Facetten)
      const ball = new THREE.SphereGeometry(1, 22, 16), p = ball.attributes.position, seed = rr() * 10;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const j = 1 + 0.14 * Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.3) * Math.sin(z * 2.9 - seed) + 0.09 * Math.sin(x * 6.7 + y * 5.9 + z * 6.3 + seed * 2);
        p.setXYZ(i, x * j, y * j * 0.8, z * j);
      }
      ball.computeVertexNormals();
      leaves.push(colored(ball.scale(s, s, s).translate(f.x + ox, f.y + oy, f.z + oz), greens[Math.floor(rr() * greens.length)]));
    }
  }
  const W = new THREE.Mesh(mergeGeometries(wood), toonMaterial('#ffffff', { vertexColors: true, rim: 0.2, flatShading: true }));
  const Lv = new THREE.Mesh(mergeGeometries(leaves), toonMaterial('#ffffff', { vertexColors: true, rim: 0.25, pbr: { roughness: 0.85, hook: leafHook, key: 'leaf', a2c: true } }));
  const Lt = new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.6, 2.4, 2) }));
  W.castShadow = Lv.castShadow = true;
  W.receiveShadow = Lv.receiveShadow = true;
  for (const x of [...wood, ...leaves, ...lights]) x.dispose();
  group.add(W, Lv, Lt);
}

// Optik der Wahrzeichen (nach buildDecor): Riesenbaum, Leuchtturm-Insel (islet.js)
export function landmarkMeshes(city) {
  const D = city.landmarkData, group = new THREE.Group();
  if (D?.tree) treeMeshes(D.tree, group);
  if (D?.islet) isletMeshes(D.islet, group, city);
  if (D?.harbor?.stacked.length) group.add(containerMesh(D.harbor.stacked));
  return group;
}

// kleiner Zufall nur für die Optik (unabhängig vom Stadt-Seed-Verlauf)
function mulberryLite(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
