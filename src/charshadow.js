import * as THREE from 'three';
import { SUN_DIR } from './palette.js';

// Figurenschatten: Die Sonnenschattenkarte deckt die ganze Stadt ab (~15 cm pro Pixel) – eine Figur wäre darin nur
// ein Strich. Die Figur liegt deshalb auf einer eigenen Ebene (LAYER), die nur eine zweite, eng mitgeführte
// Schattenkarte sieht (wenige Millimeter pro Pixel, inkl. Umhang, Rock, Gleiter …). Das zweite Licht leuchtet nicht
// selbst (Stärke 0); im Shader wird sein Schatten mit dem der Sonne verrechnet.
// Die Abendsonne steht sehr tief (~9°) – ein exakter Figurenschatten wäre über 10 m lang und nur ein Strich.
// Der Figurenschatten fällt deshalb aus derselben Himmelsrichtung, aber steiler (ELEV): kürzer, gut lesbar,
// und er liegt nahe unter der Figur (hilft beim Landen).
const ELEV = (38 * Math.PI) / 180;
const DIR = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize().multiplyScalar(Math.cos(ELEV)).setY(Math.sin(ELEV));
export const LAYER = 2;

let patched = false;
function patchShaderChunk() {
  if (patched) return;
  patched = true;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const from = `		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif`;
  if (!chunk.includes(from)) {
    console.warn('Figurenschatten: three.js-Shaderabschnitt nicht gefunden – nur grobe Schatten');
    return;
  }
  THREE.ShaderChunk.lights_fragment_begin = chunk.replace(from, `${from}
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
		if ( receiveShadow ) {
			DirectionalLightShadow figShadow = directionalLightShadows[ 1 ];
			directLight.color *= getShadow( directionalShadowMap[ 1 ], figShadow.shadowMapSize, figShadow.shadowBias, figShadow.shadowRadius, vDirectionalShadowCoord[ 1 ] );
		}
		#endif`);
}

// Muss vor dem ersten Kompilieren der Materialien und direkt nach der Sonne in die Szene kommen (Lichtindex 1).
export function createCharacterShadow(scene, camera, { size = 2048, half = 3.4 } = {}) {
  patchShaderChunk();
  const light = new THREE.DirectionalLight('#ffffff', 0);
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  const sc = light.shadow.camera;
  sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
  sc.near = 1; sc.far = 700;
  sc.layers.set(LAYER);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 2;
  scene.add(light, light.target);
  camera.layers.enable(LAYER);
  return {
    light,
    // Schattenbox auf die Figur zentrieren
    update(focus) {
      light.target.position.copy(focus);
      light.position.copy(focus).addScaledVector(DIR, 260);
      light.target.updateMatrixWorld();
    },
  };
}

// alle Meshes einer Figur auf die Figurenebene legen (die Stadt-Schattenkarte sieht sie dann nicht mehr)
export function useCharacterLayer(...roots) {
  for (const r of roots) r.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) o.layers.set(LAYER); });
}
