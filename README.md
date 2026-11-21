# Heatpilot

Heizlast-Rechner für die Auslegung einer Wärmepumpe. Eine statische Webseite ohne Server, ohne Build-Schritt und ohne externe Abhängigkeiten.

## Was die Seite kann

- **Schnellschätzung** aus Haustyp, Wohnfläche, Baujahr, Dachgeschoss, Keller, nachträglicher Dämmung, Windlage und Postleitzahl
- **Haustypen:** freistehendes Haus, Doppelhaushälfte, Reihenendhaus, Reihenmittelhaus, Wohnung
- **Detailmodus** mit Abmessungen, Flächen und U-Werten je Bauteil, Wandaufbau (Material und Wandstärke), Luftwechsel, Wärmebrücken und Nachbartemperatur
- **Gegenprobe** über den Jahresverbrauch der bisherigen Heizung (Gas, Öl, Flüssiggas, Pellets, Holz, Fernwärme, Strom, Wärmepumpe) mit Abzug des Warmwassers je nach bisheriger Bereitung
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
- U-Werte: typische Werte je Baualtersklasse, bis 2008 abgeglichen mit den Typgebäuden der IWU-Wohngebäudetypologie (TABULA, Ist-Zustand), danach EnEV 2009 und GEG; nachträgliche Dämmung mit λ = 0,035 W/(mK)
- Faktor f: 1,0 Außenluft, 0,8 unbeheizter Dachboden, 0,5 unbeheizter Keller, 0,3 Erdreich
- Nachbarn: Trennwände und Decken mit U = 0,9 W/(m²K) gegen 15 °C
- Luftwechsel n: 0,4 bis 0,6 1/h je nach Baujahr und Fenstern, 0,23 mit Wärmerückgewinnung; Windlage geschützt × 0,85, frei und windig × 1,3
- Wärmebrücken: ΔU = 0,10 W/(m²K), ab Baujahr 2009 0,05
- Himmelsrichtung: geht nicht ein. DIN EN 12831 rechnet den kältesten Tag ohne Sonne; der Sonnenkorrekturwert der alten DIN 4701 ist entfallen

**Verbrauch:**

```
Φ = (Menge · Heizwert · Nutzungsgrad − Warmwasser) / Vollbenutzungsstunden
```

- Warmwasser: 650 kWh je Person; mit Speicher 400 kWh mehr, mit Zirkulation weitere 500 kWh; bei separater Bereitung kein Abzug. Ein Sommermonatsverbrauch mal zwölf ersetzt die Schätzung.
- Vollbenutzungsstunden: linear von 1.400 h (20 W/m²) bis 2.000 h (ab 90 W/m² berechneter Heizlast).

**Auslegungswert:** Mittelwert, wenn beide Verfahren höchstens 20 % auseinanderliegen. Liegt der Verbrauch deutlich darunter, der obere Verbrauchswert als Reserve. Liegt er deutlich darüber, der Verbrauchswert.

**Wärmepumpe:** Warmwasser-Zuschlag 0,25 kW je Person, Sperrzeitfaktor 24 / (24 − Sperrstunden), Kennlinie linear bis zur Heizgrenze von 15 °C.

## Grenzen

- Die Außentemperatur je Postleitzahl ist ein gerundeter Richtwert für die Leitregion (erste zwei Ziffern), kein Auszug aus DIN/TS 12831-1. Den genauen Wert liefert die [Klimakarte des Bundesverbands Wärmepumpe](https://www.waermepumpe.de/werkzeuge/klimakarte/); er lässt sich in der Seite eintragen.
- Das Ergebnis ist eine überschlägige Ermittlung für die Vorauswahl. Für Förderung und hydraulischen Abgleich ist eine raumweise Heizlastberechnung nach DIN EN 12831-1 durch einen Fachbetrieb nötig.
