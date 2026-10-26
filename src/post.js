import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Render-Pipeline für den Anime-Look:
//   Szene (HDR + Tiefe) → Tuschelinien aus der Tiefe + Farbkorrektur → Bloom → Tonemapping → FXAA
// Die Linien entstehen aus Sprüngen und Knicken im Tiefenpuffer (Silhouetten und Gebäudekanten).

const INK_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uInk;
uniform vec3 uInkColor;
uniform float uSaturation;
varying vec2 vUv;

float viewDist(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
}

void main() {
  vec4 col = texture2D(tDiffuse, vUv);
  float zc = viewDist(vUv);
  vec2 o = uTexel;
  float zl = viewDist(vUv - vec2(o.x, 0.0));
  float zr = viewDist(vUv + vec2(o.x, 0.0));
  float zd = viewDist(vUv - vec2(0.0, o.y));
  float zu = viewDist(vUv + vec2(0.0, o.y));

  // Silhouette: ein Nachbar liegt deutlich weiter hinten (Linie auf dem vorderen Objekt)
  float jump = max(max(zl, zr), max(zd, zu)) - zc;
  float sil = smoothstep(0.04, 0.09, jump / zc);
  // Kante: 1/z ist auf Ebenen linear im Bildraum, ein Knick verrät eine Gebäudekante
  float wc = 1.0 / zc;
  float lap = (abs(1.0 / zl + 1.0 / zr - 2.0 * wc) + abs(1.0 / zd + 1.0 / zu - 2.0 * wc)) / wc;
  float crease = smoothstep(0.0025, 0.007, lap) * (1.0 - smoothstep(120.0, 380.0, zc));
  float edge = max(sil * (1.0 - smoothstep(250.0, 900.0, zc)), crease);
  edge *= step(zc, uFar * 0.98) * uInk;

  float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
  col.rgb = max(mix(vec3(l), col.rgb, uSaturation), 0.0);
  col.rgb = mix(col.rgb, uInkColor * (0.35 + 0.4 * col.rgb), edge * 0.85);
  gl_FragColor = col;
}`;

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const opts = { type: THREE.HalfFloatType };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);

    this.inkMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uInk: { value: 1 },
        uInkColor: { value: new THREE.Color('#1c0c26') },
        uSaturation: { value: 1.12 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: INK_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.inkQuad = new FullScreenQuad(this.inkMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 1.0);
    this.output = new OutputPass();
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.renderToScreen = true;
  }

  setSize(width, height, pixelRatio) {
    const w = Math.max(1, Math.floor(width * pixelRatio)), h = Math.max(1, Math.floor(height * pixelRatio));
    this.sceneRT.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.bloom.setSize(w, h);
    this.inkMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);

    const u = this.inkMat.uniforms;
    u.tDiffuse.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    r.setRenderTarget(this.rtA);
    this.inkQuad.render(r);

    this.bloom.render(r, null, this.rtA, 0, false);
    this.output.render(r, this.rtB, this.rtA);
    this.fxaa.render(r, null, this.rtB);
  }
}
