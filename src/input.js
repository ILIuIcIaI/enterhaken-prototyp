import { CONFIG } from './config.js';

// Tastatur (physische Tasten via e.code, funktioniert also auch mit QWERTZ) und Maus.
// Strg dient als Gleiter-Taste: Browser-Kürzel mit Strg werden abgefangen; Strg+W/T/N lassen sich
// nur im Vollbild mit Tastatursperre (Chrome/Edge) blockieren – darum startet das Spiel im Vollbild.
export class Input {
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { dx: 0, dy: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false] };
    this.locked = false;
    this.freeLook = false; // Debug-Modus: Maus ohne Pointer-Lock

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab' || e.code === 'F1' || (this.active() && (e.ctrlKey || e.altKey))) e.preventDefault();
      // mit Tastatursperre kommt Esc beim Spiel an statt den Pointer-Lock zu lösen
      if (e.code === 'Escape' && this.locked) document.exitPointerLock?.();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('mousedown', (e) => {
      if (!this.active() || e.button > 2) return;
      this.mouse.down[e.button] = true;
      this.mouse.pressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.mouse.down[e.button]) this.mouse.released[e.button] = true;
      this.mouse.down[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active()) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget;
      if (!this.locked) this.releaseAll();
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) navigator.keyboard?.unlock?.();
    });
  }

  active() {
    return this.locked || this.freeLook;
  }

  requestLock() {
    if (CONFIG.world.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => navigator.keyboard?.lock?.())
        .catch(() => {});
    }
    try {
      const r = this.lockTarget.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch {
      /* z. B. kurz nach dem Verlassen – nächster Klick versucht es erneut */
    }
  }

  releaseAll() {
    this.keys.clear();
    for (let i = 0; i < 3; i++) {
      if (this.mouse.down[i]) this.mouse.released[i] = true;
      this.mouse.down[i] = false;
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressedKeys.has(code);
  }

  endFrame() {
    this.pressedKeys.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.pressed.fill(false);
    this.mouse.released.fill(false);
  }
}
