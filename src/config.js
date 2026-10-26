// Zentrale Spielparameter. Alles hier ist im Spiel über das Tuning-Menü (Taste G) live änderbar.
export const CONFIG = {
  physics: {
    gravity: 16,          // m/s² – etwas stärker als real, damit Schwünge knackiger sind
    dragLinear: 0.01,
    dragQuad: 0.0026,     // Luftwiderstand ~ v², ergibt ca. 80 m/s Endgeschwindigkeit
    maxSpeed: 140,
  },
  player: {
    halfWidth: 0.35,
    halfHeight: 0.9,
    runSpeed: 12,
    groundAccel: 70,
    slideDecel: 20,       // Abbremsen, wenn man schneller als Laufgeschwindigkeit landet
    jumpSpeed: 9,
    airAccel: 8,
    airMaxSpeed: 14,
    swingAccel: 10,       // WASD-Einfluss, während ein Haken hängt (Schwung "pumpen")
  },
  hook: {
    range: 140,
    speed: 420,           // Fluggeschwindigkeit des Hakens
    reelAccel: 40,        // Zugkraft der Winde (Leertaste halten)
    reelMaxSpeed: 55,
    dualFactor: 0.7,      // Zugkraft pro Haken, wenn beide hängen
    minLength: 2,
    autoRetract: false,   // true: Winde holt lockeres Seil automatisch ein
    wrap: true,           // Seil wickelt sich um Gebäudekanten
  },
  gas: {
    max: 100,
    boostAccel: 30,
    boostCost: 20,
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
  },
  world: {
    seed: 1337,
    timeScale: 1,
  },
};

export const FIXED_DT = 1 / 120;
