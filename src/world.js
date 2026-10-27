import * as THREE from 'three';
import { DUSK, DUSK_GLSL, SUN_DIR } from './palette.js';
import { gradientMap } from './toon.js';

// Abendhimmel (Wolken, Sterne, tiefe Sonne), richtungsabhängiger Dunst, Licht, Boden mit
// Straßen, Parks und Strand sowie das Meer rund um die Insel.

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSunStrength;
varying vec3 vDir;
${DUSK_GLSL}
float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = duskSky(d);
  float s = max(dot(d, DUSK_SUN_DIR), 0.0);

  // Sterne im oberen Himmel
  if (d.y > 0.25) {
    vec2 sc = floor(vec2(atan(d.z, d.x), d.y) * vec2(300.0, 260.0));
    float st = step(0.9975, sHash(sc));
    col += vec3(0.8, 0.75, 1.0) * st * smoothstep(0.25, 0.7, d.y) * 0.6;
  }

  // Wolkenbänder, von unten durch die Sonne angestrahlt
  if (d.y > -0.02) {
    vec2 uv = d.xz / (d.y + 0.14) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv * 1.3) * 0.65 + fbm(uv * vec2(0.6, 3.0)) * 0.35;
    float dens = smoothstep(0.48, 0.78, n) * smoothstep(-0.02, 0.1, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y));
    float lit = pow(s, 3.0);
    vec3 cloudCol = mix(DUSK_HIGH * 0.55, DUSK_MID * 0.9, smoothstep(0.0, 0.25, 1.0 - d.y));
    cloudCol = mix(cloudCol, DUSK_GLOW * 1.6 + DUSK_SUN * 0.4, lit * 0.85);
    float edge = smoothstep(0.5, 0.62, n) - smoothstep(0.62, 0.8, n);
    cloudCol += DUSK_SUN * edge * lit * 1.2;
    col = mix(col, cloudCol, dens * 0.9);
  }

  // Sonne mit Glühen
  col += DUSK_GLOW * (pow(s, 8.0) * 0.55 + pow(s, 90.0) * 1.6);
  col += DUSK_SUN * smoothstep(0.99955, 0.9998, s) * uSunStrength;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Ersetzt den Standard-Nebel aller Materialien: Farbe folgt dem Himmel in Blickrichtung,
// dazu bodennaher Smog in den Straßenschluchten.
function installDuskFog() {
  const C = THREE.ShaderChunk;
  if (C.fog_fragment.includes('duskFogColor')) return;
  C.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif`;
  C.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogViewPos = mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${DUSK_GLSL}
#endif`;
  C.fog_fragment = `
#ifdef USE_FOG
  float fogDist = length(vFogViewPos);
  vec3 fogDirW = transpose(mat3(viewMatrix)) * (vFogViewPos / max(fogDist, 1e-4));
  float fogY = cameraPosition.y + fogDirW.y * fogDist;
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogDist * fogDist);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, fogDist);
  #endif
  float smog = (1.0 - exp(-fogDist * 0.004)) * exp(-max(fogY, 0.0) / 32.0) * 0.6;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, DUSK_SMOG, smog * (1.0 - fogFactor));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, duskFogColor(fogDirW), fogFactor);
#endif`;
}

// Küstenlinie wie in City.coastR: Grundradius mit sechs überlagerten Wellen (natürliche Inselform)
const COAST_GLSL = /* glsl */ `
uniform float uCoastR0;
uniform float uCoastA[6];
uniform float uCoastP[6];
float coastR(vec2 w) {
  float th = atan(w.y, w.x);
  float r = 1.0;
  r += uCoastA[0] * sin(1.0 * th + uCoastP[0]);
  r += uCoastA[1] * sin(2.0 * th + uCoastP[1]);
  r += uCoastA[2] * sin(3.0 * th + uCoastP[2]);
  r += uCoastA[3] * sin(5.0 * th + uCoastP[3]);
  r += uCoastA[4] * sin(7.0 * th + uCoastP[4]);
  r += uCoastA[5] * sin(11.0 * th + uCoastP[5]);
  return uCoastR0 * r;
}
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

export function createWorld(renderer, scene, city) {
  installDuskFog();

  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSunStrength: { value: 14 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  scene.fog = new THREE.FogExp2(new THREE.Color(DUSK.horizonAnti), 0.0015);

  const hemi = new THREE.HemisphereLight('#9568c8', '#2c1a2e', 1.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffa060', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150;
  sc.near = 1; sc.far = 1400;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);

  const time = { value: 0 };
  const ground = createGround(city.mapUniforms, time);
  const water = createWater(city.mapUniforms, time);
  scene.add(ground, water);

  return {
    sun, sky, ground, water,
    update(focus, camera, t) {
      sky.position.copy(camera.position);
      skyMat.uniforms.uTime.value = t;
      time.value = t;
      const snap = 300 / 2048;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx, 0, fz).addScaledVector(SUN_DIR, 650);
      sun.target.updateMatrixWorld();
    },
  };
}

// Boden: Meeresgrund → nasser Sand → Strand → Promenade → Stadtraster (Straßen, Gehwege, Parks, Plätze, Wiesen)
function createGround(mu, time) {
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradientMap([0.45, 0.75, 1.0]) });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mu, { uTime: time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uPitch;
uniform float uBlock;
uniform float uOrigin;
uniform float uN;
uniform float uTime;
uniform sampler2D uBlockTex;
varying vec3 vWorldP;
${COAST_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWorldP.xz;
  float d = length(w) - coastR(w);
  vec3 c;
  if (d > -6.0) {
    c = mix(vec3(0.3, 0.22, 0.24), vec3(0.06, 0.05, 0.09), smoothstep(-6.0, 20.0, d));
  } else if (d > -37.0) {
    // Strand mit Windrippeln
    float rip = 0.5 + 0.5 * sin(dot(w, vec2(0.7, 0.3)) * 1.7 + gHash(floor(w * 0.1)) * 6.0);
    c = vec3(0.66, 0.5, 0.42) * (0.86 + 0.1 * rip + 0.12 * gHash(floor(w * 1.6)));
  } else if (d > -46.0) {
    // Uferpromenade: helle Platten mit Fugen, Bordkante zum Strand
    vec2 tl = fract(w / 1.6);
    float joint = step(0.92, max(tl.x, tl.y));
    c = vec3(0.4, 0.35, 0.38) * (0.9 + 0.12 * gHash(floor(w / 1.6))) * (1.0 - joint * 0.35);
    c = mix(c, vec3(0.5, 0.46, 0.48), smoothstep(-38.5, -37.2, d));
  } else {
    vec2 rel = w - vec2(uOrigin);
    vec2 cell = floor(rel / uPitch);
    vec2 lp = rel - cell * uPitch;
    float type = 0.0;
    if (cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uN && cell.y < uN) type = floor(texture2D(uBlockTex, (vec2(cell.y, cell.x) + 0.5) / uN).r * 255.0 + 0.5);
    float S = uPitch - uBlock;
    float inX = step(lp.x, uBlock);
    float inZ = step(lp.y, uBlock);
    float block = inX * inZ;
    vec3 asphalt = vec3(0.045, 0.04, 0.055) * (0.85 + 0.3 * gHash(floor(w * 0.7)));
    vec3 walk = vec3(0.24, 0.21, 0.24) * (0.9 + 0.15 * gHash(floor(w * 0.5)));
    c = asphalt;
    if (block > 0.5) {
      vec2 b = lp / uBlock;
      if (type < 0.5) {
        // Wiese am Stadtrand
        c = vec3(0.15, 0.32, 0.13) * (0.8 + 0.35 * gHash(floor(w * 0.9)));
        totalEmissiveRadiance += vec3(0.01, 0.04, 0.008);
      } else if (type > 1.5 && type < 2.5 || type > 3.5) {
        // Park: Rasen, diagonale Wege, Rundweg, ggf. Teich in der Mitte
        // kräftiges Grün, damit der Rasen im violetten Abendlicht nicht grau wirkt
        c = vec3(0.15, 0.38, 0.13) * (0.82 + 0.3 * gHash(floor(w * 1.1)));
        float diag = min(abs(b.x - b.y), abs(b.x + b.y - 1.0)) * uBlock;
        float ring = abs(length(b - 0.5) * uBlock - 12.5);
        float path = min(diag, ring);
        c = mix(c, vec3(0.42, 0.36, 0.34), 1.0 - smoothstep(1.0, 1.4, path));
        // Eigenleuchten hält Rasen und Wasser auch im Schatten der Hochhäuser farbig
        float lawn = smoothstep(1.0, 1.4, path);
        if (type > 3.5) {
          float pr = length(b - 0.5) * uBlock;
          lawn *= smoothstep(9.0, 9.6, pr);
          c = mix(c, vec3(0.34, 0.32, 0.34), 1.0 - smoothstep(9.0, 9.6, pr));
          // Wasser: spiegelt den Abendhimmel (zur Mitte heller), feine Wellenringe und Glitzern
          float ripple = 0.5 + 0.5 * sin(pr * 2.2 - uTime * 1.5);
          float glint = step(0.93, gHash(floor(w * 2.0) + floor(uTime * 3.0))) * smoothstep(8.0, 4.0, pr);
          vec3 water = mix(vec3(0.3, 0.16, 0.36), vec3(0.1, 0.1, 0.24), smoothstep(0.0, 8.0, pr));
          water += vec3(0.32, 0.2, 0.3) * ripple * 0.18 + vec3(0.9, 0.6, 0.5) * glint * 0.5;
          c = mix(c, water, 1.0 - smoothstep(8.2, 8.6, pr));
          totalEmissiveRadiance += water * 0.3 * (1.0 - smoothstep(8.2, 8.6, pr));
        }
        totalEmissiveRadiance += vec3(0.012, 0.05, 0.01) * lawn;
      } else if (type > 2.5) {
        // Platz: großes Plattenmuster
        vec2 tl = fract(w / 3.0);
        c = vec3(0.33, 0.29, 0.31) * (0.9 + 0.12 * gHash(floor(w / 3.0))) * (1.0 - step(0.94, max(tl.x, tl.y)) * 0.3);
      } else {
        c = walk;
      }
      float edge = min(min(lp.x, uBlock - lp.x), min(lp.y, uBlock - lp.y));
      c = mix(c, vec3(0.36, 0.32, 0.34), 1.0 - smoothstep(0.25, 0.4, edge));
    }
    float cz = abs(lp.x - (uBlock + S * 0.5));
    float cx = abs(lp.y - (uBlock + S * 0.5));
    float lineZ = (1.0 - inX) * inZ * (1.0 - smoothstep(0.1, 0.18, cz)) * step(0.5, fract(w.y / 6.0));
    float lineX = (1.0 - inZ) * inX * (1.0 - smoothstep(0.1, 0.18, cx)) * step(0.5, fract(w.x / 6.0));
    c = mix(c, vec3(0.8, 0.62, 0.25), max(lineZ, lineX));
    float zx = (1.0 - inZ) * inX * (step(lp.x, 3.0) + step(uBlock - 3.0, lp.x));
    float zz = (1.0 - inX) * inZ * (step(lp.y, 3.0) + step(uBlock - 3.0, lp.y));
    c = mix(c, vec3(0.55, 0.52, 0.55), clamp(zx * step(0.5, fract(w.y / 1.2)) + zz * step(0.5, fract(w.x / 1.2)), 0.0, 1.0) * 0.8);
    // weicher Übergang von der Stadt zur Promenade
    c = mix(c, vec3(0.4, 0.35, 0.38), smoothstep(-50.0, -46.0, d));
  }
  diffuseColor.rgb = c;
}`);
  };
  mat.customProgramCacheKey = () => 'island-ground';
  const geo = new THREE.PlaneGeometry(6000, 6000);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Meer: spiegelt den Abendhimmel, bewegte Wellen, Sonnenglitzern, Schaum an der Küste
function createWater(mu, time) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mu, { uTime: time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
varying vec3 vWorldP;
${COAST_GLSL}
${DUSK_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWorldP.xz;
  float d = length(w) - coastR(w);
  if (d < -2.0) discard;
  float t = uTime;
  vec3 n = normalize(vec3(
    sin(w.x * 0.11 + t * 0.8) * 0.05 + sin(w.y * 0.23 - t * 1.3) * 0.035 + sin((w.x - w.y) * 0.6 + t * 2.1) * 0.015,
    1.0,
    cos(w.y * 0.13 + t * 0.9) * 0.05 + sin((w.x + w.y) * 0.31 + t * 1.7) * 0.03 + cos(w.x * 0.7 - t * 2.4) * 0.015));
  vec3 V = normalize(vWorldP - cameraPosition);
  vec3 R = reflect(V, n);
  R.y = abs(R.y);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
  vec3 deep = vec3(0.025, 0.025, 0.07);
  vec3 col = mix(deep, duskSky(R) * 0.9, clamp(fres, 0.0, 1.0));
  col += DUSK_SUN * pow(max(dot(R, DUSK_SUN_DIR), 0.0), 350.0) * 5.0;
  // flaches Wasser am Ufer heller, Schaumkante läuft auf den Strand
  col = mix(col, vec3(0.32, 0.24, 0.3), (1.0 - smoothstep(0.0, 10.0, d)) * 0.35);
  float foam = (1.0 - smoothstep(-2.0, 3.5, d)) * (0.55 + 0.45 * sin(d * 2.2 - t * 2.0 + gHash(floor(w * 0.3)) * 2.0));
  col = mix(col, vec3(0.9, 0.8, 0.86), clamp(foam, 0.0, 1.0) * 0.75);
  diffuseColor.rgb = col;
}`);
  };
  mat.customProgramCacheKey = () => 'island-water';
  const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.18, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  return mesh;
}
