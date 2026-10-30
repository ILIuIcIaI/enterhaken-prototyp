import * as THREE from 'three';

// Bausteine für den Anime-Look: Cel-Shading-Verläufe, Toon-Material mit Randlicht, Outline-Hülle.

const gradients = new Map();

export function gradientMap(levels) {
  const key = levels.join(',');
  if (gradients.has(key)) return gradients.get(key);
  const tex = new THREE.DataTexture(new Uint8Array(levels.map((v) => Math.round(v * 255))), levels.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradients.set(key, tex);
  return tex;
}

// Hyper-Realistic-Mode (realism.js tauscht die Materialien): Das Cel-Shading verschwindet aus der Welt. Nur die Figuren
// behalten einen Hauch davon (Einstellung, Standard an): feine Umrisse und eine weiche Schattenkante (CHAR_ANIME wirkt im
// Shader der Figuren, character.js) – sonst sähen sie aus wie Knetfiguren.
let realistic = false, animeChars = true;
const REAL_OUTLINE = 0.55; // Strichstärke der Figuren im Hyper-Realistic-Mode
export const CHAR_ANIME = { value: 1 };
export function setRealistic(on, anime = animeChars) {
  realistic = on;
  animeChars = anime;
  CHAR_ANIME.value = anime ? 1 : 0;
  for (const m of outlineMats.values()) applyOutline(m);
}
function applyOutline(m) {
  m.visible = !realistic || animeChars;
  m.userData.uOutline.value = m.userData.thickness * (realistic ? REAL_OUTLINE : 1);
}

// Toon-Material mit warmem Randlicht (typisch für Anime-Abendszenen).
// pbr: Hinweise für den PBR-Zwilling im Hyper-Realistic-Mode ({ roughness, metalness, physical, clearcoat … })
export function toonMaterial(color, { rim = 0.35, rimColor = '#ffb37a', levels = [0.42, 1.0], pbr, flatShading, ...params } = {}) {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(levels), ...params });
  if (pbr) mat.userData.pbr = pbr;
  if (flatShading) mat.userData.flat = true; // das Toon-Material kennt keine Facetten, der PBR-Zwilling schon
  if (rim > 0) {
    const rimCol = new THREE.Color(rimColor).multiplyScalar(rim);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = { value: rimCol };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float rimF = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
  totalEmissiveRadiance += uRim * smoothstep(0.55, 0.85, rimF) * max(diffuseColor.rgb, vec3(0.16)); // auch dunkler Stoff bekommt eine Kante
}`);
    };
    mat.customProgramCacheKey = () => 'toon-rim';
  }
  return mat;
}

// Invertierte Hülle: Rückseiten entlang der Normalen aufgebläht und dunkel gefärbt.
// Eine Instanz pro Strichstärke (Meter), funktioniert auch mit gehäuteten Meshes.
const outlineMats = new Map();
export function outlineMaterial(thickness = 0.008) {
  if (outlineMats.has(thickness)) return outlineMats.get(thickness);
  const mat = new THREE.MeshBasicMaterial({ color: '#1b0f24', side: THREE.BackSide });
  mat.userData.thickness = thickness;
  mat.userData.uOutline = { value: thickness };
  applyOutline(mat);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = mat.userData.uOutline;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uOutline;');
  };
  mat.customProgramCacheKey = () => 'outline';
  outlineMats.set(thickness, mat);
  return mat;
}
