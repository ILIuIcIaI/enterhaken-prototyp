import * as THREE from 'three';
import { CONFIG, FIXED_DT } from './config.js';
import { City } from './city.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Hook } from './hooks.js';
import { Character } from './character.js';
import { ROSTER } from './designs/index.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { AudioFX } from './audio.js';
import { Particles, SpeedLines, AimMarker, Embers, Rain, Wake, BowWaves } from './effects.js';
import { StreetReflection } from './reflection.js';
import { WIND } from './cloth.js';
import { createTuning } from './tuning.js';
import { Post } from './post.js';
import { Traffic } from './traffic.js';
import { Birds, Pedestrians } from './life.js';
import { Transit } from './transit.js';
import { createCharacterShadow, useCharacterLayer } from './charshadow.js';
import { Settings } from './settings.js';
import { Moments } from './moments.js';
import { Flow } from './flow.js';
import { RoofFans } from './fans.js';
import { PhotoMode } from './photo.js';
import { Environment } from './environment.js';
import { Realism } from './realism.js';
import { WATER_Y } from './terrain.js';
import { SKY } from './palette.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _assist = []; // Vorauswahl der Häuser für die Zielhilfe
const _wind = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _s2 = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const _sprayCol = new THREE.Color();
const ZERO = new THREE.Vector3();

// zuletzt gewählte Figur merken (nur in diesem Browser)
function loadChoice() {
  try { return localStorage.getItem('enterhaken.character') || 'belle'; } catch { return 'belle'; }
}
function saveChoice(id) {
  try { localStorage.setItem('enterhaken.character', id); } catch { /* privates Fenster o. Ä. */ }
}
function disposeTree(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

class Game {
  constructor() {
    this.config = CONFIG;
    this.debug = new URLSearchParams(location.search).has('debug');

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.25);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CONFIG.graphics.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.25, 4000);

    this.city = new City(CONFIG.world.seed);
    this.scene.add(this.city.mesh, this.city.decor);
    this.world = createWorld(renderer, this.scene, this.city);
    this.charShadow = createCharacterShadow(this.scene, this.camera);
    this.traffic = new Traffic(this.scene, this.city, 200);
    this.transit = new Transit(this.scene, this.city);
    this.birds = new Birds(this.scene, this.city); // Vogelschwärme, die bei Annäherung auffliegen
    this.peds = new Pedestrians(this.scene, this.city); // Fußgänger auf Gehwegen, Promenade, Jahrmarkt
    this.simTime = 0;
    this.post = new Post(renderer, this.scene, this.camera);
    this.embers = new Embers(this.scene);
    this.rain = new Rain(this.scene);
    this.env = new Environment(this);
    this.realism = new Realism(renderer, this.scene, this.world, this.post); // Hyper-Realistic-Mode: PBR, Himmelslicht, Augenadaption
    this.charEvents = [];

    this.player = new Player(this.city);
    this.player.movers = [...this.transit.movers, ...this.traffic.movers];
    this.hooks = [new Hook(-1, this.scene), new Hook(1, this.scene)];
    this.character = null;
    this.charCache = new Map(); // zuletzt gespielte Figuren bleiben gebaut – Zurückwechseln geht sofort
    this.setCharacter(loadChoice());
    this.rig = new CameraRig(this.camera, this.city);
    this.input = new Input(renderer.domElement);
    this.hud = new HUD();
    this.audio = new AudioFX();
    this.particles = new Particles(this.scene);
    this.spray = new Particles(this.scene, 3600); // Gischt und Schaum auf dem Wasser (eigener Vorrat, verdrängt kein Gas)
    this.fans = new RoofFans(this.scene, this.city); // Lüfter auf den Dächern: Rotoren und Windlinien
    this.spray.surface = (x, z) => this.city.terrain.surfaceY(x, z); // Schaum schwimmt auf den Wellen
    this.wake = new Wake(this.scene, (x, z) => this.city.terrain.surfaceY(x, z));
    this.bow = new BowWaves(this.scene, (x, z) => this.city.terrain.surfaceY(x, z));
    this.waterDir = new THREE.Vector3(0, 0, -1);
    this.speedLines = new SpeedLines(document.getElementById('speedlines'));
    this.aimMarker = new AimMarker(this.scene);
    // nasse Straßen spiegeln die Stadt – Boden, Wasser, Regen und Zielmarke gehören nicht ins Spiegelbild
    this.reflection = new StreetReflection(renderer, this.scene, this.world.wet, () => [
      this.world.ground, this.world.sea, this.world.ponds, this.rain.lines, this.aimMarker.group, this.embers.points,
    ]);
    this.gui = createTuning(this);
    this.moments = new Moments(this);
    this.flow = new Flow();
    this.settings = new Settings(this);
    this.photo = new PhotoMode(this);
    this.fpsMeter = { n: 0, t: 0 };

    this.aim = { hit: false, inRange: false, point: new THREE.Vector3(), normal: new THREE.Vector3(), distPlayer: 0, mover: null, local: new THREE.Vector3() };
    this.renderPos = new THREE.Vector3();
    this.wallOff = new THREE.Vector3(); // Figur beim Wallrun so weit von der Wand weg, dass die Füße aufsetzen
    this.wallUp = 0;
    this.surfBank = 0; // Schräglage beim Surfen (rad, + = Linkskurve)
    this.surfK = 0;    // 0–1: wie sehr gerade gesurft wird (Kamera tiefer)
    this.ctl = {
      move: { x: 0, z: 0 }, reel: false, sprint: false, jumpHeld: false,
      jumpPressed: false, dashPressed: false, glideToggle: false,
      camFwd: this.rig.forward, camRight: this.rig.right,
    };
    this.hookInfo = this.hooks.map(() => ({ state: 'idle', taut: false, point: new THREE.Vector3() }));
    this.acc = 0;
    this.time = 0;
    this.last = null;
    this.slowmo = false;
    this.paused = !this.debug;
    this.speedLineIntensity = 0;

    this.spawn();
    this.setupUI();
    this.settings.apply(true);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    renderer.setAnimationLoop((t) => this.frame(t));
  }

  // Figur wechseln (Auswahlraster): altes Modell entfernen, neues bauen
  setCharacter(id) {
    if (this.character && this.character.design.id === id) return;
    let next = this.charCache.get(id);
    if (next) this.charCache.delete(id);
    else {
      next = new Character(id);
      useCharacterLayer(next.root, next.world);
    }
    for (const c of next.cloths) c.sim.ready = false; // Stoff neu an die aktuelle Pose anlegen
    if (this.character) {
      this.scene.remove(this.character.root, this.character.world);
      this.charCache.set(this.character.design.id, this.character);
      while (this.charCache.size > 3) {
        const [oldId, old] = this.charCache.entries().next().value;
        this.charCache.delete(oldId);
        disposeTree(old.root);
        disposeTree(old.world);
      }
    }
    this.character = next;
    this.scene.add(next.root, next.world);
    saveChoice(next.design.id);
  }

  spawn() {
    const roof = this.city.findSpawn();
    this.spawnPoint = roof.clone();
    this.spawnPoint.y += CONFIG.player.halfHeight + 0.01;
    this.player.reset(this.spawnPoint, -Math.PI / 2);
    for (const h of this.hooks) h.state = 'idle';
    if (this.flow) this.flow.value = this.flow.tier = 0;
    this.rig.yaw = -Math.PI / 2;
    this.rig.pitch = -0.12;
    this.rig.updateBasis();
    this.rig.snap();
    this.renderPos.copy(this.spawnPoint);
  }

  regenerateCity() {
    this.city.generate(CONFIG.world.seed);
    this.world.rebuild();
    this.fans.build(this.city);
    this.traffic.build(this.city, 200);
    this.transit.build(this.city);
    this.birds.build(this.city);
    this.peds.build(this.city);
    this.player.movers = [...this.transit.movers, ...this.traffic.movers];
    this.spawn();
  }

  // ------------------------------------------------------------------ UI
  setupUI() {
    const overlay = document.getElementById('overlay');
    const help = document.getElementById('help');
    this.overlay = overlay;
    this.helpPanel = help;
    // Reiter: Steuerung · Figur · Einstellungen (auch im Pausenmenü)
    const tabs = overlay.querySelectorAll('.tab');
    const page = (name) => {
      overlay.dataset.page = name;
      for (const t of tabs) t.classList.toggle('on', t.dataset.tab === name);
    };
    for (const t of tabs) t.addEventListener('click', () => page(t.dataset.tab));
    page('controls');
    const roster = document.getElementById('roster'), pick = document.getElementById('pick');
    const plays = overlay.querySelectorAll('.play');
    const cards = new Map();
    const mark = () => {
      const d = this.character.design;
      for (const [id, el] of cards) el.classList.toggle('selected', id === d.id);
      pick.innerHTML = `<b>${d.name}</b> <span>${d.franchise}</span>`;
    };
    for (const d of ROSTER) {
      const el = document.createElement('button');
      el.className = 'card';
      el.type = 'button';
      el.innerHTML = `<span class="thumb"><img src="assets/characters/${d.id}.png" alt="" draggable="false"><i class="spin"></i></span><span class="name">${d.name}</span><span class="fr">${d.franchise}</span>`;
      el.querySelector('img').addEventListener('error', () => el.classList.add('noimg'));
      el.addEventListener('click', () => {
        if (overlay.classList.contains('busy') || d.id === this.character.design.id) return;
        overlay.classList.add('busy');
        el.classList.add('loading');
        for (const b of plays) b.disabled = true;
        // erst den Ladezustand zeichnen lassen, dann bauen (blockiert kurz)
        requestAnimationFrame(() => setTimeout(() => {
          try { this.setCharacter(d.id); } finally {
            overlay.classList.remove('busy');
            el.classList.remove('loading');
            for (const b of plays) b.disabled = false;
            mark();
          }
        }, 30));
      });
      cards.set(d.id, el);
      roster.appendChild(el);
    }
    mark();
    document.getElementById('toSelect').addEventListener('click', () => page('select'));
    document.getElementById('toControls').addEventListener('click', () => page('controls'));
    const start = () => {
      if (overlay.classList.contains('busy')) return;
      this.audio.init();
      this.input.requestLock();
    };
    for (const b of plays) b.addEventListener('click', start);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' || overlay.classList.contains('hidden')) return;
      if (e.target.closest?.('.page-settings')) return; // dort bedient Enter die Schalter
      if (overlay.dataset.page === 'controls') page('select');
      else start();
    });
    this.settings.build(document.getElementById('settings'));
    document.getElementById('resetSettings').addEventListener('click', () => this.settings.reset());
    document.getElementById('photoBtn').addEventListener('click', () => {
      this.photo.pending = true;
      start();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.debug) return;
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.paused = !locked;
      overlay.classList.toggle('hidden', locked);
      overlay.classList.add('started');
      if (!locked) page('select');
      // Fotomodus: aus dem Menü gestartet gleich hinein, beim Pausieren beenden
      if (locked && this.photo.pending) this.photo.enter();
      if (!locked && this.photo.active) this.photo.exit();
      this.photo.pending = false;
    });
    // Verweigert der Browser den Maus-Fang (z. B. ein eingebetteter Browser), trotzdem starten: die Maus steuert die
    // Kamera dann ohne Einfangen, Esc öffnet wieder das Menü
    document.addEventListener('pointerlockerror', () => {
      if (this.debug || overlay.classList.contains('hidden') || overlay.classList.contains('busy')) return;
      this.input.freeLook = true;
      this.input.edgeLook = true; // Zeiger bleibt am Rand hängen – dort dreht die Kamera weiter
      this.paused = false;
      overlay.classList.add('hidden', 'started');
      if (this.photo.pending) this.photo.enter();
      this.photo.pending = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || this.debug || !this.input.freeLook || overlay.classList.contains('hidden') === false) return;
      if (document.pointerLockElement) return;
      this.input.freeLook = false;
      this.input.edgeLook = false;
      this.paused = true;
      overlay.classList.remove('hidden');
      page('select');
      if (this.photo.active) this.photo.exit();
    });
    if (this.debug) {
      this.input.freeLook = true;
      overlay.classList.add('hidden');
      // auch hier fängt ein Klick ins Bild die Maus (Testskripte klicken nicht – sie steuern weiter ohne Fang)
      this.renderer.domElement.addEventListener('mousedown', () => {
        if (!document.pointerLockElement) this.input.requestLock();
      });
    }
    // Ohne Vollbild schließt Strg+W (Gleiter + Sturzflug) den Tab – mitten im Spiel fragt der Browser vorher nach
    window.addEventListener('beforeunload', (e) => {
      if (this.debug || !overlay.classList.contains('started') || document.fullscreenElement) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  handleKeys() {
    const i = this.input;
    if (i.wasPressed('KeyG')) {
      if (this.gui._hidden) {
        this.gui.show();
        document.exitPointerLock?.();
      } else this.gui.hide();
    }
    if (i.wasPressed('KeyF') && !this.paused) this.photo.toggle();
    if (this.photo.active) {
      this.photo.handleKeys(i);
      return;
    }
    if (i.wasPressed('KeyH')) this.helpPanel.classList.toggle('hidden');
    if (i.wasPressed('KeyP')) this.screenshot();
    if (this.paused) return;
    if (i.wasPressed('KeyR')) this.spawn();
    if (i.wasPressed('KeyT')) this.slowmo = !this.slowmo;
    if (i.wasPressed('KeyC')) this.rig.shoulderSide *= -1;
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const hk of this.hooks) hk.setResolution(w, h);
    this.post.setSize(w, h, this.pixelRatio);
    this.reflection.setSize(w * this.pixelRatio, h * this.pixelRatio);
    this.speedLines.resize();
  }

  // ------------------------------------------------------------------ Haken
  hipPosition(side, out) {
    return out.copy(this.player.pos).addScaledVector(this.rig.right, side * 0.3).add(_u.set(0, -0.1, 0));
  }

  fireHook(hook) {
    const range = CONFIG.hook.range;
    const pp = this.player.pos;
    // der Haken verlässt die Hand, die gleich zum Ziel stößt
    this.character.joints[hook.side < 0 ? 'handL' : 'handR'].getWorldPosition(_hip);
    if (this.aim.hit && this.aim.inRange) {
      // Sichtlinie vom Spieler: steht etwas im Weg, greift der Haken dort.
      _v.subVectors(this.aim.point, pp);
      const d = _v.length();
      _v.divideScalar(d);
      const block = this.city.raycast(pp, _v, d - 0.3);
      if (block) hook.fire(_hip, block.point, block.normal, true);
      else if (this.aim.mover) hook.fire(_hip, this.aim.point, this.aim.normal, true, { mover: this.aim.mover, local: this.aim.local });
      else hook.fire(_hip, this.aim.point, this.aim.normal, true);
    } else {
      if (this.aim.hit) _w.copy(this.aim.point);
      else _w.copy(this.camera.position).addScaledVector(this.rig.forward, range + this.rig.dist);
      _v.subVectors(_w, pp).normalize();
      _w.copy(pp).addScaledVector(_v, range);
      hook.fire(_hip, _w, _v, false);
    }
    this.audio.shoot();
  }

  updateAim() {
    const maxD = CONFIG.hook.range + this.rig.dist + 10;
    const hit = this.city.raycast(this.camera.position, this.rig.forward, maxD, true);
    const a = this.aim;
    // bewegte Ziele (Zug, Flugzeuge) zählen, wenn sie näher sind als das Getroffene
    const mh = this.transit.raycast(this.camera.position, this.rig.forward, hit ? hit.dist : maxD + 400);
    a.mover = mh ? mh.mover : null;
    if (mh) a.local.copy(mh.local);
    const h2 = mh ?? hit;
    a.hit = !!h2 && !h2.ground;
    if (a.hit) {
      a.point.copy(h2.point);
      a.normal.copy(h2.normal);
      a.distPlayer = a.point.distanceTo(this.player.pos);
      a.inRange = a.distPlayer <= CONFIG.hook.range;
    } else {
      a.inRange = false;
    }
    // Zielhilfe (Einstellungen, Standard aus): knapp an einem Gebäude vorbei zählt trotzdem
    a.assisted = false;
    if (CONFIG.hook.aimAssist && !a.inRange && !a.mover && this.assistAim(maxD)) {
      a.hit = a.inRange = a.assisted = true;
      a.distPlayer = a.point.distanceTo(this.player.pos);
    }
  }

  // Strahlen in Ringen um die Blickrichtung (bis assistAngle), innen zuerst; im ersten Ring mit einem Gebäudetreffer in
  // Reichweite gewinnt der nächste Punkt. Schreibt das Ziel nach aim.point / aim.normal.
  assistAim(maxD) {
    const cam = this.camera.position, f = this.rig.forward, r = this.rig.right, a = this.aim;
    const A = THREE.MathUtils.degToRad(CONFIG.hook.assistAngle), cosA = Math.cos(A), sinA = Math.sin(A);
    // Vorauswahl: nur Häuser, deren umschließende Kugel den Kegel berühren kann – die Strahlen prüfen dann nur noch
    // diese wenigen statt aller Häuser
    const cand = _assist;
    cand.length = 0;
    for (const b of this.city.boxes) {
      const x = (b.minX + b.maxX) * 0.5 - cam.x, y = (b.minY + b.maxY) * 0.5 - cam.y, z = (b.minZ + b.maxZ) * 0.5 - cam.z;
      const ex = b.maxX - b.minX, ey = b.maxY - b.minY, ez = b.maxZ - b.minZ;
      const rad = 0.5 * Math.sqrt(ex * ex + ey * ey + ez * ez), d = Math.sqrt(x * x + y * y + z * z);
      if (d - rad > maxD) continue;
      if (d > rad) {
        const sinB = rad / d, cosB = Math.sqrt(1 - sinB * sinB);
        if ((x * f.x + y * f.y + z * f.z) / d < cosA * cosB - sinA * sinB) continue; // Winkel zur Mitte > A + Kugelradius
      }
      cand.push(b);
    }
    if (!cand.length) return false;
    _u.crossVectors(r, f).normalize();
    for (const [k, n] of [[0.35, 8], [0.7, 12], [1, 16]]) {
      const s = Math.sin(A * k), c = Math.cos(A * k);
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const phi = ((i + (k > 0.5 ? 0.5 : 0)) / n) * Math.PI * 2;
        _w.copy(f).multiplyScalar(c).addScaledVector(r, s * Math.cos(phi)).addScaledVector(_u, s * Math.sin(phi));
        const h = this.city.raycast(cam, _w, maxD, false, cand);
        if (!h || h.dist >= best || h.point.distanceTo(this.player.pos) > CONFIG.hook.range) continue;
        best = h.dist;
        a.point.copy(h.point);
        a.normal.copy(h.normal);
      }
      if (best < Infinity) return true;
    }
    return false;
  }

  // Seil wickelt sich um Kanten: verdeckt ein Gebäude die Linie zum Anker, wird dort neu verankert.
  wrapRopes() {
    if (!CONFIG.hook.wrap) return;
    const pp = this.player.pos;
    for (const h of this.hooks) {
      if (h.state !== 'attached' || h.mover) continue;
      _v.subVectors(h.anchor, pp);
      const dist = _v.length();
      if (dist < 1) continue;
      _v.divideScalar(dist);
      const hit = this.city.raycast(pp, _v, dist - 0.4);
      if (!hit || hit.dist < 0.3) continue;
      _w.copy(hit.point).addScaledVector(hit.normal, 0.02);
      const used = _w.distanceTo(h.anchor);
      h.anchor.copy(_w);
      h.normal.copy(hit.normal);
      h.length = Math.max(hit.dist, h.length - used);
    }
  }

  // ------------------------------------------------------------------ Hauptschleife
  frame(t) {
    const now = t / 1000;
    const dt = this.last === null ? 0 : Math.max(0, Math.min(0.1, now - this.last));
    this.last = now;
    const input = this.input;
    const player = this.player;

    input.edgeTurn(dt);
    this.handleKeys();
    // Zeitlupe (Taste T oder perfekter Moment) verlangsamt die ganze Spielwelt: Physik, Figur, Stoff, Partikel, Verkehr.
    // Im Fotomodus steht sie still.
    const photo = this.photo.active, frozen = this.paused || photo;
    this.moments.update(frozen ? 0 : dt);
    const slow = this.slowmo ? 0.25 : this.moments.scale;
    const gdt = frozen ? 0 : dt * CONFIG.world.timeScale * slow;
    this.time += this.paused ? dt : gdt;
    this.countFps(dt);

    if (!frozen) {
      this.rig.look(input.mouse.dx, input.mouse.dy);
      for (const [btn, idx] of [[0, 0], [2, 1]]) {
        const hook = this.hooks[idx];
        if (input.mouse.pressed[btn]) this.fireHook(hook);
        if (input.mouse.released[btn]) {
          if (hook.state === 'attached' && hook.taut && !this.hooks[1 - idx].taut) player.releaseBoost();
          if (hook.state === 'attached' && this.hooks[1 - idx].state !== 'attached') this.moments.onRelease(hook);
          hook.release();
        }
      }

      const ctl = this.ctl;
      ctl.move.z = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
      ctl.move.x = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
      ctl.reel = ctl.jumpHeld = input.isDown('Space');
      ctl.sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      // Tastendrücke gelten genau einen Physikschritt lang; bleiben bis zum nächsten Schritt
      // gespeichert, damit sie bei hoher Bildrate (Frames ohne Physikschritt) nicht verloren gehen
      ctl.jumpPressed ||= input.wasPressed('Space');
      ctl.dashPressed ||= input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight');
      ctl.glideToggle ||= input.wasPressed('ControlLeft') || input.wasPressed('ControlRight');

      this.acc += gdt;
      this.city.terrain.waveTime = this.time; // Wellen der Physik laufen mit dem Wasser-Shader
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 40) {
        this.simTime += FIXED_DT;
        this.transit.update(this.simTime, FIXED_DT);
        for (const h of this.hooks) h.step(FIXED_DT, player.pos);
        player.step(FIXED_DT, ctl, this.hooks);
        ctl.jumpPressed = ctl.dashPressed = ctl.glideToggle = false;
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps >= 40) this.acc = 0;
      this.renderPos.lerpVectors(player.prevPos, player.pos, this.acc / FIXED_DT);
      this.wrapRopes();
      if (player.pos.y < -20) this.spawn();
      this.handleEvents();
      // Hafen: Glocke der Klappbrücke, nur in Hörweite
      for (const e of this.transit.harbor.events) {
        if (e.type === 'bridgeBell' && e.pos.distanceTo(player.pos) < 260) this.audio.bell();
      }
      this.transit.harbor.events.length = 0;
      this.emitGas(dt);
      this.emitSpray(gdt);
      if (this.flow.update(gdt, player)) {
        this.audio.flowUp(this.flow.tier);
        this.hud.flowPulse();
      }
      player.flowRegen = this.flow.regen;
      player.flowBoost = this.flow.boostCost;
    }

    const swinging = this.hooks.some((h) => h.state === 'attached');
    const c = this.character;
    if (photo) {
      this.photo.update(dt);
      this.aim.hit = this.aim.inRange = false;
    } else {
      this.rig.update(this.paused ? dt : gdt, this.renderPos, player, {
        moving: !this.paused,
        swinging: swinging && player.state === 'air',
        sprinting: player.state === 'ground' && player.sprinting,
        bank: player.gliding ? player.glide.bank : 0,
        surf: this.surfK,
        surfBank: this.surfBank,
        focus: this.moments.k,
      });
      this.updateAim();
    }
    this.updateCharacter(gdt);
    this.updateWater(gdt);
    if (photo && this.photo.hideChar) c.root.visible = c.world.visible = false;
    if (!frozen) for (const s of c.steps) {
      if (player.waterRun && player.state === 'ground') this.waterStep(s);
      else this.audio.step(s);
    }
    for (const h of this.hooks) {
      this.hipPosition(h.side, _hip).sub(player.pos).add(this.renderPos);
      h.draw(this.paused ? dt : gdt, c.ropeOrigin(h.side, _hip, _w), this.time);
    }
    const pxScale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.particles.material.uniforms.uScale.value = pxScale;
    this.particles.update(gdt);
    this.spray.material.uniforms.uScale.value = pxScale;
    this.spray.update(gdt);
    this.embers.update(this.time, this.camera, pxScale);
    this.aimMarker.update(this.aim, this.camera, this.time);
    this.env.update(dt, !frozen);
    this.rain.update(this.time, this.camera, frozen ? ZERO : player.vel, _wind.copy(WIND.dir).multiplyScalar(WIND.speed), this.env.rain, this.realism.rainColor(this.env.rainColor));
    this.world.update(this.renderPos, this.camera, this.time, this.env.lightDir);
    this.charShadow.update(this.renderPos, this.env.lightDir);
    this.realism.update(dt, this.env.lightDir, this.env.cloud);
    this.city.updateDecor(this.time);
    this.fans.update(gdt, this.camera);
    // Autos bremsen für die Figur auf der Fahrbahn – nicht, wenn sie auf einem Fahrzeug mitfährt
    this.traffic.update(gdt, this.player.state === 'ground' && !this.player.platform ? this.renderPos : null);
    this.birds.update(gdt, this.renderPos, player.vel.length());
    for (const e of this.birds.events.splice(0)) {
      const d = Math.hypot(e.x - this.renderPos.x, e.y - this.renderPos.y, e.z - this.renderPos.z);
      if (d < 60) this.audio.flutter(1 - d / 60);
    }
    this.peds.update(gdt, this.camera.position);
    this.transit.render(this.simTime);
    this.hud.update(this);
    this.updateSpeedLines(dt);
    this.audio.update(frozen ? 0 : player.vel.length(), {
      reeling: !frozen && player.reeling,
      gliding: !frozen && player.gliding,
      boosting: !frozen && player.boosting,
      rain: this.paused ? 0 : this.env.rain,
      water: !frozen && player.state === 'ground' && (player.landMove?.type === 'surf' || player.waterRun) ? Math.hypot(player.vel.x, player.vel.z) : 0,
      grind: !frozen && player.state === 'grind' ? player.vel.length() : 0,
    });
    this.audio.setSlow(frozen ? 0 : (1 - slow) / 0.75);

    this.applyGraphics();
    const gl = this.post.glitch;
    gl.amount = CONFIG.gameplay.glitch && !this.paused ? this.moments.k : 0;
    gl.burst = this.moments.burst;
    gl.time = now;
    if (photo) this.photo.applyLook();
    // Spiegelungen: bei Nässe an der Straßenebene; im Hyper-Realistic-Mode sonst auf Meereshöhe (Meer spiegelt die Stadt)
    const reflect = CONFIG.graphics.waterReflections && this.env.wet > 0.01;
    const seaRefl = CONFIG.graphics.waterReflections && CONFIG.graphics.hyperReal && !reflect;
    this.world.wet.uReflOn.value = reflect ? 1 : 0;
    this.world.wet.uSeaRefl.value = seaRefl ? 1 : 0;
    if (reflect || seaRefl) {
      this.reflection.height = reflect ? 0 : WATER_Y;
      this.reflection.render(this.camera);
    }
    this.post.render();
    input.endFrame();
  }

  applyGraphics() {
    const G = CONFIG.graphics, real = G.hyperReal ? 1 : 0, u = this.post.inkMat.uniforms;
    this.renderer.toneMappingExposure = G.exposure * this.env.exposure * (real ? this.realism.exposure : 1);
    // Hyper-Realistic-Mode: keine Tuschelinien, sparsames Leuchten, natürliche Farben, Vignette und Filmkorn
    this.post.bloom.strength = G.bloom * (real ? 0.45 : 1);
    u.uInk.value = real ? 0 : G.ink;
    // Farbstimmung der Tageszeit: abends warm und satt, morgens zart und weicher, nachts etwas kühler
    const gold = this.env.gold, dawn = this.env.dawn, night = 1 - SKY.uSunUp.value;
    u.uSaturation.value = real ? 0.94 + 0.28 * gold + 0.04 * dawn : G.saturation;
    u.uTint.value.set(real ? 1.02 + 0.07 * gold + 0.015 * dawn - 0.05 * night : 1, 1 - 0.015 * gold * real, real ? 0.97 - 0.13 * gold + 0.02 * dawn + 0.08 * night : 1);
    u.uContrast.value = real ? 1.07 + 0.07 * gold - 0.04 * dawn : 1;
    u.uReal.value = real;
  }

  // Bildrate für die Anzeige (Einstellungen → Grafik)
  countFps(dt) {
    const m = this.fpsMeter;
    m.n++;
    m.t += dt;
    if (m.t < 0.5) return;
    this.hud.fps(CONFIG.graphics.fps ? Math.round(m.n / m.t) : null);
    if (!this.overlay.classList.contains('hidden')) this.settings.tick();
    m.n = 0;
    m.t = 0;
  }

  handleEvents() {
    const p = this.player;
    for (const e of p.events) {
      this.flow.onEvent(e);
      if (e.type === 'land' && p.waterDeep()) {
        // aufs Wasser: Krone aus Gischt statt Staub
        this.audio.splash(Math.min(1.4, 0.5 + e.strength / 30));
        this.rig.addShake(Math.min(0.6, e.strength / 60));
        this.waterSplash(p.pos, Math.min(1.4, 0.3 + e.strength / 25), p.vel);
      } else if (e.type === 'land' && e.strength > 6) {
        this.audio.land(e.strength);
        this.rig.addShake(Math.min(0.8, e.strength / 50));
        this.dustRing(p.pos, e.strength);
      } else if (e.type === 'wallrun') {
        this.audio.wallrun();
        this.rig.addShake(Math.min(0.5, e.strength / 80));
      } else if (e.type === 'walljump' || e.type === 'jump') {
        this.audio.jump();
      } else if (e.type === 'pivot') {
        this.audio.step(1);
        this.dustRing(p.pos, 8);
      } else if (e.type === 'dash') {
        this.audio.dash();
        this.rig.addShake(0.18);
        this.rig.kick(6);
        this.gasBurst(18, 0.8);
      } else if (e.type === 'glideOn') {
        this.audio.glide(true);
      } else if (e.type === 'glideOff') {
        this.audio.glide(false);
      } else if (e.type === 'move') {
        // Abrollen: dumpfer Aufprall und Staub; Slide: Staubwolke beim Aufsetzen
        if (e.move === 'roll') { this.audio.step(1.3); this.dustRing(p.pos, 10); }
        else if (e.move === 'slide') this.dustRing(p.pos, 8);
        else if (e.move === 'surf') {
          // aufs Wasser gesetzt: Sichtfeld-Stoß, kurzer Ruck
          this.audio.splash(1);
          this.rig.kick(7);
          this.rig.addShake(0.25);
        }
      } else if (e.type === 'grind') {
        this.audio.grindHit();
        this.rig.addShake(0.12);
      } else if (e.type === 'fan') {
        // vom Lüfter hochgeschleudert: Rauschen, Sichtfeld-Stoß, ein Bündel Windlinien fliegt mit
        this.audio.fanLaunch();
        this.rig.kick(6);
        this.rig.addShake(0.15);
        const f = this.city.fanNear(e.x, e.z, 0.5);
        if (f) this.fans.burst(f);
      } else if (e.type === 'catapult') {
        // von der Klappbrücke geschleudert: Ruck, Sichtfeld-Stoß, perfekter Moment
        this.audio.dash();
        this.audio.land(30);
        this.rig.addShake(0.5);
        this.rig.kick(9);
        this.moments.trigger();
      } else if (e.type === 'sink') {
        this.audio.splash(0.6);
        this.waterSplash(p.pos, 0.55, p.vel);
      } else if (e.type === 'stop') {
        this.audio.step(0.8);
      } else if (e.type === 'ledge') {
        // Kante gepackt: Hände klatschen auf, kurzer Ruck
        this.audio.step(1.1);
        this.audio.wallrun();
        this.rig.addShake(0.12);
      } else if (e.type === 'climb' || e.type === 'sit') {
        this.audio.step(0.6);
      } else if (e.type === 'hop') {
        this.audio.jump();
      } else if (e.type === 'snap') {
        this.audio.snap(e.strength);
        this.rig.addShake(Math.min(0.4, e.strength / 120));
      }
    }
    this.charEvents.push(...p.events);
    p.events.length = 0;
    for (const h of this.hooks) {
      if (h.justAttached) {
        h.justAttached = false;
        this.audio.attach();
        this.moments.onAttach();
        if (p.vel.length() > 20) this.flow.onEvent({ type: 'attach' }); // im vollen Tempo eingehakt
        for (let i = 0; i < 14; i++) {
          _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8).addScaledVector(h.normal, 6);
          this.particles.emit(h.anchor, _v, { life: 0.35, size: 0.18, alpha: 1, color: [1, 0.75, 0.4], drag: 4, grow: -0.5 });
        }
      }
      if (h.justMissed) {
        h.justMissed = false;
        this.audio.miss();
      }
    }
  }

  dustRing(p, strength) {
    const n = Math.min(24, Math.floor(strength));
    _w.set(p.x, p.y - CONFIG.player.halfHeight + 0.1, p.z);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      _v.set(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(4 + Math.random() * strength * 0.2);
      this.particles.emit(_w, _v, { life: 0.7, size: 0.45, alpha: 0.18, color: [0.55, 0.45, 0.62], drag: 3, grow: 2.5 });
    }
  }

  // Gaswolken aus den Kartuschen an der Hüfte (Dash-Stoß, Winde)
  gasBurst(n, strength) {
    const p = this.player;
    const q = this.character.root.quaternion;
    for (let i = 0; i < n; i++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      _w.set(0.1 * s, -0.04, 0.2).applyQuaternion(q).add(this.renderPos);
      _v.copy(p.vel).normalize().multiplyScalar(-12 * strength).addScaledVector(p.vel, 0.4);
      _v.add(_u.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5 * strength));
      this.particles.emit(_w, _v, { life: 0.4 + strength * 0.25, size: 0.2 + strength * 0.18, alpha: 0.22, color: [0.85, 0.8, 0.95], drag: 3, grow: 2.5 });
    }
  }

  emitGas(dt) {
    const p = this.player;
    if (p.reeling) this.gasBurst(Math.max(1, Math.round(25 * dt)), 0.35);
    if (p.dashing) this.gasBurst(Math.max(1, Math.round(70 * dt)), 0.7);
    if (p.boosting) this.gasBurst(Math.max(1, Math.round(60 * dt)), 0.6);
    // Gleiter: Luftwirbel an den Flügelspitzen
    if (p.gliding && Math.random() < dt * 30) {
      const J = this.character.joints;
      J[Math.random() < 0.5 ? 'handL' : 'handR'].getWorldPosition(_w);
      _v.copy(p.vel).multiplyScalar(0.6);
      this.particles.emit(_w, _v, { life: 0.4, size: 0.12, alpha: 0.35, color: [0.9, 0.85, 1.0], drag: 2, grow: 1.5 });
    }
    // Funken beim Grinden: an den Füßen, fliegen nach hinten weg und fallen
    if (p.state === 'grind') {
      const J = this.character.joints, rate = 240 * dt * Math.min(1.5, p.vel.length() / 18);
      for (let i = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0); i > 0; i--) {
        J[Math.random() < 0.5 ? 'footL' : 'footR'].getWorldPosition(_w);
        _w.y -= 0.06;
        _v.copy(p.vel).multiplyScalar(-0.15 - Math.random() * 0.25).add(_u.set(Math.random() - 0.5, 0.3 + Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(4.5));
        this.particles.emit(_w, _v, { life: 0.3 + 0.3 * Math.random(), size: 0.08 + 0.07 * Math.random(), alpha: 1, color: [1, 0.78 + 0.2 * Math.random(), 0.36], drag: 1.2, grow: -0.7, gravity: 14 });
      }
    }
    if (p.state === 'wallrun' && Math.random() < dt * 30) {
      const n = p.wall.n;
      _w.copy(this.renderPos).addScaledVector(n, -0.3);
      _w.y -= 0.75;
      _v.copy(n).multiplyScalar(2).add(_u.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(2));
      this.particles.emit(_w, _v, { life: 0.5, size: 0.2, alpha: 0.18, color: [0.8, 0.6, 0.75], drag: 2, grow: 2 });
    }
  }

  // Farbe der Gischt folgt dem Himmelslicht: mittags weiß-bläulich, abends lila, nachts gedämpft
  sprayColor() {
    const c = _sprayCol.copy(this.world.hemi.color).multiplyScalar(0.85).addScalar(0.14);
    return c.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
  }

  // Bugwellen (zwei durchgehende Wasserbögen, effects.js) und Kielwasser folgen der Figur auf dem Wasser;
  // ihre Farben kommen aus dem Himmelslicht
  updateWater(dt) {
    const p = this.player;
    const surfing = p.state === 'ground' && p.landMove?.type === 'surf';
    const running = p.state === 'ground' && p.waterRun;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const on = (surfing || running) && sp > 2;
    const k = Math.min(1.4, Math.max(0, (sp - 4) / 16)) * (surfing ? 1 : 0.45);
    if (sp > 0.5) this.waterDir.set(p.vel.x / sp, 0, p.vel.z / sp);
    const col = this.sprayColor();
    this.wake.material.uniforms.uColor.value.copy(col);
    this.bow.material.uniforms.uFoam.value.copy(col);
    // der Wasserkörper bleibt immer Blau, nur so hell wie das Himmelslicht (abends und nachts dunkler)
    const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    this.bow.material.uniforms.uBody.value.setRGB(0.25 * lum, 0.7 * lum, 1.2 * lum);
    this.wake.material.uniforms.uBody.value.copy(this.bow.material.uniforms.uBody.value);
    this.bow.material.uniforms.uReal.value = this.wake.material.uniforms.uReal.value = CONFIG.graphics.hyperReal ? 1 : 0;
    const P = this.renderPos;
    this.wake.update(dt, on, P.x, P.z, Math.min(1, 0.35 + k), sp);
    this.bow.update(dt, {
      on, x: P.x, y: P.y - CONFIG.player.halfHeight, z: P.z, fx: this.waterDir.x, fz: this.waterDir.z,
      speed: sp, strength: k, bank: this.surfBank / 0.6, real: CONFIG.graphics.hyperReal,
    });
  }

  // Partikel zu den Bugwellen (eigener Vorrat): Spritzer, wo die Bögen aufs Wasser schlagen, ein paar Tropfen vom
  // Scheitel, hinten zwischen den Füßen etwas Gischt, in scharfen Kurven zieht die innere Hand durchs Wasser.
  // Tropfen fliegen im Bogen (Schwerkraft); unter der Oberfläche verdeckt sie das Wasser.
  emitSpray(dt) {
    const p = this.player, S = this.spray, Bw = this.bow;
    const surfing = p.landMove?.type === 'surf';
    if (!(surfing || p.waterRun) || p.state !== 'ground' || dt <= 0) return;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp < 1) return;
    const k = Math.min(1.4, Math.max(0, (sp - 4) / 16));
    const fx = p.vel.x / sp, fz = p.vel.z / sp, rx = -fz, rz = fx; // vorwärts, rechts
    const wy = this.renderPos.y - CONFIG.player.halfHeight;
    const col = this.sprayColor(), c = [col.r, col.g, col.b];
    const b = this.surfBank / 0.6; // −1…1, + = Linkskurve
    const J = this.character.joints;
    const n = (rate) => { const x = Math.max(0, rate * dt); return Math.floor(x) + (Math.random() < x % 1 ? 1 : 0); };
    for (let i = 0; i < 2; i++) {
      const kk = Bw.k[i], sd = i === 0 ? -1 : 1;
      if (kk < 0.05) continue;
      for (let m = n(70 * kk); m > 0; m--) {
        const out = 0.5 + 2.2 * Math.random(), along = Math.random() * 1.2, across = (Math.random() - 0.3) * 0.8;
        _s2.set(Bw.tips[i].x + rx * sd * across - fx * along, Bw.tips[i].y, Bw.tips[i].z + rz * sd * across - fz * along);
        _s3.set(rx * sd * out + fx * sp * 0.25, 1.2 + 2.8 * Math.random() * Math.min(1.2, kk), rz * sd * out + fz * sp * 0.25);
        S.emit(_s2, _s3, { life: 0.8, size: 0.07 + 0.08 * Math.random(), alpha: 0.9, color: c, drag: 0.8, grow: 0.4, gravity: 15, floor: wy - 0.8 });
      }
      for (let m = n(22 * kk); m > 0; m--) {
        const out = 1.5 + 2.5 * Math.random();
        _s3.set(rx * sd * out + fx * sp * 0.3, 0.8 + 2 * Math.random(), rz * sd * out + fz * sp * 0.3);
        S.emit(Bw.crests[i], _s3, { life: 0.9, size: 0.06 + 0.06 * Math.random(), alpha: 0.9, color: c, drag: 0.8, grow: 0.3, gravity: 15, floor: wy - 0.8 });
      }
    }
    if (!surfing) return;
    // hinten zwischen den Füßen ein wenig Gischt – ab Reisetempo
    for (let i = n(60 * Math.max(0, k - 0.3)); i > 0; i--) {
      const side = (Math.random() - 0.5) * 1.6, sub = Math.random() * dt; // über die Strecke des Bildes verteilt
      _s3.set(rx * side + fx * sp * 0.12, (2.5 + 3.5 * Math.random()) * (0.6 + 0.4 * k), rz * side + fz * sp * 0.12);
      _s2.set(this.renderPos.x - fx * 0.45 + rx * (Math.random() - 0.5) * 0.5, wy + 0.05, this.renderPos.z - fz * 0.45 + rz * (Math.random() - 0.5) * 0.5);
      _s2.addScaledVector(_s3, sub).addScaledVector(p.vel, -sub);
      S.emit(_s2, _s3, Math.random() < 0.3
        ? { life: 0.8, size: 0.3 + 0.25 * Math.random(), alpha: 0.2, color: c, drag: 1.8, grow: 2, gravity: 7, floor: wy - 0.8 }
        : { life: 1.1, size: 0.06 + 0.07 * Math.random(), alpha: 0.85, color: c, drag: 0.6, grow: 0.3, gravity: 15, floor: wy - 0.8 });
    }
    // die innere Hand zieht in der Kurve durchs Wasser
    const ab = Math.abs(b);
    if (ab > 0.3) {
      J[b > 0 ? 'handL' : 'handR'].getWorldPosition(_s1);
      if (_s1.y < wy + 0.5) {
        const si = b > 0 ? -1 : 1; // innen
        for (let i = n(150 * (ab - 0.3) * k); i > 0; i--) {
          const out = 0.6 + 1.6 * Math.random();
          _s2.set(_s1.x, wy + 0.04, _s1.z);
          _s3.set(rx * si * out + fx * sp * 0.15, 1.2 + 2.4 * Math.random(), rz * si * out + fz * sp * 0.15);
          S.emit(_s2, _s3, { life: 0.8, size: 0.06 + 0.06 * Math.random(), alpha: 0.85, color: c, drag: 1, grow: 0.4, gravity: 14, floor: wy - 0.8 });
        }
      }
    }
  }

  // Aufklatschen aufs Wasser: Krone aus Tropfen, Nebel und ein Schaumring, der auseinanderläuft
  waterSplash(pos, strength, vel = null) {
    const S = this.spray, wy = pos.y - CONFIG.player.halfHeight;
    const col = this.sprayColor(), c = [col.r, col.g, col.b], foam = [col.r * 0.92, col.g * 0.95, col.b];
    for (let i = Math.round(24 + 70 * strength); i > 0; i--) {
      const a = Math.random() * Math.PI * 2, r = (1.5 + 5 * Math.random()) * (0.5 + 0.6 * strength);
      _s2.set(pos.x + Math.cos(a) * 0.3, wy + 0.05, pos.z + Math.sin(a) * 0.3);
      _s3.set(Math.cos(a) * r, (2 + 5.5 * Math.random()) * (0.6 + 0.6 * strength), Math.sin(a) * r);
      if (vel) _s3.x += vel.x * 0.35, _s3.z += vel.z * 0.35;
      S.emit(_s2, _s3, { life: 1.1, size: 0.07 + 0.09 * Math.random(), alpha: 0.9, color: c, drag: 0.8, grow: 0.4, gravity: 15, floor: wy - 0.8 });
    }
    for (let i = Math.round(10 + 20 * strength); i > 0; i--) {
      const a = Math.random() * Math.PI * 2, r = (1 + 2.5 * Math.random()) * (0.6 + 0.5 * strength);
      _s2.set(pos.x, wy + 0.1, pos.z);
      _s3.set(Math.cos(a) * r, 1 + 3 * Math.random() * strength, Math.sin(a) * r);
      S.emit(_s2, _s3, { life: 0.9, size: 0.4 + 0.4 * Math.random(), alpha: 0.24, color: c, drag: 2, grow: 2.4, gravity: 4, floor: wy - 0.8 });
    }
    const ring = Math.round(8 + 14 * strength);
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      _s2.set(pos.x + Math.cos(a) * 0.4, wy + 0.03, pos.z + Math.sin(a) * 0.4);
      _s3.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(1.2 + 1.5 * strength);
      S.emit(_s2, _s3, { life: 2.2, size: 0.5 + 0.3 * Math.random(), alpha: 0.32, color: foam, drag: 1.2, grow: 1.4, ride: 0.06 });
    }
  }

  // Schritt beim Sprint über das Wasser: kleiner Platscher am aufsetzenden (tieferen) Fuß
  waterStep(intensity) {
    this.audio.splash(0.22 + 0.18 * intensity);
    const J = this.character.joints, S = this.spray, p = this.player;
    J.footL.getWorldPosition(_s1);
    J.footR.getWorldPosition(_s2);
    if (_s2.y < _s1.y) _s1.copy(_s2);
    const wy = this.renderPos.y - CONFIG.player.halfHeight;
    const col = this.sprayColor(), c = [col.r, col.g, col.b];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.8 + 2.2 * Math.random();
      _s2.set(_s1.x, wy + 0.04, _s1.z);
      _s3.set(Math.cos(a) * r + p.vel.x * 0.3, 1.6 + 2.8 * Math.random(), Math.sin(a) * r + p.vel.z * 0.3);
      S.emit(_s2, _s3, { life: 0.7, size: 0.06 + 0.07 * Math.random(), alpha: 0.85, color: c, drag: 1, grow: 0.4, gravity: 15, floor: wy - 0.8 });
    }
    for (let i = 0; i < 4; i++) {
      _s2.set(_s1.x + (Math.random() - 0.5) * 0.3, wy + 0.03, _s1.z + (Math.random() - 0.5) * 0.3);
      _s3.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
      S.emit(_s2, _s3, { life: 1.6, size: 0.4 + 0.3 * Math.random(), alpha: 0.3, color: [col.r * 0.92, col.g * 0.95, col.b], drag: 1, grow: 1.4, ride: 0.06 });
    }
  }

  updateCharacter(dt) {
    const p = this.player, c = this.character;
    c.root.position.copy(this.renderPos);
    c.root.visible = c.world.visible = this.rig.dist > 0.9;

    let rate = 10;
    const v = p.vel;
    const hs = Math.hypot(v.x, v.z);
    // Surfen: Schräglage aus der Kurvenbeschleunigung (Tempo × Drehrate, wie auf Skiern), weich geglättet;
    // beim Sprint über das Wasser nur angedeutet
    const surfing = p.state === 'ground' && p.landMove?.type === 'surf';
    const turnLean = Math.atan((hs * p.turnRate) / 16);
    const bankGoal = surfing ? Math.max(-0.6, Math.min(0.6, turnLean * 0.9)) : p.state === 'ground' && p.waterRun ? Math.max(-0.22, Math.min(0.22, turnLean * 0.45)) : 0;
    if (dt > 0) {
      this.surfBank += (bankGoal - this.surfBank) * (1 - Math.exp(-7 * dt));
      this.surfK += ((surfing ? 1 : 0) - this.surfK) * (1 - Math.exp(-4 * dt));
    }
    let taut = 0;
    const attached = this.hooks.some((h) => h.state === 'attached');
    _w.set(0, 0, 0);
    for (const h of this.hooks) {
      if (h.state === 'attached' && h.taut) {
        _w.add(h.anchor);
        taut++;
      }
    }

    let wallUp = 0;
    if (p.state === 'wallrun') {
      // Laufrichtung auf der Wand bestimmt die Haltung: waagrecht an der Wand entlang leicht von ihr weggelehnt,
      // gerade hinauf wie im Anime – die Wand wird zum Boden, der Körper steht quer ab, Füße auf der Wand,
      // leicht in die Laufrichtung geneigt. Dazwischen stufenlos.
      const n = p.wall.n, t = p.wall.t;
      _f.copy(v).addScaledVector(n, -v.dot(n));
      if (_f.y < 0) _f.y = 0; // beim Abrutschen weiter in Laufrichtung schauen
      if (_f.lengthSq() < 1) _f.copy(t).multiplyScalar(Math.sign(v.dot(t)) || 1);
      else _f.normalize();
      wallUp = Math.max(0, _f.y);
      _u.copy(n).multiplyScalar(0.8 + 0.2 * wallUp).addScaledVector(UP, 1 - wallUp).addScaledVector(_f, 0.38 * wallUp).normalize();
      rate = 14 - 4 * wallUp; // das große Umkippen beim Hochlaufen etwas weicher
    } else if (p.state !== 'ground' && taut > 0) {
      _u.copy(_w.divideScalar(taut)).sub(p.pos).normalize();
      _f.copy(v).addScaledVector(_u, -v.dot(_u));
      if (_f.lengthSq() < 1) _f.copy(this.rig.forward).addScaledVector(_u, -this.rig.forward.dot(_u));
      _f.normalize();
      rate = 8;
    } else if (p.state === 'ground' || p.state === 'ledge' || p.state === 'sit' || p.state === 'grind') {
      // am Boden (und an der Kante) bestimmt die Physik die Blickrichtung (Trägheit beim Drehen);
      // beim Surfen legt sich der ganze Körper in die Kurve (Hochachse zur Kurveninnenseite gekippt)
      const b = p.state === 'ground' ? this.surfBank : 0;
      _u.set(Math.cos(p.facingYaw), 0, -Math.sin(p.facingYaw)).multiplyScalar(-Math.sin(b)).addScaledVector(UP, Math.cos(b));
      _f.set(-Math.sin(p.facingYaw), 0, -Math.cos(p.facingYaw));
      rate = 16;
    } else if (p.gliding && !attached) {
      // Gleiten: Kopf voraus in Flugrichtung, Bauch gegen den Auftrieb – die Querneigung kommt aus der Physik
      _u.copy(v.lengthSq() > 1 ? v : this.rig.forward).normalize();
      _f.copy(p.glide.lift).negate().addScaledVector(_u, p.glide.lift.dot(_u)).normalize();
      rate = 8;
    } else if ((p.dashing || p.boosting) && !attached) {
      // Dash / Gas-Schub: Körper legt sich flach in Flugrichtung, Bauch nach unten
      _v.copy(v.lengthSq() > 1 ? v : this.rig.forward).normalize();
      _u.copy(UP).multiplyScalar(0.2).addScaledVector(_v, 0.8).normalize();
      _f.set(0, -1, 0).addScaledVector(_u, _u.y).normalize();
      rate = 10;
    } else {
      if (hs > 1.5) _f.set(v.x / hs, 0, v.z / hs);
      else _f.set(this.rig.forward.x, 0, this.rig.forward.z).normalize();
      const lean = Math.min(1, v.length() / 40) * 0.6;
      _u.copy(UP).addScaledVector(_f, lean).normalize();
      _f.addScaledVector(_u, -_f.dot(_u)).normalize();
    }
    if (dt > 0) c.orient(_u, _f, dt, rate);
    // Füße auf die Wandfläche: je weiter der Körper zur Wand kippt, desto weiter weg von ihr (weich ein- und ausgeblendet)
    _v.set(0, 0, 0);
    if (p.state === 'wallrun') {
      _w.set(0, 1, 0).applyQuaternion(c.root.quaternion);
      _v.copy(p.wall.n).multiplyScalar(Math.max(0, 0.8 * _w.dot(p.wall.n) - CONFIG.player.halfWidth + 0.02));
    }
    if (dt > 0) this.wallOff.lerp(_v, 1 - Math.exp(-14 * dt));
    this.wallUp += (wallUp - this.wallUp) * (dt > 0 ? 1 - Math.exp(-10 * dt) : 0);
    c.root.position.add(this.wallOff);
    // Schräglage um die Füße statt um die Körpermitte – die Füße bleiben auf dem Wasser
    if (Math.abs(this.surfBank) > 1e-3 && p.state === 'ground') {
      _w.set(0, 1, 0).applyQuaternion(c.root.quaternion).sub(UP);
      c.root.position.addScaledVector(_w, CONFIG.player.halfHeight);
    }

    // Position im Schwungbogen: hinter dem Anker (Abschwung) = 0, darunter = 0.5, davor (Aufschwung) = 1
    let swingPhase;
    if (attached && p.state === 'air') {
      _w.set(0, 0, 0);
      let n = 0, len = 0;
      for (const h of this.hooks) if (h.state === 'attached') { _w.add(h.anchor); len += h.length; n++; }
      _w.divideScalar(n);
      len /= n;
      if (hs > 1) swingPhase = Math.min(1, Math.max(0, 0.5 + (((p.pos.x - _w.x) * v.x + (p.pos.z - _w.z) * v.z) / hs) / (1.2 * Math.max(4, len))));
      else swingPhase = 0.5;
    }
    const hookInfo = this.hookInfo;
    this.hooks.forEach((h, i) => {
      const o = hookInfo[i];
      o.state = h.state;
      o.taut = h.taut;
      o.point.copy(h.state === 'attached' ? h.anchor : h.target);
    });

    c.update(dt, {
      hooks: hookInfo,
      swingPhase,
      state: p.state,
      speed: p.state === 'wallrun' ? Math.hypot(v.dot(p.wall.t), v.y) : v.length(),
      hspeed: hs,
      vy: v.y,
      swinging: attached && p.state === 'air',
      reeling: p.reeling,
      gliding: p.gliding,
      boosting: p.boosting && !p.gliding,
      turnRate: p.state === 'ground' ? p.turnRate : 0,
      surfBank: this.surfBank / 0.6,
      move: p.landMove,
      perch: p.perch,
      wallUp: this.wallUp,
      events: this.charEvents,
      lookDir: this.rig.forward,
    });
    this.charEvents.length = 0;
  }

  updateSpeedLines(dt) {
    const speed = this.paused || this.photo.active ? 0 : this.player.vel.length();
    const target = CONFIG.graphics.speedlines && !CONFIG.graphics.hyperReal ? Math.min(1, Math.max(0, (speed - 32) / 40)) : 0;
    this.speedLineIntensity += (target - this.speedLineIntensity) * (1 - Math.exp(-6 * dt));
    let fx = window.innerWidth / 2, fy = window.innerHeight / 2;
    if (speed > 1) {
      _proj.copy(this.camera.position).addScaledVector(this.player.vel, 10 / speed).project(this.camera);
      if (_proj.z < 1 && Math.abs(_proj.x) < 1.5 && Math.abs(_proj.y) < 1.5) {
        fx = ((_proj.x + 1) / 2) * window.innerWidth;
        fy = ((1 - _proj.y) / 2) * window.innerHeight;
      }
    }
    this.speedLines.draw(this.speedLineIntensity, fx, fy);
  }

  // ------------------------------------------------------------------ Screenshot (Taste P)
  // Rendert Bild + Speedlines + Kern-HUD in eine PNG. Mit serve.ps1 landet sie in /screenshots,
  // sonst wird sie heruntergeladen.
  async screenshot(name, hud = true) {
    this.post.render();
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const k = out.width / window.innerWidth;
    ctx.drawImage(document.getElementById('speedlines'), 0, 0, out.width, out.height);
    if (hud) this.drawHudSnapshot(ctx, out.width, out.height, k);
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    const file = `${name || 'shot-' + new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    try {
      const res = await fetch(`/__shot?name=${encodeURIComponent(file)}`, { method: 'POST', body: blob });
      if (!res.ok) throw new Error(res.status);
      return file;
    } catch {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file;
      a.click();
      return null;
    }
  }

  drawHudSnapshot(ctx, w, h, k) {
    const cx = w / 2, cy = h / 2;
    const col = this.aim.hit ? (this.aim.inRange ? '#c8ff3c' : '#ff3b5c') : 'rgba(255,255,255,0.75)';
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(cx, cy, 11 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * k, 0, Math.PI * 2);
    ctx.fill();
    this.hooks.forEach((hk, i) => {
      const s = i === 0 ? -1 : 1;
      ctx.strokeStyle = hk.state === 'attached' ? '#c8ff3c' : hk.state === 'flying' ? '#ffd400' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3 * k;
      ctx.beginPath();
      ctx.arc(cx, cy, 22 * k, s < 0 ? Math.PI * 0.75 : -Math.PI * 0.25, s < 0 ? Math.PI * 1.25 : Math.PI * 0.25);
      ctx.stroke();
    });
    ctx.font = `600 ${44 * k}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6 * k;
    ctx.fillText(`${Math.round(this.player.vel.length() * 3.6)}`, 28 * k, h - 52 * k);
    ctx.font = `600 ${15 * k}px system-ui, sans-serif`;
    ctx.fillText(`km/h   ·   ${Math.max(0, Math.round(this.player.feetY))} m Höhe   ·   ${this.hud.el.state.textContent}`, 28 * k, h - 28 * k);
    ctx.shadowBlur = 0;
    const gw = 200 * k, gx = w - gw - 28 * k, gy = h - 36 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(gx, gy, gw, 8 * k);
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(gx, gy, gw * (this.player.gas / CONFIG.gas.max), 8 * k);
    ctx.font = `600 ${12 * k}px system-ui, sans-serif`;
    ctx.fillText('GAS', gx, gy - 8 * k);
  }
}

window.game = new Game();
if (window.game.debug) import('./debugtools.js').then((m) => m.installDebugTools(window.game));
