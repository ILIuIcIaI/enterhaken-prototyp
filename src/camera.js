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
    this.fovKick = 0;
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
    if (!CONFIG.camera.shake) return;
    this.shake = Math.min(1, this.shake + amount);
  }

  // kurzer Sichtfeld-Stoß (z. B. Dash)
  kick(deg) {
    this.fovKick += deg;
  }

  // opts: { moving, swinging, sprinting, bank, surf, surfBank, focus }
  // focus 0–1: Zeitlupe beim perfekten Moment – näher an die Figur, enger, Figur mehr zur Bildmitte. Folgt direkt der
  // (schon weichen) Hüllkurve der Zeitlupe, ohne eigenes Nachziehen.
  // surf 0–1: auf dem Wasser – Kamera tiefer (die Figur hockt), etwas weiter; surfBank: neigt sich mit in die Kurve.
  update(dt, pos, player, { moving = true, swinging = false, sprinting = false, bank = 0, surf = 0, surfBank = 0, focus = 0 } = {}) {
    const C = CONFIG.camera;
    const speed = player.vel.length();
    const sf = Math.min(1, Math.max(0, (speed - 12) / 50));

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

    if (moving && dt > 0) {
      const lat = _side.subVectors(player.vel, this.prevVel).dot(this.right) / dt;
      this.latAcc += (Math.max(-60, Math.min(60, lat)) - this.latAcc) * (1 - Math.exp(-4 * dt));
      this.prevVel.copy(player.vel);
    }

    this.fovKick *= Math.exp(-5 * dt);
    const targetFov = C.fov + C.fovSpeedBoost * sf + (sprinting ? 4 : 0) + (player.state === 'wallrun' ? 5 : 0) + 6 * surf + this.fovKick;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-6 * dt));
    const fov = this.fov * (1 - 0.18 * focus);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Schulterversatz, ohne in Wände zu ragen
    _head.set(pos.x, pos.y + C.height * (1 - 0.45 * focus) - 0.32 * surf, pos.z);
    let shoulder = C.shoulder * this.shoulderSide * (1 - 0.55 * focus);
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
    const d = this.dist + (Math.min(this.dist, 3) - this.dist) * focus;
    this.camera.position.copy(this.pivot).addScaledVector(this.forward, -d);
    // nie unter die Wasseroberfläche (Blick nach oben auf dem Wasser): von unten wäre das Meer unsichtbar
    const cp = this.camera.position;
    cp.y = Math.max(cp.y, this.city.terrain.surfaceY(cp.x, cp.z) + 0.35);

    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    let targetRoll = 0;
    // Wallrun: Kamera kippt deutlich von der Wand weg (seitlich bis ≈ 16°, beim Hochlaufen weniger)
    if (player.state === 'wallrun') targetRoll = -player.wall.n.dot(this.right) * 0.28 * (1 - 0.6 * Math.max(0, player.vel.y / Math.max(1, player.vel.length())));
    else if (player.gliding) targetRoll = bank * 0.35;
    else if (Math.abs(surfBank) > 1e-3) targetRoll = surfBank * 0.25; // bis ≈ 9° mit in die Kurve
    else if (swinging) targetRoll = Math.max(-0.14, Math.min(0.14, -this.latAcc * 0.005));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-6 * dt));
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
}
