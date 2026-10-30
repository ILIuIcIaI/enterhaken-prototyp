import * as THREE from 'three';
import { setRealistic } from './toon.js';
import { SKY, updatePhysicalSky } from './palette.js';

// Hyper-Realistic-Mode (Einstellungen → Grafik): physikalisch basierte Materialien statt Cel-Shading, beleuchtet vom
// echten Himmel. Jedes Toon-Material bekommt einen PBR-Zwilling (MeshStandardMaterial mit Rauheit und Metall, gleiche
// Farbe, Textur und Shader-Erweiterungen, Hinweise aus userData.pbr); umgeschaltet wird pro Mesh, die Toon-Materialien
// bleiben unverändert erhalten – ausgeschaltet sieht alles aus wie vorher.
// Der Himmel (ohne Sonnenscheibe – die ist das gerichtete Licht) und ein Boden mit geschätzter Helligkeit werden
// regelmäßig in eine vorgefilterte Umgebungskarte (PMREM) gerendert: diffuses Himmelslicht von oben, dunkler Boden von
// unten, Spiegelungen auf Lack, Glas und Metall. Das Hemisphärenlicht übernimmt dann fast nichts mehr.

const REFRESH = 0.5; // s zwischen zwei Aufnahmen des Himmels (Tageszeit und Wetter ändern sich langsam)
const HEMI = 0.12;   // Rest des Hemisphärenlichts neben der Umgebungskarte
const ENV = 1.0;     // Stärke der Umgebungskarte
// Augenadaption: Zielhelligkeit am hellen Tag, Grenzen des Ausgleichs
const ADAPT_REF = 0.13, ADAPT_MIN = 0.6, ADAPT_MAX = 2.6;
const MSAA = 4;      // Mehrfachabtastung der Szene (statt FXAA)

const GROUND_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// Boden unter dem Horizont, weich in den Himmel überblendet
const GROUND_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec3 vDir;
void main() {
  float a = smoothstep(0.03, -0.08, normalize(vDir).y);
  gl_FragColor = vec4(uColor, a);
}`;

const PROTO_HOOK = THREE.Material.prototype.onBeforeCompile;
const _c = new THREE.Color();
const _rain = new THREE.Color();

// three.js r160: AgX endet ohne Klemmen – nach der Rec.2020→sRGB-Matrix bleiben bei dunklen, satten Farben leicht
// negative Werte, die sRGB-Kurve (pow einer negativen Zahl) macht daraus NaN: Solche Pixel wurden schwarz und
// flackerten mit dem Filmkorn Bild für Bild. Ab r161 behoben, hier nachgerüstet (vor dem ersten Kompilieren).
// Greift der Patch nicht (andere three-Version), bleibt der Modus beim sicheren ACES.
const AGX_END = 'color = LINEAR_REC2020_TO_LINEAR_SRGB * color;\n\treturn color;';
const AGX_OK = THREE.ShaderChunk.tonemapping_pars_fragment.includes(AGX_END);
if (AGX_OK) {
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(AGX_END,
    'color = LINEAR_REC2020_TO_LINEAR_SRGB * color;\n\tcolor = clamp( color, 0.0, 1.0 );\n\treturn color;');
}
const REAL_TONEMAP = AGX_OK || Number(THREE.REVISION) >= 161 ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
if (REAL_TONEMAP !== THREE.AgXToneMapping) console.warn('Hyper-Realistic-Mode: AgX-Tonemapping nicht nachrüstbar – nutze ACES');

export class Realism {
  constructor(renderer, scene, world, post) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.post = post;
    this.on = false;
    this.exposure = 1; // Augenadaption (× Belichtung der Tageszeit)
    // schwache Zuordnungen: Zwillinge alter Städte und Figuren räumt der Browser mit ihren Originalen weg
    this.twins = new WeakMap(); // Toon → PBR
    this.back = new WeakMap();  // PBR → Toon
    this.pairs = [];            // [WeakRef Toon, WeakRef PBR] zum Abgleichen
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.timer = 0;
    this.envScene = new THREE.Scene();
    const sky = new THREE.Mesh(world.sky.geometry, world.sky.material);
    sky.frustumCulled = false;
    this.groundMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() } },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), this.groundMat);
    ground.frustumCulled = false;
    this.envScene.add(sky, ground);
  }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    setRealistic(on);
    const r = this.renderer;
    r.toneMapping = on ? REAL_TONEMAP : THREE.ACESFilmicToneMapping;
    this.post.metering = on;
    this.post.luminance = null;
    this.post.setAntialias(on ? MSAA : 0);
    this.world.wet.uReal.value = on ? 1 : 0; // Wasser physikalisch
    SKY.uRealSky.value = on ? 1 : 0;         // Himmel physikalisch (Preetham)
    if (on) updatePhysicalSky(this.cloud ?? 0);
    // Sonnenschatten über die doppelte Fläche (die Karte ist dafür doppelt so groß, settings.js) – auch entferntere
    // Häuser werfen Schatten; gleiche Texelgröße, das Einrasten in world.js passt weiter
    const sc = this.world.sun.shadow.camera, ext = on ? 300 : 150;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.updateProjectionMatrix();
    this.exposure = 1;
    this.swap();
    if (on) this.capture();
    this.scene.environment = on && this.envRT ? this.envRT.texture : null;
  }

  // PBR-Zwilling eines Toon-Materials (einmal angelegt, danach wiederverwendet)
  twin(m) {
    let p = this.twins.get(m);
    if (p) return p;
    const h = m.userData.pbr ?? {};
    const Mat = h.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    p = new Mat({
      name: m.name,
      color: m.color,
      map: m.map,
      emissive: m.emissive,
      emissiveIntensity: m.emissiveIntensity,
      emissiveMap: m.emissiveMap,
      alphaMap: m.alphaMap,
      normalMap: m.normalMap,
      bumpMap: h.bumpMap ?? m.bumpMap,
      bumpScale: h.bumpScale ?? m.bumpScale,
      vertexColors: m.vertexColors,
      side: m.side,
      transparent: m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      depthWrite: m.depthWrite,
      depthTest: m.depthTest,
      blending: m.blending,
      polygonOffset: m.polygonOffset,
      polygonOffsetFactor: m.polygonOffsetFactor,
      polygonOffsetUnits: m.polygonOffsetUnits,
      fog: m.fog,
      toneMapped: m.toneMapped,
      flatShading: !!m.userData.flat,
      roughness: h.roughness ?? 0.72,
      metalness: h.metalness ?? 0,
      envMapIntensity: ENV * (h.env ?? 1),
    });
    if (h.physical) {
      p.clearcoat = h.clearcoat ?? 0;
      p.clearcoatRoughness = h.clearcoatRoughness ?? 0.08;
      if (h.sheen) {
        p.sheen = h.sheen;
        p.sheenRoughness = h.sheenRoughness ?? 0.6;
        p.sheenColor.set(h.sheenColor ?? '#ffffff');
      }
    }
    p.userData = m.userData; // gemeinsame Uniforms (z. B. Fensterlicht der Gebäude)
    if (h.hook) {
      // eigener Shader nur für den PBR-Zwilling (z. B. Blattwerk), Umriss per Alpha-to-Coverage
      p.onBeforeCompile = h.hook;
      p.customProgramCacheKey = () => h.key;
      p.alphaToCoverage = !!h.a2c;
    } else if (m.onBeforeCompile !== PROTO_HOOK && m.customProgramCacheKey() !== 'toon-rim') {
      // eigene Shader-Erweiterungen übernehmen (Boden, Fassaden …), nicht aber das Randlicht des Cel-Looks
      p.onBeforeCompile = m.onBeforeCompile;
      p.customProgramCacheKey = m.customProgramCacheKey;
    }
    this.twins.set(m, p);
    this.back.set(p, m);
    this.pairs.push([new WeakRef(m), new WeakRef(p)]);
    return p;
  }

  // Materialien aller Meshes passend zum Modus setzen – läuft jedes Bild, damit auch neu erzeugte Objekte
  // (neue Stadt, andere Figur, Effekte) sofort stimmen
  swap() {
    const on = this.on;
    const pick = (m) => (on ? (m.isMeshToonMaterial ? this.twin(m) : m) : (this.back.get(m) ?? m));
    this.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) {
        if (m.some((x) => pick(x) !== x)) o.material = m.map(pick);
      } else {
        const n = pick(m);
        if (n !== m) o.material = n;
      }
    });
  }

  // veränderliche Eigenschaften vom Toon-Material übernehmen (Code hält oft das Original und färbt es um)
  sync() {
    for (let i = this.pairs.length - 1; i >= 0; i--) {
      const m = this.pairs[i][0].deref(), p = this.pairs[i][1].deref();
      if (!m || !p) {
        this.pairs.splice(i, 1);
        continue;
      }
      p.color.copy(m.color);
      p.emissive.copy(m.emissive);
      p.emissiveIntensity = m.emissiveIntensity;
      p.opacity = m.opacity;
      p.visible = m.visible;
      p.depthWrite = m.depthWrite;
      if (p.map !== m.map || p.transparent !== m.transparent || p.side !== m.side || p.alphaTest !== m.alphaTest) {
        p.map = m.map;
        p.transparent = m.transparent;
        p.side = m.side;
        p.alphaTest = m.alphaTest;
        p.needsUpdate = true;
      }
    }
  }

  // Himmel ohne Sonnenscheibe plus Boden in die Umgebungskarte
  capture() {
    const w = this.world, u = w.sky.material.uniforms, sun = u.uSunStrength.value;
    // Bodenhelligkeit: mittlere Albedo der Stadt (~0,14) unter Sonne/Mond und Himmel
    const lift = Math.max(0, this.lightUp ?? 0.3);
    const g = this.groundMat.uniforms.uColor.value;
    g.copy(w.sun.color).multiplyScalar((w.sun.intensity * lift) / Math.PI);
    _c.copy(SKY.uSkyHigh.value).lerp(SKY.uSkyZenith.value, 0.4);
    g.add(_c).multiplyScalar(0.14);
    // nachts warmes Streulicht der beleuchteten Straßen von unten (wie auf Langzeitbelichtungen einer Stadt)
    const night = 1 - SKY.uSunUp.value;
    g.r += 0.011 * night;
    g.g += 0.0068 * night;
    g.b += 0.0036 * night;
    if (!Number.isFinite(g.r + g.g + g.b)) g.setRGB(0, 0, 0);
    u.uSunStrength.value = 0;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    u.uSunStrength.value = sun;
    this.envRT?.dispose();
    this.envRT = rt;
    if (this.on) this.scene.environment = rt.texture;
  }

  // Regenstriche: im Hyper-Realistic-Mode so hell wie das Umgebungslicht – die Augenadaption hellt die Nacht auf, der
  // Regen soll dabei nicht als weiße Striche leuchten
  rainColor(base) {
    if (!this.on) return base;
    return _rain.copy(base).multiplyScalar(0.7 * Math.min(1, 0.9 / this.exposure));
  }

  // Augenadaption wie bei einer Kamera: gemessene mittlere Bildhelligkeit gegen einen Zielwert, der der Tageszeit
  // folgt (die Nacht bleibt dunkler als der Tag); nur teilweise ausgeglichen und begrenzt, ins Helle schneller als
  // ins Dunkle
  adapt(dt) {
    const L = this.post.luminance;
    if (!L || !(dt > 0)) return;
    const sky = SKY.uSkyHigh.value, Lsky = 0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b;
    const ref = ADAPT_REF * Math.pow(Math.min(1, Math.max(Lsky, 1e-4) / 0.25), 0.4);
    const target = Math.min(ADAPT_MAX, Math.max(ADAPT_MIN, Math.pow(ref / L, 0.5)));
    const rate = target < this.exposure ? 2.2 : 1.1;
    this.exposure += (target - this.exposure) * (1 - Math.exp(-rate * dt));
  }

  // nach Environment.update: Licht anpassen, Umgebungskarte auffrischen
  update(dt, lightDir, cloud = 0) {
    const mood = SKY.uDawn.value, gold = SKY.uGold.value;
    this.swap();
    if (!this.on) return;
    this.cloud = cloud;
    updatePhysicalSky(cloud);
    this.sync();
    this.lightUp = lightDir.y;
    this.world.hemi.intensity *= HEMI;
    // Mondlicht: im Cel-Look bewusst hell (Formen lesbar), real viel schwächer – die Augenadaption hellt nachts auf
    this.world.sun.intensity *= (0.35 + 0.65 * SKY.uSunUp.value) * (1 + 0.55 * mood + 0.12 * gold);
    // Wolken schlucken das direkte Licht: bewölkt weiche Schatten, bei Regen praktisch keins mehr – sonst glänzen
    // nasse Flächen unter geschlossener Wolkendecke im Sonnen- bzw. Mondlicht
    this.world.sun.intensity *= 1 - 0.92 * cloud * cloud;
    // klare Luft: weniger Dunst als im Cel-Look (Fernsicht), bei Bewölkung und Regen bleibt er
    this.scene.fog.density *= (0.65 + 0.35 * cloud) * (1 + 0.55 * mood + 0.25 * gold); // Morgendunst, Abenddunst
    this.adapt(dt);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = REFRESH;
      this.capture();
    }
  }
}
