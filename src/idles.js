import { buildClip, IDLE_R } from './animations.js';

// Eigenheiten im Stand: steht die Figur ein paar Sekunden still, spielt sie abwechselnd eine ihrer zwei Idles
// (Character.update). Abgeleitet aus der Persönlichkeit der Vorlagen (Fan-Wikis, Spieltexte):
//   Belle (Zenless Zone Zero)  begeisterungsfähig, spontan, liebt Musik → schaut aufs Handy und hüpft, summt und wippt
//   Rei Ayanami (Evangelion)    still, ausdruckslos, nach innen gekehrt → betrachtet ihre Hand, Blick in den Himmel
//   Makima (Chainsaw Man)       ruhig, souverän, lächelnd, berechnend → Hände auf dem Rücken, prüfender Blick
//   Zero (Drakengard 3)         reizbar, ungeduldig, spöttisch → Arme verschränkt mit Fußtippen, Nacken kreisen
//   2B (NieR:Automata)          stille Entschlossenheit, stoisch, darunter gefühlvoll → zupft den Handschuh, Blick in die Ferne
//   Joker (Persona 5)           frech, selbstbewusst, Sinn für Auftritte → zieht den Handschuh straff, rückt die Maske
//   Makoto Yuki (Persona 3)     ruhig, distanziert, immer Musik → Hände in den Taschen, nickt im Takt, rückt die Kopfhörer am Kragen
//   Steve (Minecraft)           Abbauen, Schleichen → Hackbewegung nach unten, doppeltes Ducken
//   Scientist (Half-Life)       ängstlich, tollpatschig → schiebt die Brille hoch, nervöse Blicke, Hände reiben
//   Jonesy (Fortnite)           lässig, selbstbewusst → Hände in die Hüften, lässt die Fingerknöchel knacken
// Alle Abläufe beginnen und enden in der Standpose IDLE_R, damit Ein- und Ausstieg nahtlos sind.
// Wichtig: kein Arm wird in die Luft gehoben (auch nicht im Übergang) – das kann wie ein Gruß wirken. Die Hände
// bleiben unter Schulterhöhe; nur an Maske und Brille kommt die Hand ans Gesicht, der Ellbogen bleibt dabei vorn
// auf Schulterhöhe. Die Armwinkel dafür sind am Skelett nachgerechnet (Handgelenk am Ziel, Ellbogen tief).
const P = (o) => ({ ...IDLE_R, ...o });
const seq = (keys) => [[0, IDLE_R], ...keys, [keys[keys.length - 1][0] + 0.7, IDLE_R]];

// Belle: Handy vor dem Bauch (Unterarm quer nach innen), Blick drauf – dann ein fröhlicher kleiner Hüpfer auf die Zehen
const B_PHONE = P({ upperArmR: [12, 55, 8], forearmR: [81, 0, 0], handR: [-10, 0, 0], head: [-24, -8, 0], neck: [-6, 0, 0], chest: [-3, 0, 0] });
const B_PHONE_B = { ...B_PHONE, handR: [-4, 0, 0], head: [-26, -4, 4] };
const B_HAPPY = P({ upperArmR: [8, 45, 6], forearmR: [60, 0, 0], head: [6, 6, 8], chest: [4, 0, 0], footL: [-14, 0, 0], footR: [-14, 0, 0], bob: 0.035 });
const B_HAPPY_DOWN = { ...B_HAPPY, footL: [0, 0, 0], footR: [0, 0, 0], bob: 0 };
const B_HUM_L = P({ hips: [0, 4, -5], spine: [2, 0, 4], chest: [-2, 0, 4], head: [-4, 10, 10], upperArmR: [-6, 10, 14], forearmR: [40, 0, 0], footL: [10, 0, 0], bob: -0.01 });
const B_HUM_R = P({ hips: [0, -4, 5], spine: [2, 0, -4], chest: [-2, 0, -4], head: [-4, -6, -10], upperArmR: [-4, 10, 10], forearmR: [16, 0, 0] });
// Rei
const R_PALM = P({ upperArmR: [22, 0, -12], forearmR: [80, 0, 0], head: [-30, -14, 0], neck: [-8, 0, 0], chest: [-4, 0, 0] });
const R_PALM_B = { ...R_PALM, head: [-30, -10, 4] };
const R_GAZE = P({ head: [22, 30, 4], neck: [6, 10, 0], chest: [0, 6, 0] });
// Makima
const M_BACK = P({ upperArmL: [-28, 0, -10], upperArmR: [-28, 0, 10], forearmL: [62, 0, 0], forearmR: [62, 0, 0], chest: [4, 0, 0], spine: [2, 0, 0], head: [2, 0, 12] });
const M_BACK_B = { ...M_BACK, head: [4, -8, -6] };
const M_CLASP = P({ upperArmL: [18, 0, 8], upperArmR: [18, 0, -8], forearmL: [70, 0, 0], forearmR: [70, 0, 0] });
const M_WATCH = { ...M_CLASP, chest: [0, 18, 0], neck: [0, 10, 0], head: [-2, 30, 4] };
// Zero
// Arme verschränkt: Oberarme nach innen gedreht (y), damit die Unterarme quer vor der Brust liegen
const Z_CROSS = P({ upperArmL: [20, -60, 30], upperArmR: [20, 60, -30], forearmL: [100, 0, 0], forearmR: [100, 0, 0], chest: [2, 0, 0], head: [-4, 0, 0] });
const Z_TAP = { ...Z_CROSS, footR: [24, 0, 0], thighR: [4, 0, 4] };
const Z_SHAKE_L = { ...Z_CROSS, head: [-6, 16, 0] };
const Z_SHAKE_R = { ...Z_CROSS, head: [-6, -14, 0] };
const Z_NECK_L = P({ head: [-10, 10, 24], neck: [-6, 0, 10], shoulderL: [0, 0, 6] });
const Z_NECK_BACK = P({ head: [20, 0, 0], neck: [10, 0, 0] });
const Z_NECK_R = P({ head: [-10, -10, -24], neck: [-6, 0, -10] });
const Z_SHRUG = P({ shoulderL: [0, 0, 14], shoulderR: [0, 0, -14], upperArmL: [6, 0, -14], upperArmR: [6, 0, 14], forearmL: [40, 0, 0], forearmR: [40, 0, 0], head: [-4, 0, 0] });
// 2B
const T_GLOVE = P({ upperArmR: [34, 0, -6], forearmR: [92, 0, 0], upperArmL: [42, 0, 24], forearmL: [104, 0, 0], head: [-22, -12, 0], chest: [-4, -6, 0] });
const T_PULL = { ...T_GLOVE, upperArmL: [36, 0, 20], forearmL: [96, 0, 0] };
const T_VIEW = P({ head: [6, -18, 6], neck: [2, -6, 0], chest: [-2, -4, 0] });
const T_VIEW_B = { ...T_VIEW, head: [8, -20, 3], chest: [2, -4, 0] };
// Joker
const J_GLOVE = P({ upperArmL: [24, 0, 16], forearmL: [88, 0, 0], upperArmR: [26, 0, -22], forearmR: [92, 0, 0], head: [-14, 8, 0], chest: [0, 6, 0] });
const J_TUG = { ...J_GLOVE, upperArmR: [18, 0, -16], forearmR: [78, 0, 0], head: [-8, 10, 6] };
const J_SHAKE = P({ upperArmL: [10, 0, -10], forearmL: [30, 0, 0], handL: [0, 0, 20], head: [2, 14, 8] });
// Maske: erst die Hand dicht am Körper zur Brust, dann ans Gesicht – Ellbogen vorn auf Schulterhöhe
const J_MASK_IN = P({ upperArmR: [0, 28, 2], forearmR: [132, 0, 0], head: [-6, 0, 0], chest: [0, 2, 0] });
const J_MASK = P({ upperArmR: [85, 29, -16], forearmR: [126, 0, 0], head: [-10, 0, 0], chest: [0, 4, 0] });
const J_MASK_B = { ...J_MASK, head: [-4, -6, 4] };
const J_MASK_DONE = P({ upperArmR: [20, 0, 10], forearmR: [40, 0, 0], head: [6, 8, 6] });
// Makoto
const K_POCKETS = P({ upperArmL: [-10, 0, -14], upperArmR: [-10, 0, 14], forearmL: [34, 0, 0], forearmR: [34, 0, 0], handL: [0, 0, 10], handR: [0, 0, -10], head: [-6, 6, 0] });
const K_NOD = { ...K_POCKETS, head: [-14, 6, 0] };
// Kopfhörer hängen um den Hals (designs/makoto.js): die Hand rückt die rechte Muschel am Kragen zurecht, Ellbogen unten
const K_PHONES = P({ upperArmR: [-13, 60, 26], forearmR: [144, 0, 0], head: [-8, 0, -8], chest: [0, 0, -2], upperArmL: [-10, 0, -14], forearmL: [34, 0, 0], handL: [0, 0, 10] });
const K_PHONES_B = { ...K_PHONES, head: [-13, 0, -10], forearmR: [140, 0, 0] };
// Steve
// Hacken an einem Block vor den Füßen: vorgebeugt, der Arm (ein Block am Oberarm) schlägt schräg nach unten
const S_UP = P({ upperArmR: [40, 0, -6], forearmR: [40, 0, 0], head: [-22, 0, 0], chest: [-8, 0, 0], spine: [-6, 0, 0] });
const S_HIT = P({ upperArmR: [14, 0, -4], forearmR: [20, 0, 0], head: [-24, 0, 0], chest: [-10, 0, 0], spine: [-8, 0, 0] });
const S_SNEAK = P({ spine: [-16, 0, 0], chest: [-10, 0, 0], head: [10, 0, 0], thighL: [30, 0, -6], thighR: [30, 0, 6], shinL: [-40, 0, 0], shinR: [-40, 0, 0], footL: [10, 0, 0], footR: [10, 0, 0], bob: -0.14 });
const S_LOOK = P({ head: [0, 40, 0] });
// Scientist
const C_GLASSES_IN = P({ upperArmR: [4, 27, -10], forearmR: [130, 0, 0], head: [-4, 0, 0] });
const C_GLASSES = P({ upperArmR: [91, 33, -31], forearmR: [116, 0, 0], head: [-6, 0, 0] });
const C_PUSH = { ...C_GLASSES, upperArmR: [93, 33, -31], forearmR: [119, 0, 0], head: [-1, 0, 0] };
const C_GLANCE_L = P({ upperArmR: [10, 0, 6], forearmR: [40, 0, 0], head: [0, 34, 0], shoulderL: [0, 0, 6], shoulderR: [0, 0, -6] });
const C_GLANCE_R = { ...C_GLANCE_L, head: [0, -36, 0] };
const C_WRING = P({ upperArmL: [22, 0, 10], upperArmR: [22, 0, -10], forearmL: [78, 0, 0], forearmR: [78, 0, 0], shoulderL: [0, 0, 8], shoulderR: [0, 0, -8], head: [-10, 0, 0], chest: [-6, 0, 0] });
const C_WRING_B = { ...C_WRING, forearmL: [86, 0, 0], forearmR: [70, 0, 0], handL: [0, 0, 14], handR: [0, 0, -14] };
const C_FLINCH = { ...C_WRING, shoulderL: [0, 0, 14], shoulderR: [0, 0, -14], head: [-16, 18, 0], spine: [-8, 0, 0], shinL: [-26, 0, 0], shinR: [-14, 0, 0], bob: -0.05 };
// Jonesy
// Hände in die Hüften: Ellbogen seitlich und etwas nach hinten, die Hände liegen seitlich am Gürtel – Blick in die Runde
const Y_HIPS = P({ upperArmR: [-60, 44, 32], forearmR: [94, 0, 0], upperArmL: [-60, -38, -35], forearmL: [94, 0, 0], chest: [2, 0, 0], head: [2, 0, 0] });
const Y_HIPS_LOOK = { ...Y_HIPS, chest: [2, 6, 0], neck: [0, 8, 0], head: [0, 24, 4] };
const Y_HIPS_NOD = { ...Y_HIPS, head: [-10, 6, 0] };
// Fingerknöchel knacken: Hände vor der Brust verschränkt, kurz nach vorn gedrückt, dann ein lässiges Kopfneigen
const Y_KNUCKLE = P({ upperArmL: [24, -40, 26], upperArmR: [24, 40, -26], forearmL: [96, 0, 0], forearmR: [96, 0, 0], head: [-8, 0, 0], chest: [-2, 0, 0] });
const Y_PUSH = P({ upperArmL: [36, -30, 20], upperArmR: [36, 30, -20], forearmL: [62, 0, 0], forearmR: [62, 0, 0], head: [2, 0, 4], chest: [2, 0, 0] });
const Y_COOL = P({ head: [4, 10, 6] });

const IDLE_KEYS = {
  belle_phone: seq([[0.6, B_PHONE], [1.6, B_PHONE_B], [2.0, B_HAPPY], [2.3, B_HAPPY_DOWN], [2.6, B_HAPPY]]),
  belle_hum: seq([[0.6, B_HUM_L], [1.2, B_HUM_R], [1.8, B_HUM_L], [2.4, B_HUM_R], [3.0, B_HUM_L]]),
  rei_palm: seq([[1.1, R_PALM], [2.6, R_PALM_B]]),
  rei_gaze: seq([[1.3, R_GAZE], [2.7, R_GAZE]]),
  makima_poise: seq([[0.8, M_BACK], [2.0, M_BACK_B], [2.8, M_BACK]]),
  makima_watch: seq([[0.9, M_CLASP], [2.0, M_WATCH], [3.0, M_CLASP]]),
  zero_tap: seq([[0.45, Z_CROSS], [0.65, Z_TAP], [0.85, Z_CROSS], [1.05, Z_TAP], [1.25, Z_CROSS], [1.45, Z_TAP], [1.65, Z_CROSS], [1.95, Z_SHAKE_L], [2.15, Z_SHAKE_R]]),
  zero_neck: seq([[0.6, Z_NECK_L], [1.2, Z_NECK_BACK], [1.8, Z_NECK_R], [2.5, Z_SHRUG]]),
  twob_glove: seq([[0.7, T_GLOVE], [1.2, T_PULL], [1.6, T_GLOVE], [2.0, T_PULL], [2.3, T_GLOVE]]),
  twob_view: seq([[1.4, T_VIEW], [2.6, T_VIEW_B], [3.5, T_VIEW]]),
  joker_glove: seq([[0.5, J_GLOVE], [0.9, J_TUG], [1.4, J_SHAKE]]),
  joker_mask: seq([[0.35, J_MASK_IN], [0.75, J_MASK], [1.5, J_MASK_B], [2.1, J_MASK_DONE]]),
  makoto_pockets: seq([[0.7, K_POCKETS], [1.2, K_NOD], [1.6, K_POCKETS], [2.0, K_NOD], [2.4, K_POCKETS], [2.8, K_NOD], [3.3, K_POCKETS]]),
  makoto_phones: seq([[0.7, K_PHONES], [1.5, K_PHONES_B], [2.2, K_POCKETS]]),
  steve_mine: seq([[0.3, S_UP], [0.5, S_HIT], [0.75, S_UP], [0.95, S_HIT], [1.2, S_UP], [1.4, S_HIT]]),
  steve_sneak: seq([[0.25, S_SNEAK], [0.5, IDLE_R], [0.75, S_SNEAK], [1.0, IDLE_R], [1.45, S_LOOK]]),
  sci_glasses: seq([[0.3, C_GLASSES_IN], [0.6, C_GLASSES], [0.95, C_PUSH], [1.35, C_GLANCE_L], [1.75, C_GLANCE_R], [2.15, { ...C_GLANCE_L, head: [0, 18, 0] }]]),
  sci_nervous: seq([[0.6, C_WRING], [1.0, C_WRING_B], [1.4, C_WRING], [1.8, C_WRING_B], [2.2, C_FLINCH], [2.6, C_WRING]]),
  jonesy_hips: seq([[0.7, Y_HIPS], [1.5, Y_HIPS_LOOK], [2.3, Y_HIPS_NOD], [2.9, Y_HIPS]]),
  jonesy_knuckles: seq([[0.6, Y_KNUCKLE], [1.0, Y_PUSH], [1.3, Y_KNUCKLE], [1.7, Y_PUSH], [2.1, Y_KNUCKLE], [2.6, Y_COOL]]),
};

// je Figur zwei Idles (Reihenfolge = Abwechslung)
export const IDLES = {
  belle: ['belle_phone', 'belle_hum'],
  rei: ['rei_palm', 'rei_gaze'],
  makima: ['makima_poise', 'makima_watch'],
  zero: ['zero_tap', 'zero_neck'],
  '2b': ['twob_glove', 'twob_view'],
  joker: ['joker_glove', 'joker_mask'],
  makoto: ['makoto_pockets', 'makoto_phones'],
  steve: ['steve_mine', 'steve_sneak'],
  scientist: ['sci_glasses', 'sci_nervous'],
  jonesy: ['jonesy_hips', 'jonesy_knuckles'],
};

export function createIdleClips(designId, baseY) {
  const out = {};
  for (const name of IDLES[designId] ?? []) out[name] = buildClip(name, IDLE_KEYS[name], baseY, false);
  return out;
}
