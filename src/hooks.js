import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { CONFIG } from './config.js';

const ROPE_POINTS = 24;
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _side = new THREE.Vector3();
const _look = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Ein Enterhaken: fliegt als Projektil zum Ziel, hängt dann als Seil mit fester Länge.
export class Hook {
  constructor(side, scene) {
    this.side = side; // -1 = links, +1 = rechts
    this.state = 'idle'; // 'idle' | 'flying' | 'attached' | 'retracting'
    this.head = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.willHit = false;
    this.length = 0;
    this.taut = false;
    this.tension = 0;
    this.justAttached = false;
    this.justMissed = false;
    this.flyTime = 0;

    const headGeo = new THREE.ConeGeometry(0.1, 0.36, 6);
    headGeo.rotateX(Math.PI / 2);
    this.headMesh = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: '#a8b0b8', metalness: 0.9, roughness: 0.3 }));
    this.headMesh.visible = false;

    this.points = new Float32Array(ROPE_POINTS * 3);
    this.geometry = new LineGeometry();
    this.geometry.setPositions(this.points);
    this.material = new LineMaterial({ color: '#15171b', linewidth: 2.2, worldUnits: false });
    this.line = new Line2(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.headMesh, this.line);
  }

  setResolution(w, h) {
    this.material.resolution.set(w, h);
  }

  fire(from, target, normal, willHit) {
    this.state = 'flying';
    this.head.copy(from);
    this.target.copy(target);
    this.normal.copy(normal);
    this.willHit = willHit;
    this.taut = false;
    this.flyTime = 0;
  }

  release() {
    if (this.state === 'flying' || this.state === 'attached') this.state = 'retracting';
    this.taut = false;
    this.tension = 0;
  }

  // Physik-Takt: Projektilflug und Einhaken.
  step(dt, playerPos) {
    if (this.state !== 'flying') return;
    this.flyTime += dt;
    const travel = CONFIG.hook.speed * dt;
    _d.subVectors(this.target, this.head);
    const dist = _d.length();
    if (dist <= travel) {
      this.head.copy(this.target);
      if (this.willHit) {
        this.state = 'attached';
        this.anchor.copy(this.target);
        this.length = Math.max(CONFIG.hook.minLength, playerPos.distanceTo(this.anchor));
        this.justAttached = true;
      } else {
        this.state = 'retracting';
        this.justMissed = true;
      }
    } else {
      this.head.addScaledVector(_d, travel / dist);
    }
  }

  // Render-Takt: Einholen nach Fehlschuss/Lösen und Seil zeichnen.
  draw(dt, hip, time) {
    if (this.state === 'retracting') {
      _d.subVectors(hip, this.head);
      const dist = _d.length();
      const travel = CONFIG.hook.speed * 1.4 * dt;
      if (dist <= travel) this.state = 'idle';
      else this.head.addScaledVector(_d, travel / dist);
    }
    if (this.state === 'idle') {
      this.line.visible = false;
      this.headMesh.visible = false;
      return;
    }
    this.line.visible = true;
    this.headMesh.visible = true;

    const end = this.state === 'attached' ? this.anchor : this.head;
    const dist = hip.distanceTo(end);
    let sag = 0;
    let wave = 0;
    if (this.state === 'attached' && !this.taut) sag = Math.min(8, Math.max(0, this.length - dist) * 0.6);
    if (this.state === 'flying') wave = Math.min(0.35, dist * 0.01);
    if (this.state === 'retracting') sag = Math.min(3, dist * 0.08);
    _d.subVectors(end, hip);
    _side.crossVectors(_d, UP);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize();

    const pts = this.points;
    for (let i = 0; i < ROPE_POINTS; i++) {
      const s = i / (ROPE_POINTS - 1);
      _p.copy(hip).addScaledVector(_d, s);
      _p.y -= sag * 4 * s * (1 - s);
      if (wave > 0) _p.addScaledVector(_side, Math.sin(s * 18 - time * 45) * wave * (1 - s) * s * 4);
      pts[i * 3] = _p.x; pts[i * 3 + 1] = _p.y; pts[i * 3 + 2] = _p.z;
    }
    // In-place-Update der Line2-Segmente (Start/Ende pro Segment interleaved)
    const buf = this.geometry.attributes.instanceStart.data;
    const arr = buf.array;
    for (let i = 0; i < ROPE_POINTS - 1; i++) {
      const o = i * 6, a = i * 3;
      arr[o] = pts[a]; arr[o + 1] = pts[a + 1]; arr[o + 2] = pts[a + 2];
      arr[o + 3] = pts[a + 3]; arr[o + 4] = pts[a + 4]; arr[o + 5] = pts[a + 5];
    }
    buf.needsUpdate = true;

    this.headMesh.position.copy(end);
    if (this.state === 'attached') _look.copy(end).sub(this.normal);
    else _look.copy(end).add(_d);
    this.headMesh.lookAt(_look);
  }
}
