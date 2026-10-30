import * as THREE from 'three';
import { DUSK, DUSK_GLSL, SUN_DIR, SKY } from './palette.js';
import { gradientMap } from './toon.js';
import { TERRAIN_GLSL, WATER_Y, pondRadius } from './terrain.js';
import { drawGroundMap, MAP_EXT } from './groundmap.js';
import { GROUND_PBR_PARS, GROUND_PBR_COLOR } from './groundpbr.js';

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
uniform float uStars;  // Sterne (0–1, nach Tageszeit)
uniform float uDay;    // 0 Abend/Nacht … 1 Tag: Wolken weiß statt farbig
uniform float uClouds; // zusätzliche Bewölkung (Wetter)
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
  // (physikalischer Himmel: erst, wenn es wirklich dunkel ist)
  float starVis = uStars * mix(1.0, 1.0 - smoothstep(-0.16, -0.04, DUSK_SUN_DIR.y), uRealSky);
  if (d.y > 0.25 && starVis > 0.0) {
    vec2 sc = floor(vec2(atan(d.z, d.x), d.y) * vec2(300.0, 260.0));
    float st = step(0.9975, sHash(sc));
    col += vec3(0.8, 0.75, 1.0) * st * smoothstep(0.25, 0.7, d.y) * mix(0.6, 0.12, uRealSky) * starVis;
  }

  // Mond (nachts gegenüber der Sonne) mit leichtem Hof
  if (uMoon > 0.0) {
    float m = max(dot(d, -DUSK_SUN_DIR), 0.0);
    col += vec3(0.82, 0.86, 1.0) * (smoothstep(0.99955, 0.99975, m) * 3.0 + pow(m, 80.0) * 0.12) * uMoon;
  }

  // Wolkenbänder, von unten durch die Sonne angestrahlt; tagsüber weiß, bei Bewölkung dichter
  if (d.y > -0.02) {
    vec2 uv = d.xz / (d.y + 0.14) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv * 1.3) * 0.65 + fbm(uv * vec2(0.6, 3.0)) * 0.35;
    float dens = smoothstep(0.48 - 0.2 * uClouds, 0.78 - 0.18 * uClouds, n) * smoothstep(-0.02, 0.1, d.y) * (1.0 - smoothstep(0.55 + 0.4 * uClouds, 0.9 + 0.1 * uClouds, d.y));
    float lit = pow(s, 3.0) * uSunUp;
    vec3 cloudCol = mix(DUSK_HIGH * 0.55, DUSK_MID * 0.9, smoothstep(0.0, 0.25, 1.0 - d.y));
    cloudCol = mix(cloudCol, vec3(0.8, 0.82, 0.88) * (0.75 + 0.25 * smoothstep(0.0, 0.3, d.y)) * (1.0 - 0.45 * uClouds), uDay);
    cloudCol = mix(cloudCol, DUSK_GLOW * 1.6 + DUSK_SUN * 0.4, lit * 0.85 * (1.0 - 0.75 * uDay));
    float edge = smoothstep(0.5, 0.62, n) - smoothstep(0.62, 0.8, n);
    cloudCol += DUSK_SUN * edge * lit * 1.2 * (1.0 - 0.6 * uDay);
    if (uRealSky > 0.5) {
      // Hyper-Realistic-Mode: Wolken im echten Licht – Himmelslicht von oben und vom Horizont, Sonne in der Farbe der
      // Tageszeit (zur Sonne hin heller, Ränder leuchten), dichte Wolken unten dunkler
      vec3 amb = duskSky(vec3(0.0, 1.0, 0.0)) * 0.8 + duskSky(vec3(d.x, 0.05, d.z)) * 0.5;
      vec3 sunL = DUSK_SUN * uSunUp * (0.3 + 1.3 * pow(s, 6.0) + 0.7 * edge);
      cloudCol = (amb + sunL * 0.45) * (1.0 - 0.55 * uClouds * smoothstep(0.5, 0.9, n));
      // bei tiefer Sonne von unten angestrahlt: zur Sonne hin glühend, gegenüber dunkel und violett
      float moodC = max(uGold, uDawn);
      if (moodC > 0.001) {
        vec3 warm = mix(vec3(1.0, 0.36, 0.13), vec3(1.0, 0.55, 0.42), uDawn / moodC);
        vec3 far = mix(vec3(0.14, 0.09, 0.16), vec3(0.32, 0.3, 0.4), uDawn / moodC);
        cloudCol = mix(cloudCol, mix(far, warm, pow(s, 1.8)) + warm * edge * pow(s, 2.0) * 0.9, moodC * 0.9);
      }
    }
    col = mix(col, cloudCol, dens * 0.9);
  }

  // Sonne mit Glühen (nur über dem Horizont; der physikalische Himmel hat seinen Sonnenhof selbst)
  col += DUSK_GLOW * (pow(s, 8.0) * 0.55 + pow(s, 90.0) * 1.6) * uSunUp * (1.0 - uRealSky);
  col += DUSK_SUN * smoothstep(0.99955, 0.9998, s) * uSunStrength * uSunUp * (1.0 - uRealSky * uPOvercast);
  // nie NaN oder Unendlich ausgeben: der Himmel wird auch in die Umgebungskarte gerendert, deren Weichzeichner ein
  // einzelnes solches Pixel über die ganze Karte verschmiert (alle PBR-Flächen würden schwarz)
  col = (any(isnan(col)) || any(isinf(col))) ? vec3(0.0) : clamp(col, 0.0, 6e4);
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
    uniforms: { uTime: { value: 0 }, uSunStrength: { value: 14 }, uStars: { value: 1 }, uDay: { value: 0 }, uClouds: { value: 0 }, ...SKY },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  // die Himmelskugel sitzt immer an der Kamera, die gerade rendert (auch der Spiegelkamera für nasse Straßen)
  sky.onBeforeRender = (r, s, cam) => {
    sky.position.copy(cam.position);
    sky.updateMatrixWorld();
  };
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
  // Nässe und Straßenspiegelung (environment.js, reflection.js)
  // uReal: Hyper-Realistic-Mode (Wasser), uSeaRefl: Spiegelbild liegt auf Meereshöhe (Meer spiegelt die Stadt)
  const wet = { uWet: { value: 0 }, uReflOn: { value: 0 }, tRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReal: { value: 0 }, uSeaRefl: { value: 0 } };
  const size = Math.min(4096, renderer.capabilities.maxTextureSize);
  let ground, sea, ponds;
  const build = () => {
    if (ground) { scene.remove(ground, ponds); ground.geometry.dispose(); mu.uLayout.value?.dispose(); }
    mu.uLayout.value = drawGroundMap(city, size);
    mu.uLayoutExt.value = MAP_EXT;
    mu.tRock.value?.dispose();
    const rk = city.terrain.rock?.depthTexture();
    mu.tRock.value = rk?.tex ?? null;
    if (rk) mu.uRock.value.copy(rk.rect);
    ground = createGround(city, mu, time, wet);
    ponds = createPonds(city, mu, time, wet);
    scene.add(ground, ponds);
  };
  build();
  sea = createSea(mu, time, wet);
  scene.add(sea);

  return {
    sun, sky, hemi, sea, wet,
    get ground() { return ground; },
    get ponds() { return ponds; },
    rebuild: build,
    // Himmel nach Tageszeit und Wetter (environment.js)
    setSky({ stars, day, clouds = 0 }) {
      const u = skyMat.uniforms;
      u.uStars.value = stars;
      u.uDay.value = day;
      u.uClouds.value = clouds;
    },
    // lightDir: Richtung des schattenwerfenden Lichts (Sonne oder Mond)
    update(focus, camera, t, lightDir = SUN_DIR) {
      sky.position.copy(camera.position);
      sea.position.x = camera.position.x;
      sea.position.z = camera.position.z;
      skyMat.uniforms.uTime.value = t;
      time.value = t;
      const snap = 300 / 2048;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx, 0, fz).addScaledVector(lightDir, 650);
      sun.target.updateMatrixWorld();
    },
  };
}

// Boden: Gelände-Mesh mit echten Höhen (Strand, Ufermauer, Hügel, Teichmulden). Farbe aus dem Bodenplan
// (Asphalt, Gehweg, Rasen, Wege, Markierungen), an der Küste analytisch Promenade, Sand, Meeresgrund.
function createGround(city, mu, time, wet) {
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradientMap([0.45, 0.75, 1.0]) });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mu, { uTime: time }, wet);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform sampler2D uLayout;
uniform float uLayoutExt;
uniform vec4 uCanal;
uniform vec4 uCanalBr;
uniform float uCanalBrHalf;
varying vec3 vWorldP;
${COAST_GLSL}
uniform float uWet;
uniform float uReflOn;
uniform sampler2D tRefl;
uniform mat4 uReflMat;
${DUSK_GLSL}
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}
// Tropfenringe: je Zelle ein Ring, der sich mit eigener Phase ausbreitet und vergeht (Richtung = Neigung der Normale)
vec2 gRipple(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 q = fract(p) - 0.5 - (vec2(gHash(cell + 7.13), gHash(cell + 3.71)) - 0.5) * 0.5;
  float ph = fract(t * 1.1 + gHash(cell));
  float r = length(q);
  float ring = sin((r - ph * 0.45) * 55.0) * smoothstep(0.07, 0.0, abs(r - ph * 0.45)) * (1.0 - ph);
  return q / max(r, 1e-3) * ring;
}
#ifdef STANDARD
${GROUND_PBR_PARS}
#endif`)
      // Hyper-Realistic-Mode (PBR-Zwilling, STANDARD): echte Oberflächen aus groundpbr.js, sonst der Cel-Look
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = gRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef STANDARD
normal = normalize((viewMatrix * vec4(gNw, 0.0)).xyz);
#endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef STANDARD
${GROUND_PBR_COLOR}
#else
{
  vec2 w = vWorldP.xz;
  // Kanal: Boden ausschneiden, nur unter den Brücken bleibt die Straße
  if (w.x > uCanal.x && w.x < uCanal.z && w.y > uCanal.y && w.y < uCanal.w) {
    vec4 bd = abs(vec4(w.y) - uCanalBr);
    if (min(min(bd.x, bd.y), min(bd.z, bd.w)) > uCanalBrHalf) discard;
  }
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
  // Regen: nasser, dunklerer Boden; Asphalt und Wege mit Pfützen, die die Stadt spiegeln (Tropfenringe verzerren das
  // Spiegelbild); ohne Spiegelungen nur der Himmel
  if (uWet > 0.001 && d < 0.5) {
    float hard = clamp(asphalt + path + m, 0.0, 1.0);
    if (d > -46.0) hard = d < -37.6 ? 1.0 : 0.45; // Promenade befestigt, Sand nur nass
    float pud = smoothstep(0.5, 0.68, gNoise(w * 0.11) * 0.65 + gNoise(w * 0.43 + 9.0) * 0.35) * hard;
    c *= 1.0 - uWet * (0.3 + 0.25 * hard + 0.2 * pud);
    vec2 rp = (gRipple(w * 1.7, uTime) + gRipple(w * 2.6 + 13.0, uTime * 1.23 + 0.4)) * uWet;
    vec3 N = normalize(vec3(rp.x * 0.45, 1.0, rp.y * 0.45));
    vec3 V = normalize(vWorldP - cameraPosition);
    float fres = mix(0.08, 1.0, pow(clamp(1.0 - dot(-V, N), 0.0, 1.0), 4.0));
    float k = uWet * hard * (0.22 + 0.78 * pud) * (0.3 + 0.7 * fres);
    vec3 refl;
    if (uReflOn > 0.5) {
      vec4 ruv = uReflMat * vec4(vWorldP, 1.0);
      ruv.xy += N.xz * ruv.w * 0.05;
      refl = texture2DProj(tRefl, ruv).rgb;
    } else {
      vec3 R = reflect(V, N);
      R.y = abs(R.y);
      refl = duskSky(R);
    }
    totalEmissiveRadiance += refl * k;
  }
  diffuseColor.rgb = c;
  totalEmissiveRadiance += vec3(0.012, 0.05, 0.01) * glow;
}
#endif`);
  };
  mat.customProgramCacheKey = () => 'island-ground';

  // Gitter: fein (3 m) über der Insel, grob am Rand; Höhen direkt aus dem Gelände
  const axis = [];
  for (let x = -800; x < -690; x += 11) axis.push(x);
  for (let x = -690; x < 690; x += 3) axis.push(x);
  for (let x = 690; x <= 800; x += 11) axis.push(x);
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  const T = city.terrain;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 3, x = axis[i], z = axis[j];
      pos[o] = x;
      pos[o + 1] = T.height(x, z, true); // ohne Kanalbett: den Kanal schneidet der Shader aus
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
// Flaches Wasser dämpft die offenen Wellen, die Brandung wird zum Ufer hin stärker. fade: Wellen kürzer als das
// Doppelte davon werden ausgeblendet – im Vertex-Shader die Gitterweite (sonst Kästchen und Moiré, weil das Gitter
// in der Ferne gröber als die Welle ist), im Fragment-Shader die Pixelgröße. Gefärbt wird pro Pixel: Höhe und Normale
// kommen im Fragment-Shader aus derselben Funktion, damit nichts über große Dreiecke verschmiert.
const WAVES_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWaveAmp;
const vec4 WAVE_D = vec4(0.9, 0.44, -0.3, 0.95);
const vec4 WAVE_D2 = vec4(0.7, -0.7, -0.85, -0.5);
const vec4 WAVE_L = vec4(48.0, 27.0, 15.0, 8.5);
const vec4 WAVE_A = vec4(0.32, 0.18, 0.09, 0.045);
vec3 waveDisp(vec2 p, float amp, float shore, float d, float fade, out vec3 nrm) {
  vec3 disp = vec3(0.0);
  vec3 nn = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 4; i++) {
    vec2 D = i == 0 ? WAVE_D.xy : i == 1 ? WAVE_D.zw : i == 2 ? WAVE_D2.xy : WAVE_D2.zw;
    D = normalize(D);
    float L = WAVE_L[i], A = WAVE_A[i] * amp * (1.0 - smoothstep(L * 0.25, L * 0.5, fade));
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
  float As = 0.16 * shore * (1.0 - smoothstep(3.5, 7.0, fade));
  disp.y += As * sin(fs);
  vec2 g = p / max(length(p), 1e-4);
  nn.xz -= g * ks * As * cos(fs);
  nrm = normalize(nn);
  return disp;
}`;

// gemeinsame Wasserfarbe: Himmelsspiegelung, Tiefe, Sonnenglitzern, Schaum
const WATER_SHADE_GLSL = /* glsl */ `
// glattes Rauschen, jede Oktave gedreht – so bleibt kein Raster sichtbar (Schaum und Flecken ohne Kästchen)
float wVal(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wFbm(vec2 p) {
  const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * wVal(p);
    p = ROT * p * 2.03 + 7.1;
    a *= 0.5;
  }
  return v / 0.9375;
}

vec4 shadeWater(vec3 wp, vec3 n, float depth, float foamExtra, float t, float fp) {
  // feine Kräuselung: schräge Wellenzüge (achsparallele ergaben ein Karomuster), feiner als ein Pixel ausgeblendet
  vec2 q = wp.xz;
  float ka = 1.0 - smoothstep(0.8, 2.4, fp), kb = 1.0 - smoothstep(0.35, 1.0, fp);
  n = normalize(n + vec3(
    sin(dot(q, vec2(0.82, 0.57)) * 0.9 + t * 2.3) * 0.03 * ka + sin(dot(q, vec2(-0.37, 0.93)) * 2.1 - t * 3.1) * 0.015 * kb,
    0.0,
    sin(dot(q, vec2(0.57, -0.82)) * 1.1 - t * 2.0) * 0.03 * ka + sin(dot(q, vec2(0.93, 0.37)) * 1.7 + t * 2.7) * 0.015 * kb));
  vec3 V = normalize(wp - cameraPosition);
  vec3 R = reflect(V, n);
  R.y = abs(R.y);
  float fres = 0.04 + 0.96 * pow(clamp(1.0 - dot(-V, n), 0.0, 1.0), 5.0); // geklemmt: pow einer negativen Basis = NaN
  fres = mix(fres, max(fres, 0.8), smoothstep(1.5, 9.0, fp)); // weit draußen keine dunklen Streifen von einzelnen Wellen
  vec3 deep = vec3(0.02, 0.025, 0.07);
  vec3 shallow = vec3(0.16, 0.17, 0.24);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 6.0, depth));
  vec3 col = mix(body, duskSky(R) * 0.9, clamp(fres, 0.0, 1.0));
  col += DUSK_SUN * pow(max(dot(R, DUSK_SUN_DIR), 0.0), 320.0) * 5.0 * uSunUp;
  col += vec3(0.75, 0.8, 1.0) * pow(max(dot(R, -DUSK_SUN_DIR), 0.0), 420.0) * 3.0 * uMoon;
  float foam = clamp(foamExtra, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.84, 0.9), foam * 0.85);
  float alpha = mix(0.35, 0.97, smoothstep(0.0, 2.2, depth));
  return vec4(col, max(alpha, foam));
}

// Hyper-Realistic-Mode: 8 gerichtete Wellenzüge mit Tiefwasser-Dispersion (ω = √(g·k), lange Wellen laufen
// schneller), Normale aus den Ableitungen, Wellen feiner als ein Pixel ausgeblendet (kein Flimmern). Leicht verzogene
// Koordinaten, damit keine geraden, regelmäßigen Linien entstehen
vec3 realWaveN(vec2 p, float t, float fp) {
  p += 2.2 * vec2(wVal(p * 0.043 + 3.0), wVal(p.yx * 0.037 + 11.0));
  vec2 g = vec2(0.0);
  float amp = 0.05, len = 7.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 2.399 + 0.6;
    vec2 dir = vec2(cos(a), sin(a));
    float k = 6.2831 / len;
    float ph = dot(dir, p) * k + sqrt(9.81 * k) * t + fi * 1.7;
    g += dir * (amp * k * cos(ph)) * (1.0 - smoothstep(0.35, 0.9, fp * k));
    amp *= 0.7;
    len *= 0.62;
  }
  return vec3(-g.x, 0.0, -g.y);
}
// Wasser physikalisch: Fresnel nach Brechungsindex 1,33 (F0 0,02), Spiegelbild der Stadt (planare Spiegelung auf
// Meereshöhe) bzw. Himmel, tiefenabhängiges Streulicht im Wasserkörper, Schaum als feine Spitze. Sonnenglitzer nach
// Cox & Munk: Die Wellenneigung, die die Sonne ins Auge spiegelt, ist normalverteilt – bei tiefer Sonne wird daraus der
// lange, glitzernde Pfad übers Wasser; dazu einzelne Funken aus der feinen Normale
vec4 shadeWaterReal(vec3 wp, vec3 nBig, float depth, float foamExtra, float t, float mirror, float murky, float fp) {
  vec3 n = normalize(nBig + realWaveN(wp.xz, t, fp));
  vec3 V = normalize(wp - cameraPosition);
  float cosV = clamp(dot(-V, n), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
  vec3 R = reflect(V, n);
  R.y = abs(R.y);
  vec3 refl = duskSky(R);
  if (mirror > 0.5) {
    vec4 ruv = uReflMat * vec4(wp, 1.0);
    ruv.xy += n.xz * ruv.w * 0.045;
    refl = texture2DProj(tRefl, ruv).rgb;
  }
  float clear = (1.0 - uPOvercast) * (1.0 - uPOvercast); // unter geschlossener Wolkendecke kein Glitzern
  vec3 Hs = normalize(DUSK_SUN_DIR - V);
  vec2 sl = Hs.xz / max(Hs.y, 0.04);
  float moodW = max(uGold, uDawn);
  float pdf = exp(-dot(sl, sl) / mix(0.036, 0.06, moodW)); // Neigung σ² ≈ 0,018–0,03 (leichte Brise)
  // der Pfad zerfällt in waagrechte Flecken, die mit den Wellen treiben – nahe feine Funken, fern ein ruhiger Mittelwert
  float flecks = wFbm(wp.xz * 0.55 + vec2(t * 0.35, -t * 0.21) + nBig.xz * 7.0);
  // Funken: Koordinaten nach der Sonne ausgerichtet und gewellt (kein Raster), quer zur Sonne langgezogen
  vec2 sd = DUSK_SUN_DIR.xz / max(length(DUSK_SUN_DIR.xz), 1e-4), gq = vec2(dot(wp.xz, vec2(-sd.y, sd.x)), dot(wp.xz, sd));
  gq += 1.6 * vec2(wVal(gq * 0.31 + 3.7), wVal(gq.yx * 0.27 + 8.1)) + nBig.xz * 14.0;
  float spark = wFbm(gq * vec2(0.85, 3.3) + vec2(t * 0.5, -t * 1.1));
  flecks = mix(flecks, flecks * 0.3 + spark * 0.7, 1.0 - smoothstep(0.2, 1.0, fp));
  float sh = max(dot(R, DUSK_SUN_DIR), 0.0);
  vec3 glint = DUSK_SUN * (pdf * mix(2.6, 7.5, moodW) * smoothstep(0.34, 0.68, flecks) + pow(sh, 1400.0) * 70.0) * uSunUp;
  glint *= mix(vec3(1.0), mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.8, 0.6), uDawn / max(moodW, 1e-3)), moodW);
  glint += vec3(0.75, 0.8, 1.0) * (pow(max(dot(R, -DUSK_SUN_DIR), 0.0), 1400.0) * 14.0) * uMoon;
  glint *= clear;
  // Streulicht im Wasser: tief dunkel blaugrün, flach türkis über Sand; Kanal trüb grünlich
  float L = dot(DUSK_HIGH, vec3(0.2126, 0.7152, 0.0722)) * 1.6 + uSunUp * max(DUSK_SUN_DIR.y, 0.0) * 1.1 + 0.004;
  vec3 deep = mix(vec3(0.006, 0.03, 0.045), vec3(0.02, 0.035, 0.025), murky);
  vec3 shallow = mix(vec3(0.05, 0.14, 0.13), vec3(0.05, 0.07, 0.045), murky);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 7.0, depth)) * L;
  // Schaum als weiche Spitze: nahe ein Netz aus Graten, das auch in den Maschen nie ganz abreißt, fern ein Mittelwert
  float web = 1.0 - abs(2.0 * wFbm(wp.xz * 1.15 + vec2(t * 0.12, -t * 0.09)) - 1.0);
  float near = 1.0 - smoothstep(0.25, 1.2, fp);
  float foam = clamp(foamExtra, 0.0, 1.0) * mix(0.5, mix(0.22, 1.0, smoothstep(0.3, 0.92, web)), near);
  vec3 col = mix(body, refl, F) + glint * (1.0 - foam);
  col = mix(col, vec3(0.85) * (L * 0.6 + 0.03), foam * 0.9);
  float alpha = mix(0.55, 0.985, smoothstep(0.0, 2.5, depth));
  return vec4(col, max(alpha, foam));
}`;

function waterMaterial(mu, time, extra, key, wet) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true });
  const uWaveAmp = { value: extra.amp };
  const sea = !extra.pond;
  const SEA_Y = WATER_Y.toFixed(2);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mu, { uTime: time, uWaveAmp }, wet);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${COAST_GLSL}
${TERRAIN_GLSL}
${WAVES_GLSL}
${extra.pond ? 'attribute float aDepth;' : ''}
varying vec3 vWorldP;
varying vec2 vBase;
varying float vDepth;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float d = length(wp.xz) - coastR(wp.xz);
  float depth = ${extra.pond ? 'aDepth' : `${SEA_Y} - beachHeight(d)`};
  float amp = uWaveAmp * (0.3 + 0.7 * smoothstep(0.0, 7.0, depth));
  float shore = ${extra.pond ? '0.0' : 'smoothstep(60.0, 8.0, d) * smoothstep(-1.0, 1.5, depth)'};
  vec3 nrm;
  // das Meeresgitter wächst mit dem Abstand zur Kamera (Ringe je 7,5 %): kürzere Wellen kann es nicht darstellen. Fern
  // bleibt die Fläche ganz flach – die Wellen liefert dort allein die Normale pro Pixel, und keine Tiefensprünge an den
  // Kämmen erzeugen schwarze Tuschestriche am Horizont
  vec3 disp = waveDisp(wp.xz, amp, shore, d, ${extra.pond ? '0.0' : '0.2 * distance(wp.xz, cameraPosition.xz)'}, nrm);
  transformed += disp;
  vWorldP = wp + disp;
  vBase = wp.xz;
  vDepth = depth;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 uCanal;
uniform float uReal;
uniform float uSeaRefl;
uniform sampler2D tRefl;
uniform mat4 uReflMat;
uniform sampler2D tRock;
uniform vec3 uRock;
varying vec3 vWorldP;
varying vec2 vBase;
varying float vDepth;
${COAST_GLSL}
${TERRAIN_GLSL}
${DUSK_GLSL}
${WAVES_GLSL}
${WATER_SHADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float t = uTime;
  vec2 w = vWorldP.xz;
  ${sea ? '// das Meeresnetz liegt unter der ganzen Insel – im Kanal (Boden ausgeschnitten) darf es nicht durchscheinen\n  if (w.x > uCanal.x && w.x < uCanal.z && w.y > uCanal.y && w.y < uCanal.w) discard;' : ''}
  // Höhe, Normale, Tiefe und Küstenabstand pro Pixel – nichts verschmiert über die Dreiecke des groben Gitters
  vec2 b = vBase;
  float fp = max(length(fwidth(b)), 1e-3);
  float vd = length(b) - coastR(b);
  float depth0 = ${extra.pond ? 'vDepth' : `${SEA_Y} - beachHeight(vd)`};
  float rockD = 99.0;
  ${sea ? `{
    // Felsinsel: Flachwasser aus ihrer Höhenkarte
    vec2 ruv = (b - uRock.xy) / (2.0 * uRock.z) + 0.5;
    if (ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
      float rv = texture2D(tRock, ruv).r;
      rockD = ${SEA_Y} - mix(${(WATER_Y - 6).toFixed(2)}, ${(WATER_Y + 2).toFixed(2)}, rv);
      depth0 = mix(depth0, min(depth0, rockD), smoothstep(0.0, 0.1, rv));
      if (rv < 0.01) rockD = 99.0;
    }
  }` : ''}
  float amp = uWaveAmp * (0.3 + 0.7 * smoothstep(0.0, 7.0, depth0));
  float shore = ${extra.pond ? '0.0' : 'smoothstep(60.0, 8.0, vd) * smoothstep(-1.0, 1.5, depth0)'};
  vec3 nrm;
  vec3 disp = waveDisp(b, amp, shore, vd, fp * 2.5, nrm);
  float rise = disp.y;
  float depth = depth0${sea ? ' + rise' : ''};
  // Schaum: Uferkante, Brandungskämme kurz vor dem Strand, vereinzelt Schaumkronen draußen: Sicheln an der Vorderseite
  // der Wellenberge, die Lage kommt aus einem langsam treibenden Rauschen
  vec2 drift = vec2(t * 0.35, -t * 0.22);
  float edge = ${extra.pond ? '(1.0 - smoothstep(0.02, 0.12, depth)) * 0.35' : '1.0 - smoothstep(0.05, 0.45, depth)'};
  float crest = smoothstep(0.75, 0.98, sin(0.4488 * vd + t * 1.7 + 0.9)) * shore * (1.0 - smoothstep(0.5, 3.5, depth));
  if (rockD < 98.0) edge = max(edge, (1.0 - smoothstep(0.05, 0.55 + 0.75 * wVal(w * 0.3 + vec2(t * 0.17, -t * 0.11)), rockD + rise * 0.6)) * 0.85); // Gischtsaum am Fels
  float patchy = wFbm(w * 0.42 + drift * 0.6);
  float bn = wFbm(w * 1.15 + drift);
  float caps = ${extra.pond ? '0.0' : 'smoothstep(0.26, 0.44, rise) * smoothstep(0.015, 0.1, dot(nrm.xz, vec2(0.9, 0.44))) * 0.6 * smoothstep(0.5, 0.68, patchy) * (1.0 - smoothstep(60.0, 180.0, distance(cameraPosition, vWorldP)))'};
  float broken = 0.55 + 0.45 * smoothstep(0.3, 0.62, bn);
  vec4 wc;
  if (uReal > 0.5) {
    // Hyper-Realistic-Mode: nur das Meer liegt auf der Spiegelebene (Meereshöhe)
    wc = shadeWaterReal(vWorldP, nrm, max(depth, 0.0), (edge * 0.9 + crest * 0.7 + caps) * broken, t, ${extra.pond ? '0.0' : 'uSeaRefl'}, ${extra.canal ? '1.0' : extra.pond ? '0.5' : '0.0'}, fp);
  } else {
    wc = shadeWater(vWorldP, nrm, max(depth, 0.0), (edge * 0.9 + crest + caps) * broken, t, fp);
    ${extra.canal ? '// Kanal zwischen Hochhäusern: kaum Himmel im Spiegel, dunkles Grünblau\n    wc.rgb = mix(wc.rgb, vec3(0.04, 0.1, 0.12), 0.6);' : ''}
  }
  diffuseColor = vec4(wc.rgb, wc.a);
}`);
  };
  mat.customProgramCacheKey = () => key;
  mat.userData.uWaveAmp = uWaveAmp;
  return mat;
}


// Meer: kreisförmiges Gitter um die Kamera, nah fein (echte 3D-Wellen), fern grob
function createSea(mu, time, wet) {
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
  const mesh = new THREE.Mesh(geo, waterMaterial(mu, time, { amp: 1, pond: false }, 'island-sea', wet));
  mesh.position.y = WATER_Y;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// Teiche: Gitter in Uferform, Tiefe je Eckpunkt aus dem Gelände, sanfte kleine Wellen
function createPonds(city, mu, time, wet) {
  const group = new THREE.Group();
  const mat = waterMaterial(mu, time, { amp: 0.11, pond: true }, 'island-pond', wet);
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
  // Kanalwasser: ruhig wie ein Teich, an den Kaimauern flacher gerechnet (dort eine feine Schaumkante)
  const cn = city.canal;
  if (cn) {
    const nx = 12, nz = Math.max(2, Math.round((cn.z1 - cn.z0) / 3)), pos = [], depth = [], idx = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = -cn.hw + (2 * cn.hw * i) / nx, z = cn.z0 + ((cn.z1 - cn.z0) * j) / nz;
        pos.push(cn.x + u, 0, z);
        depth.push(Math.min(cn.level - cn.bottom, (cn.hw - Math.abs(u)) * 1.2, (Math.min(z - cn.z0, cn.z1 - z)) * 1.2));
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, waterMaterial(mu, time, { amp: 0.07, pond: true, canal: true }, 'island-canal', wet));
    mesh.position.y = cn.level;
    mesh.renderOrder = 2;
    group.add(mesh);
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
