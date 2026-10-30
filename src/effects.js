import * as THREE from 'three';
import { DUSK_GLSL, SKY } from './palette.js';

// Weiche Partikel (Gasstöße, Staub, Funken, Gischt) als ein einziges Points-Objekt. Optional mit Schwerkraft und
// einer Bodenhöhe (Tropfen verschwinden, sobald sie zurück ins Wasser fallen).
export class Particles {
  constructor(scene, max = 1500) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.baseSize = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.floor = new Float32Array(max).fill(-1e9);
    this.ride = new Float32Array(max).fill(-1); // ≥ 0: schwimmt so hoch über der Oberfläche (Schaum auf den Wellen)
    this.surface = null; // (x, z) → Höhe der Wasseroberfläche

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
        varying vec3 vColor; varying float vAlpha;
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // dicht vor der Kamera ausblenden – sonst fliegen große Scheiben durchs Bild
          vColor = aColor; vAlpha = aAlpha * smoothstep(0.4, 2.2, -mv.z);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3; // nach dem (durchsichtigen) Wasser, sonst deckt das Meer Gischt und Dampf zu
    scene.add(this.points);
  }

  setScale(height, fovDeg) {
    this.material.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(p, v, { life = 0.6, size = 0.5, alpha = 0.6, color = [1, 1, 1], drag = 2, grow = 2, gravity = 0, floor = -1e9, ride = -1 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size; this.baseAlpha[i] = alpha;
    this.drag[i] = drag; this.grow[i] = grow;
    this.grav[i] = gravity; this.floor[i] = floor; this.ride[i] = ride;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= damp;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      if (this.ride[i] >= 0 && this.surface) {
        const s = this.surface(this.pos[i * 3], this.pos[i * 3 + 2]);
        if (s === -Infinity) this.life[i] = 0; // an Land getrieben
        else this.pos[i * 3 + 1] = s + this.ride[i];
      }
      if (this.pos[i * 3 + 1] < this.floor[i]) this.life[i] = 0; // zurück ins Wasser getaucht
      this.alpha[i] = this.baseAlpha[i] * f;
      this.size[i] = this.baseSize[i] * (1 + (1 - f) * this.grow[i]);
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aSize.needsUpdate = true;
  }
}

// gemeinsames Wertrauschen für die Wasser-Effekte (Cel-Look: daraus werden harte Kanten geschnitten)
const VNOISE_GLSL = /* glsl */ `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

// Kielwasser hinter der Figur (Surfen, Sprint über das Wasser), nach The Legend of Zelda: The Wind Waker: ein Band
// entlang des Weges, das mit dem Alter breiter wird – so öffnet es sich zum V. An den Rändern laufen zwei scharfe weiße
// Linien (gleich breit, reißen mit dem Alter auf), dazwischen ein heller, durchscheinender Streifen mit Schaumflecken.
// Die Höhe folgt den Wellen; Lücken im Weg beginnen eine neue Spur.
export class Wake {
  constructor(scene, surface, max = 180) {
    this.surface = surface; // (x, z) → Höhe der Wasseroberfläche (-Infinity an Land)
    this.max = max;
    this.life = 2.8;
    this.runs = [];
    this.active = null;
    this.time = 0;
    this.pos = new Float32Array(max * 2 * 3);
    this.attr = new Float32Array(max * 2 * 4); // Seite −1/1, Alter 0–1, Stärke, halbe Breite (m)
    this.index = new Uint16Array(max * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aW', new THREE.BufferAttribute(this.attr, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uBody: { value: new THREE.Color(0.3, 0.6, 1) }, uReal: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aW;
        varying vec4 vW; varying vec2 vP;
        void main() {
          vW = aW; vP = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uBody; uniform float uReal;
        varying vec4 vW; varying vec2 vP;
        ${VNOISE_GLSL}
        void main() {
          float e = abs(vW.x), age = vW.y, edge = (1.0 - e) * vW.w; // Abstand zum Rand in Metern
          float n = vnoise(vP * 1.3) * 0.6 + vnoise(vP * 3.7) * 0.4;
          if (uReal > 0.5) {
            // Hyper-Realistic-Mode: feiner Schaum statt Zeichentrick-Linien, aufgewühltes Wasser dazwischen
            float fine = n * 0.55 + vnoise(vP * 8.0) * 0.3 + vnoise(vP * 19.0) * 0.15;
            float wide = 0.18 + 0.5 * age;
            float rim2 = smoothstep(0.0, wide * 0.4, edge) * (1.0 - smoothstep(wide * 0.5, wide * 1.6, edge));
            float trail = rim2 * smoothstep(0.34 + 0.36 * age, 0.6 + 0.3 * age, fine);
            float mid = (1.0 - smoothstep(0.1, 1.0, e * vW.w)) * (1.0 - age) * smoothstep(0.44, 0.72, fine);
            float foam2 = clamp(max(trail * 0.75, mid * 0.6), 0.0, 1.0);
            float churn = (1.0 - smoothstep(0.0, 1.8, e * vW.w)) * (1.0 - age) * 0.16 * smoothstep(0.0, 0.5, edge);
            float a2 = (foam2 + churn * (1.0 - foam2)) * vW.z * (1.0 - age * 0.5);
            if (a2 < 0.01) discard;
            gl_FragColor = vec4(mix(uBody, uColor, foam2 / max(foam2 + churn, 1e-3)), min(1.0, a2));
            return;
          }
          float soft = 0.002; // harte Kanten im Cel-Look
          #define EDGE(e, x) smoothstep((e) - soft, (e) + soft, (x))
          // V-Linien: gleich breit, reißen mit dem Alter auf
          float line = EDGE(0.03, edge) * (1.0 - EDGE(0.3, edge)) * EDGE(age * 0.85, n);
          // heller, durchscheinender Streifen hinter den Füßen und Schaumflecken, beide jung am deutlichsten
          float inner = (1.0 - smoothstep(0.0, 1.6, edge - 0.3)) * smoothstep(0.03, 0.3, edge); // heller Saum innen an den Linien
          float core = (1.0 - smoothstep(0.0, 0.9, e * vW.w)) * (1.0 - age);
          float band = (core * 0.5 + inner * 0.25) * (1.0 - age);
          float spots = EDGE(0.66 + 0.28 * age, n) * (1.0 - smoothstep(0.0, 1.2, e * vW.w)) * (1.0 - age);
          float foam = max(line, spots);
          float a = max(line * 0.95, max(band * 0.42, spots * 0.85)) * vW.z * (1.0 - age * 0.55);
          if (a < 0.02) discard;
          // nur Linien und Flecken sind weißer Schaum, der Streifen dazwischen bleibt aufgewühltes Blau
          gl_FragColor = vec4(mix(uBody, uColor, foam), min(1.0, a));
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3; // nach dem Wasser
    scene.add(this.mesh);
  }

  // je Bild: on = gerade auf dem Wasser unterwegs, (x, z) = Position, s = Stärke 0–1, speed = Tempo (m/s)
  update(dt, on, x, z, s, speed = 10) {
    this.time += dt;
    const T = this.time;
    if (on) {
      let run = this.active;
      const last = run?.pts[run.pts.length - 1];
      if (!run || (last && Math.hypot(x - last.x, z - last.z) > 4)) {
        run = this.active = { pts: [] };
        this.runs.push(run);
      }
      const l = run.pts[run.pts.length - 1];
      if (!l || Math.hypot(x - l.x, z - l.z) > 0.45) run.pts.push({ x, z, t: T, s, v: speed });
    } else this.active = null;
    // Alte Punkte weg, Gesamtzahl begrenzen
    let total = 0;
    for (const r of this.runs) {
      while (r.pts.length && T - r.pts[0].t > this.life) r.pts.shift();
      total += r.pts.length;
    }
    this.runs = this.runs.filter((r) => r.pts.length > 0 || r === this.active);
    while (total > this.max - 2 && this.runs.length) {
      this.runs[0].pts.shift();
      total--;
      if (!this.runs[0].pts.length && this.runs[0] !== this.active) this.runs.shift();
    }
    // Band aufbauen; die laufende Spur reicht bis an die Füße
    let v = 0, ix = 0;
    for (const r of this.runs) {
      const P = r === this.active && on ? [...r.pts, { x, z, t: T, s, v: speed }] : r.pts;
      const n = P.length;
      if (n < 2) continue;
      const v0 = v;
      for (let i = 0; i < n; i++) {
        const p = P[i], a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const age = Math.min(1, (T - p.t) / this.life);
        const hw = 0.3 + (0.6 + 0.2 * p.v) * (T - p.t); // halbe Breite wächst mit dem Alter: V mit ≈ 12° je Seite
        for (const side of [-1, 1]) {
          const px = p.x - tz * hw * side, pz = p.z + tx * hw * side;
          const y = this.surface(px, pz);
          this.pos[v * 3] = px;
          this.pos[v * 3 + 1] = y === -Infinity ? -1e4 : y + 0.07;
          this.pos[v * 3 + 2] = pz;
          this.attr[v * 4] = side;
          this.attr[v * 4 + 1] = age;
          this.attr[v * 4 + 2] = p.s;
          this.attr[v * 4 + 3] = hw;
          v++;
        }
      }
      for (let i = 0; i < n - 1; i++) {
        const a = v0 + i * 2, b = a + 2;
        this.index[ix++] = a; this.index[ix++] = a + 1; this.index[ix++] = b;
        this.index[ix++] = a + 1; this.index[ix++] = b + 1; this.index[ix++] = b;
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aW.needsUpdate = true;
    g.index.needsUpdate = true;
    g.setDrawRange(0, ix);
  }
}

// Bugwellen beim Surfen, nach dem Bug des Boots in The Legend of Zelda: The Wind Waker: links und rechts je ein
// durchgehender, geschwungener Wasserbogen, der an den Füßen aufsteigt, sich nach außen wölbt und seitlich hinten auf den
// Wellen landet. Oben ein Gischtschleier (hellblau mit weißem Schaum, das Muster fließt den Bogen entlang, die Enden
// reißen mit harter Kante aus), darunter hängt bis ins Wasser ein dünner blauer Vorhang – der Bogen steht also im Meer,
// statt frei zu fliegen. Zur Wasserlinie wird er tiefer und läuft mit Schaumspitzen und kurzem Saum im Wasser aus. Die
// Größe wächst mit dem Tempo, in Kurven wirft die Außenseite höher und weiter, die Innenseite weniger. Das gilt für den
// Cel-Look. Im Hyper-Realistic-Mode ist es dieselbe Form, aber niedriger und länger und aus klarem Wasser: durchscheinend
// in Meeresfarbe, mit Himmel und Sonne im Spiegel, nur an der Kante und an der Wasserlinie Schaum. tips/crests: Lande-
// und Scheitelpunkte für Spritzer.
const BOW_CURTAIN = 5, BOW_RIBBON = 6; // Segmente je Vorhang und im Schleier oben
const BOW_V = 2 * (BOW_CURTAIN + 1) + BOW_RIBBON; // Querschnitt: Saum, Vorhang hinten, Schleier, Vorhang vorn, Saum
export class BowWaves {
  constructor(scene, surface) {
    this.surface = surface; // (x, z) → Höhe der Wasseroberfläche
    const S = (this.S = 32), V = BOW_V;
    const per = (S + 1) * (V + 1);
    this.pos = new Float32Array(2 * per * 3);
    this.attr = new Float32Array(2 * per * 4); // s (Fuß → Landestelle), w (vordere → hintere Kante), Seite, Stärke
    this.fall = new Float32Array(2 * per);     // f: 1 = Schleier, 1 … 0 Vorhang bis zur Wasserlinie, 0 … −1 Saum
    const idx = [];
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < S; i++) {
        for (let j = 0; j < V; j++) {
          const a = k * per + i * (V + 1) + j, b = a + V + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aB', new THREE.BufferAttribute(this.attr, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aF', new THREE.BufferAttribute(this.fall, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uFlow: { value: 0 }, uFoam: { value: new THREE.Color(1, 1, 1) }, uBody: { value: new THREE.Color(0.3, 0.6, 1) }, uReal: { value: 0 }, ...SKY,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aB;
        attribute float aF;
        varying vec4 vB;
        varying float vF;
        varying vec3 vW;
        varying vec3 vN;
        void main() {
          vB = aB;
          vF = aF;
          vN = normal;
          vW = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFlow; uniform vec3 uFoam; uniform vec3 uBody; uniform float uReal;
        varying vec4 vB;
        varying float vF;
        varying vec3 vW;
        varying vec3 vN;
        ${DUSK_GLSL}
        ${VNOISE_GLSL}
        void main() {
          float s = vB.x, w = vB.y, k = vB.w, f = vF;
          if (k < 0.01) discard;
          if (uReal > 0.5) {
            // klares Wasser: Normale aus dem Bogen plus feine Strömungsrippen, Fresnel-Spiegelung von Himmel und Sonne
            vec3 N = normalize(vN), V = normalize(vW - cameraPosition);
            if (dot(N, V) > 0.0) N = -N;
            vec2 q = vec2(s * 13.0 - uFlow * 1.5 + vB.z * 9.0, f * 3.5 + w * 2.5);
            N = normalize(N + 0.22 * vec3(vnoise(q) - 0.5, vnoise(q * 1.7 + 4.0) - 0.5, vnoise(q * 2.3 + 9.0) - 0.5));
            float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
            vec3 R = reflect(V, N);
            R.y = abs(R.y);
            float clear = 1.0 - uPOvercast;
            vec3 refl = duskSky(R) + DUSK_SUN * pow(max(dot(R, DUSK_SUN_DIR), 0.0), 220.0) * 9.0 * uSunUp * clear * clear;
            // Schichtdicke: an der Wasserlinie dick und farbig, oben dünn und fast klar
            float L = dot(DUSK_HIGH, vec3(0.2126, 0.7152, 0.0722)) * 1.6 + uSunUp * max(DUSK_SUN_DIR.y, 0.0) * 1.1 + 0.004;
            float up = max(f, 0.0), thick = mix(0.48, 0.1, up) * (0.75 + 0.5 * vnoise(q * 0.6 + 2.0));
            vec3 tint = vec3(0.06, 0.24, 0.27) * L;
            // Schaum: Krone an der Oberkante, Spitzen an der Wasserlinie, feine Luftschlieren im Schleier
            float r1 = vnoise(vec2(s * 24.0 - uFlow * 2.0, vB.z * 5.0 + w * 3.0)) * 0.6 + vnoise(vec2(s * 61.0 - uFlow * 3.0, vB.z * 9.0 + f * 5.0)) * 0.4;
            float crown = smoothstep(0.93, 1.0, f) * smoothstep(0.36, 0.68, r1);
            float lace = (1.0 - smoothstep(0.0, 0.1 + 0.18 * r1, abs(f))) * smoothstep(0.44, 0.74, r1) * 0.8;
            float air = smoothstep(0.62, 0.86, vnoise(vec2(s * 34.0 + vB.z * 7.0 - uFlow, up * 2.2 + uFlow * 0.6))) * smoothstep(0.25, 0.8, up) * 0.35;
            float foam = clamp(crown * 0.85 + lace + air, 0.0, 1.0);
            // läuft zum Ende und am Fuß weich aus
            float fade = (1.0 - smoothstep(0.42, 1.0, s)) * smoothstep(0.0, 0.05, s) * min(1.0, k * 1.6);
            if (f < 0.0) fade *= (1.0 + f) * (1.0 + f);
            float aT = thick * fade, aS = F * fade, aF = foam * fade;
            float alpha = 1.0 - (1.0 - aT) * (1.0 - aS) * (1.0 - aF);
            if (alpha < 0.004) discard;
            gl_FragColor = vec4((tint * aT + refl * aS + uFoam * aF) / max(alpha, 1e-3), alpha);
            return;
          }
          float soft = 0.002; // harte Kanten im Cel-Look
          #define EDGE(e, x) smoothstep((e) - soft, (e) + soft, (x))
          // Schleier oben: Muster fließt vom Fuß zur Landestelle, zur Landestelle zerstäubt er
          vec2 p = vec2(s * 7.0 - uFlow, w * 2.4 + vB.z * 13.7);
          float n = vnoise(p * vec2(1.0, 1.7)) * 0.65 + vnoise(p * vec2(2.9, 4.3) + 3.1) * 0.35;
          float tear = smoothstep(0.5, 1.0, s) * 0.9 + (1.0 - smoothstep(0.0, 0.09, s)) * 0.6 + 0.15 * (1.0 - min(1.0, k));
          float m = n - tear;
          float rim = 1.0 - EDGE(0.1, m);                 // weißer Saum an der Risskante
          float crest = 1.0 - smoothstep(0.0, 0.3, w);    // die vordere, obere Kante schäumt
          float foamTop = max(max(rim, crest * 0.8), EDGE(0.78, n) * 0.7);
          // Vorhang darunter: Wasser läuft in Streifen herab, hinten reißt er mit dem Bogen auf
          vec2 q = vec2(s * 17.0 + vB.z * 7.0, f * 1.3 + uFlow * 0.5);
          float c = vnoise(q * vec2(1.0, 0.8)) * 0.6 + vnoise(q * vec2(2.7, 1.5) + 5.0) * 0.4;
          float mc = c + 0.55 - smoothstep(0.58, 1.0, s) * (0.65 + 0.5 * f);
          float streak = EDGE(0.68, c) * smoothstep(0.3, 0.75, f) * 0.5;   // hellere Rinnsale im oberen Teil
          // Gischtkrone: schmales weißes Band unter der Oberkante, die Unterkante zackig aus dem Muster
          float crown = EDGE(0.86 - 0.34 * (vnoise(vec2(s * 31.0 - uFlow * 1.2, vB.z * 5.0)) - 0.5), f);
          streak = max(streak, crown);
          float lace = (1.0 - EDGE(0.07 + 0.13 * c, f)) * EDGE(0.46, c) * step(0.0, f); // Schaumspitzen an der Wasserlinie
          // Farbe: unten tief wie das Meer, nach oben heller Blau
          vec3 water = uBody * mix(0.62, 1.0, EDGE(0.42 + 0.22 * (c - 0.5), f));
          float top = smoothstep(0.97, 1.0, f);           // 1 = Schleier, sonst Vorhang
          float foam = mix(max(streak, lace), foamTop, top);
          float keep = mix(EDGE(0.0, mc), EDGE(0.0, m), top);
          float a = mix(0.66, 0.95, foam);
          if (f < 0.0) a = 0.5 * (1.0 + f) * (1.0 + f);   // kurzer Saum: läuft auf dem Wasser aus
          float alpha = a * keep * min(1.0, k * 1.6);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(water, uFoam, foam), alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4; // nach Wasser und Kielwasser
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.k = [0, 0]; // geglättete Größe je Seite (links, rechts)
    this.tips = [new THREE.Vector3(), new THREE.Vector3()];
    this.crests = [new THREE.Vector3(), new THREE.Vector3()];
  }

  // o: { on, x, z (Fußpunkt), fx, fz (Fahrtrichtung, normiert), speed, strength (0–1.4), bank (−1…1, + = Linkskurve) }
  update(dt, o) {
    const U = this.material.uniforms;
    U.uFlow.value += dt * (1.2 + o.speed * 0.35);
    const rx = -o.fz, rz = o.fx;
    const S = this.S, V = BOW_V, Cn = BOW_CURTAIN, Rn = BOW_RIBBON, per = (S + 1) * (V + 1);
    let any = false;
    for (let k = 0; k < 2; k++) {
      const sd = k === 0 ? -1 : 1;
      // außen in der Kurve höher und weiter, innen kleiner
      const carve = 1 + 0.7 * Math.max(0, sd * o.bank) - 0.45 * Math.max(0, -sd * o.bank);
      const target = o.on ? o.strength * carve : 0;
      // wachsen in ≈ 0,2 s; vom Wasser weg (Ufer, Sprung) fallen sie schnell in sich zusammen
      this.k[k] += (target - this.k[k]) * (1 - Math.exp(-(target > this.k[k] ? 5 : o.on ? 3 : 9) * dt));
      const kk = this.k[k];
      const vis = kk > 0.02;
      any ||= vis;
      // Hyper-Realistic-Mode: niedriger und länger, wie eine echte Bugwelle
      const H = o.real ? Math.min(1.7, 0.28 + 0.72 * kk) : Math.min(2.4, 0.35 + 0.95 * kk); // Scheitelhöhe
      const L = o.real ? 0.8 + 1.8 * kk : 0.9 + 2.3 * kk;                  // seitliche Weite bis zur Landestelle
      const B = o.real ? 1.0 + 3.8 * kk : 0.6 + 2.6 * kk;                  // so weit hinten landet er
      const D0 = o.real ? 0.14 + 0.14 * kk : 0.2 + 0.22 * kk;              // Dicke des Bogens (in Fahrtrichtung)
      for (let i = 0; i <= S; i++) {
        const s = i / S, g = Math.pow(s, 0.75);
        const lat = 0.18 + L * s;
        // die Oberkante wogt und spritzt: Wellenzüge laufen den Bogen entlang
        const fl = U.uFlow.value;
        const wob = 1 + 0.05 * Math.sin(11 * s - fl * 1.7 + sd) + 0.025 * Math.sin(23 * s - fl * 2.6);
        const h = H * 4 * g * (1 - g) * wob;
        const back = B * Math.pow(s, 1.15) - 0.15;
        const depth = D0 * (1 - 0.6 * s);
        const hem = 0.18 + 0.3 * h, lean = 0.35 * h; // Saum auf dem Wasser; der Vorhang steht unten weiter innen
        for (let j = 0; j <= V; j++) {
          // Querschnitt von hinten nach vorn: Saum, Vorhang, Schleier oben, Vorhang, Saum
          let w, f, off = 0;
          if (j === 0) { w = 1; f = -1; off = hem; }
          else if (j <= Cn + 1) { w = 1; f = (j - 1) / (Cn + 1); }
          else if (j <= Cn + 1 + Rn) { w = 1 - (j - Cn - 1) / Rn; f = 1; }
          else if (j < V) { w = 0; f = 1 - (j - Cn - 1 - Rn) / (Cn + 1); }
          else { w = 0; f = -1; off = -hem; }
          const up = Math.max(0, f), a = lat - lean * Math.pow(1 - up, 1.4);
          const b = back + depth * w + off;
          const x = o.x + rx * sd * a - o.fx * b;
          const z = o.z + rz * sd * a - o.fz * b;
          const y = this.surface(x, z);
          const n = k * per + i * (V + 1) + j;
          this.pos[n * 3] = x;
          // Vorhang reicht ins Wasser hinein, der Saum liegt knapp darauf
          this.pos[n * 3 + 1] = (y === -Infinity ? o.y : y) + (f < 0 ? 0.03 : 0.04 * up - 0.06 * (1 - up) + h * up * (1 - 0.35 * w));
          this.pos[n * 3 + 2] = z;
          this.attr[n * 4] = s;
          this.attr[n * 4 + 1] = w;
          this.attr[n * 4 + 2] = sd;
          this.attr[n * 4 + 3] = vis ? Math.min(1.2, kk) : 0;
          this.fall[n] = f;
        }
      }
      // Landestelle und Scheitel (für Spritzer)
      const mid = Cn + 1 + (Rn >> 1);
      this.tips[k].fromArray(this.pos, (k * per + S * (V + 1) + mid) * 3);
      this.crests[k].fromArray(this.pos, (k * per + Math.round(S * 0.4) * (V + 1) + Cn + 1 + Rn) * 3);
    }
    this.mesh.visible = any;
    if (any) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.aB.needsUpdate = true;
      this.geometry.attributes.aF.needsUpdate = true;
      if (o.real) this.geometry.computeVertexNormals(); // das klare Wasser spiegelt mit glatten Normalen
    }
  }
}

// Glühende Funken/Asche, die um die Kamera herum aufsteigen (komplett auf der GPU animiert).
export class Embers {
  constructor(scene, count = 500) {
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 600 }, uAmount: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uScale; uniform float uAmount;
        varying float vAlpha;
        void main() {
          vec3 box = vec3(160.0, 90.0, 160.0);
          vec3 p = aSeed * box;
          p.y += uTime * (0.8 + aSeed.x * 1.6);
          p.x += uTime * 2.0 + sin(uTime * 0.4 + aSeed.y * 30.0) * 4.0;
          p.z += cos(uTime * 0.35 + aSeed.z * 25.0) * 4.0;
          p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_PointSize = (0.12 + aSeed.y * 0.22) * uScale / max(d, 0.5);
          vAlpha = (0.55 + 0.45 * sin(uTime * (3.0 + aSeed.z * 6.0) + aSeed.x * 40.0)) * (1.0 - smoothstep(35.0, 80.0, d)) * smoothstep(1.0, 4.0, d) * uAmount;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, r) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(2.6, 1.1, 0.45) * a, a);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3; // nach dem Wasser
    scene.add(this.points);
  }

  update(time, camera, scale) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(camera.position);
    u.uScale.value = scale;
  }
}

// Regen: Striche, die um die Kamera fallen (komplett auf der GPU, wie die Glut). Schräg im Wind; beim schnellen Fliegen
// zieht die eigene Bewegung die Striche schräg. amount (0–1) bestimmt, wie viele Tropfen fallen.
export class Rain {
  constructor(scene, count = 14000) {
    const n = count * 2;
    const seeds = new Float32Array(n * 3), end = new Float32Array(n);
    for (let i = 0; i < count; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random();
      for (let k = 0; k < 2; k++) {
        seeds.set([a, b, c], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCamVel: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color() },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        attribute float aEnd;
        uniform float uTime; uniform float uAmount; uniform vec3 uCam; uniform vec3 uCamVel; uniform vec3 uWind;
        varying float vAlpha;
        void main() {
          vec3 box = vec3(64.0, 44.0, 64.0);
          vec3 vel = vec3(uWind.x, -26.0 - 8.0 * aSeed.y, uWind.z);
          vec3 p = aSeed * box + vel * uTime;
          p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
          p -= (vel - uCamVel) * 0.03 * aEnd; // Strich: Weg in 1/30 s, gesehen von der mitbewegten Kamera
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vAlpha = step(aSeed.z, uAmount) * (1.0 - smoothstep(18.0, 30.0, d)) * smoothstep(0.8, 3.0, d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.01) discard;
          gl_FragColor = vec4(uColor, vAlpha * 0.6);
        }`,
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 3; // nach dem Wasser, sonst verschwindet der Regen über dem Meer
    scene.add(this.lines);
  }

  update(time, camera, camVel, wind, amount, color) {
    const u = this.material.uniforms;
    this.lines.visible = amount > 0.005;
    u.uTime.value = time;
    u.uCam.value.copy(camera.position);
    u.uCamVel.value.copy(camVel);
    u.uWind.value.copy(wind);
    u.uAmount.value = amount;
    u.uColor.value.copy(color);
  }
}

// Anime-artige Geschwindigkeitslinien als 2D-Overlay, zentriert auf die Flugrichtung.
export class SpeedLines {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dirty = false;
    this.resize();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  draw(intensity, fx, fy) {
    const { ctx, canvas } = this;
    if (intensity <= 0.01) {
      if (this.dirty) ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.dirty = false;
      return;
    }
    this.dirty = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const R = Math.hypot(canvas.width, canvas.height) * 0.6;
    const n = Math.floor(25 + 55 * intensity);
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.22 * intensity})`;
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass === 0 ? 1 : 2.5;
      ctx.beginPath();
      for (let i = 0; i < n / 2; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r0 = R * (0.42 + Math.random() * 0.3 * (1 - intensity * 0.4));
        const r1 = r0 + R * (0.15 + Math.random() * 0.5) * intensity;
        const c = Math.cos(ang), s = Math.sin(ang);
        ctx.moveTo(fx + c * r0, fy + s * r0);
        ctx.lineTo(fx + c * r1, fy + s * r1);
      }
      ctx.stroke();
    }
  }
}

// Markierung an der Stelle, an der ein Haken greifen würde.
export class AimMarker {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: '#c8ff3c', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), mat);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat);
    this.group = new THREE.Group();
    this.group.add(this.ring, this.dot);
    this.group.renderOrder = 999;
    this.ring.renderOrder = 999;
    this.dot.renderOrder = 999;
    this.group.visible = false;
    this._look = new THREE.Vector3();
    scene.add(this.group);
  }

  update(aim, camera, time) {
    if (!aim.hit || !aim.inRange) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.copy(aim.point).addScaledVector(aim.normal, 0.05);
    this.group.lookAt(this._look.copy(aim.point).add(aim.normal));
    const s = camera.position.distanceTo(aim.point) * 0.012 * (1 + Math.sin(time * 8) * 0.08);
    this.group.scale.setScalar(s);
  }
}
