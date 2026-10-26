import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { CONFIG } from './config.js';

// Live-Tuning aller Gameplay-Werte (Taste G). Änderungen wirken sofort.
export function createTuning(game) {
  const gui = new GUI({ title: 'Tuning  (G schließt)' });
  gui.domElement.style.zIndex = 30;

  const ph = gui.addFolder('Physik');
  ph.add(CONFIG.physics, 'gravity', 4, 40, 0.5).name('Schwerkraft');
  ph.add(CONFIG.physics, 'dragQuad', 0, 0.01, 0.0001).name('Luftwiderstand');
  ph.add(CONFIG.player, 'jumpSpeed', 2, 20, 0.5).name('Sprungkraft');
  ph.add(CONFIG.player, 'airAccel', 0, 30, 0.5).name('Luftsteuerung');
  ph.add(CONFIG.player, 'swingAccel', 0, 40, 0.5).name('Schwung-Steuerung');

  const lo = gui.addFolder('Bewegung');
  lo.add(CONFIG.locomotion, 'walkSpeed', 1, 8, 0.1).name('Gehtempo');
  lo.add(CONFIG.locomotion, 'sprintSpeed', 4, 25, 0.5).name('Sprinttempo');
  lo.add(CONFIG.locomotion, 'walkAccel', 1, 40, 0.5).name('Beschl. Gehen');
  lo.add(CONFIG.locomotion, 'sprintAccel', 1, 40, 0.5).name('Beschl. Sprint');
  lo.add(CONFIG.locomotion, 'decel', 1, 40, 0.5).name('Abbremsen');
  lo.add(CONFIG.locomotion, 'turnWalk', 1, 20, 0.5).name('Drehen Gehen');
  lo.add(CONFIG.locomotion, 'turnSprint', 0.5, 15, 0.1).name('Drehen Sprint');
  lo.add(CONFIG.locomotion, 'chargeTime', 0.2, 3, 0.05).name('Aufladezeit (s)');
  lo.add(CONFIG.locomotion, 'chargeMax', 10, 50, 0.5).name('Supersprung max.');

  const da = gui.addFolder('Dash');
  da.add(CONFIG.dash, 'speed', 5, 60, 1).name('Dash-Tempo');
  da.add(CONFIG.dash, 'duration', 0.05, 1, 0.01).name('Dauer (s)');
  da.add(CONFIG.dash, 'cooldown', 0, 2, 0.05).name('Abklingzeit (s)');
  da.add(CONFIG.dash, 'cost', 0, 50, 1).name('Gasverbrauch');

  const gl = gui.addFolder('Gleiter');
  gl.add(CONFIG.glide, 'pitchBase', -0.6, 0.1, 0.01).name('Grund-Sinkwinkel');
  gl.add(CONFIG.glide, 'pitchDive', -1.4, -0.2, 0.01).name('Sturzflug (W)');
  gl.add(CONFIG.glide, 'pitchFlare', 0, 0.6, 0.01).name('Abfangen (S)');
  gl.add(CONFIG.glide, 'drag', 0.001, 0.03, 0.0005).name('Luftwiderstand');
  gl.add(CONFIG.glide, 'turnRate', 0.3, 4, 0.05).name('Wendigkeit');
  gl.add(CONFIG.glide, 'stallSpeed', 0, 20, 0.5).name('Strömungsabriss');

  const hk = gui.addFolder('Enterhaken');
  hk.add(CONFIG.hook, 'range', 30, 400, 5).name('Reichweite');
  hk.add(CONFIG.hook, 'speed', 50, 1500, 10).name('Hakengeschw.');
  hk.add(CONFIG.hook, 'reelAccel', 0, 120, 1).name('Winde: Zugkraft');
  hk.add(CONFIG.hook, 'reelMaxSpeed', 5, 120, 1).name('Winde: max. Geschw.');
  hk.add(CONFIG.hook, 'dualFactor', 0.3, 1.5, 0.05).name('Faktor 2 Haken');
  hk.add(CONFIG.hook, 'stiffness', 20, 600, 5).name('Seil-Steifigkeit');
  hk.add(CONFIG.hook, 'damping', 0, 60, 1).name('Seil-Dämpfung');
  hk.add(CONFIG.hook, 'maxStretch', 0, 6, 0.1).name('Max. Dehnung (m)');
  hk.add(CONFIG.hook, 'autoRetract').name('Seil auto. straffen');
  hk.add(CONFIG.hook, 'retractSpeed', 0, 40, 0.5).name('Einholgeschw.');
  hk.add(CONFIG.hook, 'releaseBoost', 0, 15, 0.5).name('Schwung beim Lösen');
  hk.add(CONFIG.hook, 'wrap').name('Seil um Kanten');

  const gs = gui.addFolder('Gas');
  gs.add(CONFIG.gas, 'infinite').name('Unendlich Gas');
  gs.add(CONFIG.gas, 'reelCost', 0, 30, 0.5).name('Verbrauch Winde');
  gs.add(CONFIG.gas, 'regen', 0, 60, 1).name('Regeneration');

  const wr = gui.addFolder('Wallrun');
  wr.add(CONFIG.wallrun, 'minEntrySpeed', 0, 30, 0.5).name('Mindestgeschw.');
  wr.add(CONFIG.wallrun, 'speed', 5, 70, 1).name('Laufgeschw.');
  wr.add(CONFIG.wallrun, 'accel', 5, 120, 1).name('Beschleunigung');
  wr.add(CONFIG.wallrun, 'impactConversion', 0, 1, 0.05).name('Aufprall-Umlenkung');
  wr.add(CONFIG.wallrun, 'gravityScale', 0, 1, 0.01).name('Schwerkraft-Faktor');
  wr.add(CONFIG.wallrun, 'climbSpeed', 0, 40, 0.5).name('Hochlauf-Geschw.');
  wr.add(CONFIG.wallrun, 'maxTime', 0.5, 20, 0.5).name('Max. Dauer (s)');
  wr.add(CONFIG.wallrun, 'jumpOut', 0, 40, 0.5).name('Wandsprung weg');
  wr.add(CONFIG.wallrun, 'jumpUp', 0, 30, 0.5).name('Wandsprung hoch');

  const cam = gui.addFolder('Kamera');
  cam.add(CONFIG.camera, 'fov', 50, 110, 1).name('Sichtfeld');
  cam.add(CONFIG.camera, 'fovSpeedBoost', 0, 50, 1).name('FOV bei Tempo');
  cam.add(CONFIG.camera, 'distance', 1.5, 15, 0.1).name('Abstand');
  cam.add(CONFIG.camera, 'sensitivity', 0.0005, 0.006, 0.0001).name('Mausempfindl.');
  cam.add(CONFIG.camera, 'invertY').name('Y invertieren');
  cam.add(CONFIG.camera, 'bob', 0, 2, 0.05).name('Kamera-Wippen');

  const gr = gui.addFolder('Grafik');
  gr.add(CONFIG.graphics, 'ink', 0, 1.5, 0.05).name('Tuschelinien');
  gr.add(CONFIG.graphics, 'bloom', 0, 2, 0.05).name('Bloom');
  gr.add(CONFIG.graphics, 'exposure', 0.4, 2, 0.05).name('Belichtung');
  gr.add(CONFIG.graphics, 'saturation', 0.5, 1.8, 0.02).name('Sättigung');

  const w = gui.addFolder('Welt');
  w.add(CONFIG.world, 'timeScale', 0.05, 1.5, 0.05).name('Zeitfaktor');
  w.add(CONFIG.world, 'fullscreen').name('Vollbild beim Start');
  w.add(CONFIG.world, 'seed', 1, 99999, 1).name('Stadt-Seed');
  w.add({ regen: () => game.regenerateCity() }, 'regen').name('Stadt neu generieren');
  w.add({ random: () => { CONFIG.world.seed = Math.floor(Math.random() * 99999) + 1; gui.controllersRecursive().forEach((c) => c.updateDisplay()); game.regenerateCity(); } }, 'random').name('Zufällige Stadt');

  for (const f of gui.folders) f.close();
  gui.hide();
  return gui;
}
