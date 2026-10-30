import * as THREE from 'three';

// Gemeinsame Palette für Himmel, Nebel, Fensterspiegelungen und Wasser. Sie ändert sich mit Tageszeit und Wetter
// (environment.js) und steckt deshalb in Uniforms (linearer Farbraum): eigene Shader tragen SKY in ihren Uniforms,
// alle eingebauten Materialien bekommen es über UniformsUtils.clone (unten) – damit kopiert three.js die Uniforms eines
// Materials, bevor es übersetzt wird. Es sind dieselben Objekte, also überall sofort aktuell.

// Abendsonne – Ausgangslage („Abend“, 19 Uhr) und Richtung für alles, was beim Start schon eine braucht
export const SUN_DIR = new THREE.Vector3(-0.72, 0.15, -0.68).normalize();

// Abend, klar – der ursprüngliche Look
export const DUSK = {
  zenith: '#120a2a',
  high: '#45206a',
  mid: '#b03f7c',
  horizonSun: '#ff8a38',
  horizonAnti: '#7a3a80',
  ground: '#1c0f26',
  sun: '#ffd28c',
  glow: '#ff6224',
  smog: '#2e1532',
};

export const SKY = {
  uSkyZenith: { value: new THREE.Color(DUSK.zenith) },
  uSkyHigh: { value: new THREE.Color(DUSK.high) },
  uSkyMid: { value: new THREE.Color(DUSK.mid) },
  uSkyHorizonSun: { value: new THREE.Color(DUSK.horizonSun) },
  uSkyHorizonAnti: { value: new THREE.Color(DUSK.horizonAnti) },
  uSkyGround: { value: new THREE.Color(DUSK.ground) },
  uSkySun: { value: new THREE.Color(DUSK.sun) },
  uSkyGlow: { value: new THREE.Color(DUSK.glow) },
  uSkySmog: { value: new THREE.Color(DUSK.smog) },
  uSunDir: { value: SUN_DIR.clone() },
  uSunUp: { value: 1 },  // Sonne über dem Horizont (0–1)
  uMoon: { value: 0 },   // Mond sichtbar (0–1)
  // Hyper-Realistic-Mode: physikalischer Himmel (Preetham: Rayleigh- und Mie-Streuung) statt der Palette
  uRealSky: { value: 0 },
  uPBetaR: { value: new THREE.Vector3() },
  uPBetaM: { value: new THREE.Vector3() },
  uPSunE: { value: 0 },
  uPOvercast: { value: 0 },
  // Stimmung bei tiefer Sonne (Hyper-Realistic-Mode, environment.js): Abendrot, Morgenrot (0–1)
  uGold: { value: 0 },
  uDawn: { value: 0 },
};

// Streukoeffizienten des physikalischen Himmels aus Sonnenstand und Wetter (Preetham-Modell wie three.js' Sky):
// klare Luft wenig Dunst, Bewölkung trüber
const RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
export function updatePhysicalSky(cloud = 0) {
  const d = SKY.uSunDir.value;
  const zen = Math.acos(Math.min(1, Math.max(-1, d.y)));
  SKY.uPSunE.value = 1000 * Math.max(0, 1 - Math.exp(-(1.6110731556870734 - zen) / 1.5));
  const rayleigh = 1.6 + 1.2 * cloud, turbidity = 2.6 + 5 * cloud, mie = 0.005;
  SKY.uPBetaR.value.set(RAYLEIGH[0] * rayleigh, RAYLEIGH[1] * rayleigh, RAYLEIGH[2] * rayleigh);
  const c = 0.434 * 0.2 * turbidity * 10e-18 * mie;
  SKY.uPBetaM.value.set(MIE[0] * c, MIE[1] * c, MIE[2] * c);
  SKY.uPOvercast.value = cloud;
}

export const DUSK_GLSL = /* glsl */ `
#ifndef DUSK_DEFINED
#define DUSK_DEFINED
uniform vec3 uSkyZenith;
uniform vec3 uSkyHigh;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizonSun;
uniform vec3 uSkyHorizonAnti;
uniform vec3 uSkyGround;
uniform vec3 uSkySun;
uniform vec3 uSkyGlow;
uniform vec3 uSkySmog;
uniform vec3 uSunDir;
uniform float uSunUp;
uniform float uMoon;
uniform float uRealSky;
uniform vec3 uPBetaR;
uniform vec3 uPBetaM;
uniform float uPSunE;
uniform float uPOvercast;
uniform float uGold;
uniform float uDawn;
#define DUSK_ZENITH uSkyZenith
#define DUSK_HIGH uSkyHigh
#define DUSK_MID uSkyMid
#define DUSK_HORIZON_SUN uSkyHorizonSun
#define DUSK_HORIZON_ANTI uSkyHorizonAnti
#define DUSK_GROUND uSkyGround
#define DUSK_SUN uSkySun
#define DUSK_GLOW uSkyGlow
#define DUSK_SMOG uSkySmog
#define DUSK_SUN_DIR uSunDir

// Preetham-Himmel (wie three.js' Sky): Rayleigh- und Mie-Streuung entlang der Luftmasse, Sonnenhof, Abendrot.
// Alle Potenzen mit nichtnegativer Basis (sonst NaN auf manchen Grafikkarten)
vec3 physSky(vec3 d) {
  vec3 dir = normalize(vec3(d.x, max(d.y, 0.0) + 1e-4, d.z));
  float zen = acos(clamp(dir.y, 0.0, 1.0));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(max(93.885 - zen * 57.29578, 1e-3), -1.253));
  vec3 Fex = exp(-(uPBetaR * 8.4e3 + uPBetaM * 1.25e3) * inv);
  float cosT = dot(dir, DUSK_SUN_DIR);
  float rPhase = 0.05968310365946075 * (1.0 + pow(clamp(cosT * 0.5 + 0.5, 0.0, 1.0), 2.0));
  float mPhase = 0.07957747154594767 * 0.36 / pow(max(1.64 - 1.6 * cosT, 1e-4), 1.5);
  vec3 ratio = (uPBetaR * rPhase + uPBetaM * mPhase) / max(uPBetaR + uPBetaM, vec3(1e-12));
  // Original: Helligkeit ∝ Sonnenstärke^1,5 – abends wäre der Himmel viel zu dunkel gegen die angestrahlten Häuser;
  // hier etwa linear (begrenzt)
  vec3 Lin = pow(max(uPSunE * ratio * (1.0 - Fex), vec3(0.0)), vec3(1.5)) * min(sqrt(500.0 / max(uPSunE, 1.0)), 4.0);
  Lin *= mix(vec3(1.0), pow(max(uPSunE * ratio * Fex, vec3(0.0)), vec3(0.5)), clamp(pow(clamp(1.0 - DUSK_SUN_DIR.y, 0.0, 2.0), 5.0), 0.0, 1.0));
  // linear (das Original wendet danach eine Gammakurve an – in dieser HDR-Kette wäre der Himmel grau und milchig);
  // skaliert so, dass der Zenit etwa ein Fünftel einer sonnenbeschienenen weißen Fläche hell ist (wie draußen)
  return ((Lin + vec3(0.1) * Fex) * 0.04 + vec3(0.0, 0.0003, 0.00075)) * 0.12;
}

// Dämmerung und Nacht (wenn die Sonne unter dem Horizont steht): tiefblauer Zenit, Abendrot über dem Horizont zur
// Sonne hin bis etwa 17° Sonnentiefe, warmes Streulicht der Stadt am Horizont, Mondlicht hellt etwas auf
vec3 nightSky(vec3 d) {
  float h = max(d.y, 0.0);
  float tw = 1.0 - smoothstep(0.0, 0.3, -DUSK_SUN_DIR.y);
  vec2 hz = d.xz / max(length(d.xz), 1e-5), sz = DUSK_SUN_DIR.xz / max(length(DUSK_SUN_DIR.xz), 1e-5);
  float az = clamp(dot(hz, sz) * 0.5 + 0.5, 0.0, 1.0);
  vec3 zen = vec3(0.0022, 0.0036, 0.011) * (1.0 + 5.0 * tw);
  vec3 hor = vec3(0.007, 0.0075, 0.012) + vec3(0.07, 0.03, 0.01) * pow(az, 3.0) * tw * tw + vec3(0.004, 0.012, 0.03) * tw;
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.45, h));
  col += vec3(0.006, 0.004, 0.0025) * (1.0 - smoothstep(0.0, 0.12, h)); // Stadtlicht im Dunst
  return col + vec3(0.0015, 0.0022, 0.0045) * uMoon;
}

// Stimmung bei tiefer Sonne über dem Preetham-Himmel, der allein zu blass bleibt. Abend: glühendes Orange am Horizont zur
// Sonne hin, darüber Rot und Violett, gegenüber Erdschatten und rosa Gegendämmerung, oben tiefes Blau. Morgen: klarer und
// kühler, Pfirsich und Rosa über dem Dunst, helles Blassblau darüber.
vec3 moodSky(vec3 p, vec3 d, float az) {
  float h = max(d.y, 0.0), s = max(dot(normalize(d), DUSK_SUN_DIR), 0.0);
  if (uGold > 0.001) {
    vec3 toSun = mix(mix(vec3(0.95, 0.27, 0.035), vec3(0.72, 0.17, 0.085), smoothstep(0.0, 0.09, h)), vec3(0.24, 0.085, 0.2), smoothstep(0.07, 0.34, h));
    vec3 away = mix(mix(vec3(0.085, 0.075, 0.13), vec3(0.3, 0.14, 0.2), smoothstep(0.015, 0.09, h)), vec3(0.06, 0.07, 0.17), smoothstep(0.11, 0.4, h));
    vec3 e = mix(away, toSun, pow(az, 1.6));
    e = mix(e, vec3(0.016, 0.03, 0.085), smoothstep(0.36, 0.85, h));
    e += vec3(1.5, 0.5, 0.1) * (pow(s, 24.0) * 0.55 + pow(s, 240.0) * 2.2);
    p = mix(p, e, uGold * 0.92);
  }
  if (uDawn > 0.001) {
    vec3 toSun = mix(mix(vec3(0.95, 0.5, 0.24), vec3(0.78, 0.46, 0.4), smoothstep(0.0, 0.1, h)), vec3(0.3, 0.33, 0.48), smoothstep(0.08, 0.38, h));
    vec3 away = mix(mix(vec3(0.23, 0.24, 0.33), vec3(0.42, 0.33, 0.4), smoothstep(0.01, 0.1, h)), vec3(0.16, 0.22, 0.4), smoothstep(0.12, 0.42, h));
    vec3 e = mix(away, toSun, pow(az, 1.5));
    e = mix(e, vec3(0.06, 0.12, 0.27), smoothstep(0.4, 0.9, h));
    e += vec3(1.4, 0.8, 0.45) * (pow(s, 30.0) * 0.4 + pow(s, 260.0) * 1.8);
    p = mix(p, e, uDawn * 0.88);
  }
  return p;
}

vec3 duskSky(vec3 d) {
  float h = clamp(d.y, -1.0, 1.0);
  // sichere Normierung (nie durch null) und az geklemmt: genau gegenüber der Sonne rutschte das Skalarprodukt durch
  // Rundung unter -1, pow(az < 0) ergab NaN – ein einziges solches Pixel machte die ganze Umgebungskarte schwarz
  vec2 hz = d.xz / max(length(d.xz), 1e-5);
  vec2 sz = DUSK_SUN_DIR.xz / max(length(DUSK_SUN_DIR.xz), 1e-5);
  float az = clamp(dot(hz, sz) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sunSide = mix(DUSK_HORIZON_SUN, DUSK_MID, smoothstep(0.0, 0.2, h));
  vec3 antiSide = mix(DUSK_HORIZON_ANTI, DUSK_MID * 0.7, smoothstep(0.0, 0.25, h));
  vec3 col = mix(antiSide, sunSide, pow(az, 2.2));
  col = mix(col, DUSK_HIGH, smoothstep(0.12, 0.45, h));
  col = mix(col, DUSK_ZENITH, smoothstep(0.4, 0.95, h));
  col = mix(col, DUSK_GROUND, smoothstep(0.0, -0.25, h));
  if (uRealSky > 0.5) {
    // Hyper-Realistic-Mode: physikalischer Himmel bei Tag und in der Dämmerung, nachts der (kühlere) Nachthimmel
    vec3 p = moodSky(physSky(d), d, az);
    float L = dot(p, vec3(0.2126, 0.7152, 0.0722));
    p = mix(p, vec3(L) * vec3(0.96, 1.0, 1.05) * (1.0 - 0.3 * uPOvercast), 0.85 * uPOvercast); // Bewölkung: grau
    p = mix(nightSky(d), p, smoothstep(-0.06, 0.08, DUSK_SUN_DIR.y));
    col = mix(p, p * 0.12, smoothstep(0.0, -0.25, h)); // unter dem Horizont: dunkler Dunst über dem Boden
  }
  return col;
}

vec3 duskFogColor(vec3 d) {
  vec3 col = duskSky(vec3(d.x, max(d.y, 0.0) * 0.5 + 0.02, d.z));
  return col + DUSK_GLOW * pow(max(dot(d, DUSK_SUN_DIR), 0.0), 6.0) * 0.45 * uSunUp * (1.0 - uRealSky);
}
#endif
`;

// Jedes eingebaute Material bekommt die gemeinsamen Himmels-Uniforms
const cloneUniforms = THREE.UniformsUtils.clone;
THREE.UniformsUtils.clone = (u) => Object.assign(cloneUniforms(u), SKY);
