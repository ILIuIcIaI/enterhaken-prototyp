# Grappling Hook – Gameplay Prototype

Third-person prototype: swing, glide, wall-run, grind and surf with two grappling hooks through a dense, procedurally
generated, dystopian high-rise city on an island – at any time of day, in sun or rain, in a cel-shaded anime look or
an optional hyper-realistic one. Ten playable characters, picked on the start screen and purely cosmetic. No levels,
no goals – just a sandbox for testing feel and physics.

**Current version: 0.8.0** · see [CHANGELOG.md](CHANGELOG.md) for changes

![Sitting on the lighthouse cliff at sunset, Hyper-Realistic Mode](docs/screenshots/sunset-lighthouse-sit.jpg)

| | |
|---|---|
| ![Rainy night: neon reflected in the wet streets](docs/screenshots/rain-night-sit.png) | ![Neon on wet asphalt](docs/screenshots/rain-night-street.jpg) |
| ![Surfing in the cel look, Wind Waker style](docs/screenshots/surf-windwaker.jpg) | ![Surfing in the Hyper-Realistic Mode: clear water](docs/screenshots/surf-clear-water.jpg) |
| ![The lighthouse island](docs/screenshots/lighthouse-cel.jpg) | ![Container ship](docs/screenshots/ship-closeup.jpg) |

![Cel look and Hyper-Realistic Mode at four times of day](docs/screenshots/compare-times.jpg)

![Landmarks of the island](docs/screenshots/landmarks.jpg)

![The ten playable characters](docs/screenshots/figuren.png)

| | |
|---|---|
| ![Belle from the front](docs/screenshots/figur-vorne.png) | ![Belle close-up](docs/screenshots/figur-gesicht.png) |
| ![Swinging, hand on the rope](docs/screenshots/schwingen.png) | ![Towed by an airplane](docs/screenshots/flugzeug.png) |
| ![Elevated train](docs/screenshots/zug.png) | ![Intersection with traffic lights](docs/screenshots/kreuzung.png) |
| ![Residential quarter with curved streets](docs/screenshots/wohnviertel.png) | ![Park with pond](docs/screenshots/park.png) |
| ![Waves on the beach](docs/screenshots/strand.png) | ![The island from above](docs/screenshots/insel.png) |
| ![Sprinting](docs/screenshots/sprint.png) | ![Gliding over the island](docs/screenshots/gleiten.png) |
| ![Character shadow with cape](docs/screenshots/schatten.png) | |

![Cloth physics while walking, sprinting, jumping and swinging](docs/screenshots/stoff.png)

![Landing at speed: shoulder roll into a slide](docs/screenshots/rolle-slide.png)

![Vertical wall run](docs/screenshots/wallrun.png)

## Getting started

Double-click **`start.bat`** – it starts a small local server (PowerShell, nothing to install) and opens
`http://localhost:8080/` in your browser. An internet connection is required (Three.js is loaded from a CDN).
Starting the game captures the mouse (pointer lock) – no fullscreen. Because Ctrl is the glider key, Ctrl+W could
close the tab; the browser asks before leaving the page mid-game. Fullscreen with keyboard lock (which blocks Ctrl+W
in Chrome/Edge) can be turned on in the tuning menu (World section). Browsers that refuse pointer lock (for example
embedded ones) keep the cursor visible; holding it at the left or right edge keeps turning the camera.

Alternatively: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Open`

The start screen shows the controls first; **Weiter: Figur wählen** leads to the character grid. Pick a character and
press **Los!** (or Enter). Esc pauses the game and opens the character grid again.

## Controls

| Input | Action |
|---|---|
| Mouse | Look around / aim |
| Hold left / right mouse button | Fire left / right hook, stays attached while held |
| W A S D | Walk · on a rope: pump the swing · during a wall run: W + view direction steers (look up = run up) |
| Shift | Hold on the ground: **sprint** (with momentum also across the water) · tap in the air: **dash** · hold in the air: **gas boost** |
| Space | Jump, during a wall run: wall jump with a flip · **hold** on a rope = winch pulls you to the anchor · on a rail: jump off |
| Ctrl (tap) | Toggle the **glider** in the air – view direction steers, W = dive, S = pull up · at an edge or a bench: sit down |
| S during a wall run | Let go of the wall |
| At a ledge | A / D shimmy · W / Space climb up · S let go · S + Space push off |
| R / T / C | Reset / slow motion / switch shoulder |
| G / H / P | Tuning menu / help / screenshot (saved to `screenshots/`) |
| F | Photo mode – time stops, free camera, five looks, Enter takes a photo |
| Esc | Pause menu: controls, character, settings |

## Mechanics

- **Walking & sprinting:** from walking (2.2 m/s) through jogging up to a sprint (9 m/s). Movement direction and body
  orientation are separate: the character turns toward the new direction instead of tilting her whole body; the faster it
  goes, the wider the arc. On sharp direction changes at full speed it brakes, turns around and pushes off in the
  new direction (turnaround). Releasing the keys out of a sprint plays a braking step.
- **Dash & gas boost:** tap Shift in the air for a short gas burst in the view direction (with cooldown); hold Shift
  for a continuous gas boost as in v0.2.0. Both use gas, which refills when you're not boosting.
- **Glider:** glowing wing membranes between arms and legs with a real flight model: lift perpendicular to the flight
  path depending on the angle of attack, drag, and stalling when pitched up too steeply. The view direction steers:
  the character banks into turns, diving builds speed, pulling up converts it back into height. Landing, wall-running or
  hooking in ends the glide.
- **Aiming matters:** the hook flies exactly to where the crosshair hits a building
  (green = within the 140 m range, red = too far).
- **Moving targets:** the elevated train and the airplanes can be hooked too – the anchor stays on the vehicle and
  the character gets towed along.
- **Solid vehicles:** the train, the airplanes, cars and buses all have collision – you can land on their roofs,
  ride along, run around on top and jump off with the vehicle's speed.
- **Rope physics:** point mass with gravity and air drag, slightly elastic rope (spring + damper, hard limit at 1.5 m
  of stretch), smooth reeling in, steering perpendicular to the rope, a small boost when letting go, ropes wrap
  around edges.
- **Wall run:** hitting a facade in mid-air automatically starts a wall run; wall jump with a flip. Running straight
  up, the character stands on the wall like in an anime, body sticking out sideways from the facade.
- **Landing at speed:** above about 38 km/h the character rolls over the shoulder. Holding a direction key turns the
  roll into a fast feet-first slide (about 12 m, steerable, then back into a run); without a key it stumbles forward
  with circling arms and catches itself after a few lunging steps. Touching down while the rope still pulls turns
  into a slide until the rope lifts you off again.
- **Grinding:** landing on a rail along its direction locks the feet onto it – viaduct rails and parapets, power
  lines, the roller-coaster track, the pier slide, neon tubes, the stadium roof ring, steel beams and tree branches.
  Downhill gets faster, uphill slower; Space jumps off, obstacles make the character jump in time.
- **Ledges:** falling against a wall whose roof edge is at chest to head height grabs the edge – shimmy, climb up,
  drop or push off.
- **Sitting:** standing still at an edge and looking out (or tapping Ctrl) sits the character down – on roofs and cliffs,
  on the harbor quay with the feet above the water, and on benches and stools at the fair.
- **Water:** with Shift and momentum the character sprints across the water (costs gas); hitting the water faster
  than it can run turns into surfing with bow waves and a wake – steer like on skis, too slow and it sinks in.
- **Roof fans and wind columns:** fans on flat roofs below 40 m launch you up. The rising wind streams mark the reach
  of their column: glide into one and it throws you up about 30 m; without the glider it only slows your fall.
- **Flow:** moving fast and cleanly fills a meter (wall runs, ledge climbs, rolls, perfect moments …); each of its
  three tiers refills gas faster. **Perfect moments** – a perfect rope release, a last-second save, a near miss –
  briefly slow time down with a camera zoom and a glitch effect.

## World

- **Natural island** (about 1 km across) with an irregular coastline, a beach that slopes down to the water behind
  a low sea wall, a waterfront promenade and a coastal ring road.
- **Time of day and weather:** morning, noon or evening, or a full day–night cycle in a little over 7 minutes; clear,
  cloudy or rain with wet, mirroring streets that dry slowly afterwards.
- **Landmarks:** a central mega tower, a construction skyscraper with turning tower cranes, a harbor with gantry
  cranes, detailed container ships (collision follows every container stack) and a bascule bridge, a rock island with a
  lighthouse, keeper's house and jetty (its beam only shines at night), an amusement pier (Ferris wheel, roller coaster,
  carousel, swing ride, pirate ship, drop tower, bumper cars, slide) with giant parade balloons, an airship with a
  landing deck, wind turbines, a neon tube around the elevated train, a tower with a huge hole, a stadium, a giant
  tree and a canal through downtown. Moving parts can be hooked and ridden.
- **Birds and pedestrians:** flocks that take off when you come close, about 150 people on sidewalks, the
  promenade, the fair and in parks.
- **Water in 3D:** the sea is a wave mesh around the camera (Gerstner waves plus surf that rolls up the beach),
  mirrors the evening sky, gets clearer in the shallows and foams at the shore; park ponds sit in real hollows with
  small ripples and lily pads.
- **City layout:** a grid downtown with high-rises; outside of it, residential quarters with curved streets, front
  yards and houses with gabled roofs facing the street; organic parks that spill across block borders, with
  winding paths, gentle hills and ponds.
- **Life in the streets:** about 200 cars and buses in many colors drive on the right, keep their distance, stop at
  traffic lights (each approach gets its own green phase) and wait at junctions without lights.
- **Elevated train:** a curved viaduct loop 24 m above the streets – high enough to swing underneath – with two
  stations; the train speeds up, brakes and stops at each station.
- **Airplanes:** three planes fly wide, calm loops over the island, each in its own altitude band above the
  buildings, so they never get close to each other; navigation lights and strobes at dusk.
- **Districts and building shapes:** towers, stepped high-rises, twin towers with a skybridge, spires, slab
  blocks, L-shapes, row houses and courtyard blocks; rooftop structures, water towers and antennas.

## Characters

All characters play identically – only the look differs. They come without weapons or items.

| Character | Series |
|---|---|
| Belle | Zenless Zone Zero |
| Rei Ayanami | Neon Genesis Evangelion |
| Makima | Chainsaw Man |
| Zero | Drakengard 3 |
| 2B | NieR:Automata |
| Joker | Persona 5 |
| Makoto Yuki | Persona 3 |
| Steve | Minecraft |
| Scientist | Half-Life |
| Jonesy | Fortnite |

- Every character is modeled from **signed distance fields** (`src/sdf.js`) and converted into soft, rounded meshes
  via marching cubes, in a cel-shaded look. The shared toolkit (`src/charkit.js`) builds one-piece bodies (male and
  female builds with their own proportions), garments fitted to the body, trousers, shoes and boots, hands, heads
  with painted faces and hair from merged strands; each character lives in its own file in `src/designs/`.
  Steve is built from pixel cubes like the original.
- **Cloth physics** (`src/cloth.js`): coat tails, hems, skirts, capes, dress panels, ties, bandana ends, long hair and
  braids are simulated (Verlet, 120 Hz); capes, skirts and coat tails move fully freely. Capsules around legs, hips
  and torso plus impenetrable body zones keep the fabric outside the body, tethers stop it from stretching. A gentle,
  steady breeze lets everything sway slightly even when standing still.
- **Character shadows** (`src/charshadow.js`): a second, tight shadow map follows the character, so its shadow shows
  the real silhouette – cape and coat tails included.

## Animation

- Arms, legs, torso, garments and hair are **skinned** (SkinnedMesh) – smooth joints instead of separate parts.
- Keyframe clips (`src/animations.js`), smoothed with Catmull-Rom splines and blended with a custom weighting system:
  idle, walk, jog and sprint (blended in phase sync, stride length = speed × cycle duration, so no foot sliding),
  turnaround, braking, jump, rising, apex, falling, fast falling, landing, superhero landing, sliding, swinging,
  winch, gas boost, dash, gliding, wall run, flip.
- Procedural layers (`src/motion.js`):
  - **Inertialization:** every switch between animations stores the offset to the previous pose and decays it
    smoothly – transitions are continuous in position and speed without anything lagging behind.
  - **Grappling arm:** firing a hook thrusts the arm toward the target; while attached, the hand holds the rope and
    the arm follows it (almost straight when taut, slightly bent when slack, a short jolt when the rope snaps tight).
  - **Secondary motion:** legs, free arms and the upper body swing along with the body's acceleration and rotation
    (damped springs with limited range – lively, but it can never flop over like a ragdoll).
  - The swing pose follows the position in the arc (downswing stretched, upswing with legs kicking forward).
  - Torso and head lean slightly into turns, the head looks toward the aim direction (on the ground only), hair
    swings along, the jacket hem flutters, the skirt halves follow the legs.

## Look

- Orange/purple evening sky with clouds, stars and a low sun by default – sky, light, haze and window lights follow
  the time of day and the weather; smog in the street canyons.
- Cel shading, ink lines from the depth buffer, bloom, outline shell around the character, detailed character shadows.
- Neon signs, billboards, glowing edges, aircraft warning lights, street lamps with light cones, rising sparks.
- **Hyper-Realistic Mode** (Settings → Graphics): physically based materials under a physical sky that also lights
  the scene; glass, concrete, brick and plaster facades with furnished rooms behind the windows, detailed ground,
  leafy trees, a sea that mirrors the city, a clear-water bow wave, MSAA, ambient occlusion, eye adaptation and AgX tone
  mapping. Each time of day has its own mood: an orange evening with the sun glittering across the water, a misty pastel
  morning, a crisp noon, a night of windows and neon. Characters keep fine outlines and a soft shadow edge (can be turned
  off). Switching the mode off brings back the cel look unchanged.

## Settings

Esc opens the menu with a **Settings** tab: graphics (resolution, shadows, ink lines, bloom, field of view,
reflections, speed lines, Hyper-Realistic Mode, anime look of the characters, camera shake, FPS counter), audio, world (time of day, day–night
cycle, weather), controls (mouse sensitivity, invert Y, aim assist – off by default) and gameplay (perfect-moment
slow motion, glitch effect, flow). Everything is saved in the browser.

## Tuning

All values live in `src/config.js` and can be changed live in-game with **G** – physics, movement (walk/sprint speed,
inertia, turning, turnaround), dash & gas boost, glider (angle of attack, lift, drag, banking), rope, gas, wall run,
camera, graphics and city seed – plus the landing roll and slide (threshold, speed, braking, slide friction).

## Structure

| File | Contents |
|---|---|
| `src/main.js` | Game loop (fixed 120 Hz physics, interpolated rendering), aiming, events, effects |
| `src/player.js` | Walk/sprint/turnaround, dash, gas boost, glider aerodynamics, elastic ropes, collision, wall run, grinding, ledges, water, roof fans |
| `src/character.js` | Skeleton, skinning, glider wings, animation weighting, procedural layer |
| `src/designs/` | One file per character (look, garments, hair, cloth), roster in `index.js` |
| `src/charkit.js` | Character toolkit: bodies, fitted garments, trousers, shoes, hands, heads, faces, hair, cloth setup |
| `src/cloth.js`, `src/charshadow.js` | Cloth and rope simulation with body colliders and wind · detailed character shadow |
| `src/sdf.js` | Distance fields (cones, ellipsoids, tori, smooth union), marching cubes, painting, skinning weights |
| `src/charGeo.js` | Geometry: skinned tubes, pleated skirt, head |
| `src/animations.js` | Poses and keyframe clips |
| `src/motion.js` | Inertialization, secondary motion springs, grappling arm |
| `src/hooks.js` | Hook projectile, anchor (also on moving vehicles), rope rendering |
| `src/city.js` | City: boxes (axis-aligned and rotated), houses with roofs, decor, grid index, raycasts, facade shader |
| `src/citygen.js` | City layout: grid, parks, curved residential streets, coastal ring road, viaduct |
| `src/roads.js`, `src/geom2d.js` | Road network graph · 2D curves, polylines, rotated rectangles, blobs |
| `src/terrain.js`, `src/groundmap.js` | Terrain heights (beach, hills, pond hollows) · ground map texture |
| `src/traffic.js` | Cars, buses, traffic lights |
| `src/transit.js` | Elevated train and airplanes as hookable moving targets, plus all other moving landmarks |
| `src/aerial.js`, `src/harbor.js`, `src/amusement.js` | Airship, parade balloons, wind turbines · ship routes, tower cranes, bascule bridge · fair rides |
| `src/ship.js`, `src/container.js` | Container ship plan, collision boxes and model · container texture atlas and geometry |
| `src/landmarks.js`, `src/pier.js` | Harbor, amusement pier, giant tree, turbine sites · pier visuals |
| `src/rock.js`, `src/islet.js` | Height field of the rock island (physics and mesh) · lighthouse, keeper's house, jetty, rock mesh |
| `src/neon.js`, `src/stadium.js` | Neon tube, hole tower and neon rings · stadium visuals |
| `src/grind.js`, `src/mover.js`, `src/fans.js` | Grind lines · moving collision objects · roof fans and wind streams |
| `src/life.js` | Bird flocks and pedestrians |
| `src/environment.js`, `src/settings.js` | Time of day, day–night cycle, weather · settings menu |
| `src/photo.js`, `src/moments.js`, `src/flow.js`, `src/idles.js` | Photo mode · perfect-moment slow motion · flow meter · idle animations |
| `src/world.js`, `src/palette.js` | Sky (also the physical one), haze, lighting, terrain mesh, sea and ponds, color palette |
| `src/reflection.js` | Mirror reflection for wet streets and, in the Hyper-Realistic Mode, the sea |
| `src/realism.js`, `src/facade.js`, `src/groundpbr.js`, `src/foliage.js` | Hyper-Realistic Mode: physically based twins, sky light, eye adaptation · facades · ground · foliage |
| `src/post.js`, `src/toon.js` | Ink lines, ambient occlusion, bloom, tone mapping, FXAA/MSAA, exposure meter · toon and outline materials |
| `src/camera.js` | Shoulder camera with collision, smoothing, tilt |
| `src/effects.js`, `hud.js`, `audio.js`, `tuning.js`, `input.js` | Particles/sparks/speed lines, rain, wake, HUD, sound, tuning, input |

Debug: `http://localhost:8080/?debug` starts right away without the menu (a click into the view captures the mouse); `window.game` is available in the
console, `window.dbg` (`src/debugtools.js`) renders character sheets, portraits, motion tests and posed scene shots
(`dbg.scene`, with time of day and weather – e.g. for comparing the cel look with the Hyper-Realistic Mode).
