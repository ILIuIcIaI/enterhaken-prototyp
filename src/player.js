import * as THREE from 'three';
import { CONFIG } from './config.js';

// Spielerphysik als Punktmasse mit AABB-Körper, integriert per Position-Based-Dynamics:
//   1. Kräfte → Geschwindigkeit
//   2. Zielposition vorhersagen, Seile als Feder + harte Dehnungsgrenze
//   3. Achsenweise gegen die Stadt kollidieren
//   4. Geschwindigkeit = tatsächliche Verschiebung / dt
// Am Boden: Gehen / Sprinten mit weichen Bögen und echter Kehrtwende. In der Luft: Dash, Gas-Schub
// und ein Gleiter mit Auftrieb, Widerstand und Querneigung.

const EPS = 1e-4;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _ip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _fwdH = new THREE.Vector3();
const _target = new THREE.Vector3();
const _vh = new THREE.Vector3();
const _up0 = new THREE.Vector3();
const _rt = new THREE.Vector3();

const approach = (cur, target, delta) => (cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function overlaps(p, b, hx, hy) {
  return (
    p.x - hx < b.maxX && p.x + hx > b.minX &&
    p.y - hy < b.maxY && p.y + hy > b.minY &&
    p.z - hx < b.maxZ && p.z + hx > b.minZ
  );
}

export class Player {
  constructor(city) {
    this.city = city;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vPre = new THREE.Vector3();
    this.state = 'air'; // 'ground' | 'air' | 'wallrun'
    this.groundTimer = 0;
    this.jumpBuffer = 0;
    this.gas = CONFIG.gas.max;
    this.wall = { n: new THREE.Vector3(), t: new THREE.Vector3(), box: null, time: 0, lost: 0 };
    this.wallCooldown = { box: null, nx: 0, nz: 0, time: 0 };
    this.contacts = [];
    this.candidates = [];
    this.events = [];
    this.reeling = false;
    this.boosting = false;
    // Bodenbewegung: moveYaw = Laufrichtung, facingYaw = sichtbare Blickrichtung
    this.moveYaw = 0;
    this.facingYaw = 0;
    this.groundSpeed = 0;
    this.turnRate = 0;
    this.sprinting = false;
    this.stopArmed = false;
    this.pivot = null; // { t, from, to }
    // Dash / Gas
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.shiftHeld = 0;
    // Gleiter
    this.gliding = false;
    this.glide = { bank: 0, alpha: 0.2, deploy: 0, lift: new THREE.Vector3(0, 1, 0) };
  }

  reset(p, yaw = 0) {
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
    this.state = 'air';
    this.gas = CONFIG.gas.max;
    this.jumpBuffer = 0;
    this.wallCooldown.time = 0;
    this.moveYaw = this.facingYaw = yaw;
    this.groundSpeed = 0;
    this.pivot = null;
    this.gliding = false;
    this.dashTimer = 0;
  }

  get feetY() {
    return this.pos.y - CONFIG.player.halfHeight;
  }

  get dashing() {
    return this.dashTimer > 0;
  }

  // ctl: { move: {x, z}, reel, sprint, jumpPressed, dashPressed, glideToggle, camFwd, camRight }
  step(dt, ctl, hooks) {
    const P = CONFIG.player, PH = CONFIG.physics, H = CONFIG.hook, G = CONFIG.gas;
    const v = this.vel;
    this.prevPos.copy(this.pos);
    if (ctl.jumpPressed) this.jumpBuffer = 0.15;
    this.jumpBuffer -= dt;
    this.groundTimer -= dt;
    this.wallCooldown.time -= dt;
    this.dashTimer -= dt;
    this.dashCooldown -= dt;
    this.shiftHeld = ctl.sprint ? this.shiftHeld + dt : 0;

    _fwdH.set(ctl.camFwd.x, 0, ctl.camFwd.z).normalize();
    _wish.set(0, 0, 0).addScaledVector(_fwdH, ctl.move.z).addScaledVector(ctl.camRight, ctl.move.x);
    if (_wish.lengthSq() > 1) _wish.normalize();

    let attached = 0;
    for (const h of hooks) if (h.state === 'attached') attached++;
    const hasGas = G.infinite || this.gas > 0.5;
    this.reeling = ctl.reel && attached > 0 && hasGas;
    // Gas-Schub: Shift in der Luft gedrückt halten (kurzes Antippen = Dash)
    this.boosting = this.state !== 'ground' && ctl.sprint && this.shiftHeld > G.boostDelay && hasGas;
    if (attached > 0 && this.gliding) this.stopGlide();

    _a.set(0, 0, 0);
    let gScale = 1;
    let drag = true;

    if (this.state === 'ground') {
      this.groundMove(dt, ctl, _wish);
    } else if (this.state === 'wallrun') {
      if (ctl.dashPressed && this.canDash()) {
        this.exitWallrun(true);
        this.dash(ctl);
      } else {
        gScale = this.wallrunMove(dt, ctl, hooks);
      }
    } else {
      if (ctl.glideToggle && attached === 0) {
        if (this.gliding) this.stopGlide();
        else this.startGlide();
      }
      if (ctl.dashPressed && this.canDash()) this.dash(ctl);
      if (this.gliding) {
        this.glideForces(dt, ctl, _a);
        drag = false;
      } else if (attached > 0) {
        // nur quer zum Seil wirken lassen: pumpt den Schwung, ohne gegen das Seil zu arbeiten
        this.ropeDir(hooks, _d);
        _t.copy(_wish).addScaledVector(_d, -_wish.dot(_d));
        _a.addScaledVector(_t, P.swingAccel);
      } else if (v.dot(_wish) < P.airMaxSpeed) {
        _a.addScaledVector(_wish, P.airAccel);
      }
      if (this.dashing && !this.gliding) gScale = 0.25;
      if (this.jumpBuffer > 0 && this.groundTimer > 0) this.jump();
    }

    // Schwerkraft + Luftwiderstand
    _a.y -= PH.gravity * gScale;
    const sp = v.length();
    if (drag && sp > 0.01) _a.addScaledVector(v, -(PH.dragLinear * sp + PH.dragQuad * sp * sp) / sp);

    // Winde: zieht mit begrenzter Kraft zum Anker
    if (this.reeling) {
      const f = H.reelAccel * (attached > 1 ? H.dualFactor : 1);
      for (const h of hooks) {
        if (h.state !== 'attached') continue;
        _d.subVectors(h.anchor, this.pos);
        const dist = _d.length();
        if (dist < H.minLength + 0.5) continue;
        _d.divideScalar(dist);
        if (v.dot(_d) < H.reelMaxSpeed) _a.addScaledVector(_d, f);
      }
      if (!G.infinite) this.gas -= G.reelCost * dt;
    }

    if (this.boosting) {
      _a.addScaledVector(ctl.camFwd, G.boostAccel);
      if (!G.infinite) this.gas -= G.boostCost * dt;
    }

    v.addScaledVector(_a, dt);

    // Elastisches Seil: Feder + Dämpfer, nur bei Dehnung über die Ruhelänge (Seile drücken nicht).
    for (const h of hooks) {
      if (h.state !== 'attached') continue;
      _d.subVectors(this.pos, h.anchor);
      const dist = _d.length();
      if (this.reeling) h.length = Math.max(H.minLength, Math.min(h.length, dist));
      else if (H.autoRetract && dist < h.length) h.length = Math.max(H.minLength, dist, h.length - H.retractSpeed * dt);
      const stretch = dist - h.length;
      if (stretch > 0 && dist > 1e-4) {
        _d.divideScalar(dist);
        const vr = v.dot(_d);
        const T = Math.max(0, H.stiffness * stretch + H.damping * vr);
        v.addScaledVector(_d, -T * dt);
        if (!h.taut && vr > 12) this.events.push({ type: 'snap', strength: vr });
        h.taut = true;
        h.tension = T;
      } else {
        h.taut = false;
        h.tension = 0;
      }
    }

    if (v.lengthSq() > PH.maxSpeed * PH.maxSpeed) v.setLength(PH.maxSpeed);
    this.vPre.copy(v);

    // Vorhersage + harte Grenze der Seildehnung (zwei Iterationen, falls beide Haken hängen)
    _target.copy(this.pos).addScaledVector(v, dt);
    for (let it = 0; it < (attached > 1 ? 2 : 1); it++) {
      for (const h of hooks) {
        if (h.state !== 'attached') continue;
        _d.subVectors(_target, h.anchor);
        const dist = _d.length();
        const maxLen = h.length + H.maxStretch;
        if (dist > maxLen) _target.copy(h.anchor).addScaledVector(_d, maxLen / dist);
      }
    }

    this.sweep(_target);
    v.subVectors(this.pos, this.prevPos).divideScalar(dt);
    this.postStep(dt, ctl);
  }

  // mittlere Richtung vom Spieler zu den Ankern (normalisiert)
  ropeDir(hooks, out) {
    out.set(0, 0, 0);
    for (const h of hooks) if (h.state === 'attached') out.add(_n.subVectors(h.anchor, this.pos).normalize());
    return out.lengthSq() > 1e-8 ? out.normalize() : out.set(0, 1, 0);
  }

  // Kleiner Schwung in Flugrichtung beim Lösen eines gespannten Seils – macht Ketten von Schwüngen flüssiger.
  releaseBoost() {
    const sp = this.vel.length();
    if (this.state !== 'air' || sp < 10) return;
    this.vel.multiplyScalar((sp + CONFIG.hook.releaseBoost) / sp);
  }

  // ------------------------------------------------------------------ Boden: Gehen, Sprinten, Kehrtwende
  // Die Laufrichtung folgt der Eingabe mit einer Drehrate, die mit dem Tempo sinkt (weiche Bögen).
  // Eine scharfe Kehrtwende aus dem Lauf wird zur Wende: abbremsen, umdrehen, neu abstoßen.
  groundMove(dt, ctl, wish) {
    const L = CONFIG.locomotion, P = CONFIG.player, v = this.vel;
    const hs = Math.hypot(v.x, v.z);
    const input = Math.min(1, wish.length());
    const prevFacing = this.facingYaw;
    this.groundSpeed = Math.min(this.groundSpeed, hs + 0.5); // Wand blockiert → Tempo fällt mit ab
    this.sprinting = false;

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      this.jump();
      return;
    }

    if (this.pivot) {
      const pv = this.pivot;
      pv.t += dt;
      const u = pv.t / L.pivotTime;
      if (u < 0.45) this.groundSpeed = approach(this.groundSpeed, 0.6, L.pivotDecel * dt);
      else {
        this.moveYaw = pv.to;
        this.groundSpeed = approach(this.groundSpeed, L.walkSpeed * 1.4, L.sprintAccel * 1.5 * dt);
      }
      this.facingYaw = wrapAngle(pv.from + wrapAngle(pv.to - pv.from) * smooth(0.15, 0.75, u));
      if (u >= 1) this.pivot = null;
    } else if (hs > L.sprintSpeed + 1.5) {
      // schneller gelandet als man laufen kann: rutschen und abbremsen
      this.groundSpeed = Math.max(0, hs - P.slideDecel * dt);
      this.moveYaw = Math.atan2(-v.x, -v.z);
    } else if (input > 0.1) {
      this.stopArmed = true;
      this.sprinting = !!ctl.sprint;
      const desired = Math.atan2(-wish.x, -wish.z);
      const diff = wrapAngle(desired - this.moveYaw);
      if (Math.abs(diff) > L.pivotAngle && this.groundSpeed > L.pivotMinSpeed) {
        this.pivot = { t: 0, from: this.facingYaw, to: desired };
        this.events.push({ type: 'pivot', strength: this.groundSpeed });
      } else {
        if (this.groundSpeed < 0.8) this.moveYaw = desired; // aus dem Stand sofort in die neue Richtung
        else {
          const rate = L.turnRate / (1 + this.groundSpeed * L.turnFalloff);
          this.moveYaw = wrapAngle(this.moveYaw + clamp(diff, -rate * dt, rate * dt));
        }
        const target = (this.sprinting ? L.sprintSpeed : L.walkSpeed) * input;
        const rate = target > this.groundSpeed ? (this.sprinting ? L.sprintAccel : L.walkAccel) : L.decel;
        this.groundSpeed = approach(this.groundSpeed, target, rate * dt);
      }
    } else {
      if (this.stopArmed && this.groundSpeed > L.walkSpeed + 1.5) this.events.push({ type: 'stop', strength: this.groundSpeed });
      this.stopArmed = false;
      this.groundSpeed = approach(this.groundSpeed, 0, (this.groundSpeed > L.walkSpeed + 1 ? L.runStopDecel : L.decel) * dt);
    }

    if (!this.pivot) {
      const fd = wrapAngle(this.moveYaw - this.facingYaw);
      this.facingYaw = wrapAngle(this.facingYaw + fd * (1 - Math.exp(-L.facingRate * dt)));
    }
    this.turnRate = wrapAngle(this.facingYaw - prevFacing) / dt;
    v.x = -Math.sin(this.moveYaw) * this.groundSpeed;
    v.z = -Math.cos(this.moveYaw) * this.groundSpeed;
  }

  jump() {
    this.vel.y = Math.max(this.vel.y, CONFIG.player.jumpSpeed);
    this.state = 'air';
    this.jumpBuffer = 0;
    this.groundTimer = 0;
    this.pivot = null;
    this.events.push({ type: 'jump' });
  }

  // ------------------------------------------------------------------ Luft: Dash
  canDash() {
    return this.dashCooldown <= 0 && (CONFIG.gas.infinite || this.gas >= CONFIG.dash.cost);
  }

  dash(ctl) {
    const D = CONFIG.dash, v = this.vel;
    const pitch = clamp(Math.asin(clamp(ctl.camFwd.y, -1, 1)), -0.35, 0.3);
    _dir.set(ctl.camFwd.x, 0, ctl.camFwd.z).normalize().multiplyScalar(Math.cos(pitch));
    _dir.y = Math.sin(pitch);
    const along = v.dot(_dir);
    _t.copy(v).addScaledVector(_dir, -along);
    const speed = Math.min(D.maxSpeed, Math.max(along, 0) * D.keep + D.speed);
    v.copy(_dir).multiplyScalar(speed).addScaledVector(_t, 0.3);
    this.dashTimer = D.duration;
    this.dashCooldown = D.cooldown;
    if (!CONFIG.gas.infinite) this.gas -= D.cost;
    this.events.push({ type: 'dash' });
  }

  // ------------------------------------------------------------------ Luft: Gleiter
  startGlide() {
    this.gliding = true;
    this.glide.deploy = 0;
    this.glide.bank = 0;
    this.glide.alpha = CONFIG.glide.alphaBase;
    this.events.push({ type: 'glideOn' });
  }

  stopGlide() {
    if (!this.gliding) return;
    this.gliding = false;
    this.events.push({ type: 'glideOff' });
  }

  // Flugmodell: Auftrieb senkrecht zur Bahn (um die Querneigung gekippt) und Widerstand gegen die Bahn.
  // Anstellwinkel kommt aus dem Blick relativ zur Flugbahn (+ W/S), Querneigung aus dem Kurswunsch.
  // Kurven entstehen so von selbst durch den geneigten Auftrieb – ohne Geschwindigkeit hart zu setzen.
  glideForces(dt, ctl, acc) {
    const G = CONFIG.glide, g = this.glide, v = this.vel;
    g.deploy = Math.min(1, g.deploy + dt / G.deployTime);
    const sp = v.length();
    if (sp < 0.5) return;
    _vh.copy(v).divideScalar(sp);
    // Querneigung aus der Differenz zwischen Blickkurs und Flugkurs
    const hs = Math.hypot(v.x, v.z);
    const velYaw = hs > 1 ? Math.atan2(-v.x, -v.z) : Math.atan2(-ctl.camFwd.x, -ctl.camFwd.z);
    const camYaw = Math.atan2(-ctl.camFwd.x, -ctl.camFwd.z);
    const yawErr = wrapAngle(camYaw - ctl.move.x * 0.6 - velYaw);
    const bankT = clamp(yawErr * G.bankGain, -G.maxBank, G.maxBank);
    g.bank += (bankT - g.bank) * (1 - Math.exp(-G.bankRate * dt));
    // Anstellwinkel: über die Flugbahn schauen = hochziehen, darunter = sinken
    const gamma = Math.asin(clamp(_vh.y, -1, 1));
    const camPitch = Math.asin(clamp(ctl.camFwd.y, -1, 1));
    // in Schräglage etwas stärker anstellen, damit die Kurve nicht durchsackt (koordinierte Kurve)
    let alphaT = G.alphaBase / Math.max(0.5, Math.cos(g.bank)) + clamp((camPitch - gamma) * G.pitchGain, -0.2, 0.3);
    if (ctl.move.z > 0.1) alphaT -= G.alphaDive;
    if (ctl.move.z < -0.1) alphaT += G.alphaFlare;
    alphaT = clamp(alphaT, 0, G.alphaMax);
    g.alpha += (alphaT - g.alpha) * (1 - Math.exp(-G.alphaRate * dt));
    // Auftriebsbeiwert mit Strömungsabriss oberhalb des kritischen Winkels
    let cl = G.clAlpha * g.alpha;
    if (g.alpha > G.alphaStall) cl *= Math.max(0.35, 1 - (g.alpha - G.alphaStall) * 4);
    const cd = G.cd0 + G.cdk * cl * cl;
    const q = sp * sp * g.deploy;
    // Auftriebsrichtung: senkrecht zur Bahn, um die Bahn um die Querneigung gedreht
    _up0.copy(UP).addScaledVector(_vh, -_vh.y);
    if (_up0.lengthSq() < 1e-4) _up0.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)).multiplyScalar(-Math.sign(_vh.y));
    _up0.normalize();
    _rt.crossVectors(_vh, _up0).normalize();
    g.lift.copy(_up0).multiplyScalar(Math.cos(g.bank)).addScaledVector(_rt, -Math.sin(g.bank));
    const lift = Math.min(G.maxLift, G.kLift * cl * q);
    acc.addScaledVector(g.lift, lift);
    acc.addScaledVector(_vh, -G.kDrag * cd * q);
    this.turnRate = yawErr;
  }

  // ------------------------------------------------------------------ Wallrun
  wallrunMove(dt, ctl, hooks) {
    const W = CONFIG.wallrun, v = this.vel, n = this.wall.n, t = this.wall.t;
    this.wall.time += dt;

    if (this.jumpBuffer > 0) { this.wallJump(ctl); return 1; }
    if (ctl.move.z < -0.5) { this.exitWallrun(true); return 1; }
    if (this.wall.time > W.maxTime) { this.exitWallrun(true); return 1; }
    if (this.reeling) {
      for (const h of hooks) {
        if (h.state !== 'attached') continue;
        _d.subVectors(h.anchor, this.pos).normalize();
        if (_d.dot(n) > 0.5) { this.exitWallrun(false); return 1; }
      }
    }

    let vt = v.dot(t), vy = v.y;
    const keep = Math.max(W.speed, Math.abs(vt) - W.excessDecay * dt);
    let climbing = false;
    let targetT = 0;
    if (ctl.move.z > 0.1) {
      // Laufrichtung = Blickrichtung projiziert auf die Wandebene (hoch schauen = hochlaufen)
      _d.copy(ctl.camFwd).addScaledVector(n, -ctl.camFwd.dot(n));
      const len = _d.length();
      if (len < 0.2) _d.set(0, 1, 0);
      else _d.divideScalar(len);
      targetT = _d.dot(t) * keep;
      if (_d.y > 0.3) {
        climbing = true;
        vy = approach(vy, _d.y * W.climbSpeed, W.accel * dt);
      }
    } else if (Math.abs(vt) > 1) {
      targetT = Math.sign(vt) * keep; // ohne Eingabe läuft man automatisch weiter
    }
    vt = approach(vt, targetT, W.accel * dt);
    if (!climbing) {
      if (vy > 0) vy = approach(vy, 0, CONFIG.physics.gravity * 0.6 * dt);
      else if (vy < -1) vy = approach(vy, -1, W.grip * dt);
    }
    v.copy(t).multiplyScalar(vt);
    v.y = vy;
    v.addScaledVector(n, -W.stickAccel * dt); // gegen die Wand drücken, damit der Kontakt bleibt

    if (!climbing && Math.hypot(vt, vy) < W.minSpeedToKeep && this.wall.time > 0.2) {
      this.exitWallrun(true);
      return 1;
    }
    return W.gravityScale;
  }

  wallJump(ctl) {
    const W = CONFIG.wallrun, n = this.wall.n;
    _d.set(ctl.camFwd.x, 0, ctl.camFwd.z).normalize();
    const into = _d.dot(n);
    if (into < 0) _d.addScaledVector(n, -into);
    this.vel.addScaledVector(n, W.jumpOut).addScaledVector(_d, W.jumpForward);
    this.vel.y = Math.max(this.vel.y, 0) * 0.5 + W.jumpUp;
    this.jumpBuffer = 0;
    this.exitWallrun(false);
    this.events.push({ type: 'walljump' });
  }

  exitWallrun(push) {
    const n = this.wall.n;
    const vn = this.vel.dot(n);
    if (vn < 0) this.vel.addScaledVector(n, -vn);
    if (push) this.vel.addScaledVector(n, 2.5);
    this.wallCooldown.box = this.wall.box;
    this.wallCooldown.nx = n.x;
    this.wallCooldown.nz = n.z;
    this.wallCooldown.time = CONFIG.wallrun.reattachCooldown;
    this.state = 'air';
  }

  tryEnterWallrun(c, ctl) {
    const W = CONFIG.wallrun, b = c.box;
    _n.set(c.axis === 0 ? c.sign : 0, 0, c.axis === 2 ? c.sign : 0);
    const cd = this.wallCooldown;
    if (cd.time > 0 && cd.box === b && cd.nx === _n.x && cd.nz === _n.z) return;
    if (b.maxY - b.minY < 3 || this.pos.y > b.maxY - 0.3) return;

    const vp = this.vPre;
    const vn = vp.dot(_n);
    const impact = Math.max(0, -vn);
    _ip.copy(vp).addScaledVector(_n, -vn);
    const ip = _ip.length();
    if (ip < W.minEntrySpeed && impact < W.minEntrySpeed * 1.3) return;

    // Aufprallenergie wird teilweise in Laufrichtung umgelenkt (frontal → nach oben / Blickrichtung)
    if (ip > 2) {
      _dir.copy(_ip).divideScalar(ip);
    } else {
      _dir.copy(ctl.camFwd).addScaledVector(_n, -ctl.camFwd.dot(_n));
      if (_dir.lengthSq() < 0.04) _dir.set(0, 1, 0);
      else _dir.normalize();
    }
    this.vel.copy(_ip).addScaledVector(_dir, impact * W.impactConversion);
    this.vel.y = Math.min(this.vel.y, 25);

    this.stopGlide();
    this.state = 'wallrun';
    this.wall.n.copy(_n);
    this.wall.t.set(-_n.z, 0, _n.x);
    this.wall.box = b;
    this.wall.time = 0;
    this.wall.lost = 0;
    this.events.push({ type: 'wallrun', strength: impact + ip });
  }

  // ------------------------------------------------------------------ Kontakte auswerten
  postStep(dt, ctl) {
    const G = CONFIG.gas;
    let ground = false, wallKeep = false, wallHit = null, bestImpact = -1;
    for (const c of this.contacts) {
      if (c.axis === 1) {
        if (c.sign > 0) ground = true;
        continue;
      }
      if (this.state === 'wallrun') {
        const n = this.wall.n;
        if ((c.axis === 0 && n.x === c.sign) || (c.axis === 2 && n.z === c.sign)) {
          wallKeep = true;
          if (c.box) this.wall.box = c.box; // durchgehende Fassaden über mehrere Gebäude
        }
      } else if (c.box && !c.box.noWallrun) {
        const impact = Math.abs(c.axis === 0 ? this.vPre.x : this.vPre.z);
        if (impact > bestImpact) { bestImpact = impact; wallHit = c; }
      }
    }

    if (ground) {
      if (this.state !== 'ground') {
        if (this.state === 'wallrun') this.exitWallrun(false);
        this.stopGlide();
        this.events.push({ type: 'land', strength: -this.vPre.y, speed: Math.hypot(this.vel.x, this.vel.z) });
        // Tempo und Richtung aus der Luft übernehmen
        this.groundSpeed = Math.hypot(this.vel.x, this.vel.z);
        if (this.groundSpeed > 1) this.moveYaw = this.facingYaw = Math.atan2(-this.vel.x, -this.vel.z);
      }
      this.state = 'ground';
      this.groundTimer = 0.12;
    } else {
      if (this.state === 'ground') this.state = 'air';
      if (this.state === 'air') {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > 1) this.facingYaw = this.moveYaw = Math.atan2(-this.vel.x, -this.vel.z);
        this.pivot = null;
      }
      if (this.state === 'wallrun') {
        if (wallKeep) this.wall.lost = 0;
        else if ((this.wall.lost += dt) > 0.08) this.exitWallrun(false);
      } else if (wallHit) {
        this.tryEnterWallrun(wallHit, ctl);
      }
    }

    if (!this.reeling && !this.dashing && !this.boosting) {
      this.gas = Math.min(G.max, this.gas + (this.state === 'ground' ? G.groundRegen : G.regen) * dt);
    }
    if (this.gas < 0) this.gas = 0;
  }

  // ------------------------------------------------------------------ Kollision
  sweep(target) {
    const P = CONFIG.player, hx = P.halfWidth, hy = P.halfHeight;
    const p = this.pos;
    this.city.query(
      Math.min(p.x, target.x) - hx - 0.5, Math.min(p.z, target.z) - hx - 0.5,
      Math.max(p.x, target.x) + hx + 0.5, Math.max(p.z, target.z) + hx + 0.5,
      this.candidates,
    );
    this.contacts.length = 0;
    this.moveAxis(1, target.y - p.y, hy);
    this.moveAxis(0, target.x - p.x, hx);
    this.moveAxis(2, target.z - p.z, hx);
    this.depenetrate();
  }

  moveAxis(axis, delta, ha) {
    const P = CONFIG.player, p = this.pos;
    if (delta !== 0) {
      const start = p.getComponent(axis);
      p.setComponent(axis, start + delta);
      for (const b of this.candidates) {
        if (!overlaps(p, b, P.halfWidth, P.halfHeight)) continue;
        const bmin = axis === 0 ? b.minX : axis === 1 ? b.minY : b.minZ;
        const bmax = axis === 0 ? b.maxX : axis === 1 ? b.maxY : b.maxZ;
        if (delta > 0 && start + ha <= bmin + 0.02) {
          p.setComponent(axis, bmin - ha - EPS);
          this.contacts.push({ axis, sign: -1, box: b });
        } else if (delta < 0 && start - ha >= bmax - 0.02) {
          p.setComponent(axis, bmax + ha + EPS);
          this.contacts.push({ axis, sign: 1, box: b });
        }
      }
    }
    if (axis === 1 && p.y - P.halfHeight < 0) {
      p.y = P.halfHeight;
      this.contacts.push({ axis: 1, sign: 1, box: null });
    }
  }

  // Sicherheitsnetz: falls doch eine Überlappung bleibt, auf kürzestem Weg herausschieben.
  depenetrate() {
    const P = CONFIG.player, hx = P.halfWidth, hy = P.halfHeight, p = this.pos;
    for (const b of this.candidates) {
      if (!overlaps(p, b, hx, hy)) continue;
      const pen = [
        [b.maxX - (p.x - hx), 0, 1], [(p.x + hx) - b.minX, 0, -1],
        [b.maxY - (p.y - hy), 1, 1], [(p.y + hy) - b.minY, 1, -1],
        [b.maxZ - (p.z - hx), 2, 1], [(p.z + hx) - b.minZ, 2, -1],
      ];
      let m = pen[0];
      for (const e of pen) if (e[0] < m[0]) m = e;
      p.setComponent(m[1], p.getComponent(m[1]) + m[2] * (m[0] + EPS));
      this.contacts.push({ axis: m[1], sign: m[2], box: b });
    }
  }
}
