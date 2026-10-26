import * as THREE from 'three';
import { DUSK, DUSK_GLSL, SUN_DIR } from './palette.js';
import { toonMaterial, gradientMap } from './toon.js';

// Abendhimmel (Wolken, Sterne, tiefe Sonne), richtungsabhängiger Dunst, Licht, Straßen,
// Laternen und die Mauer am Horizont.

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

export function createWorld(renderer, scene, layout) {
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

  scene.fog = new THREE.FogExp2(new THREE.Color(DUSK.horizonAnti), 0.0016);

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

  const ground = createGround(layout);
  scene.add(ground);
  scene.add(createLamps(layout));
  scene.add(createWall(layout));

  return {
    sun, sky, ground,
    update(focus, camera, time) {
      sky.position.copy(camera.position);
      skyMat.uniforms.uTime.value = time;
      const snap = 300 / 2048;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx, 0, fz).addScaledVector(SUN_DIR, 650);
      sun.target.updateMatrixWorld();
    },
  };
}

function createGround(layout) {
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradientMap([0.45, 0.75, 1.0]) });
  const uniforms = {
    uPitch: { value: layout.P },
    uBlock: { value: layout.B },
    uOrigin: { value: layout.origin },
    uHalf: { value: layout.half },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uPitch;
uniform float uBlock;
uniform float uOrigin;
uniform float uHalf;
varying vec3 vWorldP;
float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 w = vWorldP.xz;
  vec2 lp = mod(w - vec2(uOrigin), uPitch);
  float S = uPitch - uBlock;
  float inX = step(lp.x, uBlock);
  float inZ = step(lp.y, uBlock);
  float block = inX * inZ;
  vec3 asphalt = vec3(0.045, 0.04, 0.055) * (0.85 + 0.3 * gHash(floor(w * 0.7)));
  vec3 walk = vec3(0.24, 0.21, 0.24) * (0.9 + 0.15 * gHash(floor(w * 0.5)));
  vec3 c = mix(asphalt, walk, block);
  float edge = min(min(lp.x, uBlock - lp.x), min(lp.y, uBlock - lp.y));
  c = mix(c, vec3(0.36, 0.32, 0.34), block * (1.0 - smoothstep(0.25, 0.4, edge)));
  float cz = abs(lp.x - (uBlock + S * 0.5));
  float cx = abs(lp.y - (uBlock + S * 0.5));
  float lineZ = (1.0 - inX) * inZ * (1.0 - smoothstep(0.1, 0.18, cz)) * step(0.5, fract(w.y / 6.0));
  float lineX = (1.0 - inZ) * inX * (1.0 - smoothstep(0.1, 0.18, cx)) * step(0.5, fract(w.x / 6.0));
  c = mix(c, vec3(0.8, 0.62, 0.25), max(lineZ, lineX));
  // Zebrastreifen vor den Kreuzungen
  float zx = (1.0 - inZ) * step(abs(lp.x - uBlock * 0.5), uBlock * 0.5) * (step(lp.x, 3.0) + step(uBlock - 3.0, lp.x));
  float zz = (1.0 - inX) * step(abs(lp.y - uBlock * 0.5), uBlock * 0.5) * (step(lp.y, 3.0) + step(uBlock - 3.0, lp.y));
  c = mix(c, vec3(0.55, 0.52, 0.55), clamp(zx * step(0.5, fract(w.y / 1.2)) + zz * step(0.5, fract(w.x / 1.2)), 0.0, 1.0) * 0.8);
  float outside = smoothstep(uHalf + 10.0, uHalf + 40.0, max(abs(w.x), abs(w.y)));
  c = mix(c, vec3(0.08, 0.06, 0.07) * (0.8 + 0.3 * gHash(floor(w * 0.2))), outside);
  diffuseColor.rgb = c;
}`);
  };
  const geo = new THREE.PlaneGeometry(6000, 6000);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Straßenlaternen mit orangefarbenen Lichtkegeln auf dem Asphalt (nur Optik, keine Kollision).
function createLamps(layout) {
  const { N, B, P, origin } = layout;
  const spots = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const bx = origin + i * P, bz = origin + j * P;
      for (const f of [0.22, 0.78]) {
        spots.push([bx + B * f, bz + 1.0, 0, -1]);
        spots.push([bx + B * f, bz + B - 1.0, 0, 1]);
        spots.push([bx + 1.0, bz + B * f, -1, 0]);
        spots.push([bx + B - 1.0, bz + B * f, 1, 0]);
      }
    }
  }
  const group = new THREE.Group();
  const n = spots.length;
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 7, 0.16), toonMaterial('#262230', { rim: 0 }), n);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), toonMaterial('#262230', { rim: 0 }), n);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.9, 0.8) }), n);
  const poolTex = radialTexture();
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color(1.0, 0.45, 0.18), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    n,
  );
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  spots.forEach(([x, z, dx, dz], k) => {
    const yaw = Math.atan2(dx, dz);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    poles.setMatrixAt(k, m.compose(p.set(x, 3.5, z), q, s));
    arms.setMatrixAt(k, m.compose(p.set(x + dx * 0.7, 6.95, z + dz * 0.7), q, s));
    heads.setMatrixAt(k, m.compose(p.set(x + dx * 1.4, 6.85, z + dz * 1.4), q, s));
    pools.setMatrixAt(k, m.compose(p.set(x + dx * 2.2, 0.03, z + dz * 2.2), q, s));
  });
  poles.castShadow = true;
  pools.renderOrder = 1;
  group.add(poles, arms, heads, pools);
  return group;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Gigantische Mauer rund um die Stadt – im Dunst nur als Silhouette sichtbar.
function createWall(layout) {
  const r = layout.half + 380;
  const geo = new THREE.CylinderGeometry(r, r, 230, 160, 1, true);
  geo.translate(0, 115, 0);
  const mat = toonMaterial('#3a2a3e', { rim: 0, side: THREE.BackSide });
  const wall = new THREE.Mesh(geo, mat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(r - 6, r - 6, 10, 160, 1, true).translate(0, 228, 0), toonMaterial('#2a1e30', { rim: 0, side: THREE.BackSide }));
  const g = new THREE.Group();
  g.add(wall, crown);
  return g;
}
