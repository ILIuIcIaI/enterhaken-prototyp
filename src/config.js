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
    jumpSpeed: 8.5,
    airAccel: 8,
    airMaxSpeed: 14,
    swingAccel: 13,       // WASD-Einfluss quer zum Seil, während ein Haken hängt (Schwung "pumpen")
  },
  locomotion: {
    walkSpeed: 2.2,       // normales Gehen
    sprintSpeed: 9.0,     // Shift halten (Jog-Tempo wird beim Beschleunigen durchlaufen)
    walkAccel: 8,
    sprintAccel: 7.5,     // spürbares Gewicht beim Anlaufen
    decel: 10,
    runStopDecel: 12,     // Anhalten aus dem Lauf (zwei Bremsschritte)
    turnRate: 14,         // rad/s im Stand, sinkt mit dem Tempo
    turnFalloff: 0.15,    // → ca. 10 rad/s beim Gehen, 6 rad/s im Sprint
    facingRate: 16,       // wie schnell der Körper der Laufrichtung folgt
    pivotAngle: 2.3,      // ab ca. 130° Richtungswechsel: Wende statt Bogen
    pivotMinSpeed: 3.8,
    pivotTime: 0.46,
    pivotDecel: 28,
  },
  // Schnelles Aufkommen: Rolle → Slide (Richtungstaste gehalten) oder Rolle → Stolpern (keine Taste); am Seil Slide
  landing: {
    rollSpeed: 10.5,      // ab diesem Bodentempo (≈ 38 km/h, über dem Sprint) rollt man sich ab – nicht am Seil
    rollTime: 0.64,       // Dauer der Rolle bei Lauftempo; schneller gerollt wird sie kürzer (rollDist)
    rollTimeMin: 0.42,
    rollDist: 6.5,        // ungefähre Strecke einer Rolle (m) – bestimmt bei hohem Tempo ihre Dauer
    // Kettenglied statt Vollbremsung: man rollt mit dem Schwung ab, der Slide ist schnell und trägt rund 12 m weit,
    // dann läuft man weiter; das Stolpern ist langsamer und bremst bis zum Stand (gut 9 m)
    rollMax: 20,          // höchstes Tempo beim Abrollen (m/s)
    rollKeep: 1.2,        // Abbremsen in der Rolle mit Richtungstaste (m/s²) – der Schwung geht in den Slide
    rollBrake: 3,         // … ohne Richtungstaste (mindestens; bremst genau auf das Anfangstempo des Stolperns)
    slideFriction: 4,     // Reibung im Slide (m/s²) – schnell, aber nach ≈ 12 m ausgebremst
    slideDrag: 0.6,       // zusätzliche Reibung je m/s
    ropeFriction: 2.6,    // Slide am Seil / ohne Rolle: geringe Reibung, das Seil zieht
    ropeDrag: 0.04,
    slideSteer: 1.1,      // Lenken im Slide (rad/s)
    slideExit: 5.5,       // darunter steht man aus dem Slide auf (und läuft weiter)
    riseTime: 0.34,       // Aufstehen aus dem Slide in den Lauf
    stumbleTime: 1.45,    // Stolpern (Ausfallschritte) bis zum Stand – Tempoverlauf in animations.js (STUMBLE)
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
    deployTime: 0.35,     // Flügel öffnen sich weich
    alphaBase: 0.22,      // Anstellwinkel im ruhigen Gleitflug (rad)
    pitchGain: 0.6,       // Blick über/unter die Flugbahn ändert den Anstellwinkel
    alphaDive: 0.15,      // W: flacher anstellen = sinken, schneller werden
    alphaFlare: 0.25,     // S: abfangen
    alphaMax: 0.65,
    alphaStall: 0.5,      // darüber reißt die Strömung ab
    alphaRate: 4,
    clAlpha: 4.2,
    cd0: 0.09,
    cdk: 0.11,
    kLift: 0.048,         // ergibt ca. 19 m/s Gleiten bei 3,7 m/s Sinken (Gleitzahl ~5)
    kDrag: 0.048,
    maxLift: 45,
    bankGain: 1.3,
    maxBank: 1.0,
    bankRate: 3.5,
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
    boostAccel: 30,       // Shift in der Luft halten
    boostCost: 20,
    boostDelay: 0.22,     // kürzer gedrückt = nur Dash
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
