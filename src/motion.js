import * as THREE from 'three';

// Prozedurale Bewegungsebenen über den Keyframe-Clips:
//   Inertializer – weiche Übergänge ohne Sprünge und ohne Nachhinken im Normalbetrieb
//   LimbSpring   – Gliedmaßen schwingen bei Beschleunigung und Drehung des Körpers nach
//   ArmAim       – Arm stößt beim Abschuss zum Ziel und folgt danach dem Seil

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const X = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, -1);
const ID = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _tt = new THREE.Vector3();
const _vt = new THREE.Vector3();
const _f = new THREE.Vector3();
const _da = new THREE.Vector3();
const _db = new THREE.Vector3();
const _l = new THREE.Vector3();
const _ax = new THREE.Vector3();
const RAISE = new THREE.Quaternion().setFromAxisAngle(X, Math.PI / 2); // hängender Arm → nach vorn gestreckt

// ------------------------------------------------------------------ Trägheitsüberblendung
// Bei einem Wechsel (neuer Zustand, One-Shot, Seil an/aus) wird je Gelenk der Versatz zwischen der zuletzt
// gezeigten und der neuen Pose gespeichert und mit einer Smootherstep-Kurve abgebaut. Die neue Pose läuft
// darunter sofort weiter – Übergänge sind stetig in Lage und Geschwindigkeit, ohne dass etwas nachhinkt.
export class Inertializer {
  constructor(nodes) {
    this.items = nodes.map((node) => ({
      node,
      last: node.quaternion.clone(),
      off: new THREE.Quaternion(),
      lastPos: node.position.clone(),
      offPos: new THREE.Vector3(),
    }));
    this.t = 0;
    this.dur = 0;
    this.pending = 0;
    this.primed = false;
  }

  trigger(duration = 0.3) {
    this.pending = Math.max(this.pending, duration);
  }

  apply(dt) {
    const items = this.items;
    if (this.pending > 0 && this.primed) {
      for (const it of items) {
        it.off.copy(it.last).multiply(_q.copy(it.node.quaternion).invert());
        if (it.off.w < 0) it.off.set(-it.off.x, -it.off.y, -it.off.z, -it.off.w);
        it.offPos.subVectors(it.lastPos, it.node.position);
      }
      this.t = 0;
      this.dur = this.pending;
    }
    this.pending = 0;
    if (this.t < this.dur) {
      this.t = Math.min(this.dur, this.t + dt);
      const x = this.t / this.dur;
      const w = 1 - x * x * x * (x * (x * 6 - 15) + 10);
      for (const it of items) {
        _q.identity().slerp(it.off, w);
        it.node.quaternion.premultiply(_q);
        it.node.position.addScaledVector(it.offPos, w);
      }
    }
    for (const it of items) {
      it.last.copy(it.node.quaternion);
      it.lastPos.copy(it.node.position);
    }
    this.primed = true;
  }
}

// ------------------------------------------------------------------ Nachschwingende Gliedmaßen
// An der Spitze jeder Gliedmaße sitzt ein Massepunkt, der der animierten Pose über eine gedämpfte Feder
// folgt (relativ zu deren Geschwindigkeit, daher kein Nachziehen bei gleichmäßiger Bewegung) und einen Teil
// der Schwerkraft spürt. Beschleunigt oder dreht sich der Körper, bleibt der Punkt kurz zurück und die
// Gliedmaße schwingt nach. Der Ausschlag ist begrenzt – das wirkt lebendig, kann aber nie wegkippen.
export class LimbSpring {
  constructor(bone, child, { k = 150, zeta = 0.38, max = 0.55, gravity = 0.4 } = {}) {
    this.bone = bone;
    this.child = child;
    this.k = k;
    this.c = 2 * zeta * Math.sqrt(k);
    this.max = max;
    this.gravity = gravity;
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.prevT = new THREE.Vector3();
    this.active = false;
  }

  apply(dt, weight, g) {
    if (weight < 0.002 || dt <= 0) {
      this.active = false;
      return;
    }
    const bone = this.bone;
    bone.getWorldPosition(_a);
    this.child.getWorldPosition(_t);
    const len = _a.distanceTo(_t);
    if (!this.active || len < 1e-4) {
      this.active = true;
      this.p.copy(_t);
      this.v.set(0, 0, 0);
      this.prevT.copy(_t);
      return;
    }
    _vt.subVectors(_t, this.prevT).divideScalar(dt);
    this.prevT.copy(_t);
    // Teleport / Reset: Punkt mitnehmen statt hinterherzuschleudern
    if (_vt.lengthSq() > 200 * 200) {
      this.p.copy(_t);
      this.v.set(0, 0, 0);
      return;
    }
    const n = Math.min(8, Math.ceil(dt / 0.006));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      _tt.copy(_t).addScaledVector(_vt, -(dt - (i + 1) * h));
      _f.subVectors(_tt, this.p).multiplyScalar(this.k);
      _f.addScaledVector(_da.subVectors(this.v, _vt), -this.c);
      _f.y -= g * this.gravity;
      this.v.addScaledVector(_f, h);
      this.p.addScaledVector(this.v, h);
    }
    // auf Gliedlänge und maximalen Ausschlag begrenzen
    _da.subVectors(_t, _a).divideScalar(len);
    _db.subVectors(this.p, _a);
    if (_db.lengthSq() < 1e-10) _db.copy(_da);
    else _db.normalize();
    const ang = _da.angleTo(_db);
    if (ang > this.max) {
      _q.setFromUnitVectors(_da, _db);
      _q2.identity().slerp(_q, this.max / ang);
      _db.copy(_da).applyQuaternion(_q2);
    }
    this.p.copy(_a).addScaledVector(_db, len);
    const vr = this.v.dot(_db) - _vt.dot(_db);
    this.v.addScaledVector(_db, -vr);

    // Drehung der Gliedmaße (Welt) → lokal am Gelenk anwenden
    _q.setFromUnitVectors(_da, _db);
    _q2.identity().slerp(_q, Math.min(1, weight));
    bone.parent.getWorldQuaternion(_pq);
    _q3.copy(_pq).invert().multiply(_q2).multiply(_pq);
    bone.quaternion.premultiply(_q3);
    bone.updateMatrixWorld(true);
  }
}

// ------------------------------------------------------------------ Greifarm
// Beim Abschuss stößt der Arm zum Ziel (kurzer Überschwinger), nach dem Einhaken hält die Hand das Seil
// und der Arm zeigt die ganze Zeit zum Anker: gespannt fast gestreckt, locker leicht gebeugt, beim
// Straffen ein kurzer Ruck im Ellbogen.
export class ArmAim {
  constructor(joints, side) {
    const k = side < 0 ? 'L' : 'R';
    this.side = side;
    this.sh = joints['shoulder' + k];
    this.ua = joints['upperArm' + k];
    this.fa = joints['forearm' + k];
    this.ha = joints['hand' + k];
    this.w = 0;
    this.wl = 0;
    this.dir = new THREE.Vector3(0, 1, 0);
    this.thrust = 0;
    this.thrustV = 0;
    this.grip = 0;
    this.gripV = 0;
    this.wasTaut = false;
    this.prev = 'idle';
  }

  // hook: { state, point (Welt), taut }
  update(dt, hook) {
    const state = hook ? hook.state : 'idle';
    const active = state === 'flying' || state === 'attached';
    if (state === 'flying' && this.prev !== 'flying') this.thrustV += 16;
    if (state === 'attached' && this.prev !== 'attached') this.gripV += 6;
    if (state === 'attached' && hook.taut && !this.wasTaut) this.gripV += 8;
    this.wasTaut = state === 'attached' && hook.taut;
    this.prev = state;
    if (dt > 0) {
      // linear hoch- bzw. runterfahren und per Smoothstep formen: weicher Anfang und weiches Ende
      this.wl = clamp(this.wl + (active ? dt / 0.16 : -dt / 0.38), 0, 1);
      this.w = this.wl * this.wl * (3 - 2 * this.wl);
      this.thrustV += (-this.thrust * 170 - this.thrustV * 15) * dt;
      this.thrust += this.thrustV * dt;
      this.gripV += (-this.grip * 140 - this.gripV * 13) * dt;
      this.grip += this.gripV * dt;
    }
    if (this.w < 0.003 || !hook) return;

    // Schuss: Schulter schiebt kurz mit
    this.sh.rotation.z += this.side * clamp(this.thrust, 0, 1) * 0.12 * this.w;
    this.sh.updateMatrixWorld(true);

    // Richtung Schulter → Ziel, weich nachgeführt
    this.ua.getWorldPosition(_a);
    _l.subVectors(hook.point, _a);
    if (_l.lengthSq() < 1e-6) return;
    _l.normalize();
    // höchstens ~16 rad/s: schneller Wurf, aber kein Umklappen in einem Frame
    if (this.w < 0.05 && active) this.dir.copy(_l);
    else {
      const ang = this.dir.angleTo(_l);
      const step = Math.min(ang * (1 - Math.exp(-24 * dt)), 16 * dt);
      if (ang > 1e-5) {
        _ax.crossVectors(this.dir, _l);
        if (_ax.lengthSq() < 1e-10) _ax.set(0, 1, 0);
        this.dir.applyAxisAngle(_ax.normalize(), step).normalize();
      }
    }

    // im Schulterraum: hängender Arm → nach vorn → zum Ziel (stabil auch für Ziele direkt über dem Kopf)
    this.sh.getWorldQuaternion(_pq).invert();
    _l.copy(this.dir).applyQuaternion(_pq);
    _q.setFromUnitVectors(FWD, _l).multiply(RAISE);
    let bend = state === 'attached' ? (hook.taut ? 0.16 : 0.5) : 0.12;
    bend = clamp(bend - this.thrust * 0.35 + this.grip * 0.7, 0.02, 1.3);
    // Oberarm um den halben Beugewinkel vorhalten, damit die Hand auf der Seillinie bleibt
    _ax.copy(X).applyQuaternion(_q);
    _q2.setFromAxisAngle(_ax, -bend * 0.5);
    _q.premultiply(_q2);
    this.ua.quaternion.slerp(_q, this.w);
    _q3.setFromAxisAngle(X, bend);
    this.fa.quaternion.slerp(_q3, this.w);
    this.ha.quaternion.slerp(ID, this.w * 0.7);
    this.ua.updateMatrixWorld(true);
  }
}
