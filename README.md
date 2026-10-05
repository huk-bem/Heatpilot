# Heatpilot

Heizlast-Rechner für die Auslegung einer Wärmepumpe. Eine statische Webseite ohne Server, ohne Build-Schritt und ohne externe Abhängigkeiten.

## Was die Seite kann

- **Schnellschätzung** aus Haustyp, Wohnfläche, Baujahr, Dämmzustand und Postleitzahl
- **Haustypen:** freistehendes Haus, Doppelhaushälfte, Reihenendhaus, Reihenmittelhaus, Wohnung
- **Detailmodus** mit Abmessungen, Flächen und U-Werten je Bauteil, Wandaufbau (Material und Wandstärke), Luftwechsel, Wärmebrücken und Nachbartemperatur
- **Gegenprobe** über den Jahresverbrauch der bisherigen Heizung (Gas, Öl, Flüssiggas, Pellets, Holz, Fernwärme, Strom, Wärmepumpe)
- **Wärmepumpen-Auslegung** mit Warmwasser-Zuschlag, Sperrzeiten, Bivalenzpunkt und Kennlinie über der Außentemperatur
- Helles und dunkles Farbschema, Bedienung auf Handy und Desktop
- Eingaben bleiben im Browser (localStorage), es werden keine Daten übertragen

## Online stellen mit GitHub Pages

1. Im Repository **Settings → Pages** öffnen.
2. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
3. Branch **main** und Ordner **/ (root)** einstellen, speichern.
4. Nach etwa einer Minute ist die Seite unter `https://huk-bem.github.io/Heatpilot/` erreichbar.

Lokal genügt ein Doppelklick auf `index.html`.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seite und Formular |
| `assets/heatpilot.css` | Gestaltung, Farben für hell und dunkel |
| `assets/heatpilot.js` | Kennwerte, Rechenkern (`Heat.calc`) und Oberfläche |
| `assets/fonts/` | Schrift Sofia Sans (SIL Open Font License, siehe `OFL.txt`) |
| `test/heizlast.test.js` | Handproben für den Rechenkern, Aufruf mit `node test/heizlast.test.js` |

Alle Kennwerte stehen am Anfang von `assets/heatpilot.js` (`YEARS`, `WIN`, `WALLMAT`, `FUEL`, `PLZ`, `C`) und lassen sich dort anpassen.

## Rechenweg

**Gebäudehülle** (vereinfachtes Hüllflächenverfahren in Anlehnung an DIN EN 12831-1):

```
Φ = Σ (A · (U + ΔU_WB) · f) · (θ_innen − θ_außen) + 0,34 · n · V · (θ_innen − θ_außen)
```

- Flächen: im Schnellmodus aus Wohnfläche, Haustyp und Geschosszahl geschätzt, im Detailmodus einzeln überschreibbar
- U-Werte: Pauschalwerte je Baualtersklasse, angelehnt an die Bekanntmachung der Regeln zur Datenaufnahme und Datenverwendung im Wohngebäudebestand (BAnz AT 04.12.2020) und die IWU-Gebäudetypologie; nachträgliche Dämmung mit λ = 0,035 W/(mK)
- Faktor f: 1,0 Außenluft, 0,8 unbeheizter Dachboden, 0,5 unbeheizter Keller, 0,3 Erdreich
- Nachbarn: Trennwände und Decken mit U = 0,9 W/(m²K) gegen 15 °C
- Luftwechsel n: 0,3 bis 0,6 1/h je nach Dichtheit, 0,23 mit Wärmerückgewinnung

**Verbrauch:**

```
Φ = (Menge · Heizwert · Nutzungsgrad − Warmwasser) / Vollbenutzungsstunden
```

mit 800 kWh Warmwasser je Person und 2.000 Vollbenutzungsstunden (1.800 bei sehr gut gedämmten Häusern).

**Auslegungswert:** Mittelwert, wenn beide Verfahren höchstens 20 % auseinanderliegen. Liegt der Verbrauch deutlich darunter, der obere Verbrauchswert als Reserve. Liegt er deutlich darüber, der Verbrauchswert.

**Wärmepumpe:** Warmwasser-Zuschlag 0,25 kW je Person, Sperrzeitfaktor 24 / (24 − Sperrstunden), Kennlinie linear bis zur Heizgrenze von 15 °C.

## Grenzen

- Die Außentemperatur je Postleitzahl ist ein gerundeter Richtwert für die Leitregion (erste zwei Ziffern), kein Auszug aus DIN/TS 12831-1. Den genauen Wert liefert die [Klimakarte des Bundesverbands Wärmepumpe](https://www.waermepumpe.de/werkzeuge/klimakarte/); er lässt sich in der Seite eintragen.
- Das Ergebnis ist eine überschlägige Ermittlung für die Vorauswahl. Für Förderung und hydraulischen Abgleich ist eine raumweise Heizlastberechnung nach DIN EN 12831-1 durch einen Fachbetrieb nötig.
