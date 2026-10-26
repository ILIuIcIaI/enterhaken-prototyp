# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).

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

[0.1.0]: https://github.com/ILIuIcIaI/enterhaken-prototyp/releases/tag/v0.1.0
