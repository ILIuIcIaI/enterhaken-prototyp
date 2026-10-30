import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { colored, box } from './mover.js';

// Optik des Stadions (Ränge, Dachring, Masten und Tafel sind Stadtboxen: city.js addStadium): Rasen mit Mähstreifen und
// Spielfeldlinien, Laufbahn rundherum, leuchtende Flutlichtstrahler, Anzeigetafel mit Spielstand.
export function stadiumMeshes(city) {
  const S = city.stadiumData, group = new THREE.Group();
  if (!S) return group;
  const { cx, cz, A, Bz } = S, flat = [], glow = [];
  const quad = (x0, z0, x1, z1, y, col) => flat.push(colored(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate(cx + (x0 + x1) / 2, y, cz + (z0 + z1) / 2), col));
  // Innenraum und Laufbahn als Ellipsen
  flat.push(colored(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2).scale(A * 0.66, 1, Bz * 0.66).translate(cx, 0.04, cz), '#b8503a'));
  flat.push(colored(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2).scale(A * 0.53, 1, Bz * 0.53).translate(cx, 0.06, cz), '#4f9e44'));
  for (const s of [0.565, 0.6, 0.635]) flat.push(colored(new THREE.RingGeometry(s - 0.003, s + 0.003, 64).rotateX(-Math.PI / 2).scale(A, 1, Bz).translate(cx, 0.05, cz), '#f4f0ea'));
  // Spielfeld: Mähstreifen, Außenlinien, Mittellinie, Mittelkreis, Strafräume, Tore
  const fx = A * 0.48, fz = Bz * 0.38;
  for (let k = 0; k < 10; k++) quad(-fx + (k * 2 * fx) / 10, -fz, -fx + ((k + 1) * 2 * fx) / 10, fz, 0.08, k % 2 ? '#4f9e44' : '#5aae4c');
  const line = (x0, z0, x1, z1) => quad(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12, 0.1, '#f4f0ea');
  line(-fx, -fz, fx, -fz); line(-fx, fz, fx, fz); line(-fx, -fz, -fx, fz); line(fx, -fz, fx, fz); line(0, -fz, 0, fz);
  for (const s of [-1, 1]) { line(s * fx, -8, s * (fx - 7), -8); line(s * fx, 8, s * (fx - 7), 8); line(s * (fx - 7), -8, s * (fx - 7), 8); }
  flat.push(colored(new THREE.RingGeometry(5.3, 5.55, 48).rotateX(-Math.PI / 2).translate(cx, 0.1, cz), '#f4f0ea'));
  const solid = [];
  for (const s of [-1, 1]) {
    const x = cx + s * (fx + 0.6);
    solid.push(colored(box(0.15, 2.4, 0.15, x, 1.2, cz - 3.6), '#f4f0ea'), colored(box(0.15, 2.4, 0.15, x, 1.2, cz + 3.6), '#f4f0ea'), colored(box(0.15, 0.15, 7.35, x, 2.4, cz), '#f4f0ea'));
  }
  // Flutlicht: leuchtende Strahlerfelder auf der Innenseite der Mastköpfe
  for (const [x, z] of S.masts) {
    const dx = cx - x, dz = cz - z, a = Math.atan2(dx, dz);
    glow.push(colored(new THREE.PlaneGeometry(6, 2.6).rotateY(a).translate(x + Math.sin(a) * 3.6, 45.75, z + Math.cos(a) * 3.6), '#fff6dc'));
  }
  const add = (geos, mat, shadow) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = shadow; m.receiveShadow = !shadow; for (const g of geos) g.dispose(); group.add(m); };
  add(flat, toonMaterial('#ffffff', { vertexColors: true, rim: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), false);
  add(solid, toonMaterial('#ffffff', { vertexColors: true, rim: 0.2 }), true);
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4), side: THREE.DoubleSide }), false);
  // Anzeigetafel: Bildschirm zur Spielfläche hin
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 144;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a14';
  g.fillRect(0, 0, 512, 144);
  g.font = '900 64px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd84a';
  g.fillText('HEIM 2:1 GAST', 256, 76);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 3.9), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) }));
  screen.position.set(S.board.x, 17.2, S.board.z - 0.62);
  screen.rotation.y = Math.PI;
  group.add(screen);
  return group;
}
