import * as THREE from 'three';

// Keyframe-Animationen für die Figur. Posen sind Gelenkwinkel in Grad (Euler XYZ).
// Konventionen (Figur schaut nach -Z):
//   Oberschenkel/Oberarm x+ = nach vorne, Unterschenkel x- = Knie beugen, Unterarm x+ = Ellbogen beugen,
//   Fuß x+ = Zehen hoch (Ferse setzt auf), x- = Zehen strecken, Rumpf x- = nach vorne lehnen,
//   Kopf x+ = nach oben schauen, Arm z: links negativ / rechts positiv = seitlich abspreizen,
//   Brust y+ = rechte Schulter vor, Hüfte y- = linke Hüfte vor, Hüfte z+ = rechte Hüftseite hoch.
// Die Gangzyklen sind an reale Bewegungsabläufe angelehnt (Fersenaufsatz, Abfedern, Abrollen,
// Gegenrotation von Becken und Schultern) und über Schrittlänge und Kadenz an das Tempo gekoppelt.

export const JOINTS = [
  'flip', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
];

// Arme hängen leicht abgespreizt, damit die Hände außen an der weiten Jacke vorbeischwingen
const ARM_SPREAD = 8;
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _ry = new THREE.Quaternion();

// Gangzyklen: Dauer eines Doppelschritts bei Referenztempo
export const GAITS = {
  walk: { speed: 2.2, cycle: 1.0 },
  jog: { speed: 4.8, cycle: 0.7 },
  sprint: { speed: 9.0, cycle: 0.52 },
};

const mirrorName = (n) => (n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n);

// Spiegelt eine Pose links/rechts (für die zweite Hälfte von Gangzyklen).
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

const get = (pose, joint, i) => {
  let v = pose[joint] ? pose[joint][i] : 0;
  if (i === 2 && joint === 'upperArmL') v -= ARM_SPREAD;
  if (i === 2 && joint === 'upperArmR') v += ARM_SPREAD;
  return v;
};

// keys: [[zeit, pose], ...]; pose.bob = Höhenversatz der Figur in Metern,
// pose.pivot = Höhenversatz des Drehpunkts (flip-Knoten) – bei der Rolle dreht sich der Körper knapp über dem Boden,
// pose.flipYaw = Gierwinkel der Drehachse von flip (Grad) – flip[0] dreht dann um diese schräge Achse
export function buildClip(name, keys, baseY, loop = true) {
  const duration = keys[keys.length - 1][0];
  const fps = 50;
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = (f / (frames - 1)) * duration;

  const n = keys.length;
  const at = (idx) => {
    if (loop) {
      const m = n - 1; // letzter Key == erster Key
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
  const axisRoll = keys.some(([, p]) => p.flipYaw !== undefined);
  const D = Math.PI / 180;
  for (const joint of JOINTS) {
    const values = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      const t = times[f];
      if (joint === 'flip' && axisRoll) {
        // Drehung um eine waagrechte Achse, die um flipYaw gegen die Querachse gedreht ist (diagonale Schulterrolle)
        const yaw = sample(t, (p) => p.flipYaw ?? 0) * D;
        _ry.setFromAxisAngle(_Y, yaw);
        q.setFromAxisAngle(_X, sample(t, (p) => get(p, joint, 0)) * D).premultiply(_ry).multiply(_ry.invert());
      } else {
        e.set(sample(t, (p) => get(p, joint, 0)) * D, sample(t, (p) => get(p, joint, 1)) * D, sample(t, (p) => get(p, joint, 2)) * D);
        q.setFromEuler(e);
      }
      if (f > 0 && q.dot(prev) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev.copy(q);
      q.toArray(values, f * 4);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${joint}.quaternion`, times, values));
  }
  const pos = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) pos[f * 3 + 1] = baseY + sample(times[f], (p) => p.bob ?? 0);
  tracks.push(new THREE.VectorKeyframeTrack('model.position', times, pos));
  if (keys.some(([, p]) => p.pivot !== undefined)) {
    const piv = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) piv[f * 3 + 1] = sample(times[f], (p) => p.pivot ?? 0);
    tracks.push(new THREE.VectorKeyframeTrack('flip.position', times, piv));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// ------------------------------------------------------------------ Stand

const IDLE_R = { // Gewicht auf dem rechten Bein, lockerer Kontrapost
  hips: [0, 5, 4], spine: [3, -2, -2], chest: [-3, -3, -2], neck: [2, 2, 1], head: [-3, 7, 3],
  shoulderL: [0, 0, 2], shoulderR: [0, 0, -1],
  thighL: [9, -8, -6], shinL: [-16, 0, 0], footL: [8, 0, 0],
  thighR: [-2, 0, -4], shinR: [-2, 0, 0], footR: [0, 0, 0],
  upperArmL: [5, 0, -4], forearmL: [16, 0, 0], handL: [6, 0, 8],
  upperArmR: [-4, 10, 5], forearmR: [24, 0, 0], handR: [8, 0, -10],
  bob: -0.006,
};
const IDLE_R2 = { ...IDLE_R, chest: [-5, -3, -2], spine: [4, -2, -2], shoulderL: [0, 0, 3.5], shoulderR: [0, 0, -2.5], head: [-1, 9, 2], bob: -0.002 };
const IDLE_L = { ...mirror(IDLE_R), head: [-2, -4, -2], upperArmR: [3, 0, 4], forearmR: [18, 0, 0], upperArmL: [-2, -6, -6], forearmL: [26, 0, 0] };
const IDLE_L2 = { ...IDLE_L, chest: [-5, 3, 2], spine: [4, 2, 2], head: [0, -6, -1], bob: -0.002 };

// ------------------------------------------------------------------ Gehen (2,2 m/s): Fersenaufsatz, Abfedern, Abrollen

const W_CONTACT = {
  hips: [0, -6, 0], spine: [-2, 3, 0], chest: [-1, 5, 0], neck: [1, -3, 0], head: [1, -2, 0],
  shoulderL: [0, 0, -1], shoulderR: [0, 0, 1],
  thighL: [26, 0, 0], shinL: [-4, 0, 0], footL: [14, 0, 0],
  thighR: [-15, 0, 0], shinR: [-16, 0, 0], footR: [-22, 0, 0],
  upperArmL: [-16, 0, -2], forearmL: [12, 0, 0], handL: [-4, 0, 6],
  upperArmR: [18, 0, 2], forearmR: [24, 0, 0], handR: [6, 0, -6],
  bob: -0.01,
};
const W_LOAD = {
  hips: [0, -4, -3], spine: [-2, 2, 1], chest: [-2, 3, 1], neck: [2, -2, 0], head: [2, -1, 0],
  thighL: [20, 0, 0], shinL: [-16, 0, 0], footL: [2, 0, 0],
  thighR: [-8, 0, 0], shinR: [-36, 0, 0], footR: [-30, 0, 0],
  upperArmL: [-12, 0, -2], forearmL: [14, 0, 0], handL: [-2, 0, 6],
  upperArmR: [14, 0, 2], forearmR: [22, 0, 0], handR: [4, 0, -6],
  bob: -0.028,
};
const W_PASS = {
  hips: [0, 0, -4], spine: [-2, 0, 1], chest: [-1, 0, 2],
  thighL: [2, 0, 0], shinL: [-5, 0, 0], footL: [-1, 0, 0],
  thighR: [18, 0, 0], shinR: [-48, 0, 0], footR: [-2, 0, 0],
  upperArmL: [-2, 0, -2], forearmL: [16, 0, 0], upperArmR: [4, 0, 2], forearmR: [18, 0, 0],
  bob: 0.018,
};
const W_PUSH = {
  hips: [0, 4, -2], spine: [-2, -2, 1], chest: [-1, -3, 1], neck: [1, 2, 0], head: [1, 1, 0],
  thighL: [-12, 0, 0], shinL: [-7, 0, 0], footL: [-12, 0, 0],
  thighR: [27, 0, 0], shinR: [-16, 0, 0], footR: [6, 0, 0],
  upperArmL: [10, 0, -2], forearmL: [20, 0, 0], upperArmR: [-10, 0, 2], forearmR: [16, 0, 0],
  bob: 0.004,
};

// ------------------------------------------------------------------ Jog (4,8 m/s): kurze Flugphase, Arme ca. 80° gebeugt

const J_CONTACT = {
  hips: [0, -8, 0], spine: [-6, 4, 0], chest: [-3, 8, 0], neck: [4, -4, 0], head: [3, -3, 0],
  thighL: [32, 0, 0], shinL: [-14, 0, 0], footL: [8, 0, 0],
  thighR: [-20, 0, 0], shinR: [-72, 0, 0], footR: [-28, 0, 0],
  upperArmL: [-30, 0, -4], forearmL: [76, 0, 0], handL: [0, 0, 8],
  upperArmR: [32, 0, 4], forearmR: [86, 0, 0], handR: [0, 0, -8],
  bob: -0.03,
};
const J_LOAD = {
  ...J_CONTACT, hips: [0, -5, -2], spine: [-7, 3, 0], chest: [-4, 5, 0],
  thighL: [22, 0, 0], shinL: [-32, 0, 0], footL: [0, 0, 0],
  thighR: [-3, 0, 0], shinR: [-98, 0, 0], footR: [-20, 0, 0],
  upperArmL: [-22, 0, -4], upperArmR: [24, 0, 4],
  bob: -0.05,
};
const J_FLIGHT = {
  hips: [0, 0, -2], spine: [-7, 0, 0], chest: [-3, 0, 0], neck: [4, 0, 0], head: [3, 0, 0],
  thighL: [-12, 0, 0], shinL: [-28, 0, 0], footL: [-28, 0, 0],
  thighR: [44, 0, 0], shinR: [-92, 0, 0], footR: [0, 0, 0],
  upperArmL: [2, 0, -4], forearmL: [82, 0, 0], upperArmR: [2, 0, 4], forearmR: [80, 0, 0],
  bob: 0.035,
};
const J_REACH = {
  ...J_FLIGHT, hips: [0, 5, -1], chest: [-3, -5, 0],
  thighL: [-20, 0, 0], shinL: [-62, 0, 0], footL: [-24, 0, 0],
  thighR: [40, 0, 0], shinR: [-40, 0, 0], footR: [10, 0, 0],
  upperArmL: [20, 0, -4], upperArmR: [-20, 0, 4],
  bob: 0.012,
};

// ------------------------------------------------------------------ Sprint (9 m/s): Rumpf ca. 15° vor, Kniehub, enge Fersenführung

const S_CONTACT = {
  hips: [0, -9, 0], spine: [-10, 5, 0], chest: [-6, 10, 0], neck: [7, -5, 0], head: [6, -4, 0],
  thighL: [38, 0, 0], shinL: [-22, 0, 0], footL: [6, 0, 0],
  thighR: [-18, 0, 0], shinR: [-112, 0, 0], footR: [-38, 0, 0],
  upperArmL: [-52, 0, -4], forearmL: [92, 0, 0], handL: [0, 0, 6],
  upperArmR: [58, 0, 4], forearmR: [104, 0, 0], handR: [0, 0, -6],
  bob: -0.03,
};
const S_DOWN = {
  ...S_CONTACT, hips: [0, -6, -2], spine: [-11, 4, 0], chest: [-7, 7, 0],
  thighL: [24, 0, 0], shinL: [-36, 0, 0], footL: [-2, 0, 0],
  thighR: [8, 0, 0], shinR: [-126, 0, 0], footR: [-30, 0, 0],
  upperArmL: [-36, 0, -4], upperArmR: [42, 0, 4],
  bob: -0.045,
};
const S_FLIGHT = {
  hips: [0, 0, -1], spine: [-11, 0, 0], chest: [-5, 0, 0], neck: [7, 0, 0], head: [6, 0, 0],
  thighL: [-22, 0, 0], shinL: [-30, 0, 0], footL: [-34, 0, 0],
  thighR: [66, 0, 0], shinR: [-104, 0, 0], footR: [4, 0, 0],
  upperArmL: [12, 0, -4], forearmL: [90, 0, 0], upperArmR: [-6, 0, 4], forearmR: [88, 0, 0],
  bob: 0.04,
};
const S_REACH = {
  ...S_FLIGHT, hips: [0, 5, 0], chest: [-6, -5, 0],
  thighL: [-26, 0, 0], shinL: [-80, 0, 0], footL: [-30, 0, 0],
  thighR: [60, 0, 0], shinR: [-50, 0, 0], footR: [12, 0, 0],
  upperArmL: [36, 0, -4], upperArmR: [-34, 0, 4],
  bob: 0.02,
};

// ------------------------------------------------------------------ Richtungswechsel und Anhalten

const PIVOT_BRAKE = { // vorderer Fuß stemmt, Oberkörper fängt ab
  hips: [0, -10, 0], spine: [4, 0, 0], chest: [2, 0, 0], head: [0, 0, 0],
  thighL: [36, 0, -4], shinL: [-12, 0, 0], footL: [18, 0, 0],
  thighR: [-14, 0, 6], shinR: [-62, 0, 0], footR: [-20, 0, 0],
  upperArmL: [30, 0, -22], forearmL: [50, 0, 0], upperArmR: [26, 0, 26], forearmR: [56, 0, 0],
  bob: -0.05,
};
const PIVOT_TURN = { // tief, Schultern und Blick drehen schon in die neue Richtung
  hips: [0, 20, 0], spine: [-6, 18, 0], chest: [-8, 26, 0], neck: [2, 20, 0], head: [4, 22, 0],
  thighL: [30, 0, -10], shinL: [-58, 0, 0], footL: [10, 0, 0],
  thighR: [22, 0, 12], shinR: [-72, 0, 0], footR: [-6, 0, 0],
  upperArmL: [10, 0, -44], forearmL: [60, 0, 0], upperArmR: [40, 0, 40], forearmR: [50, 0, 0],
  bob: -0.12,
};
const PIVOT_PUSH = { // Abdruck in die neue Richtung
  hips: [0, 6, 0], spine: [-10, 6, 0], chest: [-6, 8, 0], neck: [4, 4, 0], head: [4, 4, 0],
  thighL: [-16, 0, -4], shinL: [-26, 0, 0], footL: [-30, 0, 0],
  thighR: [50, 0, 4], shinR: [-82, 0, 0], footR: [0, 0, 0],
  upperArmL: [36, 0, -10], forearmL: [80, 0, 0], upperArmR: [-28, 0, 8], forearmR: [80, 0, 0],
  bob: -0.04,
};
const STOP_A = {
  hips: [0, -8, 0], spine: [3, 0, 0], chest: [4, 2, 0], head: [-2, 0, 0],
  thighL: [32, 0, -3], shinL: [-12, 0, 0], footL: [16, 0, 0],
  thighR: [-16, 0, 3], shinR: [-55, 0, 0], footR: [-20, 0, 0],
  upperArmL: [24, 0, -14], forearmL: [50, 0, 0], upperArmR: [20, 0, 14], forearmR: [46, 0, 0],
  bob: -0.04,
};
const STOP_B = {
  hips: [0, 4, 2], spine: [1, 0, 0], chest: [1, -2, 0],
  thighL: [12, 0, -3], shinL: [-28, 0, 0], footL: [8, 0, 0],
  thighR: [24, 0, 3], shinR: [-30, 0, 0], footR: [8, 0, 0],
  upperArmL: [10, 0, -8], forearmL: [30, 0, 0], upperArmR: [8, 0, 8], forearmR: [30, 0, 0],
  bob: -0.07,
};

// ------------------------------------------------------------------ Luft

const AIR_UP = {
  spine: [-4, 0, 0], chest: [-2, 0, 0], head: [8, 0, 0],
  thighL: [70, 0, -4], shinL: [-96, 0, 0], footL: [-14, 0, 0],
  thighR: [10, 0, 4], shinR: [-58, 0, 0], footR: [-28, 0, 0],
  upperArmL: [46, 0, -36], forearmL: [48, 0, 0], upperArmR: [30, 0, 44], forearmR: [40, 0, 0],
};
const APEX = {
  spine: [2, 0, 0], chest: [4, 0, 0], head: [6, 0, 0],
  thighL: [44, 0, -6], shinL: [-76, 0, 0], footL: [-20, 0, 0],
  thighR: [16, 0, 6], shinR: [-52, 0, 0], footR: [-26, 0, 0],
  upperArmL: [26, 0, -56], forearmL: [38, 0, 0], upperArmR: [22, 0, 54], forearmR: [36, 0, 0],
};
const FALL_A = {
  spine: [6, 0, 0], chest: [6, 0, 0], head: [12, 0, 0],
  thighL: [34, 0, -6], shinL: [-66, 0, 0], footL: [-22, 0, 0],
  thighR: [-4, 0, 6], shinR: [-40, 0, 0], footR: [-22, 0, 0],
  upperArmL: [36, 0, -66], forearmL: [30, 0, 0], upperArmR: [32, 0, 62], forearmR: [34, 0, 0],
};
const FALL_B = { ...FALL_A, thighL: [10, 0, -6], shinL: [-42, 0, 0], thighR: [30, 0, 6], shinR: [-70, 0, 0], upperArmL: [44, 0, -60], upperArmR: [40, 0, 70] };
const FALL_FAST_A = {
  spine: [10, 0, 0], chest: [10, 0, 0], head: [18, 0, 0],
  thighL: [28, 0, -12], shinL: [-74, 0, 0], footL: [-30, 0, 0],
  thighR: [-8, 0, 12], shinR: [-30, 0, 0], footR: [-30, 0, 0],
  upperArmL: [70, 0, -86], forearmL: [20, 0, 0], upperArmR: [20, 0, 82], forearmR: [40, 0, 0],
};
const FALL_FAST_B = { ...mirror(FALL_FAST_A), spine: [10, 0, 0], chest: [10, 0, 0], head: [18, 0, 0] };
const CROUCH = {
  spine: [-14, 0, 0], chest: [-22, 0, 0], head: [20, 0, 0],
  thighL: [74, 0, -8], shinL: [-112, 0, 0], footL: [34, 0, 0],
  thighR: [68, 0, 8], shinR: [-106, 0, 0], footR: [32, 0, 0],
  upperArmL: [34, 0, -24], forearmL: [48, 0, 0], upperArmR: [38, 0, 24], forearmR: [44, 0, 0],
  bob: -0.28,
};
const HERO_LAND = { // Superhelden-Landung: Knie und Hand am Boden
  hips: [0, 10, 0], spine: [-16, 0, 0], chest: [-38, -8, 0], neck: [12, 0, 0], head: [26, -6, 0],
  thighL: [96, 0, -10], shinL: [-112, 0, 0], footL: [18, 0, 0],
  thighR: [-6, 0, 12], shinR: [-86, 0, 0], footR: [-60, 0, 0],
  upperArmL: [-42, 0, -40], forearmL: [28, 0, 0], upperArmR: [28, 0, 12], forearmR: [12, 0, 0], handR: [40, 0, 0],
  bob: -0.42,
};
// ------------------------------------------------------------------ Rolle, Slide, Aufstehen, Stolpern
// Schulterrolle (wie im Parkour): Hände auf den Boden, Kopf zur Gegenseite, die rechte Schulter setzt auf, der
// Körper rollt diagonal über den Rücken zur linken Hüfte (flip dreht um eine schräge Achse, flipYaw). Zwei Enden:
// auf der linken Hüfte sitzend mit gestrecktem rechten Bein (→ Slide) oder über das linke Knie hoch (→ Stolpern).
const ROLL_TOUCH = {
  spine: [-28, 0, 0], chest: [-22, 12, 0], neck: [-6, 0, 0], head: [-10, 25, 0],
  thighL: [60, 0, -6], shinL: [-80, 0, 0], footL: [16, 0, 0], thighR: [75, 0, 6], shinR: [-100, 0, 0], footR: [24, 0, 0],
  upperArmL: [70, 0, -15], forearmL: [10, 0, 0], upperArmR: [80, 0, 10], forearmR: [50, 0, 0],
  bob: -0.3, pivot: 0, flip: [0, 0, 0], flipYaw: -52,
};
const ROLL_DIVE = { // rechte Schulter geht zum Boden, rechter Arm bildet einen Bogen, das hintere Bein drückt
  hips: [0, 10, 0], spine: [-40, 6, -8], chest: [-38, 18, -10], neck: [-20, 0, 0], head: [-25, 35, -10],
  thighL: [40, 0, -6], shinL: [-50, 0, 0], footL: [-10, 0, 0], thighR: [110, 0, 4], shinR: [-120, 0, 0], footR: [30, 0, 0],
  upperArmL: [60, 0, -30], forearmL: [20, 0, 0], upperArmR: [100, 0, 30], forearmR: [70, 0, 0],
  bob: -0.04, pivot: -0.22, flipYaw: -52,
};
const ROLL_OVER = { // über Schulter und Rücken, die Beine kommen seitlich mit
  hips: [0, 8, 0], spine: [-40, 8, -10], chest: [-36, 18, -8], neck: [-22, 0, 12], head: [-30, 38, 22],
  thighL: [100, 0, -14], shinL: [-120, 0, 0], footL: [20, 0, 0], thighR: [95, 0, 10], shinR: [-110, 0, 0], footR: [24, 0, 0],
  upperArmL: [50, 0, -40], forearmL: [40, 0, 0], upperArmR: [96, 0, 34], forearmR: [70, 0, 0],
  bob: -0.03, pivot: -0.26, flipYaw: -52,
};
const ROLL_BACK = { // quer über den Rücken zur linken Hüfte, das linke Bein faltet sich unter
  hips: [0, 4, 0], spine: [-30, 4, -6], chest: [-26, 10, -4], neck: [-14, 0, 8], head: [-18, 26, 14],
  thighL: [70, 0, -20], shinL: [-140, 0, 0], footL: [10, 0, 0], thighR: [100, 0, 10], shinR: [-100, 0, 0], footR: [20, 0, 0],
  upperArmL: [20, 0, -44], forearmL: [30, 0, 0], upperArmR: [70, 0, 30], forearmR: [50, 0, 0],
  bob: -0.03, pivot: -0.46, flipYaw: -52,
};
const ROLL_HIP = { // auf der linken Hüfte, Oberkörper richtet sich auf, linke Hand stützt
  spine: [-20, 0, 0], chest: [-15, 0, 0], neck: [2, 0, 0], head: [10, 5, 0],
  thighL: [20, 0, -35], shinL: [-125, 0, 0], footL: [-6, 0, 0], thighR: [70, 0, 8], shinR: [-60, 0, 0], footR: [14, 0, 0],
  upperArmL: [-20, 0, -40], forearmL: [16, 0, 0], handL: [-20, 0, 0], upperArmR: [50, 0, 25], forearmR: [35, 0, 0],
  bob: -0.2, pivot: -0.32, flipYaw: -52,
};
const ROLL_KNEEL = { // Ende → Stolpern: linkes Knie fast am Boden, rechter Fuß aufgesetzt, bereit zum Hochdrücken
  hips: [0, -8, 0], spine: [-22, 0, 0], chest: [-18, 0, 0], neck: [4, 0, 0], head: [12, 0, 0],
  thighR: [78, 0, 8], shinR: [-92, 0, 0], footR: [14, 0, 0], thighL: [-8, 0, -8], shinL: [-112, 0, 0], footL: [-30, 0, 0],
  upperArmL: [30, 0, -30], forearmL: [30, 0, 0], upperArmR: [40, 0, 30], forearmR: [36, 0, 0],
  bob: -0.36, pivot: 0, flip: [-360, 0, 0], flipYaw: -52,
};
// Rolle mit Taste: sie kommt nicht erst hoch, sondern legt sich aus der Rolle direkt zurück in den Slide – der
// Oberkörper lehnt sich ab dem Rücken stetig zurück, die Hüfte sinkt stetig ab (keine Sitz-Zwischenhaltung)
const ROLL_BACK_S = { ...ROLL_BACK, hips: [8, 4, 0], spine: [-24, 4, -6], chest: [-20, 10, -4], bob: -0.06 };
const ROLL_HIP_S = {
  hips: [16, 0, 4], spine: [-6, 0, 0], chest: [-4, 2, 0], neck: [-6, 0, 0], head: [-4, 5, 0],
  thighL: [20, 0, -38], shinL: [-125, 0, 0], footL: [-14, 0, 0], thighR: [45, 0, 6], shinR: [-25, 0, 0], footR: [10, 0, 0],
  upperArmL: [-40, 0, -32], forearmL: [12, 0, 0], handL: [-30, 0, 0], upperArmR: [44, 0, 34], forearmR: [42, 0, 0],
  bob: -0.36, pivot: -0.32, flipYaw: -52,
};
// Slide (Füße voraus, wie ein Baseball- oder Parkour-Slide): Po und linker Oberschenkel liegen auf dem Boden,
// das rechte Bein ist fast gestreckt flach nach vorn (Ferse am Boden, Zehen hoch), das linke ist untergeschlagen –
// Knie nach außen, Unterschenkel unter dem rechten Knie. Oberkörper ca. 45° zurückgelehnt, Blick nach vorn, die
// linke Hand stützt hinten am Boden, der rechte Arm balanciert vorn. Das Becken liegt dabei ~14 cm über dem Boden.
const SLIDE = {
  hips: [43, 8, 10], spine: [-2, 4, 0], chest: [-4, 6, 0], neck: [-10, 0, 0], head: [-14, 6, 0],
  thighR: [29, 0, 4], shinR: [-6, 0, 0], footR: [6, 0, 0],
  thighL: [20, 0, -42], shinL: [-124, 0, 0], footL: [-24, 0, 0],
  upperArmL: [-54, 0, -24], forearmL: [8, 0, 0], handL: [-40, 0, 0],
  upperArmR: [40, 0, 40], forearmR: [48, 0, 0],
  bob: -0.7,
};
const SLIDE_B = { ...SLIDE, chest: [-6, 7, 0], head: [-16, 4, 0], upperArmR: [46, 0, 44], forearmR: [54, 0, 0], thighR: [28, 0, 5], bob: -0.698 };
// Aufstehen: das vordere Bein setzt auf, das hintere drückt ab, Oberkörper kommt nach vorn
const RISE_PUSH = {
  hips: [8, -6, 0], spine: [-20, 0, 0], chest: [-18, 0, 0], neck: [2, 0, 0], head: [12, 0, 0],
  thighR: [56, 0, 4], shinR: [-72, 0, 0], footR: [20, 0, 0], thighL: [28, 0, -14], shinL: [-108, 0, 0], footL: [-22, 0, 0],
  upperArmL: [-10, 0, -30], forearmL: [30, 0, 0], upperArmR: [40, 0, 20], forearmR: [40, 0, 0],
  bob: -0.3,
};
const RISE_END = {
  spine: [-8, 0, 0], chest: [-6, 0, 0], head: [2, 0, 0],
  thighR: [22, 0, 4], shinR: [-22, 0, 0], footR: [4, 0, 0], thighL: [-10, 0, -4], shinL: [-30, 0, 0], footL: [-12, 0, 0],
  upperArmL: [-14, 0, -8], forearmL: [24, 0, 0], upperArmR: [18, 0, 8], forearmR: [26, 0, 0],
  bob: -0.06,
};
// ------------------------------------------------------------------ Stolpern
// Nach 2B in NieR:Automata (1080p-Spielszene, Kamera hinter ihr, in 0,1-s-Schritten ausgewertet):
//   0,0 s  sie bleibt hängen – innerhalb von 0,1 s fliegen BEIDE Arme weit zur Seite, fast waagrecht (wie beim
//          Balancieren), Ellbogen leicht gebeugt; der Oberkörper kippt nach vorn, der Schritt wird kurz
//   0,1–0,3 s  Arme bleiben weit draußen und sinken etwas, hastige kurze Fangschritte
//   0,3–0,6 s  der linke Arm flattert noch ein-, zweimal seitlich hoch, der rechte bleibt tief vorn
//   0,6–0,8 s  Arme zurück in den Laufschwung, Oberkörper wieder aufrecht – kein Kreisen, kein Rudern.
// Hier kommt sie aus der Rolle hoch, stolpert genauso und läuft sich bis zum Stand aus.
// Player fährt genau den Tempoverlauf speed; aus ihm ergeben sich die Schrittlängen (Füße rutschen nicht).
export const STUMBLE = {
  dur: 1.45,
  contacts: [0, 0.16, 0.32, 0.49, 0.67, 0.87, 1.08, 1.27], // kurze, hastige Schritte; rechts steht schon aus der Rolle
  speed: [[0, 9.4], [0.45, 9.3], [0.8, 7.2], [1.05, 4.2], [1.3, 1.2], [1.45, 0]],
};
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// stückweise Kurve mit weichen Übergängen (Kosinus zwischen den Stützstellen)
export function curveAt(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i], [t1, v1] = pts[i + 1];
    if (t <= t1) return v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * (t - t0) / (t1 - t0)));
  }
  return pts[pts.length - 1][1];
}
function stumbleKeys() {
  const S = STUMBLE, C = S.contacts, n = C.length, D = 180 / Math.PI, LEG = 0.74;
  const vAt = (t) => curveAt(S.speed, t);
  const stepEnd = (i) => (i < n - 1 ? C[i + 1] : S.dur);
  // Stand eines Schritts: Anteil der Schrittdauer am Boden (schnell = lange Flugphase), halber Beinwinkel
  const step = C.map((c, i) => {
    const T = stepEnd(i) - c, v = vAt(c + T * 0.25);
    const duty = Math.min(0.9, Math.max(0.45, 0.45 + (6 - v) * 0.1));
    const len = v * duty * T;
    return { c, T, duty, a: Math.asin(Math.min(0.85, len / 2 / LEG)) * D, amp: Math.min(1, v / 6) };
  });
  const legAt = (side, t) => {
    const own = C.map((c, i) => i).filter((i) => (i % 2 === 0) === (side === 'R'));
    let k = -1;
    for (const i of own) if (t >= C[i]) k = i;
    const next = own.find((i) => C[i] > t);
    if (k >= 0) {
      const s = step[k], sEnd = s.c + s.duty * s.T;
      if (t <= sEnd) { // Standphase: Fuß steht, Körper zieht darüber
        const u = (t - s.c) / (s.duty * s.T);
        const thigh = s.a - 2 * s.a * u, shin = -(14 + 28 * s.amp * Math.sin(Math.PI * u));
        return { thigh, shin, foot: -(thigh + shin) - 22 * sstep(0.65, 1, u), stance: u };
      }
      // Schwung: das Bein bleibt erst lang nach hinten gestreckt (Ausfallschritt), dann schnellt das Knie hoch nach vorn
      const t1 = next !== undefined ? C[next] : S.dur, a1 = next !== undefined ? step[next].a : 0;
      const w = Math.min(1, (t - sEnd) / Math.max(0.05, t1 - sEnd));
      const back = 20 * s.amp * Math.sin(Math.PI * Math.min(1, w / 0.4)) * (w < 0.4 ? 1 : 0);
      const thigh = -s.a + (a1 + s.a) * sstep(0.15, 1, w) + 30 * s.amp * Math.sin(Math.PI * sstep(0.3, 1, w)) - back;
      const shin = -(14 + (45 + 75 * s.amp) * Math.sin(Math.PI * sstep(0.12, 1, w)));
      return { thigh, shin, foot: -26 + 34 * w };
    }
    // linkes Bein vor seinem ersten Aufsetzen: schwingt aus der Knie-Haltung nach vorn
    const t1 = C[next], w = t / t1, a1 = step[next].a;
    return { thigh: -10 + (a1 + 10) * sstep(0, 1, w) + 20 * Math.sin(Math.PI * w), shin: -(40 + 70 * Math.sin(Math.PI * w)), foot: -20 + 30 * w };
  };
  const kneel = { ...ROLL_KNEEL };
  delete kneel.flip; delete kneel.pivot; delete kneel.flipYaw;
  const keys = [];
  const dt = 1 / 30;
  for (let t = 0; t <= S.dur + 1e-6; t += dt) {
    const lean = curveAt([[0, 40], [0.06, 36], [0.16, 52], [0.36, 50], [0.6, 38], [0.88, 20], [1.15, 7], [1.45, 0]], t);
    const hipLean = 0.35 * lean;
    const p = {};
    for (const side of ['L', 'R']) {
      const g = legAt(side, t);
      p['thigh' + side] = [g.thigh + hipLean, 0, side === 'R' ? 5 : -5];
      p['shin' + side] = [g.shin, 0, 0];
      p['foot' + side] = [g.foot, 0, 0];
      p['_' + side] = g;
    }
    const sR = p._R.stance !== undefined ? 1 : p._L.stance !== undefined ? -1 : 0;
    const yaw = 6 * sR * (t < 1.1 ? 1 : 0.4);
    p.hips = [-hipLean, yaw, 0];
    p.spine = [-0.3 * lean, -yaw * 0.4, 0];
    p.chest = [-0.35 * lean, -yaw * 0.7 - 6 * sstep(0.1, 0.3, t) * (1 - sstep(0.9, 1.2, t)), 0];
    p.neck = [0.3 * lean, 0, 0];
    p.head = [0.42 * lean, 0, 0];
    // Arme: beim Hängenbleiben fliegen beide seitlich nach hinten und kreisen dort hinter dem gekippten Oberkörper,
    // als wolle sie sich fangen (links und rechts gegenläufig, ein Umlauf ≈ 0,34 s); dann zurück in den Laufschwung
    const fl = sstep(0.03, 0.13, t);
    const circ = fl * (1 - sstep(0.66, 0.9, t));
    const runW = sstep(0.66, 0.9, t) * (1 - sstep(1.2, 1.45, t));
    for (const [side, sg, other, off] of [['L', -1, 'R', 0], ['R', 1, 'L', 0.7]]) {
      const ph = (2 * Math.PI * Math.max(0, t - 0.06)) / 0.34 + off;
      const swing = 0.45 * p['_' + other].thigh * runW;
      const flex = circ * (-48 + 26 * Math.sin(ph)) + swing + (1 - circ) * 6;
      const abd = 12 + circ * (42 + 14 * Math.cos(ph));
      p['upperArm' + side] = [flex, 0, sg * abd];
      p['forearm' + side] = [20 + circ * (16 + 10 * Math.sin(ph + 1)) + 14 * runW, 0, 0];
    }
    delete p._L; delete p._R;
    let bob = curveAt([[0, -0.36], [0.12, -0.18], [0.3, -0.24], [0.6, -0.18], [0.95, -0.08], [1.45, 0]], t);
    for (let i = 0; i < n; i++) {
      const s = step[i], u = (t - s.c) / (s.duty * s.T);
      if (u >= 0 && u <= 1) bob -= 0.03 * s.amp * Math.sin(Math.PI * u);
      else if (t > s.c && t < stepEnd(i)) bob += 0.025 * s.amp * Math.sin(Math.PI * (t - s.c - s.duty * s.T) / ((1 - s.duty) * s.T));
    }
    p.bob = bob;
    let pose = lerpPose(p, kneel, 1 - sstep(0, 0.14, t));
    pose = lerpPose(pose, IDLE_R, sstep(1.2, 1.45, t));
    keys.push([+t.toFixed(3), pose]);
  }
  keys[keys.length - 1][0] = S.dur;
  return keys;
}
// Schwingen in drei Phasen (Zeit des Clips = Position im Bogen, siehe Character.update):
// Abschwung – gestreckt, Beine hängen nach hinten; unten – Beine schwingen durch;
// Aufschwung – Hüfte knickt, Beine schwingen nach vorn und oben, Knie beugen sich.
const SWING_DOWN = {
  spine: [7, 0, 0], chest: [6, 0, 0], neck: [4, 0, 0], head: [10, 0, 0],
  thighL: [-16, 0, -4], shinL: [-28, 0, 0], footL: [-36, 0, 0],
  thighR: [-6, 0, 5], shinR: [-46, 0, 0], footR: [-32, 0, 0],
  upperArmL: [40, 0, -34], forearmL: [40, 0, 0], upperArmR: [40, 0, 34], forearmR: [40, 0, 0],
};
const SWING_BOTTOM = {
  spine: [-3, 0, 0], chest: [-2, 0, 0], head: [10, 0, 0],
  thighL: [22, 0, -4], shinL: [-34, 0, 0], footL: [-30, 0, 0],
  thighR: [12, 0, 4], shinR: [-52, 0, 0], footR: [-30, 0, 0],
  upperArmL: [54, 0, -26], forearmL: [36, 0, 0], upperArmR: [54, 0, 26], forearmR: [36, 0, 0],
};
const SWING_UP = {
  spine: [-14, 0, 0], chest: [-10, 0, 0], neck: [2, 0, 0], head: [16, 0, 0],
  thighL: [66, 0, -6], shinL: [-72, 0, 0], footL: [-18, 0, 0],
  thighR: [50, 0, 6], shinR: [-92, 0, 0], footR: [-22, 0, 0],
  upperArmL: [70, 0, -22], forearmL: [44, 0, 0], upperArmR: [70, 0, 22], forearmR: [44, 0, 0],
};
const REEL = {
  spine: [-14, 0, 0], chest: [-18, 0, 0], head: [18, 0, 0],
  thighL: [84, 0, -6], shinL: [-108, 0, 0], footL: [-18, 0, 0],
  thighR: [76, 0, 6], shinR: [-100, 0, 0], footR: [-18, 0, 0],
  upperArmL: [92, 0, -12], forearmL: [22, 0, 0], upperArmR: [92, 0, 12], forearmR: [22, 0, 0],
};
const BOOST = {
  spine: [-8, 0, 0], chest: [-12, 0, 0], head: [24, 0, 0],
  thighL: [-8, 0, -4], shinL: [-24, 0, 0], footL: [-44, 0, 0],
  thighR: [-14, 0, 4], shinR: [-34, 0, 0], footR: [-44, 0, 0],
  upperArmL: [-58, 0, -20], forearmL: [12, 0, 0], upperArmR: [-58, 0, 20], forearmR: [12, 0, 0],
};
const DASH = { // gestreckt wie ein Pfeil (Körper liegt dabei fast waagrecht)
  spine: [-4, 0, 0], chest: [-6, 0, 0], neck: [20, 0, 0], head: [34, 0, 0],
  thighL: [-6, 0, -3], shinL: [-16, 0, 0], footL: [-48, 0, 0],
  thighR: [-12, 0, 3], shinR: [-28, 0, 0], footR: [-48, 0, 0],
  upperArmL: [-36, 0, -10], forearmL: [10, 0, 0], upperArmR: [-36, 0, 10], forearmR: [10, 0, 0],
};
const GLIDE_A = { // Arme weit gespannt für die Flügel, leichtes Hohlkreuz, Blick nach vorn
  spine: [8, 0, 0], chest: [10, 0, 0], neck: [26, 0, 0], head: [34, 0, 0],
  shoulderL: [0, 0, 4], shoulderR: [0, 0, -4],
  thighL: [-10, 0, -15], shinL: [-12, 0, 0], footL: [-46, 0, 0],
  thighR: [-10, 0, 15], shinR: [-12, 0, 0], footR: [-46, 0, 0],
  upperArmL: [8, 0, -80], forearmL: [6, 0, 0], handL: [0, 0, -10],
  upperArmR: [8, 0, 80], forearmR: [6, 0, 0], handR: [0, 0, 10],
};
const GLIDE_B = { ...GLIDE_A, upperArmL: [14, 0, -76], upperArmR: [12, 0, 77], thighL: [-6, 0, -12], thighR: [-13, 0, 16], shinR: [-18, 0, 0], chest: [8, 0, 0] };
const TUCK = {
  spine: [-20, 0, 0], chest: [-24, 0, 0], head: [-10, 0, 0],
  thighL: [110, 0, -8], shinL: [-130, 0, 0], footL: [-20, 0, 0],
  thighR: [108, 0, 8], shinR: [-128, 0, 0], footR: [-20, 0, 0],
  upperArmL: [60, 0, -20], forearmL: [80, 0, 0], upperArmR: [60, 0, 20], forearmR: [80, 0, 0],
};

const wallLean = (p) => ({ ...p, spine: [-14, p.spine?.[1] ?? 0, 0], chest: [-10, p.chest?.[1] ?? 0, 0], bob: (p.bob ?? 0) * 0.5 });
const cycle4 = (A, B, C, D, dur) => [
  [0, A], [dur * 0.125, B], [dur * 0.25, C], [dur * 0.375, D],
  [dur * 0.5, mirror(A)], [dur * 0.625, mirror(B)], [dur * 0.75, mirror(C)], [dur * 0.875, mirror(D)], [dur, A],
];

export function createClips(baseY) {
  return {
    idle: buildClip('idle', [[0, IDLE_R], [1.6, IDLE_R2], [3.4, IDLE_L], [5.0, IDLE_L2], [6.8, IDLE_R]], baseY),
    walk: buildClip('walk', cycle4(W_CONTACT, W_LOAD, W_PASS, W_PUSH, GAITS.walk.cycle), baseY),
    jog: buildClip('jog', cycle4(J_CONTACT, J_LOAD, J_FLIGHT, J_REACH, GAITS.jog.cycle), baseY),
    sprint: buildClip('sprint', cycle4(S_CONTACT, S_DOWN, S_FLIGHT, S_REACH, GAITS.sprint.cycle), baseY),
    wallrun: buildClip('wallrun', cycle4(wallLean(S_CONTACT), wallLean(S_DOWN), wallLean(S_FLIGHT), wallLean(S_REACH), 0.5), baseY),
    pivot: buildClip('pivot', [[0, PIVOT_BRAKE], [0.14, PIVOT_TURN], [0.3, PIVOT_PUSH], [0.46, J_CONTACT]], baseY, false),
    stop: buildClip('stop', [[0, STOP_A], [0.22, STOP_B], [0.62, IDLE_R]], baseY, false),
    jump: buildClip('jump', [
      [0, { ...CROUCH, bob: -0.12, thighL: [34, 0, -6], thighR: [34, 0, 6], shinL: [-58, 0, 0], shinR: [-58, 0, 0] }],
      [0.1, { chest: [6, 0, 0], thighL: [12, 0, 0], shinL: [-10, 0, 0], footL: [-36, 0, 0], thighR: [-6, 0, 0], shinR: [-16, 0, 0], footR: [-36, 0, 0], upperArmL: [120, 0, -16], forearmL: [24, 0, 0], upperArmR: [120, 0, 16], forearmR: [24, 0, 0], bob: 0.02 }],
      [0.42, AIR_UP],
    ], baseY, false),
    airUp: buildClip('airUp', [[0, AIR_UP], [0.5, { ...AIR_UP, thighL: [64, 0, -4], upperArmL: [52, 0, -42] }], [1.0, AIR_UP]], baseY),
    apex: buildClip('apex', [[0, APEX], [0.6, { ...APEX, upperArmL: [30, 0, -60], thighR: [20, 0, 6] }], [1.2, APEX]], baseY),
    fall: buildClip('fall', [[0, FALL_A], [0.4, FALL_B], [0.8, FALL_A]], baseY),
    fallFast: buildClip('fallFast', [[0, FALL_FAST_A], [0.35, FALL_FAST_B], [0.7, FALL_FAST_A]], baseY),
    land: buildClip('land', [[0, CROUCH], [0.12, { ...CROUCH, bob: -0.22 }], [0.45, IDLE_R]], baseY, false),
    landHard: buildClip('landHard', [[0, HERO_LAND], [0.5, { ...HERO_LAND, bob: -0.4 }], [0.9, IDLE_R]], baseY, false),
    slide: buildClip('slide', [[0, SLIDE], [0.6, SLIDE_B], [1.2, SLIDE]], baseY),
    // zeitgesteuert (Character.update setzt die Zeit aus dem Fortschritt der Bewegung)
    roll: buildClip('roll', [
      [0, ROLL_TOUCH],
      [0.08, { ...ROLL_DIVE, flip: [-40, 0, 0] }],
      [0.18, { ...ROLL_OVER, flip: [-150, 0, 0] }],
      [0.28, { ...ROLL_BACK_S, flip: [-255, 0, 0] }],
      [0.38, { ...ROLL_HIP_S, flip: [-322, 0, 0] }],
      [0.5, { ...SLIDE, pivot: 0, flip: [-360, 0, 0], flipYaw: -52 }],
    ], baseY, false),
    rollUp: buildClip('rollUp', [
      [0, ROLL_TOUCH],
      [0.08, { ...ROLL_DIVE, flip: [-40, 0, 0] }],
      [0.18, { ...ROLL_OVER, flip: [-150, 0, 0] }],
      [0.28, { ...ROLL_BACK, flip: [-255, 0, 0] }],
      [0.38, { ...ROLL_HIP, flip: [-322, 0, 0] }],
      [0.5, ROLL_KNEEL],
    ], baseY, false),
    rise: buildClip('rise', [[0, SLIDE], [0.14, RISE_PUSH], [0.34, RISE_END]], baseY, false),
    stumble: buildClip('stumble', stumbleKeys(), baseY, false),
    swing: buildClip('swing', [[0, SWING_DOWN], [0.5, SWING_BOTTOM], [1.0, SWING_UP]], baseY, false),
    reel: buildClip('reel', [[0, REEL], [0.25, { ...REEL, thighL: [80, 0, -6], thighR: [82, 0, 6] }], [0.5, REEL]], baseY),
    boost: buildClip('boost', [[0, BOOST], [0.25, { ...BOOST, thighL: [-14, 0, -4], thighR: [-8, 0, 4] }], [0.5, BOOST]], baseY),
    dash: buildClip('dash', [[0, lerpPose(TUCK, DASH, 0.4)], [0.09, DASH], [0.4, DASH], [0.6, lerpPose(DASH, FALL_A, 0.5)]], baseY, false),
    glide: buildClip('glide', [[0, GLIDE_A], [1.1, GLIDE_B], [2.2, GLIDE_A]], baseY),
    flip: buildClip('flip', [
      [0, { ...lerpPose(AIR_UP, TUCK, 0.5), flip: [0, 0, 0] }],
      [0.12, { ...TUCK, flip: [-110, 0, 0] }],
      [0.26, { ...TUCK, flip: [-230, 0, 0] }],
      [0.4, { ...lerpPose(TUCK, FALL_A, 0.5), flip: [-340, 0, 0] }],
      [0.52, { ...FALL_A, flip: [-360, 0, 0] }],
    ], baseY, false),
  };
}
