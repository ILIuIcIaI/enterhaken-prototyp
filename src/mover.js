import * as THREE from 'three';

// Bewegte Objekte für den Enterhaken und die Kollision (Hochbahn, Flugzeuge, Schiffe, Kranausleger): Pose zur Zeit t,
// Trefferboxen im lokalen System. Physik (Seilanker, Landen) und Darstellung fragen dieselbe Pose ab.
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Mover {
  constructor(kind, boxes) {
    this.kind = kind;
    this.boxes = boxes; // [{ min: Vector3, max: Vector3 }] lokal
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.omega = null; // Drehgeschwindigkeit um pos (rad/s, Weltachse) – Kranausleger, Klappbrücke
  }

  worldPoint(local, out) {
    return out.copy(local).applyQuaternion(this.quat).add(this.pos);
  }

  // Geschwindigkeit eines Punktes, der mitfährt (bei Drehung: ω × Hebelarm)
  pointVel(p, out) {
    out.copy(this.vel);
    if (this.omega) out.add(_o.subVectors(p, this.pos).crossVectors(this.omega, _o));
    return out;
  }

  // Strahl im lokalen System gegen alle Boxen; Ergebnis: Abstand, lokaler Treffer und Normale
  raycast(origin, dir, maxDist, hit) {
    _q.copy(this.quat).invert();
    _o.copy(origin).sub(this.pos).applyQuaternion(_q);
    _d.copy(dir).applyQuaternion(_q);
    let found = false;
    for (const b of this.boxes) {
      let tmin = 0, tmax = maxDist, axis = -1, sign = 1;
      for (let k = 0; k < 3; k++) {
        const o = _o.getComponent(k), d = _d.getComponent(k);
        const lo = b.min.getComponent(k), hi = b.max.getComponent(k);
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { tmin = Infinity; break; } continue; }
        let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { tmin = Infinity; break; }
      }
      if (tmin === Infinity || axis < 0 || tmin >= maxDist) continue;
      maxDist = tmin;
      found = true;
      hit.dist = tmin;
      hit.local.copy(_d).multiplyScalar(tmin).add(_o);
      hit.normal.set(0, 0, 0).setComponent(axis, sign).applyQuaternion(this.quat);
    }
    if (found) {
      hit.mover = this;
      this.worldPoint(hit.local, hit.point);
    }
    return found;
  }
}

// Geometrie mit fester Farbe je Ecke (für zusammengefügte Modelle mit einem Material)
export function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
