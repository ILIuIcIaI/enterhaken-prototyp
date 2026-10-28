# Changelog

All notable changes to this project. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

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

[0.6.1]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.6.1
[0.6.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.6.0
[0.5.2]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.5.2
[0.5.1]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.5.1
[0.5.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.5.0
[0.4.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.4.0
[0.3.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.3.0
[0.2.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.2.0
[0.1.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.1.0
