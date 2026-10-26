import * as THREE from 'three';
import { CONFIG } from './config.js';

const _head = new THREE.Vector3();
const _back = new THREE.Vector3();
const _side = new THREE.Vector3();

// Third-Person-Kamera über der Schulter. Das Fadenkreuz (Bildmitte) liegt auf der Verlängerung
// der Kamerablickrichtung – genau dorthin fliegen die Haken.
export class CameraRig {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = 0;
    this.pitch = -0.15;
    this.roll = 0;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this.dist = CONFIG.camera.distance;
    this.shoulderSide = 1;
    this.shake = 0;
    this.fov = CONFIG.camera.fov;
    this.updateBasis();
  }

  look(dx, dy) {
    const s = CONFIG.camera.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (CONFIG.camera.invertY ? -1 : 1);
    this.pitch = Math.min(1.45, Math.max(-1.45, this.pitch));
    this.updateBasis();
  }

  updateBasis() {
    const cp = Math.cos(this.pitch);
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  update(dt, pos, player) {
    const C = CONFIG.camera;
    const speed = player.vel.length();
    const sf = Math.min(1, Math.max(0, (speed - 12) / 50));

    const targetFov = C.fov + C.fovSpeedBoost * sf;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // Schulterversatz, ohne in Wände zu ragen
    _head.set(pos.x, pos.y + C.height, pos.z);
    let shoulder = C.shoulder * this.shoulderSide;
    _side.copy(this.right).multiplyScalar(Math.sign(shoulder));
    const sideHit = this.city.raycast(_head, _side, Math.abs(shoulder) + 0.3);
    if (sideHit) shoulder = Math.sign(shoulder) * Math.max(0, sideHit.dist - 0.3);
    this.pivot.copy(_head).addScaledVector(this.right, shoulder);

    // Abstand mit Kollision (sofort heran, sanft zurück)
    const want = C.distance + C.distanceSpeedBoost * sf;
    _back.copy(this.forward).negate();
    const hit = this.city.raycast(this.pivot, _back, want + 0.3, true);
    const allowed = hit ? Math.max(0.3, hit.dist - 0.3) : want;
    if (allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.pivot).addScaledVector(this.forward, -this.dist);

    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    // Beim Wallrun von der Wand weg neigen
    const targetRoll = player.state === 'wallrun' ? -player.wall.n.dot(this.right) * 0.2 : 0;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-6 * dt));
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
}
