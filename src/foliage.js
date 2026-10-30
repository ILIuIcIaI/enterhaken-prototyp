// Hyper-Realistic-Mode: Blattwerk für Baumkronen (nur im PBR-Zwilling, toonMaterial pbr.hook). Aus glatten Kronen
// werden Blattbüschel: 3D-Rauschen in Weltkoordinaten gibt hellere Büschel mit dunklen Lücken, gewellte Normalen
// (das Licht modelliert die Büschel), Gegenlicht scheint durch die Blätter, und am Umriss franst die Krone aus –
// über Alpha-to-Coverage, damit die Kanten mit der Mehrfachabtastung glatt bleiben.

const LEAF_PARS = /* glsl */ `
varying vec3 vLeafP;
float lHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lHash(i), lHash(i + vec3(1, 0, 0)), f.x), mix(lHash(i + vec3(0, 1, 0)), lHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lHash(i + vec3(0, 0, 1)), lHash(i + vec3(1, 0, 1)), f.x), mix(lHash(i + vec3(0, 1, 1)), lHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float lLeaves(vec3 p) { return lNoise(p * 2.3) * 0.6 + lNoise(p * 6.5 + 3.1) * 0.4; }
`;

export function leafHook(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLeafP;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 lp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  #endif
  vLeafP = (modelMatrix * lp).xyz;
}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${LEAF_PARS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float leafN = lLeaves(vLeafP);
float leafA = 1.0;
diffuseColor.rgb *= 0.5 + 0.8 * leafN;
diffuseColor.rgb *= vec3(0.96 + 0.1 * lNoise(vLeafP * 0.7), 1.0, 0.92 + 0.12 * lNoise(vLeafP * 0.5 + 7.0));`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // Büschelrelief: Gradient des Rauschens (Weltraum) in die Normale
  float e = 0.06;
  vec3 g = vec3(lLeaves(vLeafP + vec3(e, 0.0, 0.0)), lLeaves(vLeafP + vec3(0.0, e, 0.0)), lLeaves(vLeafP + vec3(0.0, 0.0, e))) - leafN;
  vec3 gv = (viewMatrix * vec4(g / e, 0.0)).xyz;
  normal = normalize(normal - gv * 0.09);
  // Umriss ausfransen: je flacher der Blick über die Krone, desto mehr Lücken (feines Rauschen = einzelne Blätter)
  float facing = abs(dot(normal, normalize(vViewPosition)));
  float edgeN = lNoise(vLeafP * 11.0) * 0.55 + leafN * 0.45;
  leafA = smoothstep(0.0, 0.12, edgeN - (0.55 - facing) * 1.25);
  diffuseColor.rgb *= 0.75 + 0.25 * smoothstep(0.1, 0.6, facing); // Kroneninneres am Rand dunkler
}`)
    // three.js setzt bei undurchsichtigen Materialien Alpha = 1 – für Alpha-to-Coverage den Blattwert ausgeben
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
gl_FragColor.a = leafA;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
{
  // Gegenlicht scheint durch die Blätter (Sonne hinter der Krone)
  float back = pow(clamp(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += diffuseColor.rgb * directionalLights[0].color * back * 0.22 * (0.4 + 0.6 * leafN);
}
#endif`);
}

// Borke für Baumstämme: senkrechte Furchen (in Weltkoordinaten), Farbe und Relief
export function barkHook(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLeafP;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 lp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  #endif
  vLeafP = (modelMatrix * lp).xyz;
}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${LEAF_PARS}
float lBark(vec3 p) { return lNoise(vec3(p.x * 9.0, p.y * 1.4, p.z * 9.0)) * 0.7 + lNoise(p * 23.0) * 0.3; }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float barkN = lBark(vLeafP);
diffuseColor.rgb *= 0.55 + 0.7 * barkN;`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float e = 0.02;
  vec3 g = vec3(lBark(vLeafP + vec3(e, 0.0, 0.0)), lBark(vLeafP + vec3(0.0, e, 0.0)), lBark(vLeafP + vec3(0.0, 0.0, e))) - barkN;
  normal = normalize(normal - (viewMatrix * vec4(g / e, 0.0)).xyz * 0.012);
}`);
}

// Fels der Leuchtturm-Insel: Gesteinsschichten, Risse und Körnung (Farbe und Relief in Weltkoordinaten), auf den grünen
// Facetten Gras, an der Wasserlinie nass, dunkel und glänzend
export function rockHook(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLeafP;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vLeafP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
${LEAF_PARS}
float rStrata(vec3 p) { return lNoise(vec3(p.x * 0.16, p.y * 1.5 + 1.6 * lNoise(p * 0.21), p.z * 0.16)); }
vec3 rH3(vec3 p) { return vec3(lHash(p), lHash(p + 19.3), lHash(p + 41.7)); }
// Bruchkanten: Abstand zur nächsten Voronoi-Grenze (flach gestauchte Zellen, wie Schichtgestein)
float rCrack(vec3 p) {
  p *= vec3(0.3, 0.62, 0.3);
  vec3 ip = floor(p), fp = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 o = vec3(float(i), float(j), float(k)), r = o + rH3(ip + o) - fp;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return 1.0 - smoothstep(0.0, 0.05, sqrt(d2) - sqrt(d1));
}
float rGrain(vec3 p) { return lNoise(p * 7.0) * 0.55 + lNoise(p * 19.0) * 0.45; }
`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float rH = 0.0;
float rGreen = smoothstep(0.02, 0.07, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
float rWet = 1.0 - smoothstep(-1.45, -0.55, vLeafP.y + (lNoise(vLeafP * 1.1) - 0.5) * 0.7);
{
  float rc = rCrack(vLeafP), rs = rStrata(vLeafP), rg = rGrain(vLeafP);
  rH = rs * 0.34 - rc * 0.1 + rg * 0.07;
  vec3 rock = vec3(0.62 + 0.62 * rs) * (0.82 + 0.36 * rg) * (1.0 - 0.3 * rc);
  // Halme und helle, trockene Stellen im Gras
  float blade = lNoise(vLeafP * vec3(24.0, 6.0, 24.0)) * 0.6 + lNoise(vLeafP * 2.1) * 0.4;
  diffuseColor.rgb *= mix(rock, vec3(0.55 + 0.9 * blade), rGreen);
  diffuseColor.rgb *= mix(1.0, 0.42, rWet * (1.0 - rGreen));
}`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.24, rWet);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // Relief aus den Bildschirmableitungen der Höhe (Oberflächengradient, begrenzt)
  vec3 dpx = dFdx(vLeafP), dpy = dFdy(vLeafP), Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 r1 = cross(dpy, Nw), r2 = cross(Nw, dpx);
  float det = dot(dpx, r1);
  vec3 sg = sign(det) * (dFdx(rH) * r1 + dFdy(rH) * r2);
  vec3 gw = clamp(-sg / max(abs(det), 1e-8), vec3(-0.7), vec3(0.7)) * (1.0 - rGreen * 0.7);
  normal = normalize(normal + (viewMatrix * vec4(gw, 0.0)).xyz);
}`);
}
