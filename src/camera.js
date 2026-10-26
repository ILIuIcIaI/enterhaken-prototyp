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
    this.follow = new THREE.Vector3();
    this.followInit = false;
    this.prevVel = new THREE.Vector3();
    this.latAcc = 0;
    this.updateBasis();
  }

  snap() {
    this.followInit = false;
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

  update(dt, pos, player, { moving = true, swinging = false } = {}) {
    const C = CONFIG.camera;
    const speed = player.vel.length();

    // Weiche Verfolgung mit Vorhersage: bei konstantem Tempo kein Nachziehen,
    // Rucke (Seil strafft sich, Aufprall, Kollision) werden aber geglättet.
    if (!this.followInit || this.follow.distanceToSquared(pos) > 100) {
      this.follow.copy(pos);
      this.followInit = true;
    } else {
      if (moving) this.follow.addScaledVector(player.vel, dt);
      this.follow.lerp(pos, 1 - Math.exp(-14 * dt));
    }
    pos = this.follow;

    // Querbeschleunigung (geglättet) für leichtes Kurvenneigen beim Schwingen
    if (moving && dt > 0) {
      const lat = _side.subVectors(player.vel, this.prevVel).dot(this.right) / dt;
      this.latAcc += (Math.max(-60, Math.min(60, lat)) - this.latAcc) * (1 - Math.exp(-4 * dt));
      this.prevVel.copy(player.vel);
    }
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
    let targetRoll = 0;
    if (player.state === 'wallrun') targetRoll = -player.wall.n.dot(this.right) * 0.2;
    else if (swinging) targetRoll = Math.max(-0.14, Math.min(0.14, -this.latAcc * 0.005));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-6 * dt));
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
}
