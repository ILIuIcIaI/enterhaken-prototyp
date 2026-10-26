import * as THREE from 'three';

// Weiche Partikel (Gasstöße, Staub, Funken) als ein einziges Points-Objekt.
export class Particles {
  constructor(scene, max = 600) {
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
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
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
    scene.add(this.points);
  }

  setScale(height, fovDeg) {
    this.material.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(p, v, { life = 0.6, size = 0.5, alpha = 0.6, color = [1, 1, 1], drag = 2, grow = 2 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size; this.baseAlpha[i] = alpha;
    this.drag[i] = drag; this.grow[i] = grow;
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
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= damp;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
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

// Glühende Funken/Asche, die um die Kamera herum aufsteigen (komplett auf der GPU animiert).
export class Embers {
  constructor(scene, count = 500) {
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uScale;
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
          vAlpha = (0.55 + 0.45 * sin(uTime * (3.0 + aSeed.z * 6.0) + aSeed.x * 40.0)) * (1.0 - smoothstep(35.0, 80.0, d)) * smoothstep(1.0, 4.0, d);
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
    scene.add(this.points);
  }

  update(time, camera, scale) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(camera.position);
    u.uScale.value = scale;
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
