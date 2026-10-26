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
    runSpeed: 12,
    groundAccel: 70,
    slideDecel: 20,       // Abbremsen, wenn man schneller als Laufgeschwindigkeit landet
    jumpSpeed: 9,
    airAccel: 8,
    airMaxSpeed: 14,
    swingAccel: 13,       // WASD-Einfluss quer zum Seil, während ein Haken hängt (Schwung "pumpen")
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
  graphics: {
    ink: 1,               // Stärke der Tuschelinien
    bloom: 0.45,
    exposure: 1.05,
    saturation: 1.12,
  },
};

export const FIXED_DT = 1 / 120;
