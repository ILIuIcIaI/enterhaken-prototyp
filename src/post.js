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
uniform vec3 uTint;
uniform float uContrast;
uniform float uReal;
uniform float uTime;
uniform float uExposure;
uniform vec2 uHalf; // tan(fov/2) · Seitenverhältnis, tan(fov/2)
varying vec2 vUv;

float viewDist(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
}
vec3 viewPos(vec2 uv, float z) {
  return vec3((uv * 2.0 - 1.0) * uHalf * z, -z);
}

void main() {
  vec4 col = texture2D(tDiffuse, vUv);
  // Schutz: ein NaN- oder Unendlich-Pixel aus der Szene würde der Bloom über den ganzen Bildschirm verschmieren
  // (schwarzes Flackern) – so bleibt es höchstens ein einzelnes dunkles Pixel. Direct3D darf isnan() wegoptimieren;
  // dann greift das Klemmen (max/min liefern bei NaN den anderen Wert)
  col.rgb = (any(isnan(col.rgb)) || any(isinf(col.rgb))) ? vec3(0.0) : clamp(col.rgb, 0.0, 6e4);
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
  // Farbstich und Kontrast (Looks im Fotomodus), Kontrast um ein mittleres Grau
  col.rgb = 0.18 * pow(col.rgb * uTint / 0.18, vec3(uContrast));
  col.rgb = mix(col.rgb, uInkColor * (0.35 + 0.4 * col.rgb), edge * 0.85);
  // Hyper-Realistic-Mode: Umgebungsverdeckung aus dem Tiefenpuffer (Ecken, Kanten und Gebäudefüße dunkeln weich ab),
  // Vignette wie bei einem Kameraobjektiv, feines bewegtes Filmkorn
  if (uReal > 0.0 && zc < uFar * 0.98) {
    // Umgebungsverdeckung: Flächennormale aus der Tiefe (je Achse der nähere Nachbar – an Kanten keine Fehlnormale),
    // 12 Proben auf einer Spirale (pro Pixel gedreht) im festen Radius von 1,4 m; verdeckt, was über der Fläche liegt
    vec3 P = viewPos(vUv, zc);
    vec3 dx = abs(zr - zc) < abs(zc - zl) ? viewPos(vUv + vec2(o.x, 0.0), zr) - P : P - viewPos(vUv - vec2(o.x, 0.0), zl);
    vec3 dy = abs(zu - zc) < abs(zc - zd) ? viewPos(vUv + vec2(0.0, o.y), zu) - P : P - viewPos(vUv - vec2(0.0, o.y), zd);
    vec3 N = normalize(cross(dx, dy));
    const float R = 1.4;
    float rpx = clamp(R / (zc * 2.0 * uHalf.y) / uTexel.y, 3.0, 90.0);
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float ao = 0.0;
    for (int k = 0; k < 12; k++) {
      float fk = float(k);
      float a = (fk + ign) * 2.39996;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * sqrt((fk + 0.5) / 12.0) * rpx * uTexel;
      vec3 v = viewPos(suv, viewDist(suv)) - P;
      float d2 = dot(v, v);
      ao += max(dot(N, v) * inversesqrt(max(d2, 1e-6)) - 0.12, 0.0) * (1.0 - smoothstep(R * R * 0.35, R * R, d2));
    }
    ao = clamp(ao / 12.0 * 1.7, 0.0, 1.0);
    col.rgb *= 1.0 - uReal * 0.62 * ao * (1.0 - smoothstep(250.0, 800.0, zc));
  }
  if (uReal > 0.0) {
    vec2 q = vUv - 0.5;
    col.rgb *= 1.0 - uReal * 0.42 * smoothstep(0.12, 0.62, dot(q, q) * 2.2);
    float gr = fract(sin(dot(vUv * 913.0 + fract(uTime * 7.31) * 41.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    // Korn relativ zum Bild plus ein Grundrauschen, das die Belichtung herausrechnet (nachts sonst grob)
    col.rgb = max(col.rgb * (1.0 + uReal * gr * 0.06) + uReal * gr * 0.0025 / max(uExposure, 0.1), 0.0);
  }
  gl_FragColor = col;
}`;

// Glitch in der Zeitlupe beim perfekten Moment (nach dem Kantenglätten, im fertigen Bild): Rot und Cyan laufen seitlich
// auseinander, einzelne waagrechte Streifen springen weg, darüber ein feines senkrechtes Linienmuster.
// uAmount folgt der Zeitlupe, uBurst ist der kurze starke Ausschlag beim Auslösen.
const GLITCH_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAmount;
uniform float uBurst;
uniform float uTime;
varying vec2 vUv;

float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  float frame = floor(uTime * (6.0 + 10.0 * uBurst));
  float shift = 0.0;
  for (int i = 0; i < 2; i++) {
    float bands = i == 0 ? 16.0 : 70.0;
    float b = floor(uv.y * bands);
    float share = (i == 0 ? 0.05 : 0.08) + 0.3 * uBurst;
    if (gHash(vec2(b, frame + float(i) * 17.0)) < share * uAmount) shift += (gHash(vec2(b * 3.1, frame + 5.0)) - 0.5) * (0.03 + 0.1 * uBurst);
  }
  uv.x += shift * uAmount;
  float off = uAmount * (0.005 + 0.012 * uBurst) * (0.55 + length(vUv - 0.5)) + abs(shift) * 0.25;
  float red = texture2D(tDiffuse, vec2(uv.x - off, uv.y)).r;
  vec2 gb = texture2D(tDiffuse, vec2(uv.x + off, uv.y)).gb;
  vec3 col = vec3(red, gb);
  col *= 1.0 - 0.1 * uAmount * step(0.5, fract(gl_FragCoord.x / 3.0));
  col += abs(shift) * 1.5 * uAmount;
  gl_FragColor = vec4(col, 1.0);
}`;

// Belichtungsmessung (Hyper-Realistic-Mode): 64 × 36 Messfelder, je 16 Stichproben, logarithmischer Mittelwert
// der Helligkeit. Gelesen wird asynchron über einen Pixel-Puffer (kein Warten auf die Grafikkarte).
const METER_W = 64, METER_H = 36;
const METER_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec2 px = vec2(1.0 / ${METER_W}.0, 1.0 / ${METER_H}.0);
  float s = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec3 c = texture2D(tDiffuse, vUv + (vec2(float(i), float(j)) - 1.5) * px * 0.25).rgb;
    // geklemmt statt isnan(): Direct3D darf isnan wegoptimieren, max/min geben bei NaN aber den anderen Wert zurück
    s += log2(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4, 6e4));
  }
  gl_FragColor = vec4(s / 16.0, 0.0, 0.0, 1.0);
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
        uHalf: { value: new THREE.Vector2(1, 1) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uInk: { value: 1 },
        uInkColor: { value: new THREE.Color('#1c0c26') },
        uSaturation: { value: 1.12 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uContrast: { value: 1 },
        uReal: { value: 0 },
        uTime: { value: 0 },
        uExposure: { value: 1 },
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
    this.glitchMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 }, uBurst: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: GLITCH_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.glitchQuad = new FullScreenQuad(this.glitchMat);
    this.glitch = { amount: 0, burst: 0, time: 0 };
    this.useFxaa = true;
    // Belichtungsmesser: metering = an; luminance = zuletzt gemessene mittlere Helligkeit (mittenbetont)
    this.metering = false;
    this.luminance = null;
    this.meterRT = new THREE.WebGLRenderTarget(METER_W, METER_H, { type: THREE.HalfFloatType, depthBuffer: false });
    this.meterMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: METER_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.meterQuad = new FullScreenQuad(this.meterMat);
    this.meterBuf = new Float32Array(METER_W * METER_H * 4);
    this.meterPbo = null;
    this.meterSync = null;
    this.meterW = new Float32Array(METER_W * METER_H);
    for (let y = 0; y < METER_H; y++) for (let x = 0; x < METER_W; x++) {
      const dx = (x + 0.5) / METER_W - 0.5, dy = ((y + 0.5) / METER_H - 0.5) * 0.7;
      this.meterW[y * METER_W + x] = Math.exp(-(dx * dx + dy * dy) / (2 * 0.28 * 0.28));
    }
  }

  // Messung anstoßen bzw. ein fertiges Ergebnis abholen (ein Auftrag zur Zeit, Ergebnis meist im nächsten Bild)
  meter() {
    const r = this.renderer, gl = r.getContext();
    if (this.meterSync) {
      const st = gl.clientWaitSync(this.meterSync, 0, 0);
      if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) return;
      gl.deleteSync(this.meterSync);
      this.meterSync = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.meterPbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.meterBuf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      let s = 0, n = 0;
      for (let i = 0; i < this.meterW.length; i++) {
        const v = this.meterBuf[i * 4], w = this.meterW[i];
        if (Number.isFinite(v)) { s += v * w; n += w; }
      }
      if (n > 0) this.luminance = Math.pow(2, s / n);
      return;
    }
    // zehn Messungen je Sekunde reichen für eine weiche Adaption
    const now = performance.now();
    if (now - (this.meterT ?? -1e9) < 100) return;
    this.meterT = now;
    this.meterMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    r.setRenderTarget(this.meterRT);
    this.meterQuad.render(r);
    if (!this.meterPbo) {
      this.meterPbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.meterPbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.meterBuf.byteLength, gl.STREAM_READ);
    } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.meterPbo);
    gl.readPixels(0, 0, METER_W, METER_H, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.meterSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  // Kantenglättung: samples > 0 rendert die Szene mit echter Mehrfachabtastung (MSAA, Tiefe wird mit aufgelöst) –
  // dann entfällt FXAA, das sonst feine Texturen weichzeichnet
  setAntialias(samples) {
    if (this.sceneRT.samples === samples) return;
    this.sceneRT.dispose(); // wird beim nächsten Bild mit der neuen Abtastung neu angelegt
    this.sceneRT.samples = samples;
    this.useFxaa = samples === 0;
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
    if (this.metering) this.meter();

    const u = this.inkMat.uniforms;
    u.tDiffuse.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uNear.value = this.camera.near;
    const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    u.uHalf.value.set(th * this.camera.aspect, th);
    u.uFar.value = this.camera.far;
    u.uTime.value = performance.now() * 0.001; // Filmkorn bewegt sich
    u.uExposure.value = r.toneMappingExposure;
    r.setRenderTarget(this.rtA);
    this.inkQuad.render(r);

    this.bloom.render(r, null, this.rtA, 0, false);
    const G = this.glitch;
    if (!this.useFxaa && G.amount <= 0.002) {
      // MSAA: Tonemapping direkt auf den Bildschirm
      this.output.renderToScreen = true;
      this.output.render(r, null, this.rtA);
      this.output.renderToScreen = false;
      return;
    }
    this.output.render(r, this.rtB, this.rtA);
    if (G.amount > 0.002) {
      let src = this.rtB;
      if (this.useFxaa) {
        this.fxaa.renderToScreen = false;
        this.fxaa.render(r, this.rtA, this.rtB);
        src = this.rtA;
      }
      const g = this.glitchMat.uniforms;
      g.tDiffuse.value = src.texture;
      g.uAmount.value = G.amount;
      g.uBurst.value = G.burst;
      g.uTime.value = G.time;
      r.setRenderTarget(null);
      this.glitchQuad.render(r);
    } else {
      this.fxaa.renderToScreen = true;
      this.fxaa.render(r, null, this.rtB);
    }
  }
}
