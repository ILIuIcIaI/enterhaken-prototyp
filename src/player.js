import * as THREE from 'three';
import { CONFIG } from './config.js';

// Spielerphysik als Punktmasse mit AABB-Körper, integriert per Position-Based-Dynamics:
//   1. Kräfte → Geschwindigkeit
//   2. Zielposition vorhersagen, Seile als harte Abstandsbedingung (|p - anker| <= L) projizieren
//   3. Achsenweise gegen die Stadt kollidieren
//   4. Geschwindigkeit = tatsächliche Verschiebung / dt
// Dadurch entsteht die Pendelbewegung (inkl. Zentripetalkraft und Ruck beim Straffen) ganz von selbst.

const EPS = 1e-4;
const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _ip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _fwdH = new THREE.Vector3();
const _target = new THREE.Vector3();

const approach = (cur, target, delta) => (cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target));

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
    this.boosting = false;
    this.reeling = false;
  }

  reset(p) {
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
    this.state = 'air';
    this.gas = CONFIG.gas.max;
    this.jumpBuffer = 0;
    this.wallCooldown.time = 0;
  }

  queueJump() {
    this.jumpBuffer = 0.15;
  }

  get feetY() {
    return this.pos.y - CONFIG.player.halfHeight;
  }

  // ctl: { move: {x, z}, reel, boost, camFwd, camRight }
  step(dt, ctl, hooks) {
    const P = CONFIG.player, PH = CONFIG.physics, H = CONFIG.hook, G = CONFIG.gas;
    const v = this.vel;
    this.prevPos.copy(this.pos);
    this.jumpBuffer -= dt;
    this.groundTimer -= dt;
    this.wallCooldown.time -= dt;

    _fwdH.set(ctl.camFwd.x, 0, ctl.camFwd.z).normalize();
    _wish.set(0, 0, 0).addScaledVector(_fwdH, ctl.move.z).addScaledVector(ctl.camRight, ctl.move.x);
    if (_wish.lengthSq() > 1) _wish.normalize();

    let attached = 0;
    for (const h of hooks) if (h.state === 'attached') attached++;
    const hasGas = G.infinite || this.gas > 0.5;
    this.reeling = ctl.reel && attached > 0 && hasGas;
    this.boosting = ctl.boost && hasGas;

    _a.set(0, 0, 0);
    let gScale = 1;

    if (this.state === 'ground') {
      this.groundMove(dt, _wish);
      if (this.jumpBuffer > 0) this.jump();
    } else if (this.state === 'wallrun') {
      gScale = this.wallrunMove(dt, ctl, hooks);
    } else {
      if (attached > 0) {
        // nur quer zum Seil wirken lassen: pumpt den Schwung, ohne gegen das Seil zu arbeiten
        this.ropeDir(hooks, _d);
        _t.copy(_wish).addScaledVector(_d, -_wish.dot(_d));
        _a.addScaledVector(_t, P.swingAccel);
      } else if (v.dot(_wish) < P.airMaxSpeed) {
        _a.addScaledVector(_wish, P.airAccel);
      }
      if (this.jumpBuffer > 0 && this.groundTimer > 0) this.jump();
    }

    // Schwerkraft + Luftwiderstand
    _a.y -= PH.gravity * gScale;
    const sp = v.length();
    if (sp > 0.01) _a.addScaledVector(v, -(PH.dragLinear * sp + PH.dragQuad * sp * sp) / sp);

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

    // Gas-Schub in Blickrichtung
    if (this.boosting) {
      _a.addScaledVector(ctl.camFwd, G.boostAccel);
      if (!G.infinite) this.gas -= G.boostCost * dt;
    }

    v.addScaledVector(_a, dt);

    // Elastisches Seil: Feder + Dämpfer, nur bei Dehnung über die Ruhelänge (Seile drücken nicht).
    // Das federt das Straffen ab, statt die radiale Geschwindigkeit schlagartig zu vernichten.
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
        _a.copy(_d).multiplyScalar(-T * dt);
        v.add(_a);
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

  jump() {
    this.vel.y = Math.max(this.vel.y, CONFIG.player.jumpSpeed);
    this.state = 'air';
    this.jumpBuffer = 0;
    this.groundTimer = 0;
    this.events.push({ type: 'jump' });
  }

  groundMove(dt, wish) {
    const P = CONFIG.player, v = this.vel;
    const tx = wish.x * P.runSpeed, tz = wish.z * P.runSpeed;
    const dx = tx - v.x, dz = tz - v.z;
    const hs = Math.hypot(v.x, v.z);
    const rate = (hs > P.runSpeed + 0.5 ? P.slideDecel : P.groundAccel) * dt;
    const dl = Math.hypot(dx, dz);
    if (dl > rate) {
      v.x += (dx / dl) * rate;
      v.z += (dz / dl) * rate;
    } else {
      v.x = tx;
      v.z = tz;
    }
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
      } else if (c.box) {
        const impact = Math.abs(c.axis === 0 ? this.vPre.x : this.vPre.z);
        if (impact > bestImpact) { bestImpact = impact; wallHit = c; }
      }
    }

    if (ground) {
      if (this.state !== 'ground') {
        if (this.state === 'wallrun') this.exitWallrun(false);
        this.events.push({ type: 'land', strength: -this.vPre.y });
      }
      this.state = 'ground';
      this.groundTimer = 0.12;
    } else {
      if (this.state === 'ground') this.state = 'air';
      if (this.state === 'wallrun') {
        if (wallKeep) this.wall.lost = 0;
        else if ((this.wall.lost += dt) > 0.08) this.exitWallrun(false);
      } else if (wallHit) {
        this.tryEnterWallrun(wallHit, ctl);
      }
    }

    if (!this.boosting && !this.reeling) {
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
