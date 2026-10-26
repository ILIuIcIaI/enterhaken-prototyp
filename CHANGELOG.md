# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).

## [0.3.0] – 2026-10-26

Detailliertes Modell von Kaia, gewichtige Bewegung, Aufladesprung, Luft-Dash und Gleiter.

### Hinzugefügt
- **Neues, detailliertes Modell von Kaia**: rund 60 verjüngte Haarsträhnen in zwei Lagen
  (Pony, Gesichtssträhnen, abstehende Spitzen, kleiner Zopf mit rotem Haargummi, rote Spange), türkise Augen mit
  Lidfalte und Glanzlichtern, schmales Anime-Kinn, Ohren; übergroße schwarze Jacke mit hellgrauen Kanten, flach
  aufliegender Kapuze mit rotem Futter und Kordeln, orangen Ärmelfeldern, gerippten Bündchen und Abzeichen;
  schwarzes Shirt mit weißem Print; roter Gürtel mit Schnalle, Anhänger und rotem Band; grauer asymmetrischer
  Faltenrock mit überlappender Wickelbahn und Karo-Lage; Shorts; linker Overknee-Strumpf mit weißem Streifen und
  Rüschenrand, rechte rostbraune Muster-Socke; Hände mit Fingern, roter Halbfinger-Handschuh, türkises Armband;
  klobige Sneaker aus Sohle, Zwischensohle, Kappe, Fersenteil, Schnürung und roter Lasche.
- **Skinning** für Arme, Beine, Oberkörper, Jacke, Ärmel, Strumpf und Socke – weiche Gelenke statt Einzelteilen.
- **Gehen und Sprinten:** WASD geht, Shift sprintet. Bewegung entlang der Blickrichtung mit begrenzter Drehrate
  (weite Bögen im Sprint), träges Beschleunigen, Abbremsen vor scharfen Wenden, Stopp-Animation beim Anhalten.
- **Aufladesprung:** im Stand Leertaste halten (bis 1,1 s), loslassen = Supersprung bis ca. 25 m, mit Staubwirbel,
  Kamera-Zoom und Aufladeton.
- **Luft-Dash** (Shift in der Luft): kurzer Gasstoß in Blickrichtung, auch aus Wallrun und Gleitflug, mit Abklingzeit.
- **Gleiter** (Strg antippen): leuchtende Flügelmembranen
  zwischen Armen und Beinen, Energiemodell (Sinken beschleunigt, Steigen bremst, Strömungsabriss), Lenken per Blick,
  W = Sturzflug, S = abfangen, Querneigung in Kurven.
- **Neue Animationen:** gewichtiger Gang (Fersenaufsatz, Absinken, Abrollen, Hüftschwung), kraftvoller Sprint,
  Idle mit Gewichtsverlagerung, Abbremsen, Aufladen, Supersprung, Gipfel, schnelles Fallen, Dash, Gleiten.
  Geh- und Sprintzyklus laufen phasensynchron, die Schrittlänge passt sich dem Tempo an.
- **Gewicht in der Präsentation:** Kamera-Wippen im Schrittrhythmus, Schrittgeräusche, Lehnen beim Beschleunigen
  und in Kurven, Sichtfeld-Stoß beim Dash, mehr Sichtfeld beim Sprinten.
- **Vollbild mit Tastatursperre** beim Spielstart (Chrome/Edge), damit Strg-Kombinationen den Tab nicht schließen.
- HUD: Aufladering ums Fadenkreuz, Zustände GLEITEN, SPRINT und AUFLADEN; neue Tuning-Ordner Bewegung, Dash, Gleiter.

### Geändert
- Animationen werden über eine eigene Gewichtssteuerung überblendet statt über einzelne Crossfades.
- Jackensaum, Haare und Rockhälften schwingen bzw. folgen den Beinen (weniger Durchdringen).
- Der bisherige dauerhafte Gas-Schub (Shift) wurde durch Sprint und Dash ersetzt.

### Behoben
- Der Kopf drehte sich bei schnellen Bewegungen in der Luft unabhängig vom Körper. Die Blickrichtung wirkt jetzt nur
  noch am Boden, geglättet und begrenzt.
- Seitliches Nachschwingen der Haare wurde bei gekipptem Körper falsch berechnet.

## [0.2.0] – 2026-10-26

Neuer Look, neue Spielfigur, echte Animationen und flüssigeres Schwingen.

### Hinzugefügt
- **Spielfigur Kaia**: blauer Bob mit Pony und Haarspange, gemaltes
  Anime-Gesicht, offene dunkle Jacke mit gelbem Saum, helles Top, Shorts, asymmetrische Socken, Sneaker,
  kompakte Enterhaken-Ausrüstung an der Hüfte. Farben zentral in `LOOK` (`src/character.js`).
- **Keyframe-Animationen** über den Three.js-`AnimationMixer` mit Überblendungen und Catmull-Rom-Glättung:
  Idle, Laufen (Takt passt sich dem Tempo an), Sprung, Steigen, Fallen, Landung, Superhelden-Landung,
  Rutschen, Schwingen, Winde, Gas-Schub, Wallrun und Salto beim Wandsprung. Dazu Kopfdrehung in
  Zielrichtung und nachschwingende Haare.
- **Anime-Rendering:** Cel-Shading für Stadt, Boden und Figur, Tuschelinien aus dem Tiefenpuffer,
  Outline-Hülle um die Figur, Bloom, Farbkorrektur, FXAA.
- **Dystopische Stadt-Details:** Neon-Schilder, Werbetafeln auf Dächern, Leuchtkanten, blinkende
  Flugwarnlichter, Straßenlaternen mit Lichtkegeln, Zebrastreifen, aufsteigende Funken und eine riesige
  Mauer am Horizont.
- **Tuning:** neue Regler für Seil (Steifigkeit, Dämpfung, max. Dehnung, Einholgeschwindigkeit,
  Schwung beim Lösen) und Grafik (Tuschelinien, Bloom, Belichtung, Sättigung).

### Geändert
- **Abendstimmung:** Orange-lila Himmel mit beleuchteten Wolken, Sternen und tief stehender Sonne;
  Dunst folgt der Himmelsfarbe in Blickrichtung, dazu Smog in den Straßenschluchten.
- **Fenster** leuchten warm oder neon-farbig bzw. spiegeln den Abendhimmel.
- **Schwingphysik:** Das Seil ist leicht elastisch (Feder und Dämpfer, harte Grenze bei 1,5 m Dehnung),
  dadurch federt das Straffen weich ab statt zu rucken. Die Winde holt lockeres Seil sanft ein,
  WASD wirkt beim Schwingen nur quer zum Seil, und beim Lösen eines gespannten Seils gibt es einen
  kleinen Schwung in Flugrichtung.
- **Kamera:** geglättete Verfolgung mit Vorhersage (keine Rucke mehr bei Seil-Straffen oder Aufprall),
  leichtes Kurvenneigen beim Schwingen.
- **HUD** im Comic-Stil mit schrägen Gelb-Schwarz-Elementen.
- Kollisionskörper an die kleinere Figur angepasst (1,64 m statt 1,80 m).

### Entfernt
- Bisherige Low-Poly-Figur mit Umhang und Klingen.

## [0.1.0] – 2026-10-26

Erster spielbarer Prototyp: Sandbox ohne Level oder Ziel, um Schwingen und Wallrun zu testen.

### Hinzugefügt
- **Stadt:** prozedural generierte Hochhausstadt (14 × 14 Blöcke) mit gestuften Türmen bis ca. 330 m,
  Dachaufbauten und Antennen; über einen Seed reproduzierbar.
- **Enterhaken:** zwei unabhängige Haken (linke/rechte Maustaste halten). Sie fliegen als Projektil genau auf
  das anvisierte Gebäude (Reichweite 140 m); ein Fehlschuss wird eingeholt; Seile wickeln sich um Kanten.
- **Seilphysik:** Punktmasse mit Schwerkraft und Luftwiderstand, Seile als harte Abstandsbedingung
  (Position-Based Dynamics), feste 120-Hz-Physik mit interpoliertem Rendering.
- **Seilwinde und Gas:** Leertaste halten zieht zum Anker, Shift gibt Gas-Schub; Gasvorrat mit Regeneration.
- **Wallrun:** startet automatisch beim Aufprall auf eine Fassade; Aufprallenergie wird in Laufrichtung umgelenkt,
  Hochlaufen per Blickrichtung, Wandsprung, läuft über angrenzende Gebäude hinweg weiter.
- **Kamera:** Schulterkamera mit Kollision, Sichtfeld und Abstand abhängig vom Tempo, Neigung beim Wallrun.
- **Figur:** Low-Poly-Figur mit Umhang, Klingen und Manöverausrüstung, prozedural animiert.
- **Präsentation:** Abendlicht mit Schatten, prozedurale Fassaden mit Fenstern, Straßen-Shader,
  Speedlines, Partikel und prozeduraler Sound (Fahrtwind, Gas, Winde, Effekte).
- **HUD und Werkzeuge:** Fadenkreuz mit Reichweitenanzeige, Tempo, Höhe, Gas und Zustand; Tuning-Menü (G),
  Zeitlupe (T), Screenshot (P); Startskript mit lokalem PowerShell-Server.

[0.3.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.3.0
[0.2.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.2.0
[0.1.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.1.0
