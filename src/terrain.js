// Gelände der Insel: flache Stadt, Ufermauer, schräg abfallender Strand, Meeresgrund, sanfte Hügel in
// den Parks und Mulden für die Teiche. Dieselben Formeln nutzt der Boden-Shader (TERRAIN_GLSL),
// damit Physik, Mesh und Wassertiefe exakt zusammenpassen.

export const WATER_Y = -2.0; // Meeresspiegel
export const WALL_D = -37.4; // Ufermauer zwischen Promenade und Strand (Küstenabstand)
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

// Meereswellen wie im Wasser-Shader (world.js, WAVES_GLSL): vier Gerstner-Wellen plus Brandung vor dem Strand.
// Die Physik nutzt sie beim Surfen und beim Sprint über das Wasser, damit man auf den Wellen reitet.
const WAVES = [[0.9, 0.44, 48, 0.32], [-0.3, 0.95, 27, 0.18], [0.7, -0.7, 15, 0.09], [-0.85, -0.5, 8.5, 0.045]].map(([x, z, L, A]) => {
  const n = Math.hypot(x, z), k = 6.2831 / L;
  return { x: x / n, z: z / n, k, A, c: Math.sqrt(9.81 / k), q: 0.55 / (4 * k) };
});

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
    this.waveTime = 0; // Uhr der Wellen (= Shader-Zeit, setzt main.js je Bild)
    this.canal = null; // Kanal durch die Innenstadt (citygen.js): { x, z0, z1, hw, wall, level, bottom }
    this.rock = null;  // Felsinsel (rock.js) – hat ein eigenes Mesh, gehört also nicht ins Bodennetz
  }

  // im Kanalbett (zwischen den Kaimauern, auch unter den Brücken)?
  inCanal(x, z, pad = 0) {
    const c = this.canal;
    return !!c && Math.abs(x - c.x) < c.hw + pad && z > c.z0 - pad && z < c.z1 + pad;
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

  // noCanal: Oberfläche ohne Kanalbett (für das Bodennetz – den Kanal schneidet der Boden-Shader sauber aus)
  height(x, z, noCanal = false) {
    if (!noCanal && this.inCanal(x, z)) return this.canal.bottom;
    let h = beachHeight(this.coastDist(x, z));
    if (!noCanal && this.rock) h = Math.max(h, this.rock.height(x, z));
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
    if (this.inCanal(x, z)) return this.canal.level;
    const p = this.pondAt(x, z);
    return p ? p.level : -Infinity;
  }

  // Höhe der bewegten Meeresoberfläche (wie im Shader; Gerstner-Wellen verschieben auch seitlich, darum wird
  // der Ausgangspunkt gesucht, der an (x, z) landet)
  seaY(x, z) {
    const t = this.waveTime, d = this.coastDist(x, z);
    const depth = WATER_Y - beachHeight(d);
    const amp = 0.3 + 0.7 * smooth(0, 7, depth);
    const shore = smooth(60, 8, d) * smooth(-1, 1.5, depth);
    let px = x, pz = z;
    for (let it = 0; it < 3; it++) {
      let dx = 0, dz = 0;
      for (const w of WAVES) {
        const c = Math.cos(w.k * (w.x * px + w.z * pz - w.c * t)) * w.q * amp;
        dx += c * w.x;
        dz += c * w.z;
      }
      px = x - dx;
      pz = z - dz;
    }
    let y = 0.16 * shore * Math.sin((6.2831 / 14) * d + t * 1.7);
    for (const w of WAVES) y += w.A * amp * Math.sin(w.k * (w.x * px + w.z * pz - w.c * t));
    return WATER_Y + y;
  }

  // Wasseroberfläche mit Wellen (Meer) bzw. ruhig (Teich); -Infinity ohne Wasser
  surfaceY(x, z) {
    const w = this.waterLevel(x, z);
    return w === WATER_Y && this.coastDist(x, z) > -6 ? this.seaY(x, z) : w;
  }
}
