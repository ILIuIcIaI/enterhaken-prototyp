import { CONFIG } from './config.js';

const EDGE_BAND = 0.07;  // Randstreifen (Anteil der Bildbreite) für edgeTurn
const EDGE_SPEED = 900;  // Pixel Mausweg pro Sekunde ganz am Rand

// Tastatur (physische Tasten via e.code, funktioniert also auch mit QWERTZ) und Maus.
// Strg dient als Gleiter-Taste: Browser-Kürzel mit Strg werden abgefangen; Strg+W/T/N lassen sich nur im Vollbild
// mit Tastatursperre (Chrome/Edge) blockieren – das gibt es als Option (CONFIG.world.fullscreen, Tuning). Ohne Vollbild
// fragt der Browser vor dem Schließen des Tabs nach (main.js, beforeunload).
export class Input {
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false] };
    this.locked = false;
    this.freeLook = false; // Debug-Modus: Maus ohne Pointer-Lock
    // Verweigert der Browser den Maus-Fang (z. B. ein eingebetteter Browser), bleibt der Zeiger an den Bildrändern
    // hängen – dann dreht die Kamera weiter, solange er am linken oder rechten Rand steht (edgeTurn)
    this.edgeLook = false;
    this.cursorX = -1;

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
      this.cursorX = e.clientX;
      if (!this.active()) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    document.addEventListener('mouseleave', () => (this.cursorX = -1));
    window.addEventListener('wheel', (e) => {
      if (this.active()) this.mouse.wheel += e.deltaY;
    }, { passive: true });
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

  // Maus fangen (Pointer-Lock) – zuerst: das Vollbild verbraucht in Chrome die Klick-Berechtigung, ein danach
  // angefragter Maus-Fang scheiterte, wenn das Vollbild verweigert wurde (z. B. im eingebetteten Browser)
  requestLock() {
    try {
      const r = this.lockTarget.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch {
      /* z. B. kurz nach dem Verlassen – nächster Klick versucht es erneut */
    }
    if (CONFIG.world.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => navigator.keyboard?.lock?.())
        .catch(() => {});
    }
  }

  // Kamera am Bildrand weiterdrehen (nur ohne Maus-Fang, siehe edgeLook): im äußeren Streifen je nach Tiefe bis zu
  // EDGE_SPEED Pixel Mausweg pro Sekunde
  edgeTurn(dt) {
    if (!this.edgeLook || this.locked || this.cursorX < 0) return;
    const w = window.innerWidth, band = w * EDGE_BAND;
    const k = this.cursorX < band ? -(1 - this.cursorX / band) : this.cursorX > w - band ? 1 - (w - this.cursorX) / band : 0;
    this.mouse.dx += Math.sign(k) * k * k * EDGE_SPEED * dt;
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
    this.mouse.wheel = 0;
    this.mouse.pressed.fill(false);
    this.mouse.released.fill(false);
  }
}
