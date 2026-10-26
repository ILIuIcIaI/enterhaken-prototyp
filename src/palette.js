import * as THREE from 'three';

// Gemeinsame Abend-Palette für Himmel, Nebel und Fensterspiegelungen.
// Die Farben werden als GLSL-Konstanten (linearer Farbraum) in alle Shader eingebacken.

export const SUN_DIR = new THREE.Vector3(-0.72, 0.15, -0.68).normalize();

export const DUSK = {
  zenith: '#120a2a',
  high: '#45206a',
  mid: '#b03f7c',
  horizonSun: '#ff8a38',
  horizonAnti: '#7a3a80',
  ground: '#1c0f26',
  sun: '#ffd28c',
  glow: '#ff6224',
  smog: '#2e1532',
};

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

export const DUSK_GLSL = /* glsl */ `
#ifndef DUSK_DEFINED
#define DUSK_DEFINED
const vec3 DUSK_ZENITH = ${lin(DUSK.zenith)};
const vec3 DUSK_HIGH = ${lin(DUSK.high)};
const vec3 DUSK_MID = ${lin(DUSK.mid)};
const vec3 DUSK_HORIZON_SUN = ${lin(DUSK.horizonSun)};
const vec3 DUSK_HORIZON_ANTI = ${lin(DUSK.horizonAnti)};
const vec3 DUSK_GROUND = ${lin(DUSK.ground)};
const vec3 DUSK_SUN = ${lin(DUSK.sun)};
const vec3 DUSK_GLOW = ${lin(DUSK.glow)};
const vec3 DUSK_SMOG = ${lin(DUSK.smog)};
const vec3 DUSK_SUN_DIR = vec3(${SUN_DIR.x.toFixed(5)}, ${SUN_DIR.y.toFixed(5)}, ${SUN_DIR.z.toFixed(5)});

vec3 duskSky(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  vec2 hz = normalize(d.xz + vec2(1e-5));
  float az = dot(hz, normalize(DUSK_SUN_DIR.xz)) * 0.5 + 0.5;
  vec3 sunSide = mix(DUSK_HORIZON_SUN, DUSK_MID, smoothstep(0.0, 0.2, h));
  vec3 antiSide = mix(DUSK_HORIZON_ANTI, DUSK_MID * 0.7, smoothstep(0.0, 0.25, h));
  vec3 col = mix(antiSide, sunSide, pow(az, 2.2));
  col = mix(col, DUSK_HIGH, smoothstep(0.12, 0.45, h));
  col = mix(col, DUSK_ZENITH, smoothstep(0.4, 0.95, h));
  col = mix(col, DUSK_GROUND, smoothstep(0.0, -0.25, h));
  return col;
}

vec3 duskFogColor(vec3 d) {
  vec3 col = duskSky(vec3(d.x, max(d.y, 0.0) * 0.5 + 0.02, d.z));
  return col + DUSK_GLOW * pow(max(dot(d, DUSK_SUN_DIR), 0.0), 6.0) * 0.45;
}
#endif
`;
