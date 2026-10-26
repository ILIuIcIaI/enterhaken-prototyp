// Zentrale Spielparameter. Alles hier ist im Spiel über das Tuning-Menü (Taste G) live änderbar.
export const CONFIG = {
  physics: {
    gravity: 16,          // m/s² – etwas stärker als real, damit Schwünge knackiger sind
    dragLinear: 0.01,
    dragQuad: 0.0026,     // Luftwiderstand ~ v², ergibt ca. 80 m/s Endgeschwindigkeit
    maxSpeed: 140,
  },
  player: {
    halfWidth: 0.33,
    halfHeight: 0.82,
    slideDecel: 20,       // Abbremsen, wenn man schneller als Sprinttempo landet
    jumpSpeed: 8.5,
    airAccel: 8,
    airMaxSpeed: 14,
    swingAccel: 13,       // WASD-Einfluss quer zum Seil, während ein Haken hängt (Schwung "pumpen")
  },
  locomotion: {
    walkSpeed: 3.4,       // normales Gehen
    sprintSpeed: 10.5,    // Shift halten
    walkAccel: 7,         // träge Beschleunigung = spürbares Gewicht
    sprintAccel: 9,
    decel: 11,
    sprintStopDecel: 15,
    turnWalk: 7.5,        // rad/s – Drehgeschwindigkeit beim Gehen
    turnSprint: 3.4,      // beim Sprinten weite Bögen statt Haken schlagen
    chargeTime: 1.1,      // Sekunden bis zum voll aufgeladenen Sprung
    chargeMin: 9,
    chargeMax: 28,        // ca. 25 m hoch
  },
  dash: {
    speed: 22,            // zusätzliche Geschwindigkeit in Blickrichtung
    keep: 0.7,            // Anteil der bisherigen Geschwindigkeit in Dash-Richtung
    maxSpeed: 60,
    duration: 0.24,       // so lange wirkt kaum Schwerkraft
    cooldown: 0.5,
    cost: 16,
  },
  glide: {
    pitchBase: -0.17,     // leichter Sinkflug (rad)
    pitchDive: -0.75,     // W: steiler, schneller
    pitchFlare: 0.24,     // S: abfangen, bremsen
    pitchRate: 1.6,
    drag: 0.008,          // Gleichgewicht ca. 19 m/s bei 3 m/s Sinken
    turnRate: 1.7,
    maxBank: 0.6,
    stallSpeed: 8,
    minSpeed: 5,
    startSpeed: 12,
  },
  hook: {
    range: 140,
    speed: 420,           // Fluggeschwindigkeit des Hakens
    reelAccel: 40,        // Zugkraft der Winde (Leertaste halten)
    reelMaxSpeed: 55,
    dualFactor: 0.7,      // Zugkraft pro Haken, wenn beide hängen
    minLength: 2,
    stiffness: 140,       // Seil dehnt sich leicht (Feder) statt hart zu rucken
    damping: 14,
    maxStretch: 1.5,      // harte Grenze der Dehnung in Metern
    autoRetract: true,    // Winde holt lockeres Seil sanft ein
    retractSpeed: 10,
    releaseBoost: 3,      // kleiner Schwung in Flugrichtung beim Loslassen
    wrap: true,           // Seil wickelt sich um Gebäudekanten
  },
  gas: {
    max: 100,
    reelCost: 4,
    regen: 10,
    groundRegen: 30,
    infinite: false,
  },
  wallrun: {
    minEntrySpeed: 7,
    impactConversion: 0.65, // Anteil der Aufprallgeschwindigkeit, der in Laufrichtung umgelenkt wird
    speed: 26,
    accel: 35,
    excessDecay: 2,
    gravityScale: 0.2,
    grip: 18,
    climbSpeed: 13,
    stickAccel: 30,
    maxTime: 5,
    jumpOut: 12,
    jumpUp: 8,
    jumpForward: 6,
    reattachCooldown: 0.35,
    minSpeedToKeep: 3,
  },
  camera: {
    fov: 72,
    fovSpeedBoost: 24,
    distance: 5.2,
    distanceSpeedBoost: 2.5,
    shoulder: 0.85,
    height: 1.0,
    sensitivity: 0.0022,
    invertY: false,
    bob: 1,               // Kamera-Wippen beim Gehen/Sprinten
  },
  world: {
    seed: 1337,
    timeScale: 1,
    fullscreen: true,     // Vollbild + Tastatursperre, damit Strg-Kombinationen den Tab nicht schließen
  },
  graphics: {
    ink: 1,               // Stärke der Tuschelinien
    bloom: 0.45,
    exposure: 1.05,
    saturation: 1.12,
  },
};

export const FIXED_DT = 1 / 120;
