// 2D-Geometrie in der XZ-Ebene für den Stadtgenerator: Kurven, Polylinien, gedrehte Rechtecke, Blobs.

// Kubische Bézierkurve als Punktfolge (etwa alle `step` Meter)
export function bezier(p0, p1, p2, p3, step = 3) {
  const est = Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z) + Math.hypot(p3.x - p2.x, p3.z - p2.z);
  const n = Math.max(4, Math.ceil(est / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, z: a * p0.z + b * p1.z + c * p2.z + d * p3.z });
  }
  return out;
}

// Polylinie mit Bogenlänge, Abtastung und Abstandsabfrage
export class Polyline {
  constructor(points, closed = false) {
    this.pts = closed ? [...points, points[0]] : points;
    this.closed = closed;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[this.cum.length - 1];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of this.pts) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    this.bounds = { x0, z0, x1, z1 };
  }

  // Punkt und Tangente bei Bogenlänge s
  at(s, out = {}) {
    const L = this.length;
    if (this.closed) s = ((s % L) + L) % L;
    else s = Math.min(L, Math.max(0, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= s) lo = m; else hi = m;
    }
    const a = this.pts[lo], b = this.pts[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.tx = (b.x - a.x) / seg;
    out.tz = (b.z - a.z) / seg;
    return out;
  }

  // kürzester Abstand eines Punktes zur Linie (optional mit Bogenlänge des Fußpunkts)
  dist(x, z, out) {
    let best = Infinity, bestS = 0;
    const p = this.pts;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      const ex = b.x - a.x, ez = b.z - a.z;
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / l2));
      const qx = a.x + ex * t - x, qz = a.z + ez * t - z;
      const d = qx * qx + qz * qz;
      if (d < best) { best = d; bestS = this.cum[i - 1] + t * Math.sqrt(l2); }
    }
    if (out) out.s = bestS;
    return Math.sqrt(best);
  }

  // schnelle Vorprüfung: liegt der Punkt grob in der Nähe?
  near(x, z, r) {
    const b = this.bounds;
    return x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r;
  }
}

// Gedrehtes Rechteck { cx, cz, hx, hz, a } – Ecken und Überlappung per Trennachsen-Test
export function rectCorners(r) {
  const c = Math.cos(r.a), s = Math.sin(r.a);
  const out = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    out.push({ x: r.cx + c * u * r.hx - s * v * r.hz, z: r.cz + s * u * r.hx + c * v * r.hz });
  }
  return out;
}

export function rectsOverlap(a, b, pad = 0) {
  const A = rectCorners(a), Bc = rectCorners(b);
  for (const r of [a, b]) {
    const c = Math.cos(r.a), s = Math.sin(r.a);
    for (const [ax, az] of [[c, s], [-s, c]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of A) { const d = p.x * ax + p.z * az; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const p of Bc) { const d = p.x * ax + p.z * az; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 + pad <= b0 || b1 + pad <= a0) return false;
    }
  }
  return true;
}

// Organischer Umriss: R(θ) = R · (1 + Σ a·sin(kθ + p)), k = 2, 3, 5
export function makeBlob(x, z, R, rand, wob = 1) {
  return {
    x, z, R,
    a: [0.16 * wob * (0.5 + rand()), 0.09 * wob * (0.5 + rand()), 0.05 * wob * (0.5 + rand())],
    p: [rand() * 6.283, rand() * 6.283, rand() * 6.283],
  };
}

export function blobRadius(b, th) {
  return b.R * (1 + b.a[0] * Math.sin(2 * th + b.p[0]) + b.a[1] * Math.sin(3 * th + b.p[1]) + b.a[2] * Math.sin(5 * th + b.p[2]));
}

// normierter Abstand (1 = Rand)
export function blobRho(b, x, z) {
  const dx = x - b.x, dz = z - b.z;
  return Math.hypot(dx, dz) / blobRadius(b, Math.atan2(dz, dx));
}

// Abstand eines Punktes zu einem achsenparallelen Rechteck (0 innen)
export function rectDist(x0, z0, x1, z1, x, z) {
  const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}
