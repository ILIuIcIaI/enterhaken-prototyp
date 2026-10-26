import * as THREE from 'three';

// Geometrie-Bausteine für die Figur. Alles entsteht in Bind-Pose (Figur steht gerade, Arme hängen),
// Koordinaten im Modellraum: Füße bei y = 0, Blick nach -Z.

const _c = new THREE.Color();
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Gewichtung entlang einer senkrechten Knochenkette: joints = Y-Positionen der Gelenke (absteigend),
// bones = Skin-Indizes je Abschnitt (joints.length + 1). Nahe einem Gelenk wird weich überblendet.
function skinAt(skin, y) {
  const { bones, joints, blend = 0.05 } = skin;
  for (let j = 0; j < joints.length; j++) {
    const d = y - joints[j];
    if (Math.abs(d) < blend) return [bones[j], bones[j + 1], smooth(blend, -blend, d)];
  }
  let seg = 0;
  while (seg < joints.length && y < joints[seg]) seg++;
  return [bones[seg], bones[seg], 0];
}

// Röhre entlang -Y von yTop nach yBot mit elliptischem Profil: profile(t, y) → [rx, rz, ox, oz].
// theta = π zeigt nach vorne (-Z). Optional Vertexfarben color(target, theta, t) und Skinning.
export function tubeGeometry({ yTop, yBot, cx = 0, cz = 0, profile, rings = 36, radial = 20, theta0 = 0, thetaLen = Math.PI * 2, color = null, skin = null }) {
  const cols = radial + 1, rows = rings + 1, n = cols * rows;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const col = color ? new Float32Array(n * 3) : null;
  const si = skin ? new Uint16Array(n * 4) : null;
  const sw = skin ? new Float32Array(n * 4) : null;
  for (let r = 0; r < rows; r++) {
    const t = r / rings;
    const y = yTop + (yBot - yTop) * t;
    const [rx, rz, ox = 0, oz = 0] = profile(t, y);
    const s = skin ? skinAt(skin, y) : null;
    for (let k = 0; k < cols; k++) {
      const u = k / radial;
      const a = theta0 + u * thetaLen;
      const i = r * cols + k;
      pos[i * 3] = cx + ox + Math.sin(a) * rx;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = cz + oz + Math.cos(a) * rz;
      uv[i * 2] = u;
      uv[i * 2 + 1] = 1 - t;
      if (col) {
        color(_c, a, t, u);
        col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      }
      if (s) {
        si[i * 4] = s[0]; si[i * 4 + 1] = s[1];
        sw[i * 4] = 1 - s[2]; sw[i * 4 + 1] = s[2];
      }
    }
  }
  const idx = [];
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * cols + k, b = (r + 1) * cols + k, c = (r + 1) * cols + k + 1, d = r * cols + k + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (si) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Verjüngte, abgeflachte Haarsträhne entlang einer Kurve. Abgeflacht in Richtung vom Kopfzentrum weg,
// damit die Strähnen wie Haarbüschel am Kopf anliegen. Farbe läuft von c0 (Ansatz) zu c1 (Spitze).
export function strandGeometry(points, { r0 = 0.02, r1 = 0.002, flat = 0.4, segs = 12, radial = 6, center, c0, c1 }) {
  const curve = new THREE.CatmullRomCurve3(points);
  const cols = radial + 1, rows = segs + 1, n = cols * rows;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const p = new THREE.Vector3(), T = new THREE.Vector3(), ref = new THREE.Vector3();
  const B = new THREE.Vector3(), N = new THREE.Vector3(), o = new THREE.Vector3();
  const ca = new THREE.Color(c0), cb = new THREE.Color(c1);
  for (let r = 0; r < rows; r++) {
    const t = r / segs;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, T);
    ref.subVectors(p, center).normalize();
    B.crossVectors(T, ref);
    if (B.lengthSq() < 1e-8) B.set(1, 0, 0);
    B.normalize();
    N.crossVectors(B, T).normalize();
    const rad = r0 + (r1 - r0) * Math.pow(t, 0.75);
    _c.copy(ca).lerp(cb, t);
    for (let k = 0; k < cols; k++) {
      const a = (k / radial) * Math.PI * 2;
      o.copy(B).multiplyScalar(Math.cos(a) * rad).addScaledVector(N, Math.sin(a) * rad * flat);
      const i = r * cols + k;
      pos[i * 3] = p.x + o.x; pos[i * 3 + 1] = p.y + o.y; pos[i * 3 + 2] = p.z + o.z;
      uv[i * 2] = k / radial; uv[i * 2 + 1] = 1 - t;
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
  }
  const idx = [];
  for (let r = 0; r < segs; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * cols + k, b = (r + 1) * cols + k, c = (r + 1) * cols + k + 1, d = r * cols + k + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Faltenrock-Segment um die Hüfte: Dreiecksfalten, Saumlänge pro Winkel (asymmetrischer Schnitt).
// Höhe und Radius hängen vom Winkel ab, daher eigene Vertex-Erzeugung.
export function skirtGeometry({ theta0, thetaLen, yTop, rTop, flare, length, pleats = 16, depth = 0.014, rz = 0.78, radial = 48, rings = 8, cA, cB }) {
  const ca = new THREE.Color(cA), cb = new THREE.Color(cB);
  const cols = radial + 1, rows = rings + 1, n = cols * rows;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  for (let r = 0; r < rows; r++) {
    const v = r / rings;
    for (let k = 0; k < cols; k++) {
      const u = k / radial;
      const a = theta0 + u * thetaLen;
      const tri = Math.abs((((a * pleats) / (Math.PI * 2)) % 1 + 1) % 1 * 2 - 1);
      const rad = rTop + flare * v + depth * v * (tri - 0.5) * 2;
      const i = r * cols + k;
      pos[i * 3] = Math.sin(a) * rad;
      pos[i * 3 + 1] = yTop - v * length(a);
      pos[i * 3 + 2] = Math.cos(a) * rad * rz;
      uv[i * 2] = u; uv[i * 2 + 1] = 1 - v;
      _c.copy(ca).lerp(cb, Math.pow(tri, 4) * (0.4 + 0.6 * v));
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
  }
  const idx = [];
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * cols + k, b = (r + 1) * cols + k, c = (r + 1) * cols + k + 1, d = r * cols + k + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Kopf mit schmalem Anime-Kinn (Kugel, unten V-förmig verjüngt).
export function headGeometry(r) {
  const g = new THREE.SphereGeometry(r, 40, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) {
      const k = Math.pow(-y / r, 1.5);
      x *= 1 - 0.34 * k;
      z *= 1 - 0.14 * k;
      if (z < 0) z -= 0.012 * k * r * 10 * (1 - Math.abs(x) / r);
    }
    if (z < 0) z *= 0.95;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// Fügt einer Geometrie eine einheitliche Vertexfarbe hinzu (für Materialien mit vertexColors).
export function withColor(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
