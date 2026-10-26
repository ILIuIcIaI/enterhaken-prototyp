# Enterhaken – Gameplay-Prototyp

Third-Person-Prototyp: Mit zwei Enterhaken durch eine dichte, prozedural
generierte Hochhausstadt schwingen. Kein Level, kein Ziel – nur eine Sandbox zum Testen von Gefühl und Physik.

## Starten

Doppelklick auf **`start.bat`** – startet einen kleinen lokalen Server (PowerShell, nichts zu installieren)
und öffnet `http://localhost:8080/` im Browser. Internet wird benötigt (Three.js kommt vom CDN).

Alternativ: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Open`

## Steuerung

| Eingabe | Aktion |
|---|---|
| Maus | Umsehen / zielen |
| Linke / rechte Maustaste halten | Linken / rechten Haken abschießen, solange gehalten eingehakt |
| Leertaste | Springen, im Wallrun: Wandsprung · **halten** = Seilwinde zieht zum Anker |
| Shift | Gas-Schub in Blickrichtung |
| W A S D | Laufen · am Seil: Schwung pumpen · im Wallrun: W + Blick lenkt (hoch schauen = hochlaufen) |
| S im Wallrun | Von der Wand lösen |
| R / T / C | Reset / Zeitlupe / Schulter wechseln |
| G / H / P | Tuning-Menü / Hilfe / Screenshot (landet in `screenshots/`) |
| Esc | Pause |

## Mechaniken

- **Zielen ist Pflicht:** Der Haken fliegt genau dorthin, wo das Fadenkreuz ein Gebäude trifft.
  Grün = in Reichweite (140 m), Rot = zu weit, Weiß = kein Ziel. Daneben geht der Haken ins Leere und wird eingeholt.
- **Seilphysik:** Der Spieler ist eine Punktmasse mit Schwerkraft und Luftwiderstand. Jedes Seil ist eine harte
  Abstandsbedingung (Position-Based Dynamics) – Pendelbewegung, Zentripetalkraft und der Ruck beim Straffen
  entstehen von selbst. Die Winde zieht mit begrenzter Kraft und holt dabei Seil ein. Seile wickeln sich um Kanten.
- **Wallrun:** Prallt man in der Luft gegen eine Fassade, startet automatisch ein Wallrun. Ein Teil der
  Aufprallgeschwindigkeit wird in Laufrichtung umgelenkt (frontal = nach oben). Reduzierte Schwerkraft,
  Lauf entlang der Wand mit hoher Geschwindigkeit, durchgehend über angrenzende Gebäude; endet an Ecken/Dachkanten,
  per Wandsprung oder wenn das Seil einen von der Wand wegzieht.
- **Gas:** Schub und Winde verbrauchen Gas, das sich regeneriert (am Boden schneller).

Alle Werte stehen in `src/config.js` und lassen sich im Spiel mit **G** live verändern
(inkl. neuer Stadt per Seed).

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/main.js` | Spielschleife (feste 120-Hz-Physik, interpoliertes Rendering), Zielen, Events |
| `src/player.js` | Bewegung, Seil-Bedingungen, Kollision, Wallrun |
| `src/hooks.js` | Haken-Projektil, Anker, Seil-Darstellung |
| `src/city.js` | Stadtgenerator, Raster-Index, Raycasts, Fassaden-Shader |
| `src/camera.js` | Schulterkamera mit Kollision, FOV/Neigung nach Tempo |
| `src/character.js` | Low-Poly-Figur mit prozeduraler Animation |
| `src/world.js` | Himmel, Licht, Schatten, Straßen-Shader |
| `src/effects.js`, `hud.js`, `audio.js`, `tuning.js`, `input.js` | Partikel/Speedlines, HUD, Sound, Tuning-Menü, Eingabe |

Debug: `http://localhost:8080/?debug` läuft ohne Pointer-Lock; `window.game` ist in der Konsole verfügbar.
