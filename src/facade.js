// Hyper-Realistic-Mode: physikalisch basierte Fassaden, Dächer und Aufbauten – nur im PBR-Zwilling des
// Gebäudematerials (#ifdef STANDARD), der Cel-Look bleibt unberührt. Gleiche Fensteraufteilung wie im Cel-Look, aber
// echte Materialien: Glasfassaden mit Aluminiumpfosten, Brüstungsglas und leicht welligen Scheiben (Spiegelbilder
// brechen je Scheibe), Betonplatten mit Fugen und Schmutzfahnen, Klinker im Läuferverband, Putz mit Gesimsen.
// Fenster mit Laibung (echte Parallaxe), Rahmen, Sprossen, Fensterbank, Jalousien und Vorhängen; dahinter Räume
// (Interior Mapping) mit Wänden, Boden, Decke, Möbeln, Deckenleuchte und Tageslicht. Dächer aus Bitumenbahnen und
// Kies, bei Regen mit Pfützen. Feine Muster gehen mit der Entfernung in ihren Mittelwert über (kein Flimmern).
// Ausgabe für die späteren Shader-Stufen: bRough, bMetal, bF0 (Reflexionsgrad des Glases), bWin (Glasanteil),
// bEmit (Licht aus den Räumen), bNw (gestörte Weltnormale).

export const FACADE_PARS = /* glsl */ `
varying vec3 vBWorld;
float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// gefiltertes Rauschen: Oktaven feiner als ein Pixel (px = Pixelgröße in Mustereinheiten) gehen in ihren Mittelwert
float fFbm(vec2 p, float px) {
  float v = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 4; i++) {
    v += a * mix(0.5, fNoise(p * f + float(i) * 17.3), 1.0 - smoothstep(0.3, 0.7, px * f));
    f *= 2.03;
    a *= 0.5;
  }
  return v / 0.9375;
}
// Linie (Fuge, Profil) der halben Breite w um d = 0, kantengeglättet über die Pixelgröße px
float fLine(float d, float w, float px) {
  return 1.0 - smoothstep(w - px, w + px, abs(d));
}

// Raum hinter einer Scheibe: Eintritt p (m) im Raum [0, cell] (ein Raum kann mehrere Fensterachsen der Breite
// axis umfassen), Strahl rd (x entlang der Fassade, y hoch, z < 0 ins Gebäude). Schnitt mit Rückwand, Seitenwand,
// Boden oder Decke; davor eine Möbelebene (Tisch, Stuhl, Pflanze) je Achse für Tiefenparallaxe. Licht: je Achse eine
// Deckenleuchte (lit, Farbe lamp) mit Abfall, Tageslicht vom Fenster her.
vec3 fRoom(vec2 p, vec3 rd, vec2 cell, float D, float seed, float lit, vec3 lamp, float dayL, float axis) {
  vec3 s = vec3(p, 0.0);
  vec3 r = rd;
  r.x = abs(r.x) < 1e-4 ? 1e-4 : r.x;
  r.y = abs(r.y) < 1e-4 ? 1e-4 : r.y;
  float tx = ((r.x > 0.0 ? cell.x : 0.0) - s.x) / r.x;
  float ty = ((r.y > 0.0 ? cell.y : 0.0) - s.y) / r.y;
  float tz = D / -r.z;
  float t = min(min(tx, ty), tz);
  vec3 h = s + r * t;
  float k1 = fHash(vec2(seed, 3.1)), k2 = fHash(vec2(seed, 7.7)), k3 = fHash(vec2(seed, 1.9));
  vec3 wallC = k1 < 0.55 ? vec3(0.78, 0.76, 0.72) : k1 < 0.75 ? vec3(0.64, 0.68, 0.7) : k1 < 0.9 ? vec3(0.74, 0.66, 0.55) : vec3(0.56, 0.6, 0.5);
  vec3 floorC = k2 < 0.45 ? vec3(0.34, 0.21, 0.11) : k2 < 0.8 ? vec3(0.24, 0.24, 0.26) : vec3(0.52, 0.5, 0.46);
  vec3 c;
  float panel = 0.0;
  if (t == tz) {
    c = wallC;
    float x = fract(h.x / axis);
    if (h.y < 0.82 && x > 0.12 + 0.25 * k3 && x < 0.9) c = mix(vec3(0.2, 0.13, 0.09), vec3(0.36, 0.34, 0.38), k2); // Sideboard, Sofa
    else if (k3 > 0.6 && x > 0.05 && x < 0.3 && h.y < 2.15) c = vec3(0.3, 0.21, 0.14) * (0.75 + 0.5 * step(0.5, fract(h.y * 2.6))); // Regal
    else if (k3 < 0.45 && abs(x - 0.58) < 0.13 && abs(h.y - 1.62) < 0.26) c = mix(vec3(0.62, 0.5, 0.34), vec3(0.3, 0.42, 0.55), fHash(vec2(seed, 9.0))); // Bild
  } else if (t == tx) {
    c = wallC * 0.9;
  } else if (r.y < 0.0) {
    c = floorC * (0.86 + 0.14 * step(0.5, fract(h.x * 5.0 + floor(h.z * 0.7) * 0.37)));
  } else {
    c = vec3(0.82);
    vec2 lc = vec2((fract(h.x / axis) - 0.5) * axis, h.z + D * 0.5);
    panel = step(abs(lc.x), 0.32) * step(abs(lc.y), 0.55);
  }
  // Möbelebene: Tisch mit Beinen, Stuhl, Pflanze
  float zf = D * (0.32 + 0.3 * k2);
  float tf = zf / -r.z;
  if (tf < t) {
    vec3 hf = s + r * tf;
    float x = fract(hf.x / axis);
    float desk = step(0.7, hf.y) * step(hf.y, 0.76) * step(0.14, x) * step(x, 0.86);
    float legs = step(hf.y, 0.76) * max(step(abs(x - 0.16), 0.012), step(abs(x - 0.84), 0.012));
    float chair = step(0.42, hf.y) * step(hf.y, 1.02) * step(abs(x - 0.5 - 0.2 * (k3 - 0.5)), 0.1) * step(0.35, k1);
    float pot = step(hf.y, 0.38) * step(abs(x - 0.93), 0.035);
    float leaf = step(length(vec2((x - 0.93) * axis, hf.y - 0.75)), 0.26 + 0.1 * fNoise(vec2(x * 23.0, hf.y * 17.0)));
    float plant = max(pot, leaf) * step(k3, 0.4);
    if (max(max(desk, legs), max(chair, plant)) > 0.5) {
      h = hf;
      c = plant > 0.5 ? (pot > 0.5 ? vec3(0.32, 0.18, 0.12) : vec3(0.1, 0.22, 0.07)) : (chair > 0.5 ? vec3(0.08) : vec3(0.42, 0.3, 0.2));
      panel = 0.0;
    }
  }
  vec3 lampPos = vec3((floor(h.x / axis) + 0.5) * axis, cell.y - 0.12, -D * 0.5);
  vec3 dl = h - lampPos;
  // Lampen so hell, dass beleuchtete Räume nachts auch mit der Augenadaption farbig bleiben (nicht weiß ausbrennen)
  vec3 light = lamp * lit * (0.62 / (1.0 + dot(dl, dl) * 0.2));
  light += vec3(dayL * (0.16 + 0.84 * exp(h.z * 0.3)));
  return c * light + lamp * lit * panel * 1.8;
}

// Relief der Wand (Höhe in m) – dreimal ausgewertet ergibt den Normalengradienten
float fWallH(vec2 f, vec2 cell, float mat, float px, float seed) {
  if (mat < 0.5) return 0.0;
  if (mat < 1.5) { // Betonplatten: Fugen an den Zellrändern, leicht rau
    vec2 d = (fract(f / cell + 0.5) - 0.5) * cell;
    float j = max(fLine(d.x, 0.009, px), fLine(d.y, 0.009, px)) * (1.0 - smoothstep(0.02, 0.06, px));
    return -0.008 * j + 0.0016 * fNoise(f * 7.0 + seed) * (1.0 - smoothstep(0.04, 0.12, px));
  }
  if (mat < 2.5) { // Klinker im Läuferverband (24 × 7 cm, 1 cm Fuge)
    vec2 bq = f / vec2(0.25, 0.0813);
    bq.x += 0.5 * mod(floor(bq.y), 2.0);
    vec2 bd = (0.5 - abs(fract(bq) - 0.5)) * vec2(0.25, 0.0813);
    float mort = 1.0 - smoothstep(0.004 - px * 0.5, 0.006 + px * 0.5, min(bd.x, bd.y));
    return (-0.006 * mort + 0.0012 * fHash(floor(bq) + seed)) * (1.0 - smoothstep(0.01, 0.03, px));
  }
  // Putz: körnig, leicht wellig
  return 0.0018 * fNoise(f * 13.0 + seed) * (1.0 - smoothstep(0.03, 0.09, px)) + 0.004 * fNoise(f * 2.1 + seed) * (1.0 - smoothstep(0.2, 0.5, px));
}

// Farbe der Wand (Albedo) mit Verwitterung
vec3 fWallC(vec2 f, vec2 lp, vec2 cell, vec2 o0, vec2 o1, float mat, vec3 tint, float px, float seed) {
  vec3 c;
  float big = fFbm(f * 0.07 + seed * 0.13, px * 0.07);
  if (mat < 0.5) {
    c = mix(vec3(0.025), tint * 0.1, 0.4); // hinterlackiertes Brüstungsglas
  } else if (mat < 1.5) {
    float n = fFbm(f * 0.9 + seed, px * 0.9) * 0.6 + fFbm(f * 6.0, px * 6.0) * 0.4;
    vec2 pid = floor(f / cell + 0.5);
    c = tint * (0.82 + 0.28 * n) * (0.94 + 0.12 * fHash(pid + seed));
    vec2 d = (fract(f / cell + 0.5) - 0.5) * cell;
    float j = max(fLine(d.x, 0.009, px), fLine(d.y, 0.009, px));
    c *= 1.0 - 0.45 * mix(0.036 / min(cell.x, cell.y), j, 1.0 - smoothstep(0.02, 0.08, px));
  } else if (mat < 2.5) {
    vec2 bq = f / vec2(0.25, 0.0813);
    bq.x += 0.5 * mod(floor(bq.y), 2.0);
    vec2 bid = floor(bq);
    vec2 bd = (0.5 - abs(fract(bq) - 0.5)) * vec2(0.25, 0.0813);
    float mort = 1.0 - smoothstep(0.004 - px * 0.5, 0.006 + px * 0.5, min(bd.x, bd.y));
    float k = 1.0 - smoothstep(0.012, 0.035, px);
    float hb = fHash(bid + seed);
    vec3 brickC = tint * (0.72 + 0.52 * hb) * vec3(1.0, 0.94 + 0.1 * fHash(bid * 1.7), 0.9 + 0.12 * fHash(bid * 2.3));
    brickC *= 0.9 + 0.2 * fNoise(f * 40.0) * k;
    c = mix(mix(tint * 0.98, brickC, k), vec3(0.5, 0.48, 0.44), mix(0.16, mort, k));
  } else {
    float n = fFbm(f * 1.3 + seed, px * 1.3) * 0.7 + fFbm(f * 9.0, px * 9.0) * 0.3;
    c = tint * (0.86 + 0.2 * n);
    c = mix(c, tint * 1.1 + 0.03, fLine(lp.y - 0.09, 0.09, px) * 0.7); // Gesims je Geschoss
    c = mix(c, vec3(0.32, 0.3, 0.29) * (0.85 + 0.3 * n), 1.0 - smoothstep(1.0, 1.12, f.y)); // Sockel
  }
  c *= 0.88 + 0.24 * big;
  c *= mix(0.66, 1.0, smoothstep(0.0, 2.2, f.y + big * 0.6)); // Spritzwasser und Schmutz am Fuß
  if (mat > 0.5) { // Schmutzfahnen unter den Fensterbänken
    float under = step(o0.x - 0.05, lp.x) * step(lp.x, o1.x + 0.05) * step(lp.y, o0.y) * (1.0 - smoothstep(0.0, cell.y * 0.9, o0.y - lp.y));
    float st = fNoise(vec2(f.x * 9.0, f.y * 0.6 + seed));
    c *= 1.0 - 0.3 * under * smoothstep(0.35, 0.8, st) * (1.0 - smoothstep(0.05, 0.2, px));
  }
  c *= mix(0.8, 1.0, smoothstep(0.0, 35.0, f.y)); // Straßenschlucht: unten weniger Himmel
  return c;
}

// Dach: Bitumenbahnen mit Nähten, Kiesflächen, Flecken
float fRoofH(vec2 w, float px, float gm) {
  float gr = fNoise(w * 26.0) * (1.0 - smoothstep(0.02, 0.06, px));
  float seam = fLine(abs(fract(w.x + 0.5) - 0.5), 0.02, px) * (1.0 - gm) * (1.0 - smoothstep(0.03, 0.1, px));
  return 0.007 * gr * gm + 0.003 * seam;
}
`;

export const FACADE_COLOR = /* glsl */ `
float bKind = vInfo.w;
float bStyle = vInfo.y;
float bSeed = floor(vInfo.x + 0.5);
float bWin = 0.0;
float bRough = 0.88;
float bMetal = 0.0;
float bF0 = 0.04;
vec3 bEmit = vec3(0.0);
vec3 bNw = vec3(0.0, 1.0, 0.0);
{
  vec3 Nw = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
  vec3 Vw = normalize(vBWorld - cameraPosition);
  bool horiz = abs(Nw.y) > 0.5;
  vec3 Tw = horiz ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), Nw));
  vec3 Bw = horiz ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 Nb = Nw;
  vec2 grad = vec2(0.0);
  vec3 tint = diffuseColor.rgb;
  vec3 alb = tint;
  vec2 fwm = max(fwidth(vFac), vec2(1e-4));
  float px = max(fwm.x, fwm.y);
  // Tageslicht in den Räumen: nur ein Bruchteil des Außenlichts (von außen wirken Räume tagsüber dunkel)
  float dayL = dot(DUSK_HIGH, vec3(0.2126, 0.7152, 0.0722)) * 0.5 + 0.002;
  if (bKind < 0.5) {
    vec2 wSize = vec2(2.4, 3.6), wRatio = vec2(0.6, 0.55);
    float litChance = 0.2, recess = 0.2, roomD = 6.0;
    vec3 glassT = vec3(0.86, 0.9, 0.9);
    if (bStyle < 0.5) { wSize = vec2(3.0, 3.8); wRatio = vec2(0.9, 0.74); litChance = 0.12; recess = 0.0; roomD = 9.0; glassT = vec3(0.36, 0.44, 0.5); }
    else if (bStyle > 1.5) { wSize = vec2(3.4, 3.2); wRatio = vec2(0.42, 0.5); litChance = 0.28; recess = 0.15; roomD = 4.5; }
    float cols = max(1.0, floor(vInfo.z / wSize.x + 0.5));
    vec2 cell = vec2(vInfo.z / cols, wSize.y);
    vec2 cuv = vFac / cell;
    vec2 cid = floor(cuv);
    vec2 lp = fract(cuv) * cell;
    vec2 fw = max(fwidth(cuv), vec2(1e-4));
    float detail = 1.0 - smoothstep(0.3, 0.8, max(fw.x, fw.y));
    vec2 o0 = (1.0 - wRatio) * 0.5 * cell, o1 = cell - o0;
    float coverage = wRatio.x * wRatio.y;
    // Räume über mehrere Fensterachsen (Großraumbüros, Wohnzimmer): Licht und Lampenfarbe je Raum
    float rw = 1.0 + floor(fHash(vec2(cid.y, bSeed * 0.31)) * (bStyle < 1.5 ? 3.0 : 2.0));
    float rx0 = floor(cid.x / rw) * rw;
    vec2 rid = vec2(rx0, cid.y);
    vec2 rcell = vec2(cell.x * rw, cell.y);
    float roff = (cid.x - rx0) * cell.x;
    float r1 = fHash(rid + bSeed * 1.37), r2 = fHash(rid.yx * 1.7 + bSeed * 0.71), r3 = fHash(rid * 0.37 + bSeed * 2.1);
    // brennendes Licht: Anteil folgt der Tageszeit (uLit), meist warm, in Büros öfter neutral
    float litFrac = litChance * clamp(uLit / 1.15, 0.0, 1.25);
    float lit = step(1.0 - litFrac, r1) * (0.55 + 0.6 * r2);
    vec3 lamp = r3 < 0.55 ? vec3(1.0, 0.66, 0.38) : r3 < 0.85 ? vec3(1.0, 0.88, 0.72) : r3 < 0.95 ? vec3(0.78, 0.88, 1.0) : vec3(0.45, 0.6, 1.0);
    if (bStyle < 1.5 && r3 < 0.4) lamp = vec3(1.0, 0.9, 0.78);
    float Lt = dot(tint, vec3(0.2126, 0.7152, 0.0722));
    float wmat = bStyle < 0.5 ? 0.0 : bStyle < 1.5 ? 1.0 : (tint.r > tint.g * 1.6 && Lt < 0.25 ? 2.0 : 3.0);
    // Palettenfarben des Cel-Looks sind kräftig (Lila-Töne): Beton und Putz zu natürlichen, warmen Grautönen ziehen
    if (wmat > 0.5 && wmat < 1.5) tint = mix(vec3(Lt) * vec3(1.04, 1.0, 0.94), tint, 0.3);
    else if (wmat > 2.5) tint = mix(vec3(Lt) * vec3(1.03, 1.0, 0.95), tint, 0.65);
    float wallR = wmat < 0.5 ? 0.08 : wmat < 1.5 ? 0.88 : wmat < 2.5 ? 0.84 : 0.9;
    // Wand: Farbe und Relief
    float e = max(px * 0.75, 0.002);
    float h0 = fWallH(vFac, cell, wmat, px, bSeed);
    vec2 wallG = vec2(fWallH(vFac + vec2(e, 0.0), cell, wmat, px, bSeed) - h0, fWallH(vFac + vec2(0.0, e), cell, wmat, px, bSeed) - h0) / e;
    vec3 wallA = fWallC(vFac, lp, cell, o0, o1, wmat, tint, px, bSeed);

    vec3 nA = wallA, nE = vec3(0.0), nN = Nw;
    float nR = wallR, nM = 0.0, nW = wmat < 0.5 ? 1.0 : 0.0, nF0 = 0.04;
    vec2 nG = wallG;
    vec3 rd = vec3(dot(Vw, Tw), dot(Vw, Bw), min(dot(Vw, Nw), -1e-3));
    float roomSeed = dot(rid, vec2(1.0, 57.0)) + bSeed * 3.7;
    float D = roomD * (0.75 + 0.5 * r2);
    if (detail > 0.001) {
      if (wmat < 0.5) {
        // Glasfassade: Pfosten an den Zellrändern, Riegel an den Glaskanten, Brüstungsglas zwischen den Geschossen
        float mull = fLine(min(lp.x, cell.x - lp.x), 0.045, px);
        float trans = fLine(min(abs(lp.y - o0.y), abs(lp.y - o1.y)), 0.035, px);
        bool vision = lp.y > o0.y && lp.y < o1.y;
        vec2 wob = (vec2(fHash(cid + 3.3 + bSeed), fHash(cid + 9.1 + bSeed)) - 0.5) * 0.02
          + (lp / cell - 0.5) * vec2(0.01, 0.014) * (fHash(cid + 1.7) - 0.5);
        nN = normalize(Nw + wob.x * Tw + wob.y * Bw);
        nG = vec2(0.0);
        nW = 1.0;
        nR = 0.035;
        nA = vec3(0.0);
        nF0 = mix(0.04, 0.2 + 0.1 * fHash(vec2(bSeed, 4.0)), min(uReflect, 1.0)); // beschichtetes Sonnenschutzglas
        if (vision) nE = fRoom(lp + vec2(roff, 0.0), rd, rcell, D, roomSeed, lit, lamp, dayL, cell.x) * glassT;
        else { nA = mix(vec3(0.025), tint * 0.1, 0.4); nR = 0.07; }
        float fr = max(mull, trans);
        nA = mix(nA, vec3(0.56, 0.57, 0.6), fr);
        nM = fr;
        nR = mix(nR, 0.38, fr);
        nW *= 1.0 - fr;
        nE *= 1.0 - fr;
      } else {
        bool inOpen = lp.x > o0.x && lp.x < o1.x && lp.y > o0.y && lp.y < o1.y;
        if (wmat > 1.5 && !inOpen) {
          // Fensterbank aus Stein, darunter ihr Schatten
          float sx = step(o0.x - 0.07, lp.x) * step(lp.x, o1.x + 0.07);
          float sill = sx * step(o0.y - 0.06, lp.y) * step(lp.y, o0.y);
          float shade = sx * step(o0.y - 0.17, lp.y) * step(lp.y, o0.y - 0.06);
          nA = mix(nA, vec3(0.62, 0.6, 0.57), sill);
          nA *= 1.0 - 0.4 * shade * smoothstep(o0.y - 0.17, o0.y - 0.06, lp.y);
        }
        if (inOpen) {
          // Laibung: das Glas sitzt recess hinter der Fassade – Strahl bis zur Glasebene (echte Parallaxe)
          vec2 pg = lp + rd.xy * (recess / -rd.z);
          bool onGlass = pg.x > o0.x && pg.x < o1.x && pg.y > o0.y && pg.y < o1.y;
          if (!onGlass) {
            float rx = rd.x >= 0.0 ? max(rd.x, 1e-4) : min(rd.x, -1e-4);
            float ry = rd.y >= 0.0 ? max(rd.y, 1e-4) : min(rd.y, -1e-4);
            float tx = ((rx > 0.0 ? o1.x : o0.x) - lp.x) / rx;
            float ty = ((ry > 0.0 ? o1.y : o0.y) - lp.y) / ry;
            bool sideHit = tx < ty;
            float dep = clamp(-rd.z * min(tx, ty) / max(recess, 1e-3), 0.0, 1.0);
            nN = sideHit ? (rx > 0.0 ? -Tw : Tw) : (ry > 0.0 ? -Bw : Bw);
            nA = wallA * (1.0 - 0.35 * dep);
            nG = vec2(0.0);
          } else {
            float dEdge = min(min(pg.x - o0.x, o1.x - pg.x), min(pg.y - o0.y, o1.y - pg.y));
            float fr = 1.0 - smoothstep(0.06 - px, 0.06 + px, dEdge);
            float mx = (o0.x + o1.x) * 0.5;
            fr = max(fr, fLine(pg.x - mx, 0.035, px) * (wmat > 1.5 ? 1.0 : step(1.3, o1.x - o0.x)));
            if (wmat > 1.5) fr = max(fr, fLine(pg.y - (o0.y + 0.68 * (o1.y - o0.y)), 0.03, px));
            vec3 frameC = wmat > 1.5 ? vec3(0.86, 0.86, 0.84) : vec3(0.22, 0.23, 0.25);
            vec2 wob = (vec2(fHash(cid + 3.3 + bSeed), fHash(cid + 9.1 + bSeed)) - 0.5) * 0.006;
            nN = normalize(Nw + wob.x * Tw + wob.y * Bw);
            nG = vec2(0.0);
            nW = 1.0 - fr;
            nA = frameC * fr;
            nM = (wmat > 1.5 ? 0.0 : 0.85) * fr;
            nR = mix(0.03, 0.42, fr);
            nF0 = 0.045;
            vec3 room = fRoom(pg + vec2(roff, 0.0), rd, rcell, D, roomSeed, lit, lamp, dayL, cell.x);
            // Jalousie (Lamellen) bzw. Vorhänge hinter der Scheibe – innen von der Lampe, außen vom Tag beleuchtet
            float k4 = fHash(cid * 1.31 + bSeed * 0.17);
            float blindTop = o1.y - (o1.y - o0.y) * (k4 < 0.45 ? 0.0 : (k4 - 0.45) * 1.5);
            float blind = step(blindTop, pg.y);
            float curtain = (wmat > 1.5 && k4 > 0.2 && k4 < 0.55) ? max(step(pg.x, o0.x + 0.22), step(o1.x - 0.22, pg.x)) : 0.0;
            float slat = 0.75 + 0.25 * smoothstep(0.3, 0.7, abs(fract(pg.y * 22.0) - 0.5) * 2.0) * (1.0 - smoothstep(0.02, 0.05, px));
            vec3 blindC = (wmat > 1.5 ? vec3(0.82, 0.78, 0.7) : vec3(0.7, 0.72, 0.74)) * slat;
            vec3 curtC = mix(vec3(0.62, 0.26, 0.22), vec3(0.76, 0.72, 0.6), fHash(cid + 5.0)) * (0.82 + 0.18 * sin(pg.x * 40.0));
            room = mix(room, blindC * (lamp * lit * 0.4 + dayL * 1.4), blind);
            room = mix(room, curtC * (lamp * lit * 0.36 + dayL * 1.0), curtain);
            nE = room * glassT * (1.0 - fr);
          }
        }
      }
    }
    // Fern: Mittelwerte statt Einzelfenster
    vec3 fA = mix(wallA, wmat < 0.5 ? tint * 0.07 : vec3(0.0), coverage);
    vec3 fE = coverage * glassT * (litFrac * 0.34 * vec3(1.0, 0.74, 0.5) + vec3(dayL * 0.28)) * 0.9;
    float fW = wmat < 0.5 ? 1.0 : coverage;
    float fR = mix(wallR, 0.05, coverage);
    alb = mix(fA, nA, detail);
    bEmit = mix(fE, nE, detail);
    bWin = mix(fW, nW, detail);
    bRough = mix(fR, nR, detail);
    bMetal = nM * detail;
    bF0 = wmat < 0.5 ? mix(0.04, 0.24, min(uReflect, 1.0)) : 0.045;
    bF0 = mix(bF0, nF0, detail);
    Nb = normalize(mix(Nw, nN, detail));
    grad = mix(wallG, nG, detail);
  } else if (bKind < 1.5) {
    // Dach: Bitumenbahnen (1 m) mit Nahtwulst, Kiesflächen, Wasserflecken; nass mit Pfützen
    vec2 w = vFac;
    float n1 = fFbm(w * 0.16 + bSeed, px * 0.16);
    float n2 = fFbm(w * 2.2, px * 2.2);
    float gm = smoothstep(0.42, 0.58, n1 + 0.15 * (n2 - 0.5));
    float gk = 1.0 - smoothstep(0.02, 0.06, px);
    float gr = mix(0.5, fNoise(w * 26.0), gk);
    vec3 membrane = mix(vec3(0.075, 0.075, 0.085), tint * 0.3, 0.25) * (0.75 + 0.5 * n2);
    vec3 gravel = vec3(0.34, 0.32, 0.3) * (0.7 + 0.6 * gr) * (0.9 + 0.2 * n2);
    float seam = fLine(abs(fract(w.x + 0.5) - 0.5), 0.02, px) * (1.0 - gm);
    alb = mix(membrane, gravel, gm) * (1.0 + 0.25 * seam) * (0.85 + 0.3 * fFbm(w * 0.5 + 3.0, px * 0.5));
    bRough = mix(0.7, 0.95, gm);
    float e = max(px * 0.75, 0.002);
    float h0 = fRoofH(w, px, gm);
    grad = vec2(fRoofH(w + vec2(e, 0.0), px, gm) - h0, fRoofH(w + vec2(0.0, e), px, gm) - h0) / e;
    float pud = smoothstep(0.36, 0.28, n1) * uWet;
    alb *= (1.0 - 0.3 * uWet) * (1.0 - 0.45 * pud);
    bRough = mix(bRough * (1.0 - 0.45 * uWet), 0.05, pud);
    grad *= 1.0 - pud;
  } else {
    // Aufbauten, Geländer, Masten: matter Beton oder lackiertes Metall
    float n = fFbm(vFac * 1.1 + bSeed, px * 1.1);
    alb = tint * (0.8 + 0.35 * n);
    bRough = 0.5 + 0.3 * n;
    bMetal = 0.25;
    bRough *= 1.0 - 0.35 * uWet;
  }
  // Nässe auf Wänden: dunkler und glatter (nicht auf Glas)
  if (bKind < 0.5) {
    alb *= 1.0 - 0.22 * uWet * (1.0 - bWin);
    bRough = mix(bRough, bRough * 0.55, uWet * (1.0 - bWin));
  }
  // Licht aus den Räumen geht nur zum Teil durchs Glas (Fresnel: unter flachem Winkel spiegelt es fast nur)
  float cosV = clamp(dot(-Vw, Nb), 0.0, 1.0);
  bEmit *= 1.0 - (bF0 + (1.0 - bF0) * pow(1.0 - cosV, 5.0)) * bWin;
  diffuseColor.rgb = alb;
  bNw = normalize(Nb - grad.x * Tw - grad.y * Bw);
}
`;
