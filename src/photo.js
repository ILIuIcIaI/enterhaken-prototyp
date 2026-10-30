import * as THREE from 'three';
import { CONFIG } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Fotomodus (Taste F oder Menü): die Zeit steht, eine freie Kamera fliegt um die Figur (höchstens LEASH m weit, nicht
// durch Häuser), HUD und Tempolinien verschwinden. Dazu Looks und ein Foto ohne alles Drumherum. Die Bedienleiste
// sitzt klein unten links – die Bildmitte bleibt frei.
const LEASH = 40;
export const LOOKS = [
  { name: 'Standard' },
  { name: 'Manga', sat: 0, ink: 1.7, contrast: 1.35 },
  { name: 'Glitch', glitch: 0.85 },
  { name: 'Abendrot', tint: [1.15, 0.95, 0.8], sat: 1.3 },
  { name: 'Nachtblau', tint: [0.8, 0.92, 1.18], sat: 0.8, contrast: 1.1 },
];

export class PhotoMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pending = false; // aus dem Menü gestartet: beim Zurück ins Spiel direkt in den Fotomodus
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.fov = 60;
    this.look = 0;
    this.hideChar = false;
    const $ = (id) => document.getElementById(id);
    this.el = { panel: $('photoPanel'), look: $('photoLook'), note: $('photoNote'), flash: $('photoFlash') };
  }

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }

  enter() {
    const g = this.game;
    this.active = true;
    this.pos.copy(g.camera.position);
    this.vel.set(0, 0, 0);
    this.yaw = g.rig.yaw;
    this.pitch = g.rig.pitch;
    this.roll = 0;
    this.fov = g.camera.fov;
    this.hideChar = false;
    document.body.classList.add('photo');
    this.el.panel.classList.remove('hidden', 'min');
    this.el.look.textContent = LOOKS[this.look].name;
    this.el.note.textContent = '';
  }

  exit() {
    this.active = false;
    document.body.classList.remove('photo');
    this.el.panel.classList.add('hidden');
  }

  handleKeys(i) {
    for (let n = 0; n < LOOKS.length; n++) {
      if (!i.wasPressed(`Digit${n + 1}`)) continue;
      this.look = n;
      this.el.look.textContent = LOOKS[n].name;
    }
    if (i.wasPressed('KeyH')) this.hideChar = !this.hideChar;
    if (i.wasPressed('Tab')) this.el.panel.classList.toggle('min');
    if (i.wasPressed('Enter') || i.wasPressed('KeyP')) this.capture();
  }

  // freie Kamera: Maus schaut, WASD fliegt in Blickrichtung, Leertaste/Strg hoch/runter, Shift schneller,
  // Mausrad zoomt, Q/E neigt
  update(dt) {
    const g = this.game, inp = g.input, C = CONFIG.camera, cam = g.camera;
    this.yaw -= inp.mouse.dx * C.sensitivity;
    this.pitch = clamp(this.pitch - inp.mouse.dy * C.sensitivity * (C.invertY ? -1 : 1), -1.5, 1.5);
    if (inp.mouse.wheel) this.fov = clamp(this.fov * Math.exp(inp.mouse.wheel * 0.001), 15, 100);
    const roll = (inp.isDown('KeyQ') ? 1 : 0) - (inp.isDown('KeyE') ? 1 : 0);
    this.roll = clamp(this.roll + roll * 0.9 * dt, -0.8, 0.8);

    const cp = Math.cos(this.pitch);
    _f.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const key = (k) => (inp.isDown(k) ? 1 : 0);
    _v.set(0, 0, 0)
      .addScaledVector(_f, key('KeyW') - key('KeyS'))
      .addScaledVector(_r, key('KeyD') - key('KeyA'))
      .addScaledVector(UP, key('Space') - key('ControlLeft') - key('ControlRight'));
    if (_v.lengthSq() > 0) _v.normalize().multiplyScalar(inp.isDown('ShiftLeft') || inp.isDown('ShiftRight') ? 16 : 5);
    this.vel.lerp(_v, 1 - Math.exp(-8 * dt));

    // nicht durch Häuser: vor der Wand anhalten
    _d.copy(this.vel).multiplyScalar(dt);
    const len = _d.length();
    if (len > 1e-6) {
      const hit = g.city.raycast(this.pos, _v.copy(_d).divideScalar(len), len + 0.35);
      if (hit) _d.multiplyScalar(Math.max(0, hit.dist - 0.35) / len);
      this.pos.add(_d);
    }
    // an der Leine um die Figur und nicht unter den Boden
    _d.subVectors(this.pos, g.renderPos);
    if (_d.length() > LEASH) this.pos.copy(g.renderPos).addScaledVector(_d.normalize(), LEASH);
    this.pos.y = Math.max(this.pos.y, g.city.groundY(this.pos.x, this.pos.z) + 0.3);

    cam.position.copy(this.pos);
    cam.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  // Look über die Grundeinstellung legen (jeden Frame nach applyGraphics): nur was der Look festlegt – der Rest
  // bleibt beim aktuellen Grafikmodus (im Hyper-Realistic-Mode z. B. ohne Tuschelinien)
  applyLook() {
    const L = LOOKS[this.look], u = this.game.post.inkMat.uniforms;
    if (L.ink !== undefined) u.uInk.value = L.ink;
    if (L.sat !== undefined) u.uSaturation.value = L.sat;
    if (L.tint) u.uTint.value.fromArray(L.tint);
    if (L.contrast !== undefined) u.uContrast.value = L.contrast;
    const gl = this.game.post.glitch;
    gl.amount = L.glitch ?? 0;
    gl.burst = 0;
  }

  async capture() {
    const f = this.el.flash;
    f.classList.remove('go');
    void f.offsetWidth; // Blitz neu starten
    f.classList.add('go');
    const name = `foto-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const file = await this.game.screenshot(name, false);
    this.el.note.textContent = file ? `Gespeichert: screenshots/${file}` : 'Foto heruntergeladen';
  }
}
