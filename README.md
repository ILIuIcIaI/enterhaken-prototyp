# Grappling Hook – Gameplay Prototype

Third-person prototype: swing, glide and wall-run with two grappling hooks through a dense, procedurally generated,
dystopian high-rise city on an island at dusk. The player character is an anime-style girl named Kaia. No levels,
no goals – just a sandbox for testing feel and physics.

**Current version: 0.5.2** · see [CHANGELOG.md](CHANGELOG.md) for changes

| | |
|---|---|
| ![Kaia from the front](docs/screenshots/figur-vorne.png) | ![Kaia close-up](docs/screenshots/figur-gesicht.png) |
| ![Swinging, hand on the rope](docs/screenshots/schwingen.png) | ![Towed by an airplane](docs/screenshots/flugzeug.png) |
| ![Elevated train](docs/screenshots/zug.png) | ![Intersection with traffic lights](docs/screenshots/kreuzung.png) |
| ![Residential quarter with curved streets](docs/screenshots/wohnviertel.png) | ![Park with pond](docs/screenshots/park.png) |
| ![Waves on the beach](docs/screenshots/strand.png) | ![The island from above](docs/screenshots/insel.png) |
| ![Sprinting](docs/screenshots/sprint.png) | ![Gliding over the island](docs/screenshots/gleiten.png) |

## Getting started

Double-click **`start.bat`** – it starts a small local server (PowerShell, nothing to install) and opens
`http://localhost:8080/` in your browser. An internet connection is required (Three.js is loaded from a CDN).
Clicking into the game switches the browser to fullscreen (with keyboard lock in Chrome/Edge, so Ctrl shortcuts such
as Ctrl+W don't close the tab). This can be turned off in the tuning menu (World section).

Alternatively: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Open`

## Controls

| Input | Action |
|---|---|
| Mouse | Look around / aim |
| Hold left / right mouse button | Fire left / right hook, stays attached while held |
| W A S D | Walk · on a rope: pump the swing · during a wall run: W + view direction steers (look up = run up) |
| Shift | Hold on the ground: **sprint** · tap in the air: **dash** · hold in the air: **gas boost** |
| Space | Jump, during a wall run: wall jump with a flip · **hold** on a rope = winch pulls you to the anchor |
| Ctrl (tap) | Toggle the **glider** in the air – view direction steers, W = dive, S = pull up |
| S during a wall run | Let go of the wall |
| R / T / C | Reset / slow motion / switch shoulder |
| G / H / P | Tuning menu / help / screenshot (saved to `screenshots/`) |
| Esc | Pause |

## Mechanics

- **Walking & sprinting:** from walking (2.2 m/s) through jogging up to a sprint (9 m/s). Movement direction and body
  orientation are separate: Kaia turns toward the new direction instead of tilting her whole body; the faster she
  goes, the wider the arc. On sharp direction changes at full speed she brakes, turns around and pushes off in the
  new direction (turnaround). Releasing the keys out of a sprint plays a braking step.
- **Dash & gas boost:** tap Shift in the air for a short gas burst in the view direction (with cooldown); hold Shift
  for a continuous gas boost as in v0.2.0. Both use gas, which refills when you're not boosting.
- **Glider:** glowing wing membranes between arms and legs with a real flight model: lift perpendicular to the flight
  path depending on the angle of attack, drag, and stalling when pitched up too steeply. The view direction steers:
  Kaia banks into turns, diving builds speed, pulling up converts it back into height. Landing, wall-running or
  hooking in ends the glide.
- **Aiming matters:** the hook flies exactly to where the crosshair hits a building
  (green = within the 140 m range, red = too far).
- **Moving targets:** the elevated train and the airplanes can be hooked too – the anchor stays on the vehicle and
  Kaia gets towed along.
- **Solid vehicles:** the train, the airplanes, cars and buses all have collision – Kaia can land on their roofs,
  ride along, run around on top and jump off with the vehicle's speed.
- **Rope physics:** point mass with gravity and air drag, slightly elastic rope (spring + damper, hard limit at 1.5 m
  of stretch), smooth reeling in, steering perpendicular to the rope, a small boost when letting go, ropes wrap
  around edges.
- **Wall run:** hitting a facade in mid-air automatically starts a wall run; wall jump with a flip.

## World

- **Natural island** (about 800 m across) with an irregular coastline, a beach that slopes down to the water behind
  a low sea wall, a waterfront promenade and a coastal ring road.
- **Water in 3D:** the sea is a wave mesh around the camera (Gerstner waves plus surf that rolls up the beach),
  mirrors the evening sky, gets clearer in the shallows and foams at the shore; park ponds sit in real hollows with
  small ripples and lily pads.
- **City layout:** a grid downtown with high-rises; outside of it, residential quarters with curved streets, front
  yards and houses with gabled roofs facing the street; organic parks that spill across block borders, with
  winding paths, gentle hills and ponds.
- **Life in the streets:** about 150 cars and buses in many colors drive on the right, keep their distance, stop at
  traffic lights (each approach gets its own green phase) and wait at junctions without lights.
- **Elevated train:** a curved viaduct loop 24 m above the streets – high enough to swing underneath – with two
  stations; the train speeds up, brakes and stops at each station.
- **Airplanes:** three planes fly wide, calm loops over the island, each in its own altitude band above the
  buildings, so they never get close to each other; navigation lights and strobes at dusk.
- **Districts and building shapes:** towers, stepped high-rises, twin towers with a skybridge, spires, slab
  blocks, L-shapes, row houses and courtyard blocks; rooftop structures, water towers and antennas.

## Character & animation

- Kaia is modeled from **signed distance fields** (`src/sdf.js`) and converted into soft, rounded meshes via marching
  cubes: a jacket as a fabric shell with folds, hood, sleeves and cuffs, hair made of merged strands (bangs, face
  strands, spiky tips, ponytail), hands with fingers, chunky sneakers.
- Dark blue, fluffy short hair with a red clip, turquoise eyes, an oversized black jacket with a light gray hood and
  orange sleeve panels, a print shirt, a red belt, a gray asymmetric pleated skirt with a plaid layer, an over-knee
  stocking on the left, a short sock on the right, a red fingerless glove. Colors are defined in one place in `LOOK`
  (`src/character.js`).
- Arms, legs, torso, jacket and hair are **skinned** (SkinnedMesh) – smooth joints instead of separate parts.
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

- Orange/purple evening sky with clouds, stars and a low sun; haze follows the sky color, smog in the street canyons.
- Cel shading, ink lines from the depth buffer, bloom, outline shell around the character.
- Neon signs, billboards, glowing edges, aircraft warning lights, street lamps with light cones, rising sparks.

## Tuning

All values live in `src/config.js` and can be changed live in-game with **G** – physics, movement (walk/sprint speed,
inertia, turning, turnaround), dash & gas boost, glider (angle of attack, lift, drag, banking), rope, gas, wall run,
camera, graphics and city seed.

## Structure

| File | Contents |
|---|---|
| `src/main.js` | Game loop (fixed 120 Hz physics, interpolated rendering), aiming, events, effects |
| `src/player.js` | Walk/sprint/turnaround, dash, gas boost, glider aerodynamics, elastic ropes, collision, wall run |
| `src/character.js` | Character model, skinning, glider wings, animation weighting, procedural layer |
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
| `src/transit.js` | Elevated train and airplanes as hookable moving targets |
| `src/world.js`, `src/palette.js` | Sky, haze, lighting, terrain mesh, sea and ponds, color palette |
| `src/post.js`, `src/toon.js` | Ink lines, bloom, tone mapping, FXAA · toon and outline materials |
| `src/camera.js` | Shoulder camera with collision, smoothing, tilt |
| `src/effects.js`, `hud.js`, `audio.js`, `tuning.js`, `input.js` | Particles/sparks/speed lines, HUD, sound, tuning, input |

Debug: `http://localhost:8080/?debug` runs without pointer lock and fullscreen; `window.game` is available in the
console.
