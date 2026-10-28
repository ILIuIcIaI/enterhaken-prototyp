import * as THREE from 'three';
import { CONFIG, FIXED_DT } from './config.js';
import { City } from './city.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Hook } from './hooks.js';
import { Character } from './character.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { AudioFX } from './audio.js';
import { Particles, SpeedLines, AimMarker, Embers } from './effects.js';
import { createTuning } from './tuning.js';
import { Post } from './post.js';
import { Traffic } from './traffic.js';
import { Transit } from './transit.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _proj = new THREE.Vector3();

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
    this.traffic = new Traffic(this.scene, this.city, 150);
    this.transit = new Transit(this.scene, this.city);
    this.simTime = 0;
    this.post = new Post(renderer, this.scene, this.camera);
    this.embers = new Embers(this.scene);
    this.charEvents = [];

    this.player = new Player(this.city);
    this.hooks = [new Hook(-1, this.scene), new Hook(1, this.scene)];
    this.character = new Character();
    this.scene.add(this.character.root, this.character.wings);
    this.rig = new CameraRig(this.camera, this.city);
    this.input = new Input(renderer.domElement);
    this.hud = new HUD();
    this.audio = new AudioFX();
    this.particles = new Particles(this.scene);
    this.speedLines = new SpeedLines(document.getElementById('speedlines'));
    this.aimMarker = new AimMarker(this.scene);
    this.gui = createTuning(this);

    this.aim = { hit: false, inRange: false, point: new THREE.Vector3(), normal: new THREE.Vector3(), distPlayer: 0, mover: null, local: new THREE.Vector3() };
    this.renderPos = new THREE.Vector3();
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
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    renderer.setAnimationLoop((t) => this.frame(t));
  }

  spawn() {
    const roof = this.city.findSpawn();
    this.spawnPoint = roof.clone();
    this.spawnPoint.y += CONFIG.player.halfHeight + 0.01;
    this.player.reset(this.spawnPoint, -Math.PI / 2);
    for (const h of this.hooks) h.state = 'idle';
    this.rig.yaw = -Math.PI / 2;
    this.rig.pitch = -0.12;
    this.rig.updateBasis();
    this.rig.snap();
    this.renderPos.copy(this.spawnPoint);
  }

  regenerateCity() {
    this.city.generate(CONFIG.world.seed);
    this.world.rebuild();
    this.traffic.build(this.city, 150);
    this.transit.build(this.city);
    this.spawn();
  }

  // ------------------------------------------------------------------ UI
  setupUI() {
    const overlay = document.getElementById('overlay');
    const help = document.getElementById('help');
    this.overlay = overlay;
    this.helpPanel = help;
    overlay.addEventListener('click', () => {
      this.audio.init();
      this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.debug) return;
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.paused = !locked;
      overlay.classList.toggle('hidden', locked);
      overlay.classList.add('started');
    });
    if (this.debug) {
      this.input.freeLook = true;
      overlay.classList.add('hidden');
    }
  }

  handleKeys() {
    const i = this.input;
    if (i.wasPressed('KeyG')) {
      if (this.gui._hidden) {
        this.gui.show();
        document.exitPointerLock?.();
      } else this.gui.hide();
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
    const dt = this.last === null ? 0 : Math.min(0.1, now - this.last);
    this.last = now;
    this.time += dt;
    const input = this.input;
    const player = this.player;

    this.handleKeys();

    if (!this.paused) {
      this.rig.look(input.mouse.dx, input.mouse.dy);
      for (const [btn, idx] of [[0, 0], [2, 1]]) {
        const hook = this.hooks[idx];
        if (input.mouse.pressed[btn]) this.fireHook(hook);
        if (input.mouse.released[btn]) {
          if (hook.state === 'attached' && hook.taut && !this.hooks[1 - idx].taut) player.releaseBoost();
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

      const scale = CONFIG.world.timeScale * (this.slowmo ? 0.25 : 1);
      this.acc += dt * scale;
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
      this.emitGas(dt);
    }

    const swinging = this.hooks.some((h) => h.state === 'attached');
    const c = this.character;
    this.rig.update(dt, this.renderPos, player, {
      moving: !this.paused,
      swinging: swinging && player.state === 'air',
      sprinting: player.state === 'ground' && player.sprinting,
      bank: player.gliding ? player.glide.bank : 0,
    });
    this.updateAim();
    this.updateCharacter(this.paused ? 0 : dt);
    if (!this.paused) for (const s of c.steps) this.audio.step(s);
    for (const h of this.hooks) {
      this.hipPosition(h.side, _hip).sub(player.pos).add(this.renderPos);
      h.draw(dt, c.ropeOrigin(h.side, _hip, _w), this.time);
    }
    const pxScale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.particles.material.uniforms.uScale.value = pxScale;
    this.particles.update(this.paused ? 0 : dt);
    this.embers.update(this.time, this.camera, pxScale);
    this.aimMarker.update(this.aim, this.camera, this.time);
    this.world.update(this.renderPos, this.camera, this.time);
    this.city.updateDecor(this.time);
    this.traffic.update(this.paused ? 0 : dt, this.player.state === 'ground' ? this.renderPos : null);
    this.transit.render(this.simTime);
    this.hud.update(this);
    this.updateSpeedLines(dt);
    this.audio.update(this.paused ? 0 : player.vel.length(), {
      reeling: !this.paused && player.reeling,
      gliding: !this.paused && player.gliding,
      boosting: !this.paused && player.boosting,
    });

    this.applyGraphics();
    this.post.render();
    input.endFrame();
  }

  applyGraphics() {
    const G = CONFIG.graphics;
    this.renderer.toneMappingExposure = G.exposure;
    this.post.bloom.strength = G.bloom;
    this.post.inkMat.uniforms.uInk.value = G.ink;
    this.post.inkMat.uniforms.uSaturation.value = G.saturation;
  }

  handleEvents() {
    const p = this.player;
    for (const e of p.events) {
      if (e.type === 'land' && e.strength > 6) {
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
      } else if (e.type === 'stop') {
        this.audio.step(0.8);
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
    if (p.state === 'wallrun' && Math.random() < dt * 30) {
      const n = p.wall.n;
      _w.copy(this.renderPos).addScaledVector(n, -0.3);
      _w.y -= 0.75;
      _v.copy(n).multiplyScalar(2).add(_u.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(2));
      this.particles.emit(_w, _v, { life: 0.5, size: 0.2, alpha: 0.18, color: [0.8, 0.6, 0.75], drag: 2, grow: 2 });
    }
  }

  updateCharacter(dt) {
    const p = this.player, c = this.character;
    c.root.position.copy(this.renderPos);
    c.root.visible = this.rig.dist > 0.9;

    let rate = 10;
    const v = p.vel;
    const hs = Math.hypot(v.x, v.z);
    let taut = 0;
    const attached = this.hooks.some((h) => h.state === 'attached');
    _w.set(0, 0, 0);
    for (const h of this.hooks) {
      if (h.state === 'attached' && h.taut) {
        _w.add(h.anchor);
        taut++;
      }
    }

    if (p.state === 'wallrun') {
      const n = p.wall.n, t = p.wall.t;
      _u.copy(n).multiplyScalar(0.8).add(UP).normalize();
      const vt = v.dot(t);
      _f.copy(t).multiplyScalar(Math.sign(vt) || 1);
      if (Math.abs(vt) < 3 && v.y > 0) _f.set(0, 1, 0).addScaledVector(n, -1).normalize();
      if (Math.abs(_f.dot(_u)) > 0.95) _f.copy(n).negate();
      rate = 14;
    } else if (p.state !== 'ground' && taut > 0) {
      _u.copy(_w.divideScalar(taut)).sub(p.pos).normalize();
      _f.copy(v).addScaledVector(_u, -v.dot(_u));
      if (_f.lengthSq() < 1) _f.copy(this.rig.forward).addScaledVector(_u, -this.rig.forward.dot(_u));
      _f.normalize();
      rate = 8;
    } else if (p.state === 'ground') {
      // am Boden bestimmt die Physik die Blickrichtung (Trägheit beim Drehen)
      _u.copy(UP);
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
      events: this.charEvents,
      lookDir: this.rig.forward,
    });
    this.charEvents.length = 0;
  }

  updateSpeedLines(dt) {
    const speed = this.paused ? 0 : this.player.vel.length();
    const target = Math.min(1, Math.max(0, (speed - 32) / 40));
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
