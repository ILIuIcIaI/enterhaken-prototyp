import * as THREE from 'three';

// Entwicklerhilfen (nur mit ?debug): Bilder manuell takten, Ansichtsblätter der Figuren, Vorschaubilder.
export function installDebugTools(game) {
  const sky = () => game.scene.children.find((o) => o.material?.uniforms?.uSunStrength);
  const post = async (name, canvas, type = 'image/png') => {
    const b = await new Promise((r) => canvas.toBlob(r, type, 0.85));
    await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: b });
    return name;
  };
  const sim = (n, ms = 1000 / 60) => {
    let t = (game.last ?? 0) * 1000;
    for (let i = 0; i < n; i++) { t += ms; game.frame(t); }
  };
  let lit = false;
  const look = (pos, target, fov) => {
    const cam = game.camera;
    cam.position.copy(pos);
    studio(lit, target);
    sky().position.copy(cam.position);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.lookAt(target);
    game.aimMarker.group && (game.aimMarker.group.visible = false);
    game.post.render();
  };
  // Prüflicht: weiches Führungslicht von der Kamera aus, damit dunkle Kleidung im Ansichtsblatt lesbar ist
  const fill = new THREE.DirectionalLight('#fff3ea', 0);
  game.scene.add(fill, fill.target);
  const studio = (on, target) => {
    fill.intensity = on ? 1.7 : 0;
    if (on) { fill.position.copy(game.camera.position).add(new THREE.Vector3(0, 0.6, 0)); fill.target.position.copy(target); fill.target.updateMatrixWorld(); }
  };
  const restore = () => { studio(false); game.camera.fov = game.rig.fov; game.camera.updateProjectionMatrix(); };
  const pose = () => {
    game.input.keys.clear();
    for (const h of game.hooks) h.state = 'idle';
    game.spawn();
    sim(70);
  };
  // Ansichtsblatt: vorne, schräg, seitlich, hinten, Gesicht
  const sheet = async (name, views = null, { light = true } = {}) => {
    lit = light;
    const P = game.player, cv = game.renderer.domElement, V = P.pos.constructor;
    pose();
    const out = document.createElement('canvas');
    const list = views ?? [[0, 3.1, 0.95, 0.88, 30], [0.6, 3.1, 0.95, 0.88, 30], [Math.PI / 2, 3.1, 0.95, 0.88, 30], [Math.PI, 3.1, 0.95, 0.88, 30], [0.25, 0.95, 1.5, 1.44, 30]];
    out.width = 300 * list.length; out.height = 720;
    const g = out.getContext('2d');
    const sc = game.character.design.scale ?? 1;
    for (let i = 0; i < list.length; i++) {
      const [ang, dist, cy, ly, fov] = list[i];
      const a = P.facingYaw + ang, foot = P.pos.y - 0.82;
      look(new V(P.pos.x - Math.sin(a) * dist * sc, foot + cy * sc, P.pos.z - Math.cos(a) * dist * sc), new V(P.pos.x, foot + ly * sc, P.pos.z), fov);
      const sw = (cv.height * 300) / 720;
      g.drawImage(cv, (cv.width - sw) / 2, 0, sw, cv.height, i * 300, 0, 300, 720);
    }
    restore();
    return post(name + '.png', out);
  };
  // Vorschaubild für das Auswahlraster: nur die Figur vor einfarbigem Grund, der danach transparent wird
  const thumb = async (id, { w = 320, h = 480 } = {}) => {
    lit = true;
    game.setCharacter(id);
    const P = game.player, cv = game.renderer.domElement, V = P.pos.constructor, c = game.character;
    pose();
    const hidden = [];
    const inChar = (o) => { for (let p = o; p; p = p.parent) if (p === c.root || p === c.world) return true; return false; };
    game.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !inChar(o)) { o.visible = false; hidden.push(o); } });
    const bg = game.scene.background, fog = game.scene.fog;
    game.scene.background = new THREE.Color('#00ff00');
    game.scene.fog = null;
    // gleicher Maßstab für alle Figuren: 2,05 m Bildhöhe, gemeinsame Bodenlinie (größere Figuren wirken größer)
    const box = new THREE.Box3().setFromObject(c.root), H = 2.05, cy = box.min.y + H * 0.47;
    const dist = H / 2 / Math.tan((15 * Math.PI) / 180);
    const a = P.facingYaw + 0.42;
    look(new V(P.pos.x - Math.sin(a) * dist, cy + 0.08, P.pos.z - Math.cos(a) * dist), new V(P.pos.x, cy, P.pos.z), 30);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g = out.getContext('2d');
    const sw = (cv.height * w) / h;
    g.drawImage(cv, (cv.width - sw) / 2, 0, sw, cv.height, 0, 0, w, h);
    // Hintergrund (Farbe aus der Ecke, nach der Nachbearbeitung) ausstanzen; Kantenpixel entmischen
    const img = g.getImageData(0, 0, w, h), d = img.data, k = [d[0], d[1], d[2]];
    for (let i = 0; i < d.length; i += 4) {
      const al = Math.min(1, Math.max(0, (Math.hypot(d[i] - k[0], d[i + 1] - k[1], d[i + 2] - k[2]) - 25) / 45));
      d[i + 3] = Math.round(al * 255);
      if (al > 0 && al < 1) for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, Math.max(0, (d[i + j] - (1 - al) * k[j]) / al));
    }
    g.putImageData(img, 0, 0);
    for (const o of hidden) o.visible = true;
    game.scene.background = bg;
    game.scene.fog = fog;
    restore();
    return post('thumb-' + id + '.png', out);
  };
  // Nahaufnahmen an Gelenken (z. B. Handgelenk, Oberarm): joints = [[Gelenkname, Blickwinkel, Abstand], …]
  const closeup = async (name, joints, { posed = true } = {}) => {
    const P = game.player, cv = game.renderer.domElement, V = P.pos.constructor, c = game.character;
    lit = true;
    if (posed) pose();
    const out = document.createElement('canvas');
    out.width = 300 * joints.length; out.height = 360;
    const g = out.getContext('2d');
    joints.forEach(([j, ang, dist = 0.6, j2 = null], i) => {
      const t = c.joints[j].getWorldPosition(new V());
      if (j2) t.lerp(c.joints[j2].getWorldPosition(new V()), 0.5);
      const a = P.facingYaw + ang;
      look(new V(t.x - Math.sin(a) * dist, t.y + 0.05, t.z - Math.cos(a) * dist), t, 30);
      const sw = (cv.height * 300) / 360;
      g.drawImage(cv, (cv.width - sw) / 2, 0, sw, cv.height, i * 300, 0, 300, 360);
    });
    restore();
    return post(name + '.png', out);
  };
  // Bewegungstest für Stoff und Animation: Gehen, Sprinten, Sprung, Schwingen am Seil – je ein Bild von der Seite
  const motion = async (name) => {
    const P = game.player, cv = game.renderer.domElement, V = P.pos.constructor, inp = game.input;
    lit = true;
    pose();
    const shots = [];
    const snap = (ang, dist = 3.4) => {
      const a = P.facingYaw + ang, c = game.renderPos ?? P.pos;
      look(new V(c.x - Math.sin(a) * dist, c.y + 0.2, c.z - Math.cos(a) * dist), new V(c.x, c.y - 0.05, c.z), 34);
      const sw = (cv.height * 300) / 400;
      const o = document.createElement('canvas'); o.width = 300; o.height = 400;
      o.getContext('2d').drawImage(cv, (cv.width - sw) / 2, 0, sw, cv.height, 0, 0, 300, 400);
      shots.push(o);
    };
    const run = (n, keys, fn) => { inp.keys.clear(); for (const k of keys) inp.keys.add(k); for (let i = 0; i < n; i++) { fn?.(i); sim(1); } };
    game.rig.yaw = P.facingYaw + Math.PI; game.rig.pitch = -0.1;
    run(45, ['KeyW']); snap(Math.PI / 2);
    run(70, ['KeyW', 'ShiftLeft']); snap(Math.PI / 2); snap(Math.PI + 0.4);
    run(8, ['KeyW', 'ShiftLeft'], (i) => { if (i === 0) inp.pressedKeys.add('Space'); }); run(10, ['KeyW', 'ShiftLeft', 'Space']); snap(Math.PI / 2);
    // Schwingen: nach oben vorne zielen, linken Haken schießen und halten
    game.rig.pitch = 0.75;
    run(1, ['KeyW'], () => { inp.mouse.pressed[0] = true; inp.mouse.down[0] = true; });
    run(55, ['KeyW']); snap(Math.PI / 2); run(25, ['KeyW']); snap(-Math.PI / 2);
    inp.mouse.down[0] = false; inp.mouse.released[0] = true; run(1, []);
    run(30, []); snap(Math.PI / 2);
    inp.keys.clear();
    restore();
    const out = document.createElement('canvas'); out.width = 300 * shots.length; out.height = 400;
    shots.forEach((o, i) => out.getContext('2d').drawImage(o, i * 300, 0));
    return post(name + '.png', out);
  };
  // nächstes großes Dach mit freier Sicht zur Sonne (für Schattenbilder); stellt die Figur dorthin
  const sunRoof = async () => {
    const { SUN_DIR } = await import('./palette.js');
    const P = game.player, V = P.pos.constructor, city = game.city, out = [];
    city.query(P.pos.x - 300, P.pos.z - 300, P.pos.x + 300, P.pos.z + 300, out);
    const d = (b) => Math.hypot((b.minX + b.maxX) / 2 - P.pos.x, (b.minZ + b.maxZ) / 2 - P.pos.z);
    const roofs = out.filter((b) => !b.noRender && b.maxX - b.minX > 12 && b.maxZ - b.minZ > 12 && b.maxY > 15).sort((a, b) => d(a) - d(b));
    for (const b of roofs) {
      const o = new V((b.minX + b.maxX) / 2, b.maxY + 0.5, (b.minZ + b.maxZ) / 2);
      if (city.raycast(o, SUN_DIR.clone(), 400) || city.raycast(o.clone().setY(b.maxY + 2), SUN_DIR.clone(), 400)) continue;
      P.reset(o.clone().setY(o.y + 0.4), P.facingYaw);
      game.renderPos.copy(P.pos);
      sim(60);
      return o;
    }
    return null;
  };
  window.dbg = { sim, sheet, thumb, look, post, pose, restore, closeup, motion, sunRoof };
  window.sim = sim;
}
