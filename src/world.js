import * as THREE from 'three';

// Himmel, Licht, Nebel, Boden. Abendstimmung mit tief stehender Sonne für lange Schatten.

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunStrength;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.6, h));
  col = mix(col, uGround, smoothstep(0.0, -0.2, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 5.0) * 0.22 + pow(s, 60.0) * 0.5);
  col += uSunColor * smoothstep(0.9994, 0.9997, s) * uSunStrength;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWorld(renderer, scene, layout) {
  const sunDir = new THREE.Vector3(-0.55, 0.52, -0.42).normalize();
  const horizon = new THREE.Color('#f0c9a0');

  const skyUniforms = {
    uTop: { value: new THREE.Color('#3a68a8') },
    uHorizon: { value: horizon.clone() },
    uGround: { value: new THREE.Color('#8a7464') },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color('#ffd7a8') },
    uSunStrength: { value: 18 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyGeo = new THREE.SphereGeometry(1, 48, 24);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // Umgebungs-Reflexionen (Glasfassaden) aus demselben Himmel.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMat = skyMat.clone();
  envMat.uniforms.uSunStrength.value = 3;
  envScene.add(new THREE.Mesh(skyGeo, envMat));
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();

  scene.fog = new THREE.Fog(horizon.clone(), 140, 1150);

  const hemi = new THREE.HemisphereLight('#bcd3ff', '#5a4a3e', 0.45);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffe0bd', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140;
  sc.near = 1; sc.far = 1000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);

  const ground = createGround(layout);
  scene.add(ground);

  return {
    sun, sky, ground, sunDir,
    update(focus, camera) {
      sky.position.copy(camera.position);
      // Schattenkamera folgt dem Spieler, auf Texel gerastert gegen Flimmern.
      const snap = 280 / 2048;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx, 0, fz).addScaledVector(sunDir, 500);
      sun.target.updateMatrixWorld();
    },
  };
}

function createGround(layout) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });
  const uniforms = {
    uPitch: { value: layout.P },
    uBlock: { value: layout.B },
    uOrigin: { value: layout.origin },
    uHalf: { value: layout.half },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
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
  vec3 asphalt = vec3(0.055, 0.058, 0.062) * (0.85 + 0.3 * gHash(floor(w * 0.7)));
  vec3 walk = vec3(0.30, 0.29, 0.27) * (0.9 + 0.15 * gHash(floor(w * 0.5)));
  vec3 c = mix(asphalt, walk, block);
  // Bordstein
  float edge = min(min(lp.x, uBlock - lp.x), min(lp.y, uBlock - lp.y));
  c = mix(c, vec3(0.42, 0.41, 0.39), block * (1.0 - smoothstep(0.25, 0.4, edge)));
  // Mittellinien (gestrichelt), nicht auf Kreuzungen
  float cz = abs(lp.x - (uBlock + S * 0.5));
  float cx = abs(lp.y - (uBlock + S * 0.5));
  float dashZ = step(0.5, fract(w.y / 6.0));
  float dashX = step(0.5, fract(w.x / 6.0));
  float lineZ = (1.0 - inX) * inZ * (1.0 - smoothstep(0.1, 0.18, cz)) * dashZ;
  float lineX = (1.0 - inZ) * inX * (1.0 - smoothstep(0.1, 0.18, cx)) * dashX;
  c = mix(c, vec3(0.75, 0.72, 0.6), max(lineZ, lineX));
  // Außerhalb der Stadt: Brachland
  float outside = smoothstep(uHalf + 10.0, uHalf + 40.0, max(abs(w.x), abs(w.y)));
  c = mix(c, vec3(0.2, 0.19, 0.15) * (0.8 + 0.3 * gHash(floor(w * 0.2))), outside);
  diffuseColor.rgb = c;
}`);
  };
  const geo = new THREE.PlaneGeometry(6000, 6000);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
