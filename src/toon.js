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

// Toon-Material mit warmem Randlicht (typisch für Anime-Abendszenen).
export function toonMaterial(color, { rim = 0.35, rimColor = '#ffb37a', levels = [0.42, 1.0], ...params } = {}) {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(levels), ...params });
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
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uOutline;');
  };
  mat.customProgramCacheKey = () => 'outline';
  outlineMats.set(thickness, mat);
  return mat;
}
