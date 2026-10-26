import * as THREE from 'three';

// Keyframe-Animationen für die Figur. Posen sind Gelenkwinkel in Grad (Euler XYZ).
// Konventionen (Figur schaut nach -Z):
//   Oberschenkel/Oberarm x+ = nach vorne, Unterschenkel x- = Knie beugen, Unterarm x+ = Ellbogen beugen,
//   Fuß x- = Zehen strecken, Rumpf x- = nach vorne lehnen, Kopf x+ = nach oben schauen,
//   Arm z: links negativ / rechts positiv = seitlich abspreizen, Brust y+ = rechte Schulter vor.
// Die Clips werden mit Catmull-Rom-Splines dicht abgetastet und als THREE.AnimationClip
// für den AnimationMixer erzeugt.

export const JOINTS = [
  'flip', 'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
];

const mirrorName = (n) => (n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n);

// Spiegelt eine Pose links/rechts (für die zweite Hälfte von Laufzyklen).
export function mirror(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    if (!Array.isArray(v)) { out[k] = v; continue; }
    out[mirrorName(k)] = [v[0], -v[1], -v[2]];
  }
  return out;
}

const lerpPose = (a, b, t) => {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k] ?? (Array.isArray(b[k]) ? [0, 0, 0] : 0);
    const vb = b[k] ?? (Array.isArray(a[k]) ? [0, 0, 0] : 0);
    out[k] = Array.isArray(va) ? va.map((x, i) => x + (vb[i] - x) * t) : va + (vb - va) * t;
  }
  return out;
};

const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

const get = (pose, joint, i) => (pose[joint] ? pose[joint][i] : 0);

// keys: [[zeit, pose], ...]; pose.bob = Höhenversatz der Figur in Metern
export function buildClip(name, keys, baseY, loop = true) {
  const duration = keys[keys.length - 1][0];
  const fps = 30;
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = (f / (frames - 1)) * duration;

  const n = keys.length;
  const at = (idx) => {
    if (loop) {
      // letzter Key == erster Key → beim Umlaufen den doppelten Key überspringen
      const m = n - 1;
      return keys[((idx % m) + m) % m][1];
    }
    return keys[Math.min(n - 1, Math.max(0, idx))][1];
  };
  const sample = (t, fn) => {
    let i = 0;
    while (i < n - 2 && t > keys[i + 1][0]) i++;
    const t0 = keys[i][0], t1 = keys[i + 1][0];
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    return cr(fn(at(i - 1)), fn(at(i)), fn(at(i + 1)), fn(at(i + 2)), u);
  };

  const tracks = [];
  const e = new THREE.Euler(), q = new THREE.Quaternion(), prev = new THREE.Quaternion();
  const D = Math.PI / 180;
  for (const joint of JOINTS) {
    const values = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      const t = times[f];
      e.set(sample(t, (p) => get(p, joint, 0)) * D, sample(t, (p) => get(p, joint, 1)) * D, sample(t, (p) => get(p, joint, 2)) * D);
      q.setFromEuler(e);
      if (f > 0 && q.dot(prev) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev.copy(q);
      q.toArray(values, f * 4);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${joint}.quaternion`, times, values));
  }
  const pos = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    pos[f * 3 + 1] = baseY + sample(times[f], (p) => p.bob ?? 0);
  }
  tracks.push(new THREE.VectorKeyframeTrack('model.position', times, pos));
  return new THREE.AnimationClip(name, duration, tracks);
}

// ------------------------------------------------------------------ Posen

const IDLE_A = {
  hips: [0, 4, 3], spine: [2, -2, -2], chest: [-2, -2, -1], neck: [0, 0, 0], head: [-4, 6, 3],
  thighL: [5, 0, -4], shinL: [-8, 0, 0], footL: [3, 0, 0],
  thighR: [-3, 0, 5], shinR: [-3, 0, 0], footR: [0, 0, 0],
  upperArmL: [6, 0, -10], forearmL: [20, 0, 0], handL: [0, 0, 10],
  upperArmR: [-4, 0, 9], forearmR: [16, 0, 0], handR: [0, 0, -8],
};
const IDLE_B = { ...IDLE_A, chest: [-4, -2, -1], spine: [3, -2, -2], head: [-2, 8, 2], upperArmL: [4, 0, -12], upperArmR: [-2, 0, 11], bob: 0.008 };

const RUN_A = { // linker Fuß setzt auf
  hips: [0, -9, 0], spine: [-8, 6, 0], chest: [-8, 9, 0], neck: [6, -7, 0], head: [6, -5, 0],
  thighL: [42, 0, 0], shinL: [-22, 0, 0], footL: [12, 0, 0],
  thighR: [-28, 0, 0], shinR: [-98, 0, 0], footR: [-32, 0, 0],
  upperArmL: [-42, 0, -12], forearmL: [78, 0, 0], upperArmR: [52, 0, 12], forearmR: [96, 0, 0],
  bob: -0.03,
};
const RUN_B = { // Flugphase: links drückt ab, rechtes Knie zieht nach vorn
  hips: [0, 0, 0], spine: [-10, 0, 0], chest: [-7, 0, 0], neck: [7, 0, 0], head: [5, 0, 0],
  thighL: [-14, 0, 0], shinL: [-38, 0, 0], footL: [-28, 0, 0],
  thighR: [64, 0, 0], shinR: [-108, 0, 0], footR: [8, 0, 0],
  upperArmL: [6, 0, -12], forearmL: [86, 0, 0], upperArmR: [12, 0, 12], forearmR: [86, 0, 0],
  bob: 0.05,
};

const AIR_UP = {
  spine: [-4, 0, 0], chest: [-2, 0, 0], head: [6, 0, 0],
  thighL: [80, 0, -4], shinL: [-102, 0, 0], footL: [-12, 0, 0],
  thighR: [8, 0, 4], shinR: [-62, 0, 0], footR: [-28, 0, 0],
  upperArmL: [58, 0, -48], forearmL: [52, 0, 0], upperArmR: [40, 0, 55], forearmR: [44, 0, 0],
};
const FALL_A = {
  spine: [6, 0, 0], chest: [6, 0, 0], head: [10, 0, 0],
  thighL: [38, 0, -6], shinL: [-72, 0, 0], footL: [-22, 0, 0],
  thighR: [-6, 0, 6], shinR: [-42, 0, 0], footR: [-22, 0, 0],
  upperArmL: [40, 0, -78], forearmL: [30, 0, 0], upperArmR: [36, 0, 72], forearmR: [34, 0, 0],
};
const FALL_B = { ...FALL_A, thighL: [10, 0, -6], shinL: [-44, 0, 0], thighR: [32, 0, 6], shinR: [-76, 0, 0], upperArmL: [50, 0, -68], upperArmR: [46, 0, 80] };

const CROUCH = {
  spine: [-14, 0, 0], chest: [-24, 0, 0], head: [22, 0, 0],
  thighL: [78, 0, -8], shinL: [-118, 0, 0], footL: [36, 0, 0],
  thighR: [72, 0, 8], shinR: [-112, 0, 0], footR: [34, 0, 0],
  upperArmL: [38, 0, -28], forearmL: [52, 0, 0], upperArmR: [42, 0, 28], forearmR: [48, 0, 0],
  bob: -0.3,
};
const HERO_LAND = { // Superhelden-Landung: Knie und Hand am Boden
  hips: [0, 10, 0], spine: [-16, 0, 0], chest: [-38, -8, 0], neck: [12, 0, 0], head: [26, -6, 0],
  thighL: [96, 0, -10], shinL: [-112, 0, 0], footL: [18, 0, 0],
  thighR: [-6, 0, 12], shinR: [-86, 0, 0], footR: [-60, 0, 0],
  upperArmL: [-42, 0, -44], forearmL: [28, 0, 0], upperArmR: [28, 0, 16], forearmR: [12, 0, 0], handR: [40, 0, 0],
  bob: -0.42,
};
const SLIDE = {
  hips: [0, -32, 0], spine: [-10, 10, 0], chest: [-12, 18, 0], head: [10, 18, 0],
  thighL: [72, 0, -12], shinL: [-84, 0, 0], footL: [10, 0, 0],
  thighR: [-22, 0, 18], shinR: [-104, 0, 0], footR: [-30, 0, 0],
  upperArmL: [24, 0, -62], forearmL: [30, 0, 0], upperArmR: [-10, 0, 58], forearmR: [24, 0, 0],
  bob: -0.24,
};
const SWING_A = {
  spine: [-4, 0, 0], chest: [-2, 0, 0], head: [12, 0, 0],
  thighL: [30, 0, -4], shinL: [-42, 0, 0], footL: [-36, 0, 0],
  thighR: [20, 0, 4], shinR: [-58, 0, 0], footR: [-36, 0, 0],
  upperArmL: [74, 0, -22], forearmL: [36, 0, 0], upperArmR: [74, 0, 22], forearmR: [36, 0, 0],
};
const SWING_B = { ...SWING_A, thighL: [18, 0, -4], shinL: [-54, 0, 0], thighR: [32, 0, 4], shinR: [-40, 0, 0], upperArmL: [68, 0, -24], upperArmR: [70, 0, 24] };
const REEL = {
  spine: [-14, 0, 0], chest: [-18, 0, 0], head: [18, 0, 0],
  thighL: [88, 0, -6], shinL: [-112, 0, 0], footL: [-18, 0, 0],
  thighR: [80, 0, 6], shinR: [-104, 0, 0], footR: [-18, 0, 0],
  upperArmL: [96, 0, -16], forearmL: [22, 0, 0], upperArmR: [96, 0, 16], forearmR: [22, 0, 0],
};
const BOOST_A = {
  spine: [-8, 0, 0], chest: [-12, 0, 0], head: [24, 0, 0],
  thighL: [-6, 0, -4], shinL: [-22, 0, 0], footL: [-44, 0, 0],
  thighR: [-14, 0, 4], shinR: [-34, 0, 0], footR: [-44, 0, 0],
  upperArmL: [-62, 0, -24], forearmL: [12, 0, 0], upperArmR: [-62, 0, 24], forearmR: [12, 0, 0],
};
const BOOST_B = { ...BOOST_A, thighL: [-14, 0, -4], shinL: [-34, 0, 0], thighR: [-6, 0, 4], shinR: [-22, 0, 0] };
const TUCK = {
  spine: [-20, 0, 0], chest: [-24, 0, 0], head: [-10, 0, 0],
  thighL: [110, 0, -8], shinL: [-130, 0, 0], footL: [-20, 0, 0],
  thighR: [108, 0, 8], shinR: [-128, 0, 0], footR: [-20, 0, 0],
  upperArmL: [60, 0, -20], forearmL: [80, 0, 0], upperArmR: [60, 0, 20], forearmR: [80, 0, 0],
};

const wallLean = (p) => ({ ...p, spine: [-14, p.spine?.[1] ?? 0, 0], chest: [-12, p.chest?.[1] ?? 0, 0], bob: (p.bob ?? 0) * 0.5 });

export function createClips(baseY) {
  const runCycle = (A, B, dur) => [[0, A], [dur * 0.25, B], [dur * 0.5, mirror(A)], [dur * 0.75, mirror(B)], [dur, A]];
  return {
    idle: buildClip('idle', [[0, IDLE_A], [1.4, IDLE_B], [2.8, IDLE_A]], baseY),
    run: buildClip('run', runCycle(RUN_A, RUN_B, 0.62), baseY),
    wallrun: buildClip('wallrun', runCycle(wallLean(RUN_A), wallLean(RUN_B), 0.48), baseY),
    jump: buildClip('jump', [
      [0, { ...CROUCH, bob: -0.12, thighL: [36, 0, -6], thighR: [36, 0, 6], shinL: [-62, 0, 0], shinR: [-62, 0, 0] }],
      [0.1, { chest: [8, 0, 0], thighL: [12, 0, 0], shinL: [-10, 0, 0], footL: [-38, 0, 0], thighR: [-6, 0, 0], shinR: [-16, 0, 0], footR: [-38, 0, 0], upperArmL: [140, 0, -20], forearmL: [20, 0, 0], upperArmR: [140, 0, 20], forearmR: [20, 0, 0], bob: 0.02 }],
      [0.38, AIR_UP],
    ], baseY, false),
    airUp: buildClip('airUp', [[0, AIR_UP], [0.5, { ...AIR_UP, thighL: [72, 0, -4], upperArmL: [62, 0, -52] }], [1.0, AIR_UP]], baseY),
    fall: buildClip('fall', [[0, FALL_A], [0.35, FALL_B], [0.7, FALL_A]], baseY),
    land: buildClip('land', [[0, CROUCH], [0.12, { ...CROUCH, bob: -0.24 }], [0.4, IDLE_A]], baseY, false),
    landHard: buildClip('landHard', [[0, HERO_LAND], [0.5, { ...HERO_LAND, bob: -0.4 }], [0.85, IDLE_A]], baseY, false),
    slide: buildClip('slide', [[0, SLIDE], [0.5, { ...SLIDE, bob: -0.26, chest: [-12, 20, 0] }], [1.0, SLIDE]], baseY),
    swing: buildClip('swing', [[0, SWING_A], [0.8, SWING_B], [1.6, SWING_A]], baseY),
    reel: buildClip('reel', [[0, REEL], [0.25, { ...REEL, thighL: [84, 0, -6], thighR: [86, 0, 6] }], [0.5, REEL]], baseY),
    boost: buildClip('boost', [[0, BOOST_A], [0.25, BOOST_B], [0.5, BOOST_A]], baseY),
    flip: buildClip('flip', [
      [0, { ...lerpPose(AIR_UP, TUCK, 0.5), flip: [0, 0, 0] }],
      [0.12, { ...TUCK, flip: [-110, 0, 0] }],
      [0.26, { ...TUCK, flip: [-230, 0, 0] }],
      [0.4, { ...lerpPose(TUCK, FALL_A, 0.5), flip: [-340, 0, 0] }],
      [0.52, { ...FALL_A, flip: [-360, 0, 0] }],
    ], baseY, false),
  };
}
