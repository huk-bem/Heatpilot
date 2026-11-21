/* Heatpilot – Heizlast-Rechner für die Wärmepumpen-Auslegung.
   Rechenkern (Heat.calc) ist frei von DOM-Zugriffen und in Node testbar. */
(function (root) {
  'use strict';

  /* ---------- Kennwerte ---------- */

  // Typische U-Werte unsanierter Bauteile nach Baualtersklasse, W/(m²K).
  // Bis 2008 abgeglichen mit den Typgebäuden der IWU-Wohngebäudetypologie (TABULA,
  // Ist-Zustand, Tabelle C.1); danach Anforderungsniveau EnEV 2009 bzw. EnEV 2016/GEG.
  // Die Pauschalwerte der Bekanntmachung (BAnz AT 04.12.2020) liegen teils höher,
  // weil sie für den Energieausweis bewusst ungünstig angesetzt sind.
  var YEARS = [
    { label: 'bis 1918',  wall: 1.7,  roof: 1.3,  ogd: 1.0,  floor: 1.2,  win: 'verbund', door: 3.5, hl: 2.8 },
    { label: '1919–1948', wall: 1.7,  roof: 1.4,  ogd: 0.8,  floor: 1.0,  win: 'verbund', door: 3.5, hl: 2.7 },
    { label: '1949–1957', wall: 1.4,  roof: 1.4,  ogd: 0.8,  floor: 1.2,  win: 'iso',     door: 3.5, hl: 2.5 },
    { label: '1958–1968', wall: 1.2,  roof: 0.8,  ogd: 0.6,  floor: 1.6,  win: 'iso',     door: 3.5, hl: 2.5 },
    { label: '1969–1978', wall: 1.0,  roof: 0.5,  ogd: 0.6,  floor: 1.0,  win: 'iso',     door: 3.5, hl: 2.5 },
    { label: '1979–1983', wall: 0.8,  roof: 0.5,  ogd: 0.5,  floor: 0.8,  win: 'iso',     door: 3.0, hl: 2.5 },
    { label: '1984–1994', wall: 0.55, roof: 0.4,  ogd: 0.4,  floor: 0.6,  win: 'iso',     door: 3.0, hl: 2.5 },
    { label: '1995–2001', wall: 0.45, roof: 0.35, ogd: 0.3,  floor: 0.45, win: 'wsv95',   door: 2.0, hl: 2.5 },
    { label: '2002–2008', wall: 0.3,  roof: 0.25, ogd: 0.24, floor: 0.3,  win: 'wsv95',   door: 2.0, hl: 2.5 },
    { label: '2009–2015', wall: 0.28, roof: 0.20, ogd: 0.20, floor: 0.35, win: 'wsv',     door: 1.5, hl: 2.5 },
    { label: 'ab 2016',   wall: 0.21, roof: 0.16, ogd: 0.16, floor: 0.28, win: 'drei',    door: 1.3, hl: 2.5 }
  ];

  var WIN = {
    einfach: { u: 5.0, label: 'Einfachverglasung' },
    verbund: { u: 2.7, label: 'Kasten- oder Verbundfenster' },
    iso:     { u: 2.8, label: 'Isolierglas 2-fach (vor 1995)' },
    wsv95:   { u: 1.6, label: 'Wärmeschutzglas 2-fach (1995–2008)' },
    wsv:     { u: 1.3, label: 'Wärmeschutzglas 2-fach (ab 2009)' },
    drei:    { u: 0.9, label: 'Wärmeschutzglas 3-fach' }
  };

  // Wärmeleitfähigkeit λ in W/(mK) für den Wandaufbau-Helfer.
  var WALLMAT = {
    vollziegel: { l: 0.81,  label: 'Vollziegel' },
    hlz:        { l: 0.50,  label: 'Hochlochziegel (alt)' },
    ks:         { l: 0.99,  label: 'Kalksandstein' },
    bims:       { l: 0.40,  label: 'Bims- / Leichtbeton-Hohlblock' },
    poren:      { l: 0.18,  label: 'Porenbeton (Gasbeton)' },
    poroton:    { l: 0.14,  label: 'Leichthochlochziegel (ab ca. 1990)' },
    beton:      { l: 2.10,  label: 'Stahlbeton' },
    holz:       { l: 0.055, label: 'Holzständerwand, voll gedämmt' }
  };

  // Energieträger: hi = kWh Heizwert je Einheit, eta = Jahresnutzungsgrad (heizwertbezogen).
  var FUEL = {
    gas:     { label: 'Erdgas',                         unit: 'kWh/Jahr',       hi: 0.901, gen: true },
    oel:     { label: 'Heizöl',                         unit: 'Liter/Jahr',     hi: 10.0,  gen: true },
    lpg:     { label: 'Flüssiggas',                     unit: 'Liter/Jahr',     hi: 6.57,  gen: true },
    pellets: { label: 'Holzpellets',                    unit: 'kg/Jahr',        hi: 4.8,   eta: 0.82 },
    holz:    { label: 'Scheitholz',                     unit: 'Raummeter/Jahr', hi: 1700,  eta: 0.70 },
    fern:    { label: 'Fernwärme',                      unit: 'kWh/Jahr',       hi: 1,     eta: 0.98 },
    strom:   { label: 'Strom (Nachtspeicher, direkt)',  unit: 'kWh/Jahr',       hi: 1,     eta: 0.99 },
    wp:      { label: 'Wärmepumpe (Stromverbrauch)',    unit: 'kWh/Jahr',       hi: 1,     eta: 3.5 }
  };
  var GEN = {
    bw:  { eta: 0.95, label: 'Brennwertkessel' },
    nt:  { eta: 0.86, label: 'Niedertemperaturkessel' },
    alt: { eta: 0.74, label: 'Alter Konstanttemperaturkessel' }
  };

  // Richtwerte der Auslegungs-Außentemperatur je PLZ-Leitregion (erste zwei Ziffern), °C.
  // Eigene, auf ganze Grad gerundete Schätzung – kein Auszug aus DIN/TS 12831-1.
  var PLZ = {
    '01': [-12, 'Dresden'], '02': [-13, 'Görlitz, Bautzen'], '03': [-12, 'Cottbus'], '04': [-12, 'Leipzig'],
    '06': [-12, 'Halle'], '07': [-13, 'Gera, Jena'], '08': [-14, 'Zwickau, Plauen'], '09': [-13, 'Chemnitz'],
    '10': [-12, 'Berlin'], '12': [-12, 'Berlin'], '13': [-12, 'Berlin'], '14': [-12, 'Potsdam'],
    '15': [-13, 'Frankfurt (Oder)'], '16': [-13, 'Oranienburg, Eberswalde'], '17': [-12, 'Neubrandenburg, Greifswald'],
    '18': [-10, 'Rostock, Stralsund'], '19': [-11, 'Schwerin'],
    '20': [-10, 'Hamburg'], '21': [-10, 'Hamburg-Süd, Lüneburg'], '22': [-10, 'Hamburg'], '23': [-10, 'Lübeck'],
    '24': [-9, 'Kiel, Flensburg'], '25': [-9, 'Nordseeküste'], '26': [-9, 'Oldenburg, Emden'],
    '27': [-9, 'Bremerhaven, Cuxhaven'], '28': [-10, 'Bremen'], '29': [-12, 'Celle, Uelzen'],
    '30': [-11, 'Hannover'], '31': [-11, 'Hildesheim, Hameln'], '32': [-10, 'Herford, Minden'],
    '33': [-10, 'Bielefeld, Paderborn'], '34': [-11, 'Kassel'], '35': [-11, 'Gießen, Marburg'],
    '36': [-12, 'Fulda'], '37': [-12, 'Göttingen'], '38': [-12, 'Braunschweig, Harz'], '39': [-12, 'Magdeburg'],
    '40': [-8, 'Düsseldorf'], '41': [-8, 'Mönchengladbach'], '42': [-9, 'Wuppertal'], '44': [-9, 'Dortmund'],
    '45': [-8, 'Essen'], '46': [-8, 'Oberhausen, Bocholt'], '47': [-8, 'Duisburg, Krefeld'],
    '48': [-9, 'Münster'], '49': [-10, 'Osnabrück'],
    '50': [-8, 'Köln'], '51': [-8, 'Köln, Leverkusen'], '52': [-9, 'Aachen'], '53': [-8, 'Bonn'],
    '54': [-9, 'Trier'], '55': [-9, 'Mainz'], '56': [-9, 'Koblenz'], '57': [-11, 'Siegen'],
    '58': [-10, 'Hagen'], '59': [-10, 'Hamm, Sauerland'],
    '60': [-10, 'Frankfurt am Main'], '61': [-10, 'Bad Homburg, Friedberg'], '63': [-10, 'Offenbach, Aschaffenburg'],
    '64': [-10, 'Darmstadt'], '65': [-9, 'Wiesbaden'], '66': [-10, 'Saarbrücken'],
    '67': [-10, 'Ludwigshafen, Kaiserslautern'], '68': [-9, 'Mannheim'], '69': [-9, 'Heidelberg'],
    '70': [-11, 'Stuttgart'], '71': [-11, 'Böblingen, Ludwigsburg'], '72': [-13, 'Tübingen, Schwäbische Alb'],
    '73': [-12, 'Esslingen, Göppingen'], '74': [-11, 'Heilbronn'], '75': [-11, 'Pforzheim'],
    '76': [-9, 'Karlsruhe'], '77': [-10, 'Offenburg'], '78': [-13, 'Villingen, Konstanz'], '79': [-10, 'Freiburg'],
    '80': [-12, 'München'], '81': [-12, 'München'], '82': [-15, 'Oberland, Garmisch'], '83': [-14, 'Rosenheim, Traunstein'],
    '84': [-14, 'Landshut'], '85': [-13, 'Ingolstadt, Freising'], '86': [-13, 'Augsburg'],
    '87': [-15, 'Kempten, Allgäu'], '88': [-12, 'Ravensburg, Bodensee'], '89': [-13, 'Ulm'],
    '90': [-13, 'Nürnberg'], '91': [-13, 'Erlangen, Ansbach'], '92': [-15, 'Amberg, Oberpfalz'],
    '93': [-14, 'Regensburg'], '94': [-15, 'Passau, Bayerischer Wald'], '95': [-15, 'Hof, Bayreuth'],
    '96': [-13, 'Bamberg, Coburg'], '97': [-12, 'Würzburg'], '98': [-14, 'Suhl, Thüringer Wald'], '99': [-13, 'Erfurt']
  };

  var C = {
    lambdaIns: 0.035,     // Dämmstoff WLG 035
    rSurf: 0.17,          // Rsi + Rse Außenwand, m²K/W
    rShell: 0.25,         // Luftschicht + Verblendschale
    fAttic: 0.8,          // Decke zum unbeheizten Dachraum
    fCellar: 0.5,         // Decke zum unbeheizten Keller
    fGround: 0.3,         // Bodenplatte auf Erdreich
    grossHouse: 1.22,     // Wohnfläche -> Außenmaß-Grundfläche
    grossFlat: 1.15,
    dgShare: 0.65,        // nutzbarer Flächenanteil eines ausgebauten Dachgeschosses
    roofSlope: 1.25,      // Dachfläche / Grundfläche bei rund 37° Neigung
    gable: 0.16,          // Giebeldreieck = 0,16 × Basis²
    knee: 0.9,            // Kniestock
    winShare: 0.18,       // Fensterfläche / Wohnfläche
    winMax: 0.40,         // höchstens 40 % der Fassade
    doorArea: 2.1,
    uParty: 0.9,          // Trennwand / Decke zum Nachbarn
    tNeighbour: 15,
    cAir: 0.34,           // Wh/(m³K)
    wwUse: 650,           // kWh/a je Person: rund 40 l/Tag um 35 K erwärmt, mit Leitungsverlusten
    wwStore: 400,         // kWh/a Bereitschaftsverlust eines Warmwasserspeichers
    wwCirc: 500,          // kWh/a zusätzlich mit Zirkulationsleitung
    wwKwPerPerson: 0.25,  // kW Zuschlag je Person
    heatLimit: 15         // Heizgrenztemperatur, °C
  };

  // Windlage: wirkt auf die Undichtheiten (Infiltration). Nach DIN EN 12831 über den
  // Abschirmungskoeffizienten; die Himmelsrichtung geht in die Norm-Heizlast nicht ein.
  var EXPO = {
    sheltered: { f: 0.85, label: 'Geschützt (dichte Bebauung, Stadt)' },
    normal:    { f: 1.0,  label: 'Normal (Siedlung, Vorort)' },
    exposed:   { f: 1.3,  label: 'Frei und windig (Feldrand, Küste, Kuppe)' }
  };

  var WWSYS = {
    speicher: { label: 'Über die Heizung, mit Warmwasserspeicher' },
    zirk:     { label: 'Über die Heizung, Speicher mit Zirkulation' },
    kombi:    { label: 'Über die Heizung, Kombitherme ohne Speicher' },
    separat:  { label: 'Separat, z. B. Durchlauferhitzer oder Elektroboiler' }
  };

  // Vollbenutzungsstunden: Je besser gedämmt, desto größer der Anteil der Sonnen- und
  // inneren Gewinne und desto weniger Stunden läuft die Heizung rechnerisch unter Volllast.
  // Linear zwischen 1.400 h (20 W/m² und weniger) und 2.000 h (90 W/m² und mehr), ohne Sprünge.
  function hoursFor(spec) {
    if (!(spec > 0)) return 2000;
    var x = Math.min(Math.max(spec, 20), 90);
    return Math.round((1400 + (x - 20) * 600 / 70) / 10) * 10;
  }

  /* ---------- Rechenkern ---------- */

  function has(v) { return v !== null && v !== undefined && !isNaN(v); }
  function pick(v, auto) { return has(v) ? v : auto; }
  function withIns(u, cm) { return cm > 0 ? 1 / (1 / u + (cm / 100) / C.lambdaIns) : u; }

  function calc(s) {
    var y = YEARS[s.year] || YEARS[4];
    var auto = {};
    var isFlat = s.type === 'whg';
    var ti = pick(s.ti, 20);
    var plz = PLZ[String(s.plz || '').slice(0, 2)];
    auto.te = plz ? plz[0] : -12;
    var te = pick(s.te, auto.te);
    var dT = Math.max(ti - te, 1);
    var area = Math.max(pick(s.area, 0), 0);

    /* Geometrie */
    var floors = isFlat ? 1 : pick(s.floors, 2);
    var top = s.roof || 'dg';             // dg | attic | flat
    var flatPos = s.flatPos || 'mitte';   // eg | mitte | top
    var hasOwnTop = !isFlat || flatPos === 'top';
    var hasOwnBase = !isFlat || flatPos === 'eg';
    var dg = !isFlat && top === 'dg';
    var nEff = floors + (dg ? C.dgShare : 0);
    var agAuto = area * (isFlat ? C.grossFlat : C.grossHouse) / nEff;
    var aspect = { efh: 1.25, dhh: 1.3, reh: 1.7, rmh: 1.7, whg: 1.4 }[s.type] || 1.25;
    var w, d;
    if (has(s.width) && has(s.depth)) { w = s.width; d = s.depth; }
    else if (has(s.width)) { w = s.width; d = agAuto / w; }
    else if (has(s.depth)) { d = s.depth; w = agAuto / d; }
    else { w = Math.sqrt(agAuto / aspect); d = agAuto / w; }
    auto.width = Math.sqrt(agAuto / aspect);
    auto.depth = agAuto / auto.width;
    var ag = w * d;

    auto.hl = y.hl;
    var hl = pick(s.hl, auto.hl);
    auto.hg = hl + 0.3;
    var hg = pick(s.hg, auto.hg);

    var exposed, party, gablesOut = 0, gablesParty = 0;
    if (isFlat) {
      var k = Math.min(Math.max(pick(s.flatSides, 2), 1), 4);
      exposed = [d, d + w, d + 2 * w, 2 * (d + w)][k - 1];
      party = 2 * (w + d) - exposed;
    } else if (s.type === 'rmh') {
      exposed = 2 * w; party = 2 * d;
      if (dg) gablesParty = 2 * C.gable * d * d;
    } else if (s.type === 'reh' || s.type === 'dhh') {
      exposed = 2 * w + d; party = d;
      if (dg) { gablesOut = C.gable * d * d; gablesParty = C.gable * d * d; }
    } else {
      exposed = 2 * (w + d); party = 0;
      if (dg) gablesOut = 2 * C.gable * w * w;
    }
    var hWall = floors * hg + (dg ? C.knee : 0);
    var facade = exposed * hWall + gablesOut;

    auto.A_win = Math.min(C.winShare * area, C.winMax * facade);
    var A_win = pick(s.A_win, auto.A_win);
    auto.A_door = isFlat ? 0 : C.doorArea;
    var A_door = pick(s.A_door, auto.A_door);
    auto.A_wall = Math.max(facade - A_win - A_door, 0);
    var A_wall = pick(s.A_wall, auto.A_wall);

    var topLabel, topF, topKind;
    if (!hasOwnTop) { topKind = 'nb'; }
    else if (top === 'attic') { topKind = 'ogd'; topLabel = 'Oberste Geschossdecke'; topF = C.fAttic; }
    else if (top === 'flat') { topKind = 'roof'; topLabel = 'Flachdach'; topF = 1; }
    else { topKind = 'roof'; topLabel = 'Dachschräge'; topF = 1; }
    auto.A_roof = topKind === 'nb' ? 0 : ag * (top === 'dg' ? C.roofSlope : 1);
    var A_roof = pick(s.A_roof, auto.A_roof);

    var baseLabel, baseF;
    if (hasOwnBase) {
      if (s.base === 'boden') { baseLabel = 'Bodenplatte auf Erdreich'; baseF = C.fGround; }
      else { baseLabel = 'Kellerdecke'; baseF = C.fCellar; }
    }
    auto.A_floor = hasOwnBase ? ag : 0;
    var A_floor = pick(s.A_floor, auto.A_floor);

    auto.A_party = party * hWall + gablesParty + (hasOwnTop ? 0 : ag) + (hasOwnBase ? 0 : ag);
    var A_party = pick(s.A_party, auto.A_party);

    /* U-Werte */
    var wallBase = y.wall;
    if (s.wallMat && WALLMAT[s.wallMat] && has(s.wallD) && s.wallD > 0) {
      wallBase = 1 / (C.rSurf + (s.wallD / 100) / WALLMAT[s.wallMat].l + (s.wallShell ? C.rShell : 0));
    }
    auto.U_wall = withIns(wallBase, pick(s.insWall, 0));
    auto.U_roof = withIns(topKind === 'ogd' ? y.ogd : y.roof, pick(s.insRoof, 0));
    auto.U_floor = withIns(y.floor, pick(s.insFloor, 0));
    var winKey = (s.win && s.win !== 'auto' && WIN[s.win]) ? s.win : y.win;
    auto.U_win = WIN[winKey].u;
    auto.U_door = y.door;
    auto.U_party = C.uParty;
    var U_wall = pick(s.U_wall, auto.U_wall), U_roof = pick(s.U_roof, auto.U_roof),
        U_floor = pick(s.U_floor, auto.U_floor), U_win = pick(s.U_win, auto.U_win),
        U_door = pick(s.U_door, auto.U_door), U_party = pick(s.U_party, auto.U_party);

    // Wärmebrücken: 0,10 ohne Nachweis (auch nach nachträglicher Dämmung), 0,05 ab EnEV 2009.
    // 0,03 setzt einen Wärmebrückennachweis voraus und ist nur im Detailmodus wählbar.
    auto.dUwb = s.year >= 9 ? 0.05 : 0.10;
    var dUwb = pick(s.dUwb, auto.dUwb);

    /* Lüftung: wirksamer Luftwechsel auf Gebäudeebene */
    // Ohne Lüftungsanlage wird über Fenster gelüftet; 0,4 1/h gilt auch für dichte Neubauten.
    if (s.wrg) auto.nAir = 0.23;
    else if (s.year >= 7) auto.nAir = 0.4;
    else if (s.year >= 5 || U_win <= 1.7) auto.nAir = 0.5;
    else auto.nAir = 0.6;
    var expo = EXPO[s.expo] || EXPO.normal;
    auto.nAir = Math.round(auto.nAir * expo.f * 100) / 100;
    var nAir = pick(s.nAir, auto.nAir);
    var volume = area * hl;

    auto.tn = C.tNeighbour;
    var tn = Math.min(pick(s.tn, auto.tn), ti);

    /* Verluste in W */
    var parts = [];
    var wbSum = 0;
    function ext(key, label, A, U, f) {
      if (!(A > 0)) return;
      parts.push({ key: key, label: label, A: A, U: U, f: f, W: A * U * f * dT });
      wbSum += A * dUwb * f * dT;
    }
    ext('wall', 'Außenwand', A_wall, U_wall, 1);
    ext('win', 'Fenster', A_win, U_win, 1);
    ext('door', 'Haustür', A_door, U_door, 1);
    if (topKind !== 'nb') ext('roof', topLabel, A_roof, U_roof, topF);
    if (hasOwnBase) ext('floor', baseLabel, A_floor, U_floor, baseF);
    if (wbSum > 0) parts.push({ key: 'wb', label: 'Wärmebrücken', W: wbSum });
    if (A_party > 0 && ti > tn) {
      parts.push({ key: 'party', label: isFlat ? 'Nachbarwohnungen' : 'Wand zum Nachbarn', A: A_party, U: U_party, W: A_party * U_party * (ti - tn) });
    }
    var vent = C.cAir * nAir * volume * dT;
    parts.push({ key: 'vent', label: 'Lüftung', W: vent });

    var total = 0;
    parts.forEach(function (p) { total += p.W; });
    var hull = { W: total, kW: total / 1000, spec: area > 0 ? total / area : 0, parts: parts };

    /* Gegenprobe über den Jahresverbrauch */
    var cons = null;
    var fuel = FUEL[s.fuel];
    auto.eta = fuel ? (fuel.gen ? (GEN[s.gen] || GEN.nt).eta : fuel.eta) : null;
    auto.hours = hoursFor(hull.spec);
    var persons = Math.max(pick(s.persons, 3), 0);
    var wwSys = WWSYS[s.wwSys] ? s.wwSys : (s.wwIncl === false ? 'separat' : 'speicher');
    auto.wwKwh = wwSys === 'separat' ? 0 : persons * C.wwUse +
      (wwSys === 'speicher' ? C.wwStore : wwSys === 'zirk' ? C.wwStore + C.wwCirc : 0);
    var wwSource = 'model';
    if (fuel && has(s.summer) && s.summer > 0 && wwSys !== 'separat') {
      auto.wwKwh = s.summer * 12 * fuel.hi * pick(s.eta, auto.eta);
      wwSource = 'summer';
    }
    if (fuel && has(s.amount) && s.amount > 0) {
      var eta = pick(s.eta, auto.eta);
      var hours = Math.max(pick(s.hours, auto.hours), 500);
      var useful = s.amount * fuel.hi * eta;
      var ww = Math.max(pick(s.wwKwh, auto.wwKwh), 0);
      if (has(s.wwKwh)) wwSource = 'manual';
      var qh = Math.max(useful - ww, 0);
      cons = {
        useful: useful, ww: ww, wwSys: wwSys, wwSource: wwSource, qh: qh, hours: hours,
        kW: qh / hours, low: qh / (hours * 1.12), high: qh / (hours * 0.88),
        spec: area > 0 ? qh / hours * 1000 / area : 0,
        perArea: area > 0 ? qh / area : 0
      };
      cons.dev = hull.kW > 0 ? (cons.kW - hull.kW) / hull.kW : 0;
    }

    /* Auslegungswert */
    var basisMode = s.basis || 'auto';
    var basis, basisKind;
    if (cons && basisMode === 'cons') { basis = cons.kW; basisKind = 'cons'; }
    else if (!cons || basisMode === 'hull') { basis = hull.kW; basisKind = 'hull'; }
    else if (Math.abs(cons.dev) <= 0.2) { basis = (hull.kW + cons.kW) / 2; basisKind = 'mean'; }
    else if (cons.dev < 0) { basis = cons.high; basisKind = 'consHigh'; }   // Reserve, falls bisher sparsam geheizt wurde
    else { basis = cons.kW; basisKind = 'cons'; }

    /* Wärmepumpe */
    var wwKw = s.wwWP ? persons * C.wwKwPerPerson : 0;
    var block = Math.min(Math.max(pick(s.block, 0), 0), 12);
    var fBlock = 24 / (24 - block);
    function loadAt(t) { return basis * Math.max(C.heatLimit - t, 0) / (C.heatLimit - te); }
    var pNorm = (basis + wwKw) * fBlock;
    var biv = has(s.biv) && s.biv > te ? s.biv : null;
    var pReq = biv === null ? pNorm : (loadAt(biv) + wwKw) * fBlock;
    var wp = {
      wwKw: wwKw, fBlock: fBlock, block: block, pNorm: pNorm, biv: biv, pReq: pReq,
      rod: Math.max(pNorm - pReq, 0),
      at7: loadAt(7), at2: loadAt(2),
      line: function (t) { return (loadAt(t) + wwKw) * fBlock; }
    };

    return {
      ti: ti, te: te, dT: dT, area: area, volume: volume, region: plz ? plz[1] : null,
      geo: { w: w, d: d, ag: ag, hWall: hWall, floors: floors, dg: dg, top: topKind, topLabel: topLabel, baseLabel: baseLabel,
             A_wall: A_wall, A_win: A_win, A_roof: A_roof, A_floor: A_floor, A_party: A_party, hasOwnTop: hasOwnTop, hasOwnBase: hasOwnBase },
      expo: s.expo || 'normal',
      u: { wall: U_wall, roof: U_roof, floor: U_floor, win: U_win, door: U_door, party: U_party, dUwb: dUwb, nAir: nAir, tn: tn },
      hull: hull, cons: cons, basis: basis, basisKind: basisKind, wp: wp, persons: persons, auto: auto
    };
  }

  var Heat = { calc: calc, YEARS: YEARS, WIN: WIN, WALLMAT: WALLMAT, FUEL: FUEL, GEN: GEN, PLZ: PLZ, C: C, EXPO: EXPO, WWSYS: WWSYS, hoursFor: hoursFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = Heat; return; }
  root.Heat = Heat;

  /* ---------- Oberfläche ---------- */

  var doc = root.document;
  var $ = function (id) { return doc.getElementById(id); };
  var STORE = 'heatpilot.v1';

  function fmt(v, digits) {
    return Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function temp(v) {
    var r = Math.round(v * 10) / 10;
    return (r < 0 ? '−' : '') + fmt(Math.abs(r), r % 1 === 0 ? 0 : 1) + ' °C';
  }
  function parse(str) {
    if (typeof str !== 'string') return null;
    var t = str.trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
    if (t === '') return null;
    var v = parseFloat(t);
    return isNaN(v) ? null : v;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  var fields = [];

  function fillSelects() {
    $('year').innerHTML = YEARS.map(function (y, i) { return '<option value="' + i + '">' + y.label + '</option>'; }).join('');
    $('win').innerHTML = '<option value="auto">Typisch für das Baujahr</option>' + Object.keys(WIN).map(function (k) {
      return '<option value="' + k + '">' + WIN[k].label + '</option>';
    }).join('');
    $('wallMat').innerHTML = '<option value="">Pauschalwert nach Baujahr</option>' + Object.keys(WALLMAT).map(function (k) {
      return '<option value="' + k + '">' + WALLMAT[k].label + '</option>';
    }).join('');
    $('fuel').innerHTML = '<option value="">Keine Angabe</option>' + Object.keys(FUEL).map(function (k) {
      return '<option value="' + k + '">' + FUEL[k].label + '</option>';
    }).join('');
    $('gen').innerHTML = Object.keys(GEN).map(function (k) { return '<option value="' + k + '">' + GEN[k].label + '</option>'; }).join('');
  }

  function radio(name) {
    var el = doc.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  function setRadio(name, value) {
    var el = doc.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
    return !!el;
  }

  var NUM = ['area', 'ti', 'te', 'width', 'depth', 'hg', 'hl', 'insWall', 'insRoof', 'insFloor', 'wallD',
    'A_wall', 'A_win', 'A_door', 'A_roof', 'A_floor', 'A_party',
    'U_wall', 'U_win', 'U_door', 'U_roof', 'U_floor', 'U_party',
    'dUwb', 'nAir', 'tn', 'amount', 'eta', 'hours', 'persons', 'summer', 'wwKwh'];
  var SEL = ['year', 'flatPos', 'flatSides', 'win', 'expo', 'wallMat', 'fuel', 'gen', 'wwSys', 'block', 'biv', 'basis'];
  var CHK = ['wrg', 'wallShell', 'wwWP'];
  var RAD = ['mode', 'type', 'floors', 'roof', 'base'];
  // Nur im Detailmodus wirksam; im Schnellmodus rechnet die Automatik.
  var DETAIL_ONLY = ['width', 'depth', 'hg', 'hl', 'wallMat', 'wallD', 'wallShell',
    'A_wall', 'A_win', 'A_door', 'A_roof', 'A_floor', 'A_party',
    'U_wall', 'U_win', 'U_door', 'U_roof', 'U_floor', 'U_party', 'dUwb', 'nAir', 'tn', 'eta', 'hours', 'summer', 'wwKwh'];

  function read() {
    var s = {};
    NUM.forEach(function (k) { s[k] = parse($(k).value); });
    SEL.forEach(function (k) { s[k] = $(k).value; });
    CHK.forEach(function (k) { s[k] = $(k).checked; });
    RAD.forEach(function (k) { s[k] = radio(k); });
    s.plz = $('plz').value.replace(/\D/g, '');
    s.year = parseInt(s.year, 10);
    s.floors = parseInt(s.floors, 10);
    s.flatSides = parseInt(s.flatSides, 10);
    s.block = parseFloat(s.block);
    s.biv = s.biv === '' ? null : parseFloat(s.biv);
    if (s.eta !== null) s.eta = s.fuel === 'wp' ? s.eta : s.eta / 100;
    if (s.mode !== 'detail') DETAIL_ONLY.forEach(function (k) { s[k] = typeof s[k] === 'boolean' ? false : (typeof s[k] === 'string' ? '' : null); });
    return s;
  }

  function save() {
    var raw = { plz: $('plz').value };
    NUM.concat(SEL).forEach(function (k) { raw[k] = $(k).value; });
    CHK.forEach(function (k) { raw[k] = $(k).checked; });
    RAD.forEach(function (k) { raw[k] = radio(k); });
    try { root.localStorage.setItem(STORE, JSON.stringify(raw)); } catch (e) { /* ohne Speicher weiterarbeiten */ }
  }
  function restore() {
    var raw = null;
    try { raw = JSON.parse(root.localStorage.getItem(STORE)); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return false;
    NUM.concat(SEL).concat(['plz']).forEach(function (k) { if (typeof raw[k] === 'string' && $(k)) $(k).value = raw[k]; });
    SEL.forEach(function (k) { if ($(k).selectedIndex < 0) $(k).selectedIndex = 0; });
    CHK.forEach(function (k) { if (typeof raw[k] === 'boolean') $(k).checked = raw[k]; });
    RAD.forEach(function (k) { if (raw[k]) setRadio(k, raw[k]); });
    return true;
  }

  function show(el, on) { if (el) el.hidden = !on; }

  function syncForm(s, r) {
    var detail = s.mode === 'detail';
    var flat = s.type === 'whg';
    doc.querySelectorAll('[data-detail]').forEach(function (el) { show(el, detail); });
    doc.querySelectorAll('[data-house]').forEach(function (el) { show(el, !flat); });
    doc.querySelectorAll('[data-flat]').forEach(function (el) { show(el, flat); });
    var ownTop = !flat || s.flatPos === 'top';
    var ownBase = !flat || s.flatPos === 'eg';
    show($('f-roof'), ownTop);
    show($('f-base'), ownBase);
    show($('f-insRoof'), ownTop);
    show($('f-insFloor'), ownBase);
    show($('row-roof'), detail && ownTop);
    show($('row-floor'), detail && ownBase);
    show($('row-door'), detail && !flat);
    show($('row-party'), detail && s.type !== 'efh');
    show($('f-tn'), detail && s.type !== 'efh');
    var wallCalc = detail && !!s.wallMat;
    show($('f-wallD'), wallCalc);
    show($('f-wallShell'), wallCalc);

    $('roof-dg-label').textContent = flat ? 'Dachschräge über der Wohnung' : 'Ausgebaut und beheizt';
    $('roof-attic-label').textContent = flat ? 'Kalter Dachboden darüber' : 'Kalter Dachboden';
    $('lab-insRoof').textContent = { dg: 'Dachschräge gedämmt', attic: 'Oberste Geschossdecke gedämmt', flat: 'Flachdach gedämmt' }[s.roof] || 'Dach gedämmt';
    $('lab-insFloor').textContent = s.base === 'boden' ? 'Boden gedämmt' : 'Kellerdecke gedämmt';

    var fuel = FUEL[s.fuel];
    doc.querySelectorAll('[data-fuel]').forEach(function (el) { show(el, !!fuel); });
    show($('f-gen'), !!(fuel && fuel.gen));
    show($('f-eta'), !!fuel && detail);
    show($('f-hours'), !!fuel && detail);
    show($('f-summer'), !!fuel && detail && s.wwSys !== 'separat');
    show($('f-wwKwh'), !!fuel && detail);
    if (fuel) {
      $('amount-unit').textContent = fuel.unit;
      $('summer-unit').textContent = fuel.unit.replace('/Jahr', '/Monat');
      var wwTxt = s.wwSys === 'separat' && !r.cons
        ? 'Kein Abzug, das Warmwasser steckt nicht im Verbrauch.'
        : 'Abzug für Warmwasser: ' + fmt(r.cons ? r.cons.ww : r.auto.wwKwh, 0) + ' kWh im Jahr' +
          (r.cons && r.cons.wwSource === 'summer' ? ', aus dem Sommerverbrauch hochgerechnet.' :
           r.cons && r.cons.wwSource === 'manual' ? ', eigener Wert.' :
           (s.wwSys === 'separat' ? '.' : ', geschätzt für ' + fmt(r.persons, 0) + ' Personen.'));
      $('ww-hint').textContent = wwTxt;
      $('eta-label').textContent = s.fuel === 'wp' ? 'Jahresarbeitszahl' : 'Jahresnutzungsgrad';
      $('eta-unit').textContent = s.fuel === 'wp' ? '' : '%';
    }
    show($('f-basis'), !!r.cons);

    // Segmentknöpfe der Dämmstärken markieren
    doc.querySelectorAll('.chips[data-for]').forEach(function (box) {
      var cur = parse($(box.getAttribute('data-for')).value) || 0;
      box.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(parseFloat(b.value) === cur));
      });
    });

    // Automatikwerte als Platzhalter zeigen
    var a = r.auto;
    var ph = {
      te: fmt(a.te, 0), width: fmt(a.width, 1), depth: fmt(a.depth, 1), hg: fmt(a.hg, 2), hl: fmt(a.hl, 2),
      A_wall: fmt(a.A_wall, 1), A_win: fmt(a.A_win, 1), A_door: fmt(a.A_door, 1), A_roof: fmt(a.A_roof, 1),
      A_floor: fmt(a.A_floor, 1), A_party: fmt(a.A_party, 1),
      U_wall: fmt(a.U_wall, 2), U_win: fmt(a.U_win, 2), U_door: fmt(a.U_door, 2), U_roof: fmt(a.U_roof, 2),
      U_floor: fmt(a.U_floor, 2), U_party: fmt(a.U_party, 2),
      dUwb: fmt(a.dUwb, 2), nAir: fmt(a.nAir, 2), tn: fmt(a.tn, 0), hours: fmt(a.hours, 0), wwKwh: fmt(a.wwKwh, 0),
      eta: a.eta === null ? '' : (s.fuel === 'wp' ? fmt(a.eta, 1) : fmt(a.eta * 100, 0))
    };
    Object.keys(ph).forEach(function (k) { $(k).placeholder = ph[k]; });

    $('te-hint').textContent = s.te !== null
      ? 'Eigener Wert. Feld leeren, um wieder den Richtwert zu nutzen.'
      : (r.region ? 'Richtwert für die Region ' + r.region + '.' : 'Ohne Postleitzahl rechnet die Seite mit −12 °C.');
    $('lab-roofU').textContent = r.hull.parts.filter(function (p) { return p.key === 'roof'; }).map(function (p) { return p.label; })[0] || 'Dach';
    $('lab-floorU').textContent = r.hull.parts.filter(function (p) { return p.key === 'floor'; }).map(function (p) { return p.label; })[0] || 'Boden';
    $('lab-partyU').textContent = flat ? 'Nachbarwohnungen' : 'Wand zum Nachbarn';
  }

  var BANDS = [
    { to: 25, label: 'Passivhaus-Niveau' },
    { to: 40, label: 'Neubau, Effizienzhaus' },
    { to: 60, label: 'Gut gedämmter Bestand' },
    { to: 90, label: 'Teilsanierter Bestand' },
    { to: 130, label: 'Unsanierter Altbau' },
    { to: 1e9, label: 'Sehr hoher Wärmebedarf' }
  ];
  var SCALE_MAX = 160;

  function bandOf(spec) {
    for (var i = 0; i < BANDS.length; i++) if (spec < BANDS[i].to) return i;
    return BANDS.length - 1;
  }

  function renderScale(spec) {
    var html = '', from = 0;
    BANDS.forEach(function (b, i) {
      var to = Math.min(b.to, SCALE_MAX);
      html += '<i class="b' + i + '" style="flex:' + (to - from) + '"></i>';
      from = to;
    });
    var pos = Math.min(spec, SCALE_MAX) / SCALE_MAX * 100;
    $('scale').innerHTML = '<div class="scale-bar">' + html + '</div><span class="scale-pin" style="left:' + pos.toFixed(1) + '%"></span>';
    $('scale-label').textContent = BANDS[bandOf(spec)].label;
  }

  function renderParts(hull) {
    var groups = [
      { label: 'Außenwand', keys: ['wall'] },
      { label: 'Fenster und Tür', keys: ['win', 'door'] },
      { label: null, keys: ['roof'] },
      { label: null, keys: ['floor'] },
      { label: 'Wärmebrücken', keys: ['wb'] },
      { label: null, keys: ['party'] },
      { label: 'Lüftung', keys: ['vent'] }
    ];
    var rows = [], max = 0;
    groups.forEach(function (g) {
      var w = 0, label = g.label;
      hull.parts.forEach(function (p) { if (g.keys.indexOf(p.key) >= 0) { w += p.W; if (!label) label = p.label; } });
      if (w > 0) { rows.push({ label: label, W: w }); max = Math.max(max, w); }
    });
    $('parts').innerHTML = rows.map(function (row) {
      return '<li><span class="p-label">' + esc(row.label) + '</span>' +
        '<span class="p-bar"><i style="width:' + (row.W / max * 100).toFixed(1) + '%"></i></span>' +
        '<span class="p-val">' + fmt(row.W / 1000, 2) + ' kW</span>' +
        '<span class="p-pct">' + fmt(row.W / hull.W * 100, 0) + ' %</span></li>';
    }).join('');
  }

  function renderCheck(r) {
    var box = $('check');
    if (!r.cons) {
      box.className = 'check';
      box.innerHTML = '<p class="check-title">Gegenprobe fehlt</p>' +
        '<p>Mit dem Jahresverbrauch der bisherigen Heizung prüft die Seite das Ergebnis gegen die Wirklichkeit. Das ist der wichtigste Schritt für eine sichere Auslegung.</p>';
      return;
    }
    var c = r.cons, dev = c.dev, abs = Math.abs(dev);
    var cls = abs <= 0.15 ? 'ok' : abs <= 0.3 ? 'warn' : 'crit';
    var title = abs <= 0.15 ? 'Stimmig' : abs <= 0.3 ? 'Spürbare Abweichung' : 'Große Abweichung';
    var dir = dev < 0 ? 'unter' : 'über';
    var why = '';
    if (abs > 0.15 && dev < 0) {
      why = 'Typische Gründe: einzelne Räume bleiben kühl, ein Kaminofen heizt mit, oder die Bauteile sind besser als für das Baujahr üblich. Im Detailmodus lassen sich Dämmung, Fenster und Flächen genauer angeben. Bis dahin rechnet die Auslegung mit dem oberen Verbrauchswert als Reserve.';
    } else if (abs > 0.15) {
      why = 'Typische Gründe: höhere Raumtemperaturen, ein schlechterer Kessel als angenommen, viel Warmwasser, oder die Bauteile sind schlechter als für das Baujahr üblich.';
    }
    box.className = 'check ' + cls;
    box.innerHTML = '<p class="check-title"><span class="pill">' + title + '</span></p>' +
      '<p>Aus dem Verbrauch ergeben sich <strong>' + fmt(c.kW, 1) + ' kW</strong> (' + fmt(c.low, 1) + ' bis ' + fmt(c.high, 1) + ' kW). ' +
      'Das liegt ' + fmt(abs * 100, 0) + ' % ' + dir + ' der Berechnung aus der Gebäudehülle.</p>' +
      (why ? '<p>' + why + '</p>' : '') +
      '<p class="fine">Heizwärme ' + fmt(c.qh, 0) + ' kWh im Jahr, das sind ' + fmt(c.perArea, 0) + ' kWh/m². Gerechnet mit ' + fmt(c.hours, 0) + ' Vollbenutzungsstunden.</p>';
  }

  function renderChart(r) {
    var W = 360, H = 200, ml = 34, mr = 14, mt = 26, mb = 30;
    var te = r.te, wp = r.wp;
    var x0 = Math.floor(te - 2), x1 = 18;
    var yMax = wp.pNorm * 1.08 || 1;
    var step = yMax > 20 ? 5 : yMax > 8 ? 2 : yMax > 4 ? 1 : 0.5;
    function X(t) { return ml + (t - x0) / (x1 - x0) * (W - ml - mr); }
    function Y(p) { return H - mb - p / yMax * (H - mt - mb); }
    var g = '';
    for (var p = 0; p <= yMax; p += step) {
      g += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(p).toFixed(1) + '" y2="' + Y(p).toFixed(1) + '"/>' +
        '<text class="tick" x="' + (ml - 6) + '" y="' + (Y(p) + 3.5).toFixed(1) + '" text-anchor="end">' + fmt(p, step < 1 ? 1 : 0) + '</text>';
    }
    for (var t = Math.ceil(x0 / 5) * 5; t <= x1; t += 5) {
      g += '<line class="grid" y1="' + mt + '" y2="' + (H - mb) + '" x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '"/>' +
        '<text class="tick" y="' + (H - mb + 14) + '" x="' + X(t).toFixed(1) + '" text-anchor="middle">' + (t < 0 ? '−' : '') + Math.abs(t) + '</text>';
    }
    var hl = Heat.C.heatLimit;
    var pts = [[te, wp.pNorm], [hl, wp.line(hl)], [x1, wp.line(x1)]];
    var path = pts.map(function (q, i) { return (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }).join(' ');
    var area = path + ' L' + X(x1).toFixed(1) + ' ' + Y(0).toFixed(1) + ' L' + X(te).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z';
    var marks = '';
    function dot(tt, pp, label, cls) {
      marks += '<circle class="dot ' + (cls || '') + '" cx="' + X(tt).toFixed(1) + '" cy="' + Y(pp).toFixed(1) + '" r="4"/>' +
        '<text class="lab" x="' + (X(tt) + 7).toFixed(1) + '" y="' + (Y(pp) - 7).toFixed(1) + '">' + label + '</text>';
    }
    var cap = '';
    if (wp.biv !== null) {
      cap = '<path class="rod" d="M' + X(te).toFixed(1) + ' ' + Y(wp.pNorm).toFixed(1) + ' L' + X(wp.biv).toFixed(1) + ' ' + Y(wp.pReq).toFixed(1) +
        ' L' + X(te).toFixed(1) + ' ' + Y(wp.pReq).toFixed(1) + ' Z"/>' +
        '<line class="cap" x1="' + X(te).toFixed(1) + '" x2="' + X(wp.biv).toFixed(1) + '" y1="' + Y(wp.pReq).toFixed(1) + '" y2="' + Y(wp.pReq).toFixed(1) + '"/>';
    }
    dot(te, wp.pNorm, fmt(wp.pNorm, 1) + ' kW');
    if (wp.biv !== null) dot(wp.biv, wp.pReq, fmt(wp.pReq, 1) + ' kW', 'biv');
    dot(7, wp.line(7), fmt(wp.line(7), 1) + ' kW', 'part');
    $('chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Benötigte Heizleistung über der Außentemperatur">' +
      g + '<path class="fill" d="' + area + '"/>' + cap + '<path class="curve" d="' + path + '"/>' + marks +
      '<text class="axis" x="' + (W - mr) + '" y="' + (H - 3) + '" text-anchor="end">Außentemperatur in °C</text>' +
      '<text class="axis" x="' + ml + '" y="12">kW</text></svg>';
  }

  var lastSummary = '';

  function render() {
    var s = read();
    var r = calc(s);
    syncForm(s, r);

    var kind = { hull: 'Aus der Gebäudehülle berechnet', cons: 'Aus dem Verbrauch abgeleitet', consHigh: 'Oberer Wert aus dem Verbrauch', mean: 'Mittel aus Berechnung und Verbrauch' }[r.basisKind];
    $('r-kw').textContent = fmt(r.basis, 1);
    $('bar-kw').textContent = fmt(r.basis, 1) + ' kW';
    $('r-kind').textContent = kind;
    $('r-cond').textContent = 'bei ' + temp(r.te) + ' außen und ' + temp(r.ti) + ' innen';
    var spec = r.area > 0 ? r.basis * 1000 / r.area : 0;
    $('r-spec').textContent = fmt(spec, 0);
    renderScale(spec);
    $('r-hull').textContent = fmt(r.hull.kW, 1) + ' kW';
    $('r-cons').textContent = r.cons ? fmt(r.cons.kW, 1) + ' kW' : 'nicht angegeben';
    renderParts(r.hull);
    renderCheck(r);
    var g = r.geo;
    var geo = ['Grundfläche ' + fmt(g.w, 1) + ' × ' + fmt(g.d, 1) + ' m', 'Außenwand ' + fmt(g.A_wall, 0) + ' m²', 'Fenster ' + fmt(g.A_win, 0) + ' m²'];
    if (g.hasOwnTop && g.A_roof > 0) geo.push(g.topLabel + ' ' + fmt(g.A_roof, 0) + ' m²');
    if (g.hasOwnBase && g.A_floor > 0) geo.push(g.baseLabel + ' ' + fmt(g.A_floor, 0) + ' m²');
    if (g.A_party > 0 && s.type !== 'efh') geo.push('zum Nachbarn ' + fmt(g.A_party, 0) + ' m²');
    geo.push('Luftwechsel ' + fmt(r.u.nAir, 2) + ' pro Stunde');
    $('r-geo').textContent = 'Angenommen: ' + geo.join(', ') + '.' + (s.mode !== 'detail' ? ' Im Detailmodus lässt sich jeder Wert überschreiben.' : '');

    var wp = r.wp;
    $('wp-kw').textContent = fmt(wp.pReq, 1);
    $('wp-at').textContent = 'Heizleistung bei ' + temp(wp.biv === null ? r.te : wp.biv) + ' Außentemperatur';
    var steps = '<li><span>Heizlast des Gebäudes</span><span>' + fmt(r.basis, 1) + ' kW</span></li>';
    if (wp.wwKw > 0) steps += '<li><span>Warmwasser, ' + fmt(r.persons, 0) + ' Personen</span><span>+ ' + fmt(wp.wwKw, 2) + ' kW</span></li>';
    if (wp.block > 0) steps += '<li><span>Sperrzeit ' + fmt(wp.block, 0) + ' h am Tag</span><span>× ' + fmt(wp.fBlock, 2) + '</span></li>';
    steps += '<li class="sum"><span>Bedarf bei ' + temp(r.te) + '</span><span>' + fmt(wp.pNorm, 1) + ' kW</span></li>';
    if (wp.biv !== null) {
      steps += '<li><span>Davon Wärmepumpe (Bivalenzpunkt ' + temp(wp.biv) + ')</span><span>' + fmt(wp.pReq, 1) + ' kW</span></li>' +
        '<li><span>Heizstab an den kältesten Tagen</span><span>' + fmt(wp.rod, 1) + ' kW</span></li>';
    }
    $('wp-steps').innerHTML = steps;
    $('wp-part').textContent = 'Bei +7 °C braucht das Haus nur noch etwa ' + fmt(wp.line(7), 1) +
      ' kW. Die kleinste Leistungsstufe der Wärmepumpe sollte nicht weit darüber liegen, sonst taktet sie in der Übergangszeit.';
    renderChart(r);

    var typeLabel = { efh: 'Freistehendes Haus', dhh: 'Doppelhaushälfte', reh: 'Reihenendhaus', rmh: 'Reihenmittelhaus', whg: 'Wohnung' }[s.type];
    var lines = [
      'Heizlast-Abschätzung (Heatpilot)',
      typeLabel + ', ' + fmt(r.area, 0) + ' m² Wohnfläche, Baujahr ' + YEARS[s.year].label +
        (s.type !== 'whg' ? ', ' + r.geo.floors + ' Vollgeschoss' + (r.geo.floors > 1 ? 'e' : '') + (r.geo.dg ? ' und ausgebautes Dachgeschoss' : '') : ''),
      'Lage: ' + Heat.EXPO[r.expo].label,
      'Auslegung: ' + temp(r.te) + ' außen, ' + temp(r.ti) + ' innen',
      '',
      'Heizlast des Gebäudes: ' + fmt(r.basis, 1) + ' kW (' + fmt(spec, 0) + ' W/m²) – ' + kind,
      'Berechnung Gebäudehülle: ' + fmt(r.hull.kW, 1) + ' kW'
    ];
    if (r.cons) {
      lines.push('Aus Jahresverbrauch: ' + fmt(r.cons.kW, 1) + ' kW (' + fmt(r.cons.low, 1) + ' bis ' + fmt(r.cons.high, 1) + ' kW), Abweichung ' + (r.cons.dev < 0 ? '−' : '+') + fmt(Math.abs(r.cons.dev) * 100, 0) + ' %');
      lines.push('  Warmwasser bisher: ' + Heat.WWSYS[r.cons.wwSys].label + ', Abzug ' + fmt(r.cons.ww, 0) + ' kWh/Jahr, ' + fmt(r.cons.hours, 0) + ' Vollbenutzungsstunden');
    }
    lines.push('', 'Verluste:');
    r.hull.parts.forEach(function (p) {
      lines.push('  ' + p.label + ': ' + fmt(p.W / 1000, 2) + ' kW' + (p.A ? ' (' + fmt(p.A, 1) + ' m², U = ' + fmt(p.U, 2) + ')' : ''));
    });
    lines.push('', 'Wärmepumpe: mindestens ' + fmt(wp.pReq, 1) + ' kW Heizleistung bei ' + temp(wp.biv === null ? r.te : wp.biv));
    if (wp.wwKw > 0) lines.push('  inklusive Warmwasser-Zuschlag ' + fmt(wp.wwKw, 2) + ' kW');
    if (wp.block > 0) lines.push('  inklusive Sperrzeit ' + fmt(wp.block, 0) + ' h (Faktor ' + fmt(wp.fBlock, 2) + ')');
    if (wp.biv !== null) lines.push('  Heizstab bei ' + temp(r.te) + ': ' + fmt(wp.rod, 1) + ' kW');
    lines.push('', 'Überschlägige Ermittlung. Ersetzt keine raumweise Heizlastberechnung nach DIN EN 12831-1.');
    lastSummary = lines.join('\n');
    save();
  }

  function init() {
    fillSelects();
    // Beispielgebäude als Startzustand
    function defaults() { $('year').value = '4'; $('gen').value = 'nt'; }
    defaults();
    var restored = restore();
    $('example-note').hidden = restored;

    doc.querySelectorAll('.chips[data-for]').forEach(function (box) {
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        $(box.getAttribute('data-for')).value = b.value === '0' ? '' : b.value;
        render();
      });
    });
    doc.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var el = $('te');
        var cur = parse(el.value);
        if (cur === null) cur = parse(el.placeholder) || -12;
        el.value = fmt(Math.max(-30, Math.min(5, cur + parseFloat(b.getAttribute('data-step')))), 1).replace(',0', '');
        render();
      });
    });
    $('form').addEventListener('input', function () { $('example-note').hidden = true; render(); });
    $('form').addEventListener('change', render);
    $('form').addEventListener('submit', function (e) { e.preventDefault(); });
    function resetAll() {
      try { root.localStorage.removeItem(STORE); } catch (e) { /* nichts zu löschen */ }
      $('form').reset();
      defaults();
      $('copy-out').hidden = true;
      $('example-note').hidden = false;
      render();
      $('reset-done').hidden = false;
      root.setTimeout(function () { $('reset-done').hidden = true; }, 2500);
      root.scrollTo(0, 0);
    }
    doc.querySelectorAll('[data-reset]').forEach(function (b) { b.addEventListener('click', resetAll); });
    $('copy').addEventListener('click', function () {
      var out = $('copy-out'), btn = $('copy');
      function fallback() { out.hidden = false; out.value = lastSummary; out.focus(); out.select(); }
      if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(lastSummary).then(function () {
          btn.textContent = 'Kopiert';
          root.setTimeout(function () { btn.textContent = 'Zusammenfassung kopieren'; }, 1800);
        }, fallback);
      } else { fallback(); }
    });
    if ('IntersectionObserver' in root) {
      new root.IntersectionObserver(function (en) {
        $('bar').classList.toggle('off', en[0].isIntersecting);
      }, { threshold: 0.05 }).observe($('result'));
    }
    render();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : this);
