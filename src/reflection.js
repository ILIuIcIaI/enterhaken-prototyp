import * as THREE from 'three';

// Nasse Straßen spiegeln die Stadt: die Szene wird an der Straßenebene (y = 0) gespiegelt in eine halb so große Textur
// gerendert – wie three.js' Reflector, eine schräge Nahebene schneidet alles unterhalb der Straße weg. Der Boden-Shader
// (world.js) liest sie mit Wellenversatz. Läuft nur bei Nässe und eingeschalteten Spiegelungen. Im Hyper-Realistic-
// Mode spiegelt sie bei trockenem Wetter auf Meereshöhe (height = WATER_Y): dann zeigt das Meer die Stadt.
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

export class StreetReflection {
  // uniforms: { tRefl, uReflMat, uReflOn } des Bodens; hide(): Objekte, die nicht ins eigene Spiegelbild gehören
  constructor(renderer, scene, uniforms, hide) {
    this.renderer = renderer;
    this.scene = scene;
    this.uniforms = uniforms;
    this.hide = hide;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.cam = new THREE.PerspectiveCamera();
    this.height = 0; // Höhe der Spiegelebene
    uniforms.tRefl.value = this.rt.texture;
  }

  // Größe des Bildpuffers (Pixel) – gespiegelt wird in halber Auflösung, das wirkt ohnehin nass verschwommen
  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
  }

  render(camera) {
    const c = this.cam, r = this.renderer;
    // Kamera an der Ebene y = height spiegeln: Position, Blick und Oben
    const h = this.height;
    c.position.copy(camera.position);
    c.position.y = 2 * h - c.position.y;
    _look.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _look.y = -_look.y;
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    _up.y = -_up.y;
    c.up.copy(_up);
    c.lookAt(_target.copy(c.position).add(_look));
    c.fov = camera.fov;
    c.aspect = camera.aspect;
    c.near = camera.near;
    c.far = camera.far;
    c.layers.mask = camera.layers.mask;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    // Welt → Spiegeltextur (mit der normalen Projektion)
    this.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    // schräge Nahebene = Spiegelebene
    _plane.set(_up.set(0, 1, 0), -h).applyMatrix4(c.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const P = c.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + P[8]) / P[0], (Math.sign(_clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    P[2] = _clip.x;
    P[6] = _clip.y;
    P[10] = _clip.z + 1;
    P[14] = _clip.w;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();

    const hidden = this.hide().filter((o) => o && o.visible);
    for (const o of hidden) o.visible = false;
    const auto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false; // Schattenkarten aus dem letzten Bild reichen
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, c);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = auto;
    for (const o of hidden) o.visible = true;
  }
}
