# Changelog

All notable changes to this project. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

## [0.8.0] – 2026-10-30

The biggest update so far. The island grows and fills up with landmarks to swing through, the city gets weather and a
full day–night cycle, movement gets grinding, ledges, surfing, sitting and wind columns, the game gets a settings menu
and a photo mode – and a new Hyper-Realistic Mode renders everything with physically based materials under a real sky.

### Added

#### Hyper-Realistic Mode
A second way to see the game (Settings → Graphics, off by default). No cel shading and no ink lines in the world,
physically based rendering instead – switching it off brings back the cel look exactly as it was.
- **Materials:** every toon material gets a physically based twin (roughness, metalness, clear-coated car paint, metal
  rails).
- **A sky that lights the scene:** physical sky (Rayleigh and Mie scattering) as image-based lighting, with night sky,
  overcast and rain.
- **Every time of day has its own mood:** the evening burns orange with a low sun, violet sky, glowing clouds and the
  sun glittering across the water in a long path; the morning is pastel and misty with peach light over the haze; noon
  is crisp and blue; the night belongs to windows, neon and stars. A color grade follows along.
- **Rainy nights:** wet streets mirror the city in real time – neon signs, street lamps and lit windows reflected in the
  asphalt, raindrop rings in the puddles, colored light from the signs on the ground.
- **Facades:** glass curtain walls with mullions and slightly uneven panes, concrete panels with joints and dirt
  streaks, brick and plaster; recessed windows with frames, sills, blinds and curtains, and furnished rooms behind the
  glass (interior mapping) that light up at night.
- **Ground and plants:** paving slabs, asphalt with patches and cracks, worn road markings, grass, gravel paths, sand;
  roofs of bitumen and gravel; leafy tree crowns and bark.
- **Water:** the sea mirrors the city, with dispersive waves and sun and moon glitter. The bow wave becomes a sheet of
  clear, translucent water in the color of the sea, with sky and sun in its reflection and foam only along the crest.
- **Characters keep a touch of anime:** fine outlines and a soft shadow edge, so they stay anime figures in a realistic
  world (Settings → Graphics, on by default).
- 4× MSAA, depth-based ambient occlusion, a sun shadow that reaches twice as far, eye adaptation, AgX tone mapping,
  film grain and vignette.

#### World
- **The island is bigger** (radius 410 → 500 m), so the new landmarks fit into the outskirts; 200 instead of 150 cars and
  buses.
- **Lighthouse island:** a rock massif of its own off the coast – cliffs, broken rock, lichen, a dark wet tidal zone and
  surf around it, grass on top. A red-and-white lighthouse with gallery and lantern room whose beam sweeps the sea at
  night, a keeper's house, a rock path with wooden steps and rope rails, a jetty and a rowing boat. You walk exactly on
  the rock you see; everything too steep acts as a wall.
- **Harbor:** a quay with container stacks and three gantry cranes, moles, and a bascule bridge that opens for the
  freighter – stand on it at the wrong moment and it catapults you out.
- **Container ships** sail wide loops around the island: flared hulls with a raked bow and forecastle, rails, hatch covers
  and lashing bridges, a stepped superstructure with lit windows, bridge wings, mast and radar, funnel with company colors,
  lifeboats, and their names on bow and stern. The 40-foot containers have corrugated sides, door ends with locking rods,
  logos, numbers, rust and dirt. Land on them and run across the stacks – collision follows every single stack.
- **Amusement pier:** Ferris wheel, roller coaster (ride the train or grind the track), carousel with detailed horses,
  swing ride, pirate ship, drop tower, bumper cars, a helter-skelter slide, kiosks and game booths, festoon lights and
  palms – with three giant parade balloons (star, cat, whale) tethered above the fair.
- **Downtown:** a mega tower in the center, a construction skyscraper with an open steel frame and tower cranes whose jibs
  turn (hook on and get carried along), a neon tube around the elevated train that is big enough to glide through, a tower
  with a huge hole, neon rings around a few blocks as grind routes and a canal at street level, crossed by flat bridges.
  Neon signs and shop signs now line the streets at eye level.
- **Outskirts:** a stadium with a grindable roof ring, a giant tree in a park, wind turbines on the coast and in the parks
  (the blades are moving anchors) and an airship with a landing deck circling high above.
- **Time of day:** morning, noon and evening – sun and moon, sky colors, light, haze, window lights, street lamps, neon and
  stars follow the hour, and every change blends smoothly. Optional **day–night cycle**: a whole day including the night in a
  little over 7 minutes.
- **Weather:** clear, cloudy (denser clouds, softer grey light) and rain (rain streaks, darker and hazier light, wet streets
  that mirror the city; afterwards the streets dry slowly). Works with every time of day.
- **Life in the city:** bird flocks on roofs, squares, the beach and in parks take off when you come close and land again
  later; about 150 pedestrians walk the sidewalks, the promenade, the canal, the fair and the parks.

#### Movement
- **Grinding:** land on the viaduct rails and parapets, power lines between towers, the roller-coaster track, the pier's
  spiral slide, neon tubes, the stadium roof ring, the edge beams of the construction tower or the branches of the giant tree
  – faster downhill, slower uphill; Space jumps off, obstacles make the character jump in time.
- **Ledges:** while falling, the character grabs a roof edge at chest to head height. A / D shimmy along it, W / Space climb
  up, S lets go, S + Space pushes off.
- **Sitting:** standing still (or tapping Ctrl) sits the character down – on roof edges and cliffs with the legs dangling, on
  the harbor quay with the feet above the water, on benches and stools at the fair. With smooth transitions from standing, back
  up and straight into a jump.
- **On the water:** Shift with momentum sprints across the water (costs gas); hitting the water faster than you can run turns
  into surfing, steerable like on skis – with two big bow waves and a V-shaped wake in the style of The Legend of Zelda: The
  Wind Waker.
- **Roof fans and wind columns:** fans on flat roofs below 40 m launch you upward. The rising wind streams show how far their
  column reaches – glide into one and it throws you up about 30 meters, and you keep gliding.
- **Flow:** a meter that fills while you move fast and cleanly – perfect moments, wall runs and wall jumps, ledge climbs,
  rolls, landing on water, hooking in at full speed – and drains when you stall or stumble. Three tiers: each refills gas
  faster, at tier 3 the gas boost costs half.
- **Perfect moments:** a perfect release from the rope, a last-second save just above the ground or a near miss past a building
  edge slows time down for a moment – the camera moves in on the character and the image glitches (red/cyan split, shifted
  slices). Can be turned off.
- **Idle animations:** standing still, every character plays one of two idles that fit their personality (Zero taps her foot
  with folded arms, Makoto Yuki nods along to his music, Steve mines and sneaks, …).
- **Wall-run camera tilt:** the camera leans away from the wall during a wall run.
- **Aim assist** (Settings → Controls, off by default): narrowly missing a building still hooks it.

#### Game
- **Settings menu** (Esc, tabs Controls / Character / Settings): render resolution, shadow quality, ink lines, bloom, field of
  view, window and water reflections, speed lines, Hyper-Realistic Mode, camera shake and an FPS counter; master and effects
  volume; time of day, day–night cycle and weather; mouse sensitivity, invert Y and aim assist; perfect-moment slow motion, its
  glitch effect and flow. Settings are saved in the browser.
- **Photo mode** (F or menu): time stops, a free camera flies around the character (on a leash, never through buildings), the HUD
  disappears. Five looks (Standard, Manga, Glitch, Abendrot, Nachtblau), the character can be hidden, photos are saved to
  `screenshots/`.
- New sounds: rain, water, grinding, roof-fan launch, bird flocks, the bascule bridge bell, splashes, flow tiers and perfect
  moments.

### Changed
- Starting the game captures the mouse without switching to fullscreen; the browser asks before leaving the page mid-game.
- The start screen and the pause menu have tabs for controls, character and settings.
- The HUD shows the flow meter above the speed and, optionally, the frame rate; the hint line lists Esc and F.

## [0.7.0] – 2026-10-29

Landing at speed is now part of the flow: a shoulder roll into a fast slide or into a stumble, a real slide when the
rope drags you across a roof, and wall runs straight up a facade with the feet on the wall.

### Added
- **Shoulder roll:** landing faster than about 38 km/h without a rope makes the character roll over the right
  shoulder, diagonally across the back – instead of skidding along in a crouch. The roll keeps the momentum and gets
  quicker the faster you land.
- **Roll → slide** (direction key held): the roll flows straight into a feet-first slide – sitting low on the hip,
  the front leg stretched out flat, the other tucked under, leaning back with one hand on the ground. The slide is
  fast (about 60 km/h out of a fast landing), carries you roughly 12 m and can be steered a little; release the key
  or run out of speed and the character pushes off into a run. Made for chaining: clearing a roof you couldn't
  fly over without losing the flow.
- **Roll → stumble** (no key held): coming up out of the roll, the foot catches – the upper body pitches forward, both
  arms fly out to the sides and circle behind the body, and a few quick lunging steps catch the fall before the
  character stands again (about 9 m). Modeled on 2B's stumble in NieR:Automata.
- **Slide on the rope:** touching down while the rope is still pulling no longer skids the character across the
  ground in a crouch – it slides feet first until the rope lifts it off again and blends back into the swing.
- **Vertical wall run:** running straight up a wall now looks like it does in anime – the wall becomes the floor,
  the feet are on the facade, the body sticks out sideways from it and leans into the run. Between straight up and
  sideways the pose blends smoothly; at the top it straightens up again over the edge.
- New tuning section "Landung: Rolle & Slide" (G): roll threshold and speed, braking, slide friction, steering and
  the speed at which the character gets up.

### Changed
- Feet sit on the wall during every wall run instead of sinking into it.
- Step rate on the wall matches the climbing speed, so the feet don't slide over the facade.
- Rolls, slides and stumbles move at the speed their animation shows (the steps of the stumble follow the actual
  speed, no foot sliding); all transitions blend without pops.

## [0.6.1] – 2026-10-28

Patch: capes, skirts and coat tails are fully dynamic now, 2B has a new skirt, and Steve is textured on all sides.

### Added
- **Body barrier for cloth:** impenetrable zones inside the torso and pelvis remember which side the fabric came
  from, so it can never slip through the body – not even on a full stop out of 140 km/h or in a fast spin. The fabric
  wraps around the sides instead.
- **Tethers:** every point of the fabric stays within its rest distance of where it is attached, so free cloth
  never stretches like rubber.
- Stronger bending resistance keeps capes and coat tails wide and flat instead of twisting into ribbons; after
  wild motion they fall back into a clean drape on their own.

### Changed
- **Fully dynamic cloth for flowing clothes:** Zero's cape and dress panels, 2B's skirt, Joker's coat tails and the
  Scientist's lab coat are simulated completely freely – no pull back into a fixed shape, no rigid carrying along
  with the body. The whole length moves, down to the hem: the fabric lags behind, swings, billows when running,
  streams backward when swinging and gliding, and lifts when jumping or falling. Zero's long hair and Makima's braid
  move more freely as well; ties and bandana ends are a little looser. The gentle breeze stays as subtle as before.
- **2B's new skirt:** shorter, and open at the front like the original – closed around the hips and back, with an
  opening that starts narrow at the waist and widens toward the hem, showing the white leotard underneath. When
  falling, it lifts only a little instead of flipping up.

### Fixed
- **Steve's sides:** the left and right faces of his head, arms, torso and legs were turned inward and showed up as
  dark, untextured surfaces. They now show the hair, skin, sleeves, jeans and shoes like the original.

## [0.6.0] – 2026-10-28

Ten playable characters with a character select screen, cloth physics for coats, capes, skirts, ties and braids,
real character shadows and a gentle breeze. All characters are purely cosmetic – they play exactly the same.

### Added Characters
- Belle $\color{gray}{\text{(Zenless Zone Zero)}}$
- Rei Ayanami $\color{gray}{\text{(Neon Genesis Evangelion)}}$
- Makima $\color{gray}{\text{(Chainsaw Man)}}$
- Zero $\color{gray}{\text{(Drakengard 3)}}$
- 2B $\color{gray}{\text{(NieR:Automata)}}$
- Joker $\color{gray}{\text{(Persona 5)}}$
- Makoto Yuki $\color{gray}{\text{(Persona 3)}}$
- Steve $\color{gray}{\text{(Minecraft)}}$
- Scientist $\color{gray}{\text{(Half-Life)}}$
- Jonesy $\color{gray}{\text{(Fortnite)}}$

### Added
- **Character select:** the start screen now has a second page after the controls with a grid of all characters
  (portrait, name, series). Pick one and press **Los!** – it can also be changed from the pause menu (Esc). The
  choice is remembered; the last three characters stay loaded, so switching back is instant.
- **Cloth physics** (`src/cloth.js`, Verlet at 120 Hz): coat tails, lab coat and blazer hems, skirts, capes,
  embroidered dress panels, ties, bandana ends, long hair and braids swing with every movement. Capsules around
  legs, hips and torso keep the fabric outside the body – legs never pass through a skirt or coat. A soft pull
  toward the rest shape and a maximum deflection keep it natural instead of exaggerated.
- **Character shadows:** every character casts a detailed shadow with a recognizable silhouette – including
  capes, coat tails and skirts – instead of a thin line. It falls a little steeper than the low evening sun, so it
  stays short and readable and lands near the feet.
- **Gentle wind:** a light, steady breeze from one direction makes capes, hems, hair strands and braids sway
  slightly, even when standing still; solid hairstyles move a tiny bit along with it.
- **Character toolkit** (`src/charkit.js`) and one file per character in `src/designs/`: one-piece rounded bodies
  from distance fields (male and female builds, own proportions per character), garments fitted to the body,
  trousers, shoes and boots, hair from merged strands, painted faces.

### Changed
- **Kaia is now Belle** from Zenless Zone Zero.
- Dark clothing gets a subtle rim light and slightly lighter blacks, so black coats and uniforms stay readable at
  dusk.
- Mirrored parts (such as the left ear) are drawn correctly – no more black discs beside the head.

### Notes
- The characters come without their weapons and items (no swords, guns, knives or Evoker).
- Building a character takes a few seconds the first time (a spinner shows on its card).

## [0.5.2] – 2026-10-28

Patch: cars and buses are solid too.

### Added
- **Collision with cars and buses:** Kaia can land on their roofs and ride along through the streets, jump off with
  their speed, and she can no longer walk or swing through them.

### Fixed
- Cars no longer brake for Kaia while she is riding on top of a vehicle.

## [0.5.1] – 2026-10-28

Patch: the train and the airplanes are now solid, and the elevated railway runs much higher.

### Added
- **Collision with the train and the airplanes:** Kaia can land on the train roofs, on an airplane's fuselage and
  on its wings, ride along (including the vehicle's turns) and run around on top. Jumping off keeps the vehicle's
  speed. From the side or from below the vehicles push her out instead of letting her pass through.

### Changed
- **Higher viaduct:** the track now runs at 24 m instead of 13 m on taller, thicker pillars, so you can swing
  underneath it.

## [0.5.0] – 2026-10-28

Smoother, livelier animations with a real grappling arm, a far less grid-like city with curved residential
streets and organic parks, 3D water, a sloping beach, traffic, an elevated train and airplanes you can hook onto.

### Added
- **Grappling arm:** firing a hook thrusts the arm toward the target; while attached, the hand holds the rope and
  the arm follows it the whole time (almost straight when taut, slightly bent when slack, a short jolt when the
  rope snaps tight). The rope now starts at the hand.
- **Secondary motion:** legs, free arms and the upper body swing along with the body's acceleration and rotation
  (damped springs with limited range), strongest while swinging, off on the ground.
- **Phase-driven swing pose:** stretched on the downswing, legs swinging through at the bottom, hips bending and legs
  kicking forward on the upswing.
- **Curved residential streets:** superblocks with S-curves, bends and loops, front yards, garden trees and
  houses with gabled roofs (some with chimneys) that face the street. Buildings can now be rotated, including
  collision, raycasts and wall runs.
- **Coastal ring road** with connections to the grid and a row of houses on the land side.
- **Organic parks** that spill across block borders, with winding paths, gentle hills, groves and open lawns;
  ponds sit in real hollows.
- **Terrain:** the beach slopes down to the water behind a low sea wall, the sea floor drops off, park hills and pond
  hollows are walkable; wading into the water is possible.
- **3D water:** the sea is a wave mesh around the camera (four Gerstner waves plus surf that rolls up the beach),
  clearer in the shallows, with foam at the shore and on breaking crests; ponds with small ripples and lily pads.
- **Traffic:** about 150 cars (sedans, hatchbacks, vans, taxis) and buses in many colors, driving on the right with
  headlights and taillights. They keep their distance, stop at traffic lights (each approach has its own green
  phase, so paths never cross), wait at junctions without lights and brake for Kaia on the road.
- **Traffic lights** with green, amber and red at every signalized approach; crosswalks, stop lines and center lines
  on all streets, including curved ones.
- **Elevated train:** a curved viaduct loop through the city with two covered stations; the train speeds up, brakes
  and stops at each station.
- **Airplanes:** three planes fly wide, calm loops over the island, each in its own altitude band above the
  buildings, banking into turns, with navigation lights and strobes.
- **Hooking onto moving targets:** the train cars and the airplanes can be hooked; the anchor stays on the vehicle
  and Kaia gets towed along.

### Changed
- **Animation transitions:** every switch between animations now uses inertialization – the offset to the previous
  pose decays smoothly, so transitions are continuous in position and speed without anything lagging behind.
- Ground rendering uses a ground map texture for roads, sidewalks, lawns, paths and markings instead of a fixed grid.
- Streets only exist where the city needs them; open areas at the edge of the city are meadows with trees.

### Fixed
- Procedural pose adjustments (look direction, turning, springs) could add up from frame to frame during calm poses,
  which twisted the head or limbs over time.

## [0.4.0] – 2026-10-27

A rounder, more detailed Kaia, completely new walking and sprinting, a glider with a real flight model, and a
natural island with a beach, parks and a more varied city. The mechanics are based on v0.2.0 again.

### Added
- **Rounded character from distance fields:** jacket, hair, hands and shoes are modeled from signed distance fields
  and turned into soft meshes via marching cubes – no more angular separate parts. The jacket is a fabric shell with
  folds, hood, sleeves, cuffs and an open front; the hair is strands merged into one mass with bangs, face strands,
  tips and a ponytail, with the highlight broken up into strands; hands with fingers; rounded sneakers.
  The hair is skinned as well and swings along.
- **Natural island** with an irregular coastline, a sandy beach all around, a waterfront promenade with street lamps,
  and a sea with sky reflections, sun glitter and a foam line.
- **Parks and greenery:** a central park with a pond, smaller parks, squares, street trees and cherry trees.
- **More varied city:** districts (high-rise downtown, midtown, residential quarter, waterfront) with their own color
  palettes; new building shapes (stepped high-rises, twin towers with a skybridge, spires, slab blocks, L-shapes,
  row houses, courtyard blocks); rooftop structures, water towers, antennas.
- **Turnaround:** on a sharp direction change at full speed, Kaia brakes, turns around and pushes off in the new
  direction – with its own animation and dust.
- **Jogging** as an intermediate step between walking and sprinting.
- The **gas boost** from v0.2.0 is back: hold Shift in the air. Tapping is still the dash.

### Changed
- **Walking and sprinting rebuilt from scratch:** movement direction and body orientation are separate, Kaia turns
  toward the new direction instead of tilting her whole body. The turn rate drops with speed (wide arcs when
  sprinting), torso and head lean slightly into the turn. Smoother acceleration and braking while keeping the weight.
- **More realistic running animations:** new poses for walking, jogging and sprinting; stride length follows the
  speed exactly (no foot sliding), the gaits are blended in phase sync.
- **New glider physics:** lift perpendicular to the flight path depending on the angle of attack, drag and stalling;
  banked turns (coordinated, without sinking); diving builds speed, pulling up converts it into height. The camera
  tilts into turns.
- Mechanics (swinging, wall run, gas) are based on v0.2.0 again.

### Removed
- Charged jump (super jump from a standstill).
- The wall on the horizon.
- Camera bob while walking.

### Fixed
- Key presses for jump, dash and glider were lost at high frame rates when a frame contained no physics step.

## [0.3.0] – 2026-10-26

Detailed model of Kaia, weighty movement, charged jump, air dash and glider.

### Added
- **New, detailed model of Kaia:** around 60 tapered hair strands in two layers
  (bangs, face strands, spiky tips, small ponytail with a red hair tie, red clip), turquoise eyes with
  eyelid crease and highlights, slim anime chin, ears; an oversized black jacket with light gray edges, a flat-lying
  hood with red lining and drawstrings, orange sleeve panels, ribbed cuffs and a badge; a black shirt with a white
  print; a red belt with buckle, pendant and red strap; a gray asymmetric pleated skirt with an overlapping wrap panel
  and a plaid layer; shorts; an over-knee stocking on the left with a white stripe and ruffled edge, a rust-brown
  patterned sock on the right; hands with fingers, a red fingerless glove, a turquoise bracelet; chunky sneakers made
  of sole, midsole, toe cap, heel counter, laces and a red tab.
- **Skinning** for arms, legs, torso, jacket, sleeves, stocking and sock – smooth joints instead of separate parts.
- **Walking and sprinting:** WASD walks, Shift sprints. Movement along the view direction with a limited turn rate
  (wide arcs when sprinting), sluggish acceleration, braking before sharp turns, a stop animation when halting.
- **Charged jump:** hold Space while standing (up to 1.1 s), release for a super jump of up to about 25 m, with a
  dust swirl, camera zoom and charge sound.
- **Air dash** (Shift in the air): a short gas burst in the view direction, also out of a wall run or glide, with
  cooldown.
- **Glider** (tap Ctrl): glowing wing membranes
  between arms and legs, energy model (sinking accelerates, climbing slows down, stalling), steering by looking,
  W = dive, S = pull up, banking in turns.
- **New animations:** weighty walk (heel strike, settling, roll-off, hip sway), powerful sprint,
  idle with weight shifting, braking, charging, super jump, apex, fast falling, dash, gliding.
  Walk and sprint cycles run in phase sync, stride length adapts to speed.
- **Weight in the presentation:** camera bob in step rhythm, footstep sounds, leaning when accelerating
  and in turns, a field-of-view kick on dash, a wider field of view when sprinting.
- **Fullscreen with keyboard lock** on game start (Chrome/Edge), so Ctrl shortcuts don't close the tab.
- HUD: charge ring around the crosshair, states for gliding, sprinting and charging; new tuning folders for movement,
  dash and glider.

### Changed
- Animations are blended with a custom weighting system instead of individual crossfades.
- Jacket hem, hair and skirt halves swing or follow the legs (less clipping).
- The previous continuous gas boost (Shift) was replaced by sprint and dash.

### Fixed
- The head turned independently of the body during fast movement in the air. The look direction now only applies
  on the ground, smoothed and limited.
- Sideways hair swing was calculated incorrectly when the body was tilted.

## [0.2.0] – 2026-10-26

New look, new player character, real animations and smoother swinging.

### Added
- **Player character Kaia:** blue bob with bangs and a hair clip, painted
  anime face, an open dark jacket with a yellow hem, a light top, shorts, asymmetric socks, sneakers,
  compact grappling gear on the hips. Colors are defined in one place in `LOOK` (`src/character.js`).
- **Keyframe animations** via the Three.js `AnimationMixer` with crossfades and Catmull-Rom smoothing:
  idle, running (cadence adapts to speed), jump, rising, falling, landing, superhero landing,
  sliding, swinging, winch, gas boost, wall run and a flip on wall jumps. Plus head turning toward the
  aim direction and swinging hair.
- **Anime rendering:** cel shading for city, ground and character, ink lines from the depth buffer,
  an outline shell around the character, bloom, color grading, FXAA.
- **Dystopian city details:** neon signs, rooftop billboards, glowing edges, blinking
  aircraft warning lights, street lamps with light cones, crosswalks, rising sparks and a giant
  wall on the horizon.
- **Tuning:** new sliders for the rope (stiffness, damping, max stretch, reel-in speed,
  release boost) and graphics (ink lines, bloom, exposure, saturation).

### Changed
- **Evening mood:** orange-purple sky with lit clouds, stars and a low sun;
  haze follows the sky color in the view direction, plus smog in the street canyons.
- **Windows** glow warm or in neon colors, or reflect the evening sky.
- **Swing physics:** the rope is slightly elastic (spring and damper, hard limit at 1.5 m of stretch),
  so tightening is softly cushioned instead of jerky. The winch reels in slack rope smoothly,
  WASD only acts perpendicular to the rope while swinging, and releasing a taut rope gives a
  small boost in the direction of flight.
- **Camera:** smoothed follow with prediction (no more jerks when the rope tightens or on impact),
  slight banking in turns while swinging.
- **HUD** in a comic style with slanted yellow-and-black elements.
- Collision body adjusted to the smaller character (1.64 m instead of 1.80 m).

### Removed
- The previous low-poly character with cape and blades.

## [0.1.0] – 2026-10-26

First playable prototype: a sandbox without levels or goals for testing swinging and wall-running.

### Added
- **City:** procedurally generated high-rise city (14 × 14 blocks) with stepped towers up to about 330 m,
  rooftop structures and antennas; reproducible via a seed.
- **Grappling hooks:** two independent hooks (hold left/right mouse button). They fly as projectiles exactly to
  the targeted building (140 m range); a miss is reeled back in; ropes wrap around edges.
- **Rope physics:** point mass with gravity and air drag, ropes as hard distance constraints
  (position-based dynamics), fixed 120 Hz physics with interpolated rendering.
- **Winch and gas:** hold Space to pull toward the anchor, Shift for a gas boost; gas supply with regeneration.
- **Wall run:** starts automatically when hitting a facade; impact energy is redirected into the running direction,
  run upward by looking up, wall jump, continues across adjacent buildings.
- **Camera:** shoulder camera with collision, field of view and distance depending on speed, tilt during wall runs.
- **Character:** low-poly character with cape, blades and grappling gear, procedurally animated.
- **Presentation:** evening light with shadows, procedural facades with windows, street shader,
  speed lines, particles and procedural sound (wind, gas, winch, effects).
- **HUD and tools:** crosshair with range indicator, speed, height, gas and state; tuning menu (G),
  slow motion (T), screenshot (P); start script with a local PowerShell server.

[0.7.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.7.0
[0.6.1]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.6.1
[0.6.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.6.0
[0.5.2]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.5.2
[0.5.1]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.5.1
[0.5.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.5.0
[0.4.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.4.0
[0.3.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.3.0
[0.2.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.2.0
[0.1.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.1.0
