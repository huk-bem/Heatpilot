// Handproben für den Rechenkern. Aufruf: node test/heizlast.test.js
const assert = require('assert');
const Heat = require('../assets/heatpilot.js');

const base = { type: 'rmh', area: 125, year: 4, floors: 2, roof: 'dg', base: 'keller', plz: '30', win: 'auto', persons: 3, wwWP: true, block: 0, biv: null };
const none = { A_wall: 0, A_win: 0, A_door: 0, A_roof: 0, A_floor: 0, A_party: 0, dUwb: 0, nAir: 0, te: -12, ti: 20 };
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol || 1e-6), a + ' statt ' + b);
const calc = (o) => Heat.calc(Object.assign({}, base, o));

// 100 m² Wand mit U = 1,0 bei 32 K: 3.200 W
near(calc(Object.assign({}, none, { A_wall: 100, U_wall: 1 })).hull.W, 3200);
// Lüftung: 0,34 × 0,5 1/h × 300 m³ × 32 K = 1.632 W
near(calc(Object.assign({}, none, { area: 120, hl: 2.5, nAir: 0.5 })).hull.W, 1632);
// Kellerdecke zählt mit Faktor 0,5: 50 m² × 1,0 × 0,5 × 32 K = 800 W
near(calc(Object.assign({}, none, { A_floor: 50, U_floor: 1 })).hull.W, 800);
// Nachbarwand: 100 m² × 0,9 × (20 − 15) K = 450 W
near(calc(Object.assign({}, none, { A_party: 100 })).hull.W, 450);
// 36,5 cm Vollziegel: U = 1 / (0,17 + 0,365 / 0,81) = 1,61
near(calc({ wallMat: 'vollziegel', wallD: 36.5 }).u.wall, 1.611, 0.005);
// 12 cm Dämmung WLG 035 auf U = 1,0: 1 / (1 + 0,12 / 0,035) = 0,226
near(calc({ insWall: 12 }).u.wall, 0.2258, 0.001);
// Verbrauch: 20.000 kWh Gas, Niedertemperatur, 3 Personen, Speicher ohne Zirkulation
// 20.000 × 0,901 × 0,86 − (3 × 650 + 400) = 13.147 kWh, geteilt durch die Vollbenutzungsstunden
let c = calc({ fuel: 'gas', gen: 'nt', amount: 20000, wwSys: 'speicher' }).cons;
near(c.ww, 2350); near(c.hours, Heat.hoursFor(calc({}).hull.spec)); near(c.kW, 13146.8 / c.hours, 0.005);
// Vollbenutzungsstunden: 1.400 h bei 20 W/m², 2.000 h ab 90 W/m², linear dazwischen
near(Heat.hoursFor(10), 1400); near(Heat.hoursFor(55), 1700); near(Heat.hoursFor(120), 2000);
// Warmwasser separat: kein Abzug; mit Zirkulation 900 kWh Systemverluste
near(calc({ fuel: 'gas', gen: 'nt', amount: 20000, wwSys: 'separat' }).cons.ww, 0);
near(calc({ fuel: 'gas', gen: 'nt', amount: 20000, wwSys: 'zirk' }).cons.ww, 3 * 650 + 900);
near(calc({ fuel: 'gas', gen: 'nt', amount: 20000, wwSys: 'kombi' }).cons.ww, 3 * 650);
// Sommermonat 150 kWh Gas: 150 × 12 × 0,901 × 0,86 = 1.394,7 kWh
near(calc({ fuel: 'gas', gen: 'nt', amount: 20000, wwSys: 'speicher', summer: 150 }).cons.ww, 150 * 12 * 0.901 * 0.86, 0.01);
// Windlage skaliert den Luftwechsel: 0,6 normal -> 0,78 frei, 0,51 geschützt
near(calc({ expo: 'exposed' }).u.nAir, 0.78); near(calc({ expo: 'sheltered' }).u.nAir, 0.51);
// Ausgebautes Dachgeschoss: Dachschräge statt oberster Geschossdecke, größere Hüllfläche
const dg = calc({ type: 'efh', area: 150, floors: 1, roof: 'dg' }), at = calc({ type: 'efh', area: 150, floors: 1, roof: 'attic' });
assert.ok(dg.geo.topLabel === 'Dachschräge' && at.geo.topLabel === 'Oberste Geschossdecke');
near(dg.geo.A_roof / dg.geo.ag, 1.25); near(at.geo.A_roof, at.geo.ag);
// Dämmung senkt die Heizlast
assert.ok(calc({ insRoof: 16 }).hull.W < calc({}).hull.W && calc({ insWall: 10 }).hull.W < calc({}).hull.W);
// Sperrzeit 4 h: Faktor 24 / 20 = 1,2; Warmwasser 3 × 0,25 kW
const wp = calc(Object.assign({}, none, { A_wall: 100, U_wall: 1, block: 4 })).wp;
near(wp.pNorm, (3.2 + 0.75) * 1.2);
// Bivalenzpunkt −5 °C bei −12 °C Auslegung: Last × (15 + 5) / (15 + 12)
near(calc(Object.assign({}, none, { A_wall: 100, U_wall: 1, biv: -5, wwWP: false })).wp.pReq, 3.2 * 20 / 27);
// Reihenmittelhaus verliert weniger als das gleiche Haus freistehend
assert.ok(calc({}).hull.W < calc({ type: 'reh' }).hull.W && calc({ type: 'reh' }).hull.W < calc({ type: 'efh' }).hull.W);

console.log('Alle Handproben bestanden.');
