import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { colored, box } from './mover.js';
import { WATER_Y } from './terrain.js';
import { Rock } from './rock.js';
import { leafHook, rockHook } from './foliage.js';

// Leuchtturm-Insel: Felsmassiv (rock.js) mit Plateau, Terrasse und Felsweg, dazu der rot-weiße Leuchtturm mit Galerie
// und Laterne, ein Wärterhaus, ein Bootssteg und Sträucher. Fest sind nur Dinge, die man auch sieht: Der Fels ist das
// Höhenfeld selbst, Turm und Haus sind unsichtbare Stadtboxen genau um ihre Modelle (Haken, Wandlauf, Sitzen).

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
// glattes Wertrauschen (nur für die Facettenfarben)
const vnoise = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// Turm-Maße über dem Fuß T: Radius unten → oben, Galerie, Laterne, Dach
const TOWER = { r0: 3.5, r1: 2.6, y0: 1.6, y1: 34.6, gallery: 36.15, lantern: 40.25, tip: 42.65 };

// Regelmäßiges Achteck aus vier gedrehten Quadern: Grundfläche Radius r (Abstand der Seiten zur Mitte)
function octagon(city, x, z, r, y0, y1, look) {
  for (let k = 0; k < 4; k++) city.addRotatedBox(x, z, r, r * 0.4142, (k * Math.PI) / 4, y0, y1, look);
}

export function buildIslet(city, F, plain, rand) {
  const dI = 112, R = 34, top = 7, lc = F.at(dI, 0);
  // der Felsweg führt zur Küste hin hinunter
  const th0 = Math.atan2(-F.uz, -F.ux);
  const rock = (city.terrain.rock = new Rock(lc.x, lc.z, R, top, th0, rand));
  const T = rock.height(lc.x, lc.z), hide = (hex, extra = {}) => ({ ...plain(hex), noRender: true, ...extra });
  // Turm: drei Stufen, Galerie (begehbar), Laterne, Dachspitze
  octagon(city, lc.x, lc.z, 4.05, T - 1, T + 1.6, hide('#8a8590'));
  octagon(city, lc.x, lc.z, 3.35, T + 1.6, T + 12, hide('#e8e4dc'));
  octagon(city, lc.x, lc.z, 3.05, T + 12, T + 24, hide('#e8e4dc'));
  octagon(city, lc.x, lc.z, 2.75, T + 24, T + TOWER.y1, hide('#e8e4dc'));
  octagon(city, lc.x, lc.z, 4.2, T + TOWER.y1 + 1.2, T + TOWER.gallery, hide('#2a2630', { noWallrun: true }));
  octagon(city, lc.x, lc.z, 2.2, T + TOWER.gallery, T + TOWER.lantern, hide('#2a2630', { noWallrun: true }));
  octagon(city, lc.x, lc.z, 1.3, T + TOWER.lantern, T + TOWER.tip - 0.3, hide('#c8352b', { noWallrun: true }));
  // Wärterhaus: Wände und zwei Stufen für das Satteldach (First quer zum Blick auf den Turm)
  const H = rock.hut, hc = Math.cos(H.a), hs = Math.sin(H.a);
  H.y = Math.min(rock.height(H.x, H.z), rock.height(H.x + hc * 3, H.z + hs * 3), rock.height(H.x - hc * 3, H.z - hs * 3), rock.height(H.x - hs * 4, H.z + hc * 4), rock.height(H.x + hs * 4, H.z - hc * 4)) - 0.15;
  const wall = H.y + 3.1, ridge = wall + 1.9;
  city.addRotatedBox(H.x, H.z, 2.7, 4.1, H.a, H.y - 1, wall, hide('#e8e2d6'));
  city.addRotatedBox(H.x, H.z, 1.6, 4.5, H.a, wall, wall + 0.75, hide('#a8452e', { noWallrun: true }));
  city.addRotatedBox(H.x, H.z, 0.7, 4.5, H.a, wall + 0.75, wall + 1.5, hide('#a8452e', { noWallrun: true }));
  H.ridge = ridge;
  // Bootssteg am Ende des Felswegs
  const rB = rock.radius(th0), cx = Math.cos(th0), cz = Math.sin(th0);
  const J = { r0: rB * 0.91, r1: rB * 1.27, y: WATER_Y + 1.25, cx, cz, th: th0 };
  const rm = (J.r0 + J.r1) / 2;
  city.addRotatedBox(lc.x + cx * rm, lc.z + cz * rm, (J.r1 - J.r0) / 2, 1.2, th0, J.y - 0.25, J.y, hide('#7a5a40', { noWallrun: true }));
  // kleines Boot längsseits am Steg
  const Bt = { x: lc.x + cx * (J.r1 - 3.6) - cz * 2.6, z: lc.z + cz * (J.r1 - 3.6) + cx * 2.6, a: th0 };
  city.addRotatedBox(Bt.x, Bt.z, 2.3, 0.75, th0, WATER_Y - 0.4, WATER_Y + 0.5, hide('#d8d2c8', { noWallrun: true }));
  return { F, lc, T, rock, th0, jetty: J, boat: Bt, top };
}

// Satteldach: Grundfläche w × d auf y = 0, First in Längsrichtung (z)
function prism(w, h, d) {
  const a = w / 2, b = d / 2, V = [[-a, 0, -b], [a, 0, -b], [0, h, -b], [-a, 0, b], [a, 0, b], [0, h, b]];
  const T = [[0, 2, 1], [3, 4, 5], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4], [0, 1, 4], [0, 4, 3]];
  const pos = new Float32Array(T.length * 9);
  T.forEach((t, i) => t.forEach((v, j) => pos.set(V[v], i * 9 + j * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(T.length * 6), 2)); // wie die übrigen Bauteile
  g.computeVertexNormals();
  return g;
}

// Felsmassiv: Polargitter über dieselbe Höhenfunktion wie die Physik. Die Ringe folgen den Klippen (dort dicht), die
// Facetten sind flach schattiert und bekommen die Farbe aus Lage und Steigung: Gras oben, Moos auf der Terrasse, Fels
// mit Gesteinsbändern, dunkler, nasser Algensaum am Wasser, heller Kies auf dem Weg.
const G2 = new THREE.Vector2();
function rockGeometry(rock) {
  const SEG = 420;
  const W = WATER_Y;
  const rings = (th) => {
    const a = rock.cliffA(th), b = rock.cliffB(th), out = [];
    const add = (r0, r1, n) => { for (let k = 0; k < n; k++) out.push(r0 + ((r1 - r0) * k) / n); };
    add(0, a - 0.02, 14);
    add(a - 0.02, a + 0.06, 9);
    add(a + 0.06, b - 0.012, 15);
    add(b - 0.012, b + 0.05, 8);
    add(b + 0.05, 1.04, 6);
    add(1.04, 1.29, 3);
    out.push(1.29);
    return out;
  };
  const nR = rings(0).length, grid = new Float32Array(SEG * nR * 3);
  for (let i = 0; i < SEG; i++) {
    const th = (i / SEG) * Math.PI * 2, ra = rings(th), Rt = rock.radius(th);
    for (let j = 0; j < nR; j++) {
      // leichter Versatz, damit das Gitter nicht als Ringe zu lesen ist; die Höhe kommt danach aus der Funktion
      const jit = j > 0 && j < nR - 1 ? 0.28 : 0;
      const r = ra[j] * Rt + jit * (hash(i, j) - 0.5), t = th + (jit * (hash(j, i + 7) - 0.5)) / Math.max(4, r);
      const x = rock.x + Math.cos(t) * r, z = rock.z + Math.sin(t) * r, o = (i * nR + j) * 3;
      grid[o] = x;
      grid[o + 1] = rock.height(x, z);
      grid[o + 2] = z;
    }
  }
  const nT = SEG * (nR - 1) * 2, pos = new Float32Array(nT * 9), nrm = new Float32Array(nT * 9), col = new Float32Array(nT * 9);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3(), c = new THREE.Color(), c2 = new THREE.Color();
  const ROCK = new THREE.Color('#6a636e'), WARM = new THREE.Color('#766b63'), DARK = new THREE.Color('#2f2e36'), ALGAE = new THREE.Color('#34423a'), GRASS = new THREE.Color('#6d8f48'), GRASS2 = new THREE.Color('#84a053'), MOSS = new THREE.Color('#5f6f45'), LICHEN = new THREE.Color('#9c8444'), GRAVEL = new THREE.Color('#9a8d79');
  let t = 0;
  const tri = (a, b, d) => {
    A.fromArray(grid, a); B.fromArray(grid, b); C.fromArray(grid, d);
    N.subVectors(C, A).cross(E.subVectors(B, A)).normalize();
    if (N.y < 0) N.negate();
    const x = (A.x + B.x + C.x) / 3, y = (A.y + B.y + C.y) / 3, z = (A.z + B.z + C.z) / 3;
    const th = Math.atan2(z - rock.z, x - rock.x), rho = Math.hypot(x - rock.x, z - rock.z) / rock.radius(th);
    const big = vnoise(x * 0.11, z * 0.11), mid = vnoise(x * 0.37 + 9, z * 0.37), jag = vnoise(x * 1.3, z * 1.3 + 4);
    // Gesteinsbänder quer über die Steilflächen
    const band = 0.84 + 0.3 * hash(Math.floor((y + (big - 0.5) * 1.6) / 0.85), 11);
    c.copy(ROCK).lerp(WARM, big).multiplyScalar(band * (0.9 + 0.2 * jag));
    const flat = N.y;
    if (flat > 0.8) {
      if (y > rock.top - 1.7 && mid > 0.27 + 0.2 * (1 - flat)) c.copy(GRASS).lerp(GRASS2, big).multiplyScalar(0.92 + 0.16 * jag);
      else if (y > W + 2.6 && mid > 0.54) c.lerp(MOSS, 0.7);
    }
    // gelbe Flechten über der Spritzwasserzone, darunter nass und fast schwarz, an der Wasserlinie Algen
    if (y < W + 3.1 && y > W + 1.2 && vnoise(x * 0.8 + 3, z * 0.8) > 0.56) c.lerp(LICHEN, 0.62);
    const wet = 1 - smoothstep(W + 0.55, W + 1.45, y + (mid - 0.5) * 0.9);
    if (wet > 0) c.lerp(c2.copy(DARK).lerp(ALGAE, smoothstep(W - 0.6, W + 0.2, y)), wet);
    // Felsweg: heller Kies
    const wPath = (1 - smoothstep(0.1, 0.15, Math.abs(rock.dTh(th)))) * smoothstep(0.5, 0.55, rho) * (1 - smoothstep(0.92, 0.98, rho));
    if (wPath > 0.3) c.lerp(GRAVEL, 0.75);
    // Gras und Kies: glatte Normalen aus dem Höhenfeld, nur der Fels behält seine Facetten
    const smoothed = flat > 0.8 && (y > rock.top - 1.7 || wPath > 0.3);
    for (const [k, P] of [A, B, C].entries()) {
      const o = t * 9 + k * 3;
      pos[o] = P.x; pos[o + 1] = P.y; pos[o + 2] = P.z;
      if (smoothed) {
        rock.gradient(P.x, P.z, G2);
        N.set(-G2.x, 1, -G2.y).normalize();
      }
      nrm[o] = N.x; nrm[o + 1] = N.y; nrm[o + 2] = N.z;
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
    t++;
  };
  for (let i = 0; i < SEG; i++) {
    const i1 = (i + 1) % SEG;
    for (let j = 0; j < nR - 1; j++) {
      const a = (i * nR + j) * 3, b = (i1 * nR + j) * 3, d = (i * nR + j + 1) * 3, e = (i1 * nR + j + 1) * 3;
      tri(a, b, d);
      tri(b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function isletMeshes(I, group, city) {
  const rock = I.rock, { x: cx, z: cz } = I.lc, T = I.T;
  const m = new THREE.Mesh(rockGeometry(rock), toonMaterial('#ffffff', { vertexColors: true, rim: 0.12, pbr: { roughness: 0.92, hook: rockHook, key: 'rock' } }));
  m.castShadow = m.receiveShadow = true;
  group.add(m);

  const G = [];
  const rs = (th, r, y) => [cx + Math.cos(th) * r, y, cz + Math.sin(th) * r];
  // Bauteil am Turm: lokale z-Achse zeigt nach außen
  const radial = (g, th, r, y, col) => { const p = rs(th, r, y); G.push(colored(g.rotateY(Math.PI / 2 - th).translate(p[0], p[1], p[2]), col)); };
  const cyl = (r0, r1, h, y, col, seg = 32) => G.push(colored(new THREE.CylinderGeometry(r1, r0, h, seg).translate(cx, y + h / 2, cz), col));
  const { r0, r1, y0, y1 } = TOWER, rAt = (y) => r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  // Sockel aus Stein
  cyl(4.3, 4.15, 1.0, T - 0.5, '#7d7883');
  cyl(4.05, 3.65, 1.1, T + 0.5, '#d4cec3');
  // Schaft: sechs Bänder, rot und weiß, dazwischen feine Fugen
  const bands = 6, bh = (y1 - y0) / bands;
  for (let k = 0; k < bands; k++) {
    const a = y0 + k * bh, b = a + bh;
    cyl(rAt(a), rAt(b), bh, T + a, k % 2 ? '#ece8df' : '#c8352b');
    cyl(rAt(a) + 0.03, rAt(a) + 0.015, 0.1, T + a - 0.05, '#2a2630');
  }
  // Tür zum Felsweg, Vordach, kleine Treppe
  const door = I.th0;
  radial(box(1.7, 2.9, 0.3, 0, 0, 0), door, 3.78, T + 1.25, '#d4cec3');
  radial(box(1.25, 2.45, 0.34, 0, 0, 0), door, 3.82, T + 1.05, '#2f4a5e');
  radial(box(1.9, 0.12, 0.7, 0, 0, 0), door, 4.1, T + 2.76, '#2a2630');
  for (let k = 0; k < 2; k++) radial(box(2.1 - k * 0.3, 0.16, 0.5, 0, 0, 0), door, 4.6 - k * 0.3, T + 0.08 + k * 0.16, '#7d7883');
  // Fenster steigen spiralförmig den Schaft hinauf
  for (let k = 0; k < 7; k++) {
    const y = y0 + 3.6 + k * 4.45, th = door + 0.9 + k * 2.2, r = rAt(y) + 0.02;
    radial(box(0.86, 1.46, 0.14, 0, 0, 0), th, r, T + y, '#d4cec3');
    radial(box(0.58, 1.16, 0.16, 0, 0, 0), th, r + 0.02, T + y, '#26303c');
  }
  // Konsole, Galerie, Geländer
  G.push(colored(new THREE.CylinderGeometry(4.1, r1, 1.2, 32).translate(cx, T + y1 + 0.6, cz), '#ece8df'));
  cyl(4.35, 4.35, 0.35, T + TOWER.gallery - 0.35, '#2a2630');
  for (let k = 0; k < 24; k++) {
    const th = (k / 24) * Math.PI * 2, p = rs(th, 4.2, T + TOWER.gallery + 0.55);
    G.push(colored(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 5).translate(p[0], p[1], p[2]), '#2a2630'));
  }
  for (const y of [0.55, 1.1]) G.push(colored(new THREE.TorusGeometry(4.2, 0.04, 5, 48).rotateX(Math.PI / 2).translate(cx, T + TOWER.gallery + y, cz), '#2a2630'));
  // Laterne: Fuß, Sprossen, Dach mit Knauf und Blitzableiter
  cyl(2.3, 2.3, 0.85, T + TOWER.gallery, '#ece8df');
  cyl(2.45, 2.45, 0.1, T + TOWER.gallery + 0.85, '#2a2630');
  for (let k = 0; k < 10; k++) {
    const th = (k / 10) * Math.PI * 2, p = rs(th, 2.12, T + (TOWER.gallery + 0.9 + TOWER.lantern) / 2);
    G.push(colored(new THREE.CylinderGeometry(0.05, 0.05, TOWER.lantern - TOWER.gallery - 0.9, 5).translate(p[0], p[1], p[2]), '#2a2630'));
  }
  G.push(colored(new THREE.ConeGeometry(2.75, 2.4, 32).translate(cx, T + TOWER.lantern + 1.2, cz), '#c8352b'));
  G.push(colored(new THREE.SphereGeometry(0.3, 12, 8).translate(cx, T + TOWER.tip - 0.1, cz), '#2a2630'));
  G.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5).translate(cx, T + TOWER.tip + 0.7, cz), '#2a2630'));

  // Wärterhaus
  const H = rock.hut, hr = Math.PI / 2 - H.a, W = H.y + 3.1;
  const hut = (g, x, y, z, col) => { // x: zum Turm/weg vom Turm, z: entlang der langen Seite
    const lx = Math.cos(H.a) * z + -Math.sin(H.a) * x, lz = Math.sin(H.a) * z + Math.cos(H.a) * x;
    G.push(colored(g.rotateY(hr).translate(H.x + lx, y, H.z + lz), col));
  };
  hut(box(8.2, 3.6, 5.4, 0, 0, 0), 0, H.y + 1.3, 0, '#e8e2d6');          // Wände
  hut(box(8.34, 0.42, 5.54, 0, 0, 0), 0, H.y + 0.55, 0, '#8a8590');      // Natursteinsockel
  const roof = prism(6.3, 1.95, 9.1);
  G.push(colored(roof.rotateY(Math.PI / 2 + hr).translate(H.x, W, H.z), '#a8452e'));
  hut(box(0.9, 2.2, 0.9, 0, 0, 0), 2.4, W + 1.2, 1.1, '#8a8590');        // Schornstein
  hut(box(1.06, 0.16, 1.06, 0, 0, 0), 2.4, W + 2.3, 1.1, '#3a3640');
  hut(box(1.25, 2.3, 0.16, 0, 0, 0), 1.0, H.y + 1.35, -2.72, '#2f4a5e');  // Tür zum Turm hin
  hut(box(1.6, 0.14, 0.9, 0, 0, 0), 1.0, H.y + 2.65, -3.05, '#3a3640');   // Vordach
  for (const x of [-2.5]) {
    hut(box(1.35, 1.25, 0.1, 0, 0, 0), x, H.y + 1.9, -2.72, '#d4cec3');
    hut(box(1.1, 1.0, 0.12, 0, 0, 0), x, H.y + 1.9, -2.74, '#26303c');
  }
  for (const x of [-2.5, 1.8]) {
    hut(box(1.35, 1.25, 0.1, 0, 0, 0), x, H.y + 1.9, 2.72, '#d4cec3');
    hut(box(1.1, 1.0, 0.12, 0, 0, 0), x, H.y + 1.9, 2.74, '#26303c');
  }
  for (const s of [-1, 1]) {
    hut(box(0.1, 1.25, 1.35, 0, 0, 0), s * 4.12, H.y + 1.9, 0, '#d4cec3');
    hut(box(0.12, 1.0, 1.1, 0, 0, 0), s * 4.14, H.y + 1.9, 0, '#26303c');
  }

  // Felsweg: Holzstufen, Pfosten und Handlauf-Seile
  const J = I.jetty, Rb = rock.radius(I.th0), dirx = Math.cos(I.th0), dirz = Math.sin(I.th0);
  const perp = (d) => [-dirz * d, dirx * d];
  const posts = [[], []];
  let kk = 0;
  for (let rho = 0.53; rho < 0.92; rho += 0.0175) {
    const r = Rb * rho, x = cx + dirx * r, z = cz + dirz * r, y = rock.height(x, z);
    G.push(colored(box(0.5, 0.09, 3.1, 0, 0, 0).rotateY(-I.th0).translate(x, y + 0.03, z), '#7a5f46'));
    if (kk++ % 4 === 0) {
      [-1.75, 1.75].forEach((d, s) => {
        const [ox, oz] = perp(d), px = x + ox, pz = z + oz, py = rock.height(px, pz);
        G.push(colored(new THREE.CylinderGeometry(0.06, 0.07, 1.15, 6).translate(px, py + 0.5, pz), '#5e4a38'));
        posts[s].push(new THREE.Vector3(px, py + 1.02, pz));
      });
    }
  }
  const rope = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(0.025, 0.025, len, 4).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate(a.x, a.y, a.z);
    G.push(colored(g, '#c9b78f'));
  };
  for (const line of posts) for (let k = 1; k < line.length; k++) rope(line[k - 1], line[k]);
  // Bootssteg: Planken und Pfähle
  for (let r = J.r0; r < J.r1; r += 0.62) {
    const x = cx + dirx * r, z = cz + dirz * r, shade = hash(r, 5) * 0.08;
    G.push(colored(box(0.56, 0.1, 2.4, 0, 0, 0).rotateY(-I.th0).translate(x, J.y - 0.05, z), new THREE.Color(0.5 + shade, 0.38 + shade, 0.27 + shade).getHex()));
  }
  for (let r = J.r0 + 1.4; r < J.r1 + 0.1; r += 3.1) {
    for (const d of [-1.28, 1.28]) {
      const [ox, oz] = perp(d);
      G.push(colored(new THREE.CylinderGeometry(0.13, 0.15, 7, 8).translate(cx + dirx * r + ox, J.y - 2.8, cz + dirz * r + oz), '#4e4034'));
    }
  }
  // Ruderboot: spitz zulaufender Rumpf, Bänke
  const B = I.boat, hull = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI * 2);
  const hp = hull.attributes.position;
  for (let k = 0; k < hp.count; k++) {
    const u = hp.getX(k), v = hp.getZ(k), yy = hp.getY(k), low = yy < 0 ? 0.62 : 1;
    hp.setXYZ(k, u * 2.35 * low, yy * 0.55, v * 0.8 * low * (1 - 0.25 * u * u));
  }
  hull.computeVertexNormals();
  const place = (g, y, col) => G.push(colored(g.rotateY(-B.a).translate(B.x, WATER_Y + y, B.z), col));
  place(hull, 0.18, '#e4ddd0');
  place(new THREE.CylinderGeometry(1, 1, 0.1, 14).scale(2.2, 1, 0.68), 0.47, '#55443a');
  for (const u of [-0.9, 0.6]) place(box(0.34, 0.08, 1.3, u, 0, 0), 0.58, '#7a5f46');

  // Sträucher auf dem Plateau, in Lee der Häuser
  const shrubs = [], gr = ['#4f7a3c', '#5e8a42', '#47703a', '#6a9048'];
  for (let k = 0; k < 18; k++) {
    const th = hash(k, 21) * Math.PI * 2, rho = 0.26 + hash(k, 22) * 0.34, r = rock.radius(th) * rho, x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
    if (Math.abs(rock.dTh(th)) < 0.28 || Math.hypot(x - H.x, z - H.z) < 7) continue;
    const s = 0.6 + hash(k, 23) * 0.8, ball = new THREE.SphereGeometry(1, 14, 10), p = ball.attributes.position;
    for (let i = 0; i < p.count; i++) { const j = 0.88 + 0.24 * vnoise(p.getX(i) * 2.2 + k * 3, p.getY(i) * 2.2 + p.getZ(i) * 2.2); p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.74, p.getZ(i) * j); }
    ball.computeVertexNormals();
    shrubs.push(colored(ball.scale(s, s, s).translate(x, rock.height(x, z) + s * 0.35, z), gr[k % 4]));
  }
  const towerMesh = new THREE.Mesh(mergeGeometries(G), toonMaterial('#ffffff', { vertexColors: true, rim: 0.28, pbr: { roughness: 0.7 } }));
  towerMesh.castShadow = towerMesh.receiveShadow = true;
  group.add(towerMesh);
  if (shrubs.length) {
    const sm = new THREE.Mesh(mergeGeometries(shrubs), toonMaterial('#ffffff', { vertexColors: true, rim: 0.2, pbr: { roughness: 0.85, hook: leafHook, key: 'leaf', a2c: true } }));
    sm.castShadow = sm.receiveShadow = true;
    group.add(sm);
  }
  for (const g of [...G, ...shrubs]) g.dispose();

  // Laterne und Lichtkegel: nachts an, tagsüber aus (city.js: setDaylight)
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.25, 0.28) });
  const lanternY = T + (TOWER.gallery + 0.9 + TOWER.lantern) / 2, lanternH = TOWER.lantern - TOWER.gallery - 0.9;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, lanternH, 24).translate(cx, lanternY, cz), lampMat);
  // Lichtkegel: läuft mit der Entfernung aus, zum Rand hin weich (kein harter Kegelmantel, kein sichtbares Ende)
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1, 0.92, 0.7) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vL;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vL = abs(position.x) / 140.0;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalMatrix * normal;
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vL;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float along = 1.0 - vL;
        float soft = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = uOpacity * soft * along * along * (0.4 + 0.6 * smoothstep(0.0, 0.05, vL));
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const beamGeo = new THREE.ConeGeometry(9, 140, 20, 1, true).rotateZ(Math.PI / 2).translate(70, 0, 0);
  const beam = new THREE.Group();
  beam.add(new THREE.Mesh(beamGeo, beamMat), new THREE.Mesh(beamGeo.clone().rotateY(Math.PI), beamMat));
  beam.position.set(cx, lanternY, cz);
  group.add(lamp, beam);
  city.lighthouse = { beam, beamMat, lampMat };
}
