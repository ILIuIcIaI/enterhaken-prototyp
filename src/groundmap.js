import * as THREE from 'three';
import { blobRadius, rectCorners } from './geom2d.js';
import { pondRadius } from './terrain.js';

// Bodenplan als Textur über die ganze Insel. Kodierung (wird im Boden-Shader zerlegt):
//   m = min(R, G, B) = Markierung (weiß), R − m = Asphalt, G − m = Rasen, B − m = helle Wege/Plätze,
//   alles 0 = Stadtpflaster/Gehweg. Strand, Promenade und Meeresgrund kommen analytisch aus dem Shader.
export const MAP_EXT = 560; // halbe Kantenlänge in Metern

export function drawGroundMap(city, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const k = size / (MAP_EXT * 2);
  g.setTransform(k, 0, 0, k, MAP_EXT * k, MAP_EXT * k);
  const PAVE = '#000000', LAWN = '#00ff00', PATH = '#0000ff', ASPHALT = '#ff0000', MARK = '#ffffff', MUD = '#4d4d00';

  // Grundfläche Wiese; Rasterblöcke gepflastert
  g.fillStyle = LAWN;
  g.fillRect(-MAP_EXT, -MAP_EXT, MAP_EXT * 2, MAP_EXT * 2);
  g.fillStyle = PAVE;
  for (const b of city.blockList) if (!b.super && b.built) g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  for (const b of city.plazas) {
    g.fillStyle = PATH;
    g.fillRect(b.x0 + 1, b.z0 + 1, b.x1 - b.x0 - 2, b.z1 - b.z0 - 2);
  }

  // Hausgrundstücke: gepflasterte Hausfläche und kurze Einfahrt zur Straße
  g.fillStyle = PAVE;
  g.strokeStyle = PAVE;
  g.lineWidth = 2.6;
  for (const r of city.houseRects) {
    const P = rectCorners({ ...r, hx: r.hx + 0.6, hz: r.hz + 0.6 });
    g.beginPath();
    P.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
    g.closePath();
    g.fill();
    if (r.front) {
      g.beginPath();
      g.moveTo(r.cx, r.cz);
      g.lineTo(r.front.x, r.front.z);
      g.stroke();
    }
  }

  // Parks: organischer Rasen über Block- und Straßengrenzen hinweg, Wege, Teichgrund
  for (const park of city.parks) {
    const b = park.blob;
    g.fillStyle = LAWN;
    g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const th = (i / 96) * Math.PI * 2, r = blobRadius(b, th);
      const x = b.x + Math.cos(th) * r, z = b.z + Math.sin(th) * r;
      i ? g.lineTo(x, z) : g.moveTo(x, z);
    }
    g.fill();
  }

  // Straßen: erst Gehwege (volle Breite), dann Fahrbahn, dann Markierungen
  const roads = city.roadNet.roads;
  const strokeRoad = (r, w) => {
    g.lineWidth = w;
    g.beginPath();
    r.pl.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
    g.stroke();
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = PAVE;
  for (const r of roads) strokeRoad(r, r.width);
  g.strokeStyle = ASPHALT;
  for (const r of roads) strokeRoad(r, r.width - (r.kind === 'local' ? 3.6 : 5));
  // Kreuzungsflächen ausfüllen
  g.fillStyle = ASPHALT;
  for (const n of city.roadNet.nodes) {
    if (n.roads.length < 3) continue;
    const w = Math.max(...n.roads.map((r) => r.width - (r.kind === 'local' ? 3.6 : 5)));
    g.beginPath();
    g.arc(n.x, n.z, w * 0.62, 0, Math.PI * 2);
    g.fill();
  }

  // Mittellinien (gestrichelt), mit Abstand zu den Kreuzungen
  g.strokeStyle = MARK;
  g.lineCap = 'butt';
  g.lineWidth = 0.28;
  g.setLineDash([3, 3.5]);
  for (const r of roads) {
    const gapA = r.a.roads.length >= 3 ? 10 : 2, gapB = r.b.roads.length >= 3 ? 10 : 2;
    if (r.pl.length < gapA + gapB + 4) continue;
    g.beginPath();
    const p = {};
    for (let s = gapA; s <= r.pl.length - gapB; s += 2) {
      r.pl.at(s, p);
      s === gapA ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z);
    }
    g.stroke();
  }
  g.setLineDash([]);

  // Zebrastreifen und Haltelinien an Kreuzungen mit Ampel
  g.fillStyle = MARK;
  const p = {};
  for (const n of city.roadNet.nodes) {
    if (!n.signal) continue;
    for (const r of n.roads) {
      const fromA = r.a === n;
      const s0 = fromA ? 8.6 : r.pl.length - 8.6;
      if (r.pl.length < 22) continue;
      r.pl.at(s0, p);
      const dx = fromA ? p.tx : -p.tx, dz = fromA ? p.tz : -p.tz; // weg von der Kreuzung
      const half = (r.width - 5) / 2;
      for (let o = -half + 0.4; o < half - 0.2; o += 1.1) {
        const cx = p.x - dz * o, cz = p.z + dx * o;
        g.save();
        g.translate(cx, cz);
        g.rotate(Math.atan2(dz, dx));
        g.fillRect(-1.6, -0.28, 3.2, 0.56);
        g.restore();
      }
      // Haltelinie auf der rechten (ankommenden) Spur
      const sx = p.x + dx * 2.6, sz = p.z + dz * 2.6;
      g.save();
      g.translate(sx, sz);
      g.rotate(Math.atan2(dz, dx));
      g.fillRect(-0.25, 0, 0.5, half);
      g.restore();
    }
  }

  // Parkwege und Teichgrund obenauf
  g.strokeStyle = PATH;
  g.lineCap = 'round';
  for (const park of city.parks) {
    g.lineWidth = 2.6;
    for (const pl of park.paths) {
      g.beginPath();
      pl.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.z) : g.moveTo(q.x, q.z)));
      g.stroke();
    }
    const pd = park.pond;
    if (pd) {
      g.fillStyle = MUD;
      g.beginPath();
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * Math.PI * 2, r = pondRadius(pd, th) * 1.08;
        const x = pd.x + Math.cos(th) * r, z = pd.z + Math.sin(th) * r;
        i ? g.lineTo(x, z) : g.moveTo(x, z);
      }
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false; // Canvas-Zeile = Welt-z, ohne Spiegelung
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
