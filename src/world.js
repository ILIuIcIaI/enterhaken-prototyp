import * as THREE from 'three';
import { DUSK, DUSK_GLSL, SUN_DIR } from './palette.js';
import { gradientMap } from './toon.js';
import { TERRAIN_GLSL, WATER_Y, pondRadius } from './terrain.js';
import { drawGroundMap, MAP_EXT } from './groundmap.js';

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
  const mu = city.mapUniforms;
  const size = Math.min(4096, renderer.capabilities.maxTextureSize);
  let ground, sea, ponds;
  const build = () => {
    if (ground) { scene.remove(ground, ponds); ground.geometry.dispose(); mu.uLayout.value?.dispose(); }
    mu.uLayout.value = drawGroundMap(city, size);
    mu.uLayoutExt.value = MAP_EXT;
    ground = createGround(city, mu, time);
    ponds = createPonds(city, mu, time);
    scene.add(ground, ponds);
  };
  build();
  sea = createSea(mu, time);
  scene.add(sea);

  return {
    sun, sky,
    get ground() { return ground; },
    rebuild: build,
    update(focus, camera, t) {
      sky.position.copy(camera.position);
      sea.position.x = camera.position.x;
      sea.position.z = camera.position.z;
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

// Boden: Gelände-Mesh mit echten Höhen (Strand, Ufermauer, Hügel, Teichmulden). Farbe aus dem Bodenplan
// (Asphalt, Gehweg, Rasen, Wege, Markierungen), an der Küste analytisch Promenade, Sand, Meeresgrund.
function createGround(city, mu, time) {
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradientMap([0.45, 0.75, 1.0]) });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mu, { uTime: time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform sampler2D uLayout;
uniform float uLayoutExt;
varying vec3 vWorldP;
${COAST_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWorldP.xz;
  float d = length(w) - coastR(w);
  vec4 L = texture2D(uLayout, (w + uLayoutExt) / (2.0 * uLayoutExt));
  float m = min(L.r, min(L.g, L.b));
  float asphalt = L.r - m, lawn = L.g - m, path = L.b - m;
  vec2 tl = fract(w / 2.0);
  vec3 c = vec3(0.24, 0.21, 0.24) * (0.9 + 0.15 * gHash(floor(w * 0.5))) * (1.0 - step(0.93, max(tl.x, tl.y)) * 0.25);
  vec3 grass = vec3(0.15, 0.38, 0.13) * (0.8 + 0.3 * gHash(floor(w * 1.1)));
  vec3 pathC = vec3(0.44, 0.38, 0.36) * (0.9 + 0.12 * gHash(floor(w * 0.8)));
  vec3 asph = vec3(0.045, 0.04, 0.055) * (0.85 + 0.3 * gHash(floor(w * 0.7)));
  c = mix(c, grass, clamp(lawn, 0.0, 1.0));
  c = mix(c, pathC, clamp(path, 0.0, 1.0));
  c = mix(c, asph, clamp(asphalt, 0.0, 1.0));
  c = mix(c, vec3(0.72, 0.7, 0.68), clamp(m, 0.0, 1.0));
  float glow = lawn * (1.0 - m);
  // Teichgrund: dunkler, nasser Schlamm unter dem Wasserspiegel
  if (d < -60.0) c = mix(c, vec3(0.1, 0.08, 0.07), smoothstep(-0.2, -0.7, vWorldP.y));
  // Küste: Promenade → Ufermauer → Sand mit Rippeln → nasser Sand → Meeresgrund
  if (d > -46.0) {
    glow = 0.0;
    vec2 pt = fract(w / 1.6);
    vec3 prom = vec3(0.4, 0.35, 0.38) * (0.9 + 0.12 * gHash(floor(w / 1.6))) * (1.0 - step(0.92, max(pt.x, pt.y)) * 0.35);
    float rip = 0.5 + 0.5 * sin(dot(w, vec2(0.7, 0.3)) * 1.7 + gHash(floor(w * 0.1)) * 6.0);
    vec3 sand = vec3(0.66, 0.5, 0.42) * (0.86 + 0.1 * rip + 0.12 * gHash(floor(w * 1.6)));
    vec3 wet = vec3(0.34, 0.25, 0.25);
    vec3 bed = mix(vec3(0.3, 0.22, 0.24), vec3(0.06, 0.05, 0.09), smoothstep(0.0, 40.0, d));
    vec3 coastC = d < -37.6 ? prom : d < -36.8 ? vec3(0.3, 0.27, 0.3) : d < -5.0 ? sand : d < 0.5 ? mix(sand, wet, smoothstep(-5.0, -0.5, d)) : bed;
    c = mix(c, coastC, smoothstep(-48.0, -46.0, d));
  }
  diffuseColor.rgb = c;
  totalEmissiveRadiance += vec3(0.012, 0.05, 0.01) * glow;
}`);
  };
  mat.customProgramCacheKey = () => 'island-ground';

  // Gitter: fein (2,5 m) über der Insel, grob am Rand; Höhen direkt aus dem Gelände
  const axis = [];
  for (let x = -640; x < -540; x += 10) axis.push(x);
  for (let x = -540; x < 540; x += 2.5) axis.push(x);
  for (let x = 540; x <= 640; x += 10) axis.push(x);
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  const T = city.terrain;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 3, x = axis[i], z = axis[j];
      pos[o] = x;
      pos[o + 1] = T.height(x, z);
      pos[o + 2] = z;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  // Meeresgrund jenseits des Gitters
  const bed = new THREE.Mesh(new THREE.RingGeometry(600, 6000, 64, 1).rotateX(-Math.PI / 2).translate(0, -14.8, 0), mat);
  mesh.add(bed);
  return mesh;
}

// Wellen: vier Gerstner-Wellen plus eine Brandungswelle, die senkrecht zur Küste aufs Ufer läuft.
// Flaches Wasser dämpft die offenen Wellen, die Brandung wird zum Ufer hin stärker.
const WAVES_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWaveAmp;
const vec4 WAVE_D = vec4(0.9, 0.44, -0.3, 0.95);
const vec4 WAVE_D2 = vec4(0.7, -0.7, -0.85, -0.5);
const vec4 WAVE_L = vec4(48.0, 27.0, 15.0, 8.5);
const vec4 WAVE_A = vec4(0.32, 0.18, 0.09, 0.045);
vec3 waveDisp(vec2 p, float amp, float shore, float d, out vec3 nrm) {
  vec3 disp = vec3(0.0);
  vec3 nn = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 4; i++) {
    vec2 D = i == 0 ? WAVE_D.xy : i == 1 ? WAVE_D.zw : i == 2 ? WAVE_D2.xy : WAVE_D2.zw;
    D = normalize(D);
    float L = WAVE_L[i], A = WAVE_A[i] * amp;
    float k = 6.2831 / L, c = sqrt(9.81 / k);
    float f = k * (dot(D, p) - c * uTime);
    float Q = 0.55 / (k * WAVE_A[i] * 4.0);
    disp.x += Q * A * D.x * cos(f);
    disp.z += Q * A * D.y * cos(f);
    disp.y += A * sin(f);
    nn.x -= D.x * k * A * cos(f);
    nn.z -= D.y * k * A * cos(f);
    nn.y -= Q * k * A * sin(f);
  }
  // Brandung: Wellenkämme laufen mit abnehmendem Küstenabstand an Land
  float ks = 6.2831 / 14.0;
  float fs = ks * d + uTime * 1.7;
  float As = 0.16 * shore;
  disp.y += As * sin(fs);
  vec2 g = normalize(p + 1e-4);
  nn.xz -= g * ks * As * cos(fs);
  nrm = normalize(nn);
  return disp;
}`;

// gemeinsame Wasserfarbe: Himmelsspiegelung, Tiefe, Sonnenglitzern, Schaum
const WATER_SHADE_GLSL = /* glsl */ `
vec4 shadeWater(vec3 wp, vec3 n, float depth, float foamExtra, float t) {
  // feine Kräuselung
  vec2 q = wp.xz;
  n = normalize(n + vec3(
    sin(q.x * 0.9 + t * 2.3) * 0.03 + sin((q.x + q.y) * 2.1 - t * 3.1) * 0.015,
    0.0,
    cos(q.y * 1.1 - t * 2.0) * 0.03 + sin((q.x - q.y) * 1.7 + t * 2.7) * 0.015));
  vec3 V = normalize(wp - cameraPosition);
  vec3 R = reflect(V, n);
  R.y = abs(R.y);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
  vec3 deep = vec3(0.02, 0.025, 0.07);
  vec3 shallow = vec3(0.16, 0.17, 0.24);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 6.0, depth));
  vec3 col = mix(body, duskSky(R) * 0.9, clamp(fres, 0.0, 1.0));
  col += DUSK_SUN * pow(max(dot(R, DUSK_SUN_DIR), 0.0), 320.0) * 5.0;
  float foam = clamp(foamExtra, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.84, 0.9), foam * 0.85);
  float alpha = mix(0.35, 0.97, smoothstep(0.0, 2.2, depth));
  return vec4(col, max(alpha, foam));
}`;

function waterMaterial(mu, time, extra, key) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true });
  const uWaveAmp = { value: extra.amp };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mu, { uTime: time, uWaveAmp });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${COAST_GLSL}
${TERRAIN_GLSL}
${WAVES_GLSL}
${extra.pond ? 'attribute float aDepth;' : ''}
varying vec3 vWorldP;
varying vec3 vNrm;
varying float vDepth;
varying float vShore;
varying float vD;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float d = length(wp.xz) - coastR(wp.xz);
  float depth = ${extra.pond ? 'aDepth' : `${WATER_Y.toFixed(2)} - beachHeight(d)`};
  float amp = uWaveAmp * (0.3 + 0.7 * smoothstep(0.0, 7.0, depth));
  float shore = ${extra.pond ? '0.0' : 'smoothstep(60.0, 8.0, d) * smoothstep(-1.0, 1.5, depth)'};
  vec3 nrm;
  vec3 disp = waveDisp(wp.xz, amp, shore, d, nrm);
  transformed += disp;
  vWorldP = wp + disp;
  vNrm = nrm;
  vDepth = depth;
  vShore = shore;
  vD = d;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
varying vec3 vWorldP;
varying vec3 vNrm;
varying float vDepth;
varying float vShore;
varying float vD;
${COAST_GLSL}
${DUSK_GLSL}
${WATER_SHADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float t = uTime;
  vec2 w = vWorldP.xz;
  float depth = vDepth + (vWorldP.y - ${extra.pond ? 'vWorldP.y' : WATER_Y.toFixed(2)});
  // Schaum: Uferkante, Brandungskämme kurz vor dem Strand, vereinzelt Schaumkronen draußen
  float edge = ${extra.pond ? '(1.0 - smoothstep(0.02, 0.12, depth)) * 0.35' : '1.0 - smoothstep(0.05, 0.45, depth)'};
  float crest = smoothstep(0.75, 0.98, sin(0.4488 * vD + t * 1.7 + 0.9)) * vShore * (1.0 - smoothstep(0.5, 3.5, depth));
  float caps = ${extra.pond ? '0.0' : 'smoothstep(0.36, 0.46, (vWorldP.y - ' + WATER_Y.toFixed(2) + ')) * 0.45 * (1.0 - smoothstep(60.0, 160.0, distance(cameraPosition, vWorldP)))'};
  float broken = 0.6 + 0.4 * gHash(floor(w * 1.3) + floor(t * 2.0));
  vec4 wc = shadeWater(vWorldP, vNrm, max(depth, 0.0), (edge * 0.9 + crest + caps) * broken, t);
  diffuseColor = vec4(wc.rgb, wc.a);
}`);
  };
  mat.customProgramCacheKey = () => key;
  mat.userData.uWaveAmp = uWaveAmp;
  return mat;
}

// Meer: kreisförmiges Gitter um die Kamera, nah fein (echte 3D-Wellen), fern grob
function createSea(mu, time) {
  const rings = [0];
  for (let r = 1.2; r < 6000; r *= 1.075) rings.push(r);
  const seg = 160;
  const pos = [];
  for (const r of rings) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s, b = i * seg + ((s + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, waterMaterial(mu, time, { amp: 1, pond: false }, 'island-sea'));
  mesh.position.y = WATER_Y;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// Teiche: Gitter in Uferform, Tiefe je Eckpunkt aus dem Gelände, sanfte kleine Wellen
function createPonds(city, mu, time) {
  const group = new THREE.Group();
  const mat = waterMaterial(mu, time, { amp: 0.11, pond: true }, 'island-pond');
  const lily = [];
  for (const park of city.parks) {
    const p = park.pond;
    if (!p) continue;
    const ringsN = 20, seg = 72;
    const pos = [], depth = [];
    for (let i = 0; i <= ringsN; i++) {
      const f = (i / ringsN) * 1.22;
      for (let s = 0; s < seg; s++) {
        const th = (s / seg) * Math.PI * 2, r = pondRadius(p, th) * f;
        const x = p.x + Math.cos(th) * r, z = p.z + Math.sin(th) * r;
        pos.push(x, 0, z);
        depth.push(p.level - city.terrain.height(x, z));
      }
    }
    const idx = [];
    for (let i = 0; i < ringsN; i++) {
      for (let s = 0; s < seg; s++) {
        const a = i * seg + s, b = i * seg + ((s + 1) % seg), c = a + seg, d = b + seg;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = p.level;
    mesh.renderOrder = 2;
    group.add(mesh);
    // Seerosenblätter in Gruppen
    for (let k = 0; k < 14; k++) {
      const th = Math.random() * Math.PI * 2, r = pondRadius(p, th) * (0.55 + Math.random() * 0.35);
      lily.push({ x: p.x + Math.cos(th) * r, y: p.level + 0.03, z: p.z + Math.sin(th) * r, s: 0.5 + Math.random() * 0.6, a: Math.random() * 6.28 });
    }
  }
  if (lily.length) {
    const g = new THREE.CircleGeometry(1, 14, 0.4, Math.PI * 2 - 0.4).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(g, new THREE.MeshToonMaterial({ color: '#3f6e3a', gradientMap: gradientMap([0.5, 0.8, 1.0]) }), lily.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3();
    lily.forEach((l, i) => inst.setMatrixAt(i, m.compose(pp.set(l.x, l.y, l.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.a), s.setScalar(l.s))));
    group.add(inst);
  }
  return group;
}
