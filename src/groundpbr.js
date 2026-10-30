// Hyper-Realistic-Mode: physikalisch basierter Boden – nur im PBR-Zwilling des Bodenmaterials (#ifdef STANDARD),
// der Cel-Look bleibt unberührt. Gleicher Bodenplan (Asphalt, Gehweg, Rasen, Wege, Markierungen), aber echte
// Oberflächen: Gehwegplatten mit Fugen, Asphalt mit Splitt, Flickstellen und Rissen, abgefahrene Markierungen, Rasen
// mit Halmstruktur und trockenen Flecken, Kieswege, Promenadenplatten, Sand mit Rippeln und Körnung, nasser Sand
// glänzend, dazu Rauheit je Material und Relief (Normalen aus einem Höhenfeld). Feine Muster gehen mit der
// Entfernung in ihren Mittelwert über (kein Flimmern).
// Ausgabe für die späteren Shader-Stufen: gRough (Rauheit), gNw (gestörte Weltnormale).

export const GROUND_PBR_PARS = /* glsl */ `
float gFbm(vec2 p, float px) {
  float v = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 4; i++) {
    v += a * mix(0.5, gNoise(p * f + float(i) * 17.3), 1.0 - smoothstep(0.3, 0.7, px * f));
    f *= 2.03;
    a *= 0.5;
  }
  return v / 0.9375;
}
float gSharp(float v) {
  float k = clamp(fwidth(v) * 1.5, 0.04, 0.5);
  return smoothstep(0.5 - k, 0.5 + k, v);
}
`;

export const GROUND_PBR_COLOR = /* glsl */ `
float gRough = 0.9;
vec3 gNw = vec3(0.0, 1.0, 0.0);
{
  vec2 w = vWorldP.xz;
  // Kanal: Boden ausschneiden, nur unter den Brücken bleibt die Straße
  if (w.x > uCanal.x && w.x < uCanal.z && w.y > uCanal.y && w.y < uCanal.w) {
    vec4 bd = abs(vec4(w.y) - uCanalBr);
    if (min(min(bd.x, bd.y), min(bd.z, bd.w)) > uCanalBrHalf) discard;
  }
  float d = length(w) - coastR(w);
  vec4 L = texture2D(uLayout, (w + uLayoutExt) / (2.0 * uLayoutExt));
  float m = min(L.r, min(L.g, L.b));
  float asphalt = clamp(L.r - m, 0.0, 1.0), lawn = clamp(L.g - m, 0.0, 1.0), path = clamp(L.b - m, 0.0, 1.0), mark = clamp(m, 0.0, 1.0);
  // Bodenplan nachschärfen (Texel ~0,4 m): harte Kanten an Bordstein, Rasen und Markierungen, in der Ferne weich
  asphalt = gSharp(asphalt); lawn = gSharp(lawn); path = gSharp(path); mark = gSharp(mark);
  vec2 fw2 = max(fwidth(w), vec2(1e-4));
  float px = max(fw2.x, fw2.y);
  float jk = 1.0 - smoothstep(0.02, 0.06, px);
  float n2 = gFbm(w * 2.5, px * 2.5), n0 = gFbm(w * 0.09 + 5.0, px * 0.09);
  // Gehweg: Betonplatten 60 × 60 cm mit Fugen
  vec2 sid = floor(w / 0.6);
  vec2 sd = (0.5 - abs(fract(w / 0.6) - 0.5)) * 0.6;
  float joint = 1.0 - smoothstep(0.004 - px * 0.5, 0.008 + px * 0.5, min(sd.x, sd.y));
  vec3 c = vec3(0.4, 0.385, 0.36) * (0.9 + 0.14 * gHash(sid)) * (0.85 + 0.3 * n2) * (0.9 + 0.2 * n0);
  c = mix(c, vec3(0.2, 0.19, 0.18), mix(0.03, joint, jk));
  float H = -0.004 * joint * jk;
  float rough = 0.82;
  // Asphalt: Splitt, Flickstellen, Risse
  float ak = 1.0 - smoothstep(0.008, 0.025, px);
  float agg = mix(0.5, gNoise(w * 47.0), ak);
  vec3 asph = vec3(0.068, 0.068, 0.072) * (0.7 + 0.45 * agg) * (0.86 + 0.28 * n2) * (0.85 + 0.3 * n0);
  float patchA = smoothstep(0.6, 0.63, gNoise(w * 0.07 + 3.0));
  asph = mix(asph, vec3(0.042, 0.042, 0.046) * (0.8 + 0.4 * agg), patchA);
  float crack = (1.0 - smoothstep(0.0, 0.018 + px * 0.5, abs(gNoise(w * 0.85 + 1.3) - 0.5))) * smoothstep(0.55, 0.72, gNoise(w * 0.17 + 7.0)) * (1.0 - smoothstep(0.03, 0.08, px));
  asph *= 1.0 - 0.55 * crack;
  float hA = 0.004 * agg * ak - 0.004 * crack;
  float rA = mix(0.88, 0.72, patchA);
  // Markierungen: Farbe, abgefahren
  float wear = smoothstep(0.1, 0.32, gNoise(w * 2.7 + 2.0) * 0.7 + agg * 0.3);
  vec3 paint = vec3(0.74, 0.73, 0.69) * (0.85 + 0.15 * n2);
  // Rasen: Halme, sattes und trockenes Grün, Flecken
  float g1 = gFbm(w * 0.3 + 2.0, px * 0.3), g2 = gFbm(w * 2.9, px * 2.9);
  float bk = 1.0 - smoothstep(0.006, 0.02, px);
  float blade = mix(0.5, gNoise(w * vec2(70.0, 64.0)) * 0.6 + gNoise(w * vec2(150.0, 140.0)) * 0.4, bk);
  vec3 grass = mix(vec3(0.06, 0.15, 0.03), vec3(0.15, 0.21, 0.055), g1);
  grass = mix(grass, vec3(0.2, 0.19, 0.08), smoothstep(0.62, 0.8, g2) * 0.55);
  grass *= 0.62 + 0.76 * blade;
  float hG = 0.012 * blade * bk + 0.02 * g2;
  // Kiesweg
  float peb = mix(0.5, gNoise(w * 28.0), 1.0 - smoothstep(0.015, 0.05, px));
  vec3 pathC = vec3(0.42, 0.38, 0.33) * (0.72 + 0.5 * peb) * (0.9 + 0.2 * n2);
  // nach Bodenplan mischen
  c = mix(c, grass, lawn); rough = mix(rough, 0.96, lawn); H = mix(H, hG, lawn);
  c = mix(c, pathC, path); rough = mix(rough, 0.95, path); H = mix(H, 0.006 * peb, path);
  c = mix(c, asph, asphalt); rough = mix(rough, rA, asphalt); H = mix(H, hA, asphalt);
  c = mix(c, mix(asph, paint, wear), mark); rough = mix(rough, mix(rA, 0.6, wear), mark); H = mix(H, hA + 0.0015 * wear, mark);
  // Teichgrund: dunkler, nasser Schlamm unter dem Wasserspiegel
  if (d < -60.0) {
    float k = smoothstep(-0.2, -0.7, vWorldP.y);
    c = mix(c, vec3(0.09, 0.075, 0.06), k);
    rough = mix(rough, 0.5, k);
  }
  // Küste: Promenadenplatten → Ufermauer → Sand mit Rippeln und Körnung → nasser Sand → Meeresgrund
  if (d > -46.0) {
    vec2 pd = (0.5 - abs(fract(w / 1.6) - 0.5)) * 1.6;
    float pj = 1.0 - smoothstep(0.005 - px * 0.5, 0.01 + px * 0.5, min(pd.x, pd.y));
    vec3 prom = vec3(0.5, 0.46, 0.42) * (0.88 + 0.16 * gHash(floor(w / 1.6))) * (0.88 + 0.24 * n2);
    prom = mix(prom, vec3(0.25, 0.23, 0.21), mix(0.02, pj, jk));
    float rip = 0.5 + 0.5 * sin(dot(w, vec2(0.7, 0.3)) * 1.7 + gNoise(w * 0.1) * 6.0);
    float grain = mix(0.5, gNoise(w * 90.0), 1.0 - smoothstep(0.004, 0.012, px));
    vec3 sand = vec3(0.47, 0.4, 0.31) * (0.86 + 0.08 * rip + 0.1 * n2) * (0.9 + 0.2 * grain);
    vec3 wetS = vec3(0.33, 0.27, 0.21) * (0.9 + 0.2 * n2);
    vec3 bed = mix(vec3(0.3, 0.25, 0.2), vec3(0.06, 0.06, 0.07), smoothstep(0.0, 40.0, d));
    float wetK = smoothstep(-5.0, -0.5, d);
    vec3 cc = bed;
    float cr = 0.6, ch = 0.02 * rip;
    if (d < -37.6) { cc = prom; cr = 0.78; ch = -0.004 * pj * jk; }
    else if (d < -36.8) { cc = vec3(0.36, 0.34, 0.32) * (0.85 + 0.3 * n2); cr = 0.8; ch = 0.0; }
    else if (d < 0.5) { cc = mix(sand, wetS, wetK); cr = mix(0.95, 0.32, wetK); ch = 0.03 * rip * (1.0 - wetK * 0.6) + 0.002 * grain; }
    float k = smoothstep(-48.0, -46.0, d);
    c = mix(c, cc, k);
    rough = mix(rough, cr, k);
    H = mix(H, ch, k);
  }
  // Regen: nasser, dunklerer, glatterer Boden; Pfützen spiegeln die Stadt (wie im Cel-Look), Tropfenringe
  if (uWet > 0.001 && d < 0.5) {
    float hard = clamp(asphalt + path + m, 0.0, 1.0);
    if (d > -46.0) hard = d < -37.6 ? 1.0 : 0.45;
    float pud = smoothstep(0.5, 0.68, gNoise(w * 0.11) * 0.65 + gNoise(w * 0.43 + 9.0) * 0.35) * hard;
    c *= 1.0 - uWet * (0.3 + 0.25 * hard + 0.2 * pud);
    rough = mix(rough, mix(0.42, 0.14, pud), uWet * hard);
    H *= 1.0 - uWet * pud;
    vec2 rp = (gRipple(w * 1.7, uTime) + gRipple(w * 2.6 + 13.0, uTime * 1.23 + 0.4)) * uWet;
    vec3 N = normalize(vec3(rp.x * 0.45, 1.0, rp.y * 0.45));
    vec3 V = normalize(vWorldP - cameraPosition);
    float fres = mix(0.08, 1.0, pow(clamp(1.0 - dot(-V, N), 0.0, 1.0), 4.0));
    float kk = uWet * hard * (0.22 + 0.78 * pud) * (0.3 + 0.7 * fres);
    vec3 refl;
    if (uReflOn > 0.5) {
      vec4 ruv = uReflMat * vec4(vWorldP, 1.0);
      ruv.xy += N.xz * ruv.w * 0.05;
      refl = texture2DProj(tRefl, ruv).rgb;
    } else {
      vec3 R = reflect(V, N);
      R.y = abs(R.y);
      refl = duskSky(R);
    }
    totalEmissiveRadiance += refl * kk * 0.8;
  }
  diffuseColor.rgb = c;
  gRough = rough;
  // Relief → Normale: Höhengradient aus den Bildschirmableitungen (Oberflächengradient nach Mikkelsen), begrenzt
  vec3 Ng = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
  vec3 dpx = dFdx(vWorldP), dpy = dFdy(vWorldP);
  vec3 r1 = cross(dpy, Ng), r2 = cross(Ng, dpx);
  float det = dot(dpx, r1);
  vec3 sg = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
  gNw = normalize(Ng + clamp(-sg / max(abs(det), 1e-8), vec3(-0.6), vec3(0.6)));
}
`;
