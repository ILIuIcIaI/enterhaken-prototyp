# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).

## [0.4.0] – 2026-10-27

Runde, detailliertere Kaia, komplett neues Gehen und Sprinten, Gleiter mit echtem Flugmodell und eine natürliche
Insel mit Strand, Parks und abwechslungsreicherer Stadt. Basis der Mechaniken ist wieder v0.2.0.

### Hinzugefügt
- **Runde Figur aus Distanzfeldern:** Jacke, Haare, Hände und Schuhe werden aus Signed Distance Fields modelliert
  und per Marching Cubes zu weichen Meshes – keine kantigen Einzelteile mehr. Jacke als Stoffschale mit Falten,
  Kapuze, Ärmeln, Bündchen und vorne offener Front; Haare als zu einer Masse verschmolzene Strähnen mit Pony,
  Gesichtssträhnen, Spitzen und Zopf, Glanzlicht in Strähnen aufgelöst; Hände mit Fingern; runde Sneaker.
  Die Haare sind ebenfalls gehäutet und schwingen nach.
- **Natürliche Insel** mit unregelmäßiger Küstenlinie, Sandstrand rundherum, Uferpromenade mit Laternen und Meer
  mit Himmelsspiegelung, Sonnenglitzern und Schaumkante.
- **Parks und Grün:** Zentralpark mit Teich, kleinere Parks, Plätze, Straßenbäume und Kirschbäume.
- **Abwechslungsreichere Stadt:** Viertel (Hochhaus-Zentrum, Midtown, Wohnviertel, Uferbebauung) mit eigenen
  Farbpaletten; neue Gebäudeformen (gestufte Hochhäuser, Zwillingstürme mit Skybridge, Turmspitzen, Scheibenhäuser,
  L-Formen, Reihenhäuser, Blöcke mit Innenhof); Dachaufbauten, Wassertürme, Antennen.
- **Wende:** Bei scharfem Richtungswechsel aus vollem Lauf bremst Kaia ab, dreht sich um und stößt sich in die neue
  Richtung ab – mit eigener Animation und Staub.
- **Joggen** als Zwischenstufe zwischen Gehen und Sprint.
- **Gas-Schub** aus v0.2.0 ist zurück: Shift in der Luft halten. Antippen bleibt der Dash.

### Geändert
- **Gehen und Sprinten von Grund auf neu:** Laufrichtung und Körperausrichtung sind getrennt, Kaia dreht sich in die
  neue Richtung, statt mit dem ganzen Körper zu kippen. Die Drehrate sinkt mit dem Tempo (weite Bögen im Sprint),
  Oberkörper und Kopf drehen sich leicht in die Kurve voraus. Weicheres Anfahren und Abbremsen, das Gewicht bleibt.
- **Realistischere Laufanimationen:** neue Posen für Gehen, Joggen und Sprint; die Schrittlänge folgt exakt dem
  Tempo (keine rutschenden Füße), die Gangarten werden phasensynchron überblendet.
- **Gleiter-Physik neu:** Auftrieb senkrecht zur Flugbahn abhängig vom Anstellwinkel, Luftwiderstand und
  Strömungsabriss; Kurven mit Querneigung (koordiniert, ohne Durchsacken); Sturzflug baut Tempo auf, Abfangen setzt
  es in Höhe um. Die Kamera neigt sich in Kurven mit.
- Mechaniken (Schwingen, Wallrun, Gas) basieren wieder auf v0.2.0.

### Entfernt
- Aufladesprung (Supersprung aus dem Stand).
- Die Mauer am Horizont.
- Kamera-Wippen beim Gehen.

### Behoben
- Tastendrücke für Springen, Dash und Gleiter gingen bei hoher Bildwiederholrate verloren, wenn ein Frame keinen
  Physikschritt enthielt.

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

[0.4.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.4.0
[0.3.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.3.0
[0.2.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.2.0
[0.1.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.1.0
