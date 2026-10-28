// Gelände der Insel: flache Stadt, Ufermauer, schräg abfallender Strand, Meeresgrund, sanfte Hügel in
// den Parks und Mulden für die Teiche. Dieselben Formeln nutzt der Boden-Shader (TERRAIN_GLSL),
// damit Physik, Mesh und Wassertiefe exakt zusammenpassen.

export const WATER_Y = -2.0; // Meeresspiegel
const WALL_D = -37.4; // Ufermauer zwischen Promenade und Strand (Küstenabstand)
const WALL_H = 0.6;
const CELL = 40;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Höhe über dem Küstenabstand d (> 0 im Meer)
export function beachHeight(d) {
  if (d < WALL_D) return 0;
  const sand = -WALL_H * smooth(WALL_D, WALL_D + 0.7, d);
  if (d < 0) {
    const t = (d - WALL_D) / -WALL_D;
    return sand + (WATER_Y + WALL_H) * Math.pow(Math.max(0, t), 1.35);
  }
  return WATER_Y - 13 * (1 - Math.exp(-d / 32));
}

export const TERRAIN_GLSL = /* glsl */ `
float beachHeight(float d) {
  if (d < ${WALL_D.toFixed(2)}) return 0.0;
  float sand = -${WALL_H.toFixed(2)} * smoothstep(${WALL_D.toFixed(2)}, ${(WALL_D + 0.7).toFixed(2)}, d);
  if (d < 0.0) {
    float t = (d - (${WALL_D.toFixed(2)})) / ${(-WALL_D).toFixed(2)};
    return sand + (${WATER_Y.toFixed(2)} + ${WALL_H.toFixed(2)}) * pow(max(0.0, t), 1.35);
  }
  return ${WATER_Y.toFixed(2)} - 13.0 * (1.0 - exp(-d / 32.0));
}`;

// Teich: organische Uferlinie r(θ) = R · (1 + Σ a·sin(kθ + p))
export function pondRadius(p, th) {
  let r = 1;
  for (let k = 0; k < p.a.length; k++) r += p.a[k] * Math.sin((k + 2) * th + p.p[k]);
  return p.R * r;
}

export class Terrain {
  constructor(coastDist) {
    this.coastDist = coastDist;
    this.bumps = []; // { x, z, r, h }
    this.ponds = []; // { x, z, R, a, p, level, depth }
    this.grid = new Map();
  }

  key(ix, iz) {
    return (ix + 512) * 1024 + iz + 512;
  }

  addBump(b) {
    this.bumps.push(b);
    this.index(b, b.r * 2.2, 0);
  }

  addPond(p) {
    this.ponds.push(p);
    this.index(p, p.R * 1.6, 1);
  }

  index(item, reach, kind) {
    for (let ix = Math.floor((item.x - reach) / CELL); ix <= Math.floor((item.x + reach) / CELL); ix++) {
      for (let iz = Math.floor((item.z - reach) / CELL); iz <= Math.floor((item.z + reach) / CELL); iz++) {
        const k = this.key(ix, iz);
        let cell = this.grid.get(k);
        if (!cell) this.grid.set(k, (cell = { b: [], p: [] }));
        (kind ? cell.p : cell.b).push(item);
      }
    }
  }

  cell(x, z) {
    return this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  // normierter Abstand zur Teichmitte (1 = Uferlinie)
  pondRho(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    return Math.hypot(dx, dz) / pondRadius(p, Math.atan2(dz, dx));
  }

  height(x, z) {
    let h = beachHeight(this.coastDist(x, z));
    const c = this.cell(x, z);
    if (!c) return h;
    for (const b of c.b) {
      const d2 = ((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r);
      if (d2 < 4.5) h += b.h * Math.exp(-d2 * 1.6);
    }
    for (const p of c.p) {
      const rho = this.pondRho(p, x, z);
      if (rho < 1.3) h -= p.depth * (1 - smooth(0.45, 1.18, rho));
    }
    return h;
  }

  // Teich an dieser Stelle (oder null)
  pondAt(x, z) {
    const c = this.cell(x, z);
    if (!c) return null;
    for (const p of c.p) if (this.pondRho(p, x, z) < 1.25) return p;
    return null;
  }

  // Wasserspiegel an dieser Stelle (-Infinity, wenn kein Wasser)
  waterLevel(x, z) {
    if (this.coastDist(x, z) > -6) return WATER_Y;
    const p = this.pondAt(x, z);
    return p ? p.level : -Infinity;
  }
}
