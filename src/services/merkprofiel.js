// Merkprofiel per klant: de tien vaste kopjes van het klantprofiel, getoond als
// kaarten waarop de klant kan reageren. Bron van de tekst is de n8n Data Table
// "klantprofiel_concepten" (gevuld door BA - Shared - Klantprofiel Concept en
// samengevoegd met de eigen documenten van de klant). Reacties van de klant
// (klopt, niet gebruiken, opmerking) staan in de n8n Data Table
// "profiel_beoordelingen". Alleen bij klanten met merkprofielNaarKennisdocument
// aan schrijft elke reactie het Kennisdocument opnieuw; anders blijven de blog
// workflows ongemoeid.
//
// Matching gebeurt op client_name, exact gelijk aan "naam" in clients.js.

const crypto = require('crypto');
const kennisdocument = require('./kennisdocument');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const PROFIEL_TABLE_ID = process.env.N8N_KLANTPROFIEL_TABLE_ID || 'ZG3rObbabNWtoI28';
const BEOORDELING_TABLE_ID = process.env.N8N_PROFIEL_BEOORDELINGEN_TABLE_ID || 'jl5j77gmLKJp1NAH';

// Alleen rijen met een van deze statussen worden aan de klant getoond. Een
// "concept" of "samengevoegd" profiel is nog niet door Advertisr nagekeken.
const TOONBARE_STATUSSEN = ['definitief concept', 'bevestigd'];

const KOPJES = [
  'Over het bedrijf',
  'Doelgroep',
  'Diensten en aanbod',
  'Werkgebied en bereikbaarheid',
  'Schrijfstijl en termen',
  "USP's",
  'Vakkennis',
  'Geverifieerde feiten en voorwaarden',
  'Niet beweren en verboden onderwerpen',
  'Concurrenten'
];

const TOEGESTANE_STATUSSEN = ['klopt', 'niet_gebruiken', 'opmerking', 'aangepast', 'geen'];

// Sectie 9 bevat de vaste blogregels van Advertisr. Die kan de klant niet uitsluiten.
const BESCHERMDE_SECTIE = 9;
const CONCURRENTEN_SECTIE = 10;

// Regels waarin het profiel meldt dat website en kennisdocument elkaar tegenspreken.
function isTegenstrijdigheid(tekst) {
  return /^website\s+(wijkt af|spreekt zichzelf tegen)/i.test(String(tekst || '').trim());
}

// Haalt onderwerp en de twee kanten uit een melding als "Website wijkt af van het
// kennisdocument over de Tipi/Cabin. De website noemt maximaal 8 personen, terwijl
// het kennisdocument een bezetting van 1 tot 7 personen noemt." Past de melding
// niet in dat patroon, dan krijgt de klant alleen "eigen antwoord" en "niet noemen".
function leesTegenstrijdigheid(tekst) {
  const t = String(tekst || '').trim();
  const m = t.match(/^website\s+wijkt af van het kennisdocument over\s+(.+?)\.\s+de website noemt\s+(.+?),?\s+terwijl het kennisdocument\s+(.+?)\s+noemt\.?$/i);
  if (!m) return { onderwerp: '', website: '', document: '', opties: [] };
  const hoofd = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const onderwerp = m[1].trim();
  const website = m[2].trim();
  const document = m[3].trim();
  return {
    onderwerp,
    website,
    document,
    opties: [
      { sleutel: 'website', label: 'De website klopt', waarde: website, tekst: `${hoofd(onderwerp)}: ${website} (volgens de website).` },
      { sleutel: 'document', label: 'Het eigen document klopt', waarde: document, tekst: `${hoofd(onderwerp)}: ${document} (volgens het eigen document).` }
    ]
  };
}

// Regel in het Kennisdocument voor een tegenstrijdigheid. Heeft de klant gekozen,
// dan staat daar de gekozen tekst, anders een waarschuwing dat het niet genoemd
// mag worden. De woorden "wijkt af" blijven in de waarschuwing staan, want de
// workflow Bestaande blogs verbeteren herkent daar onzekere feiten aan.
function tegenstrijdigheidRegel(feitTekst, beoordeling) {
  const status = beoordeling ? beoordeling.status : 'geen';
  if (status === 'aangepast' && beoordeling.opmerking) {
    return `Vastgesteld door de klant, gaat voor op andere vermeldingen: ${beoordeling.opmerking}`;
  }
  if (status === 'niet_gebruiken') {
    return `Onzeker, de klant koos om dit niet te noemen in blogs: ${feitTekst}`;
  }
  return `Onzeker, nog geen keuze gemaakt, niet noemen in blogs: ${feitTekst}`;
}

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, het Merkprofiel-tabblad kan niet bij n8n.');
  return key;
}

async function n8nRows(tableId, path, options = {}) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${tableId}${path}`, {
    ...options,
    headers: {
      'X-N8N-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    // niet-JSON antwoord: alleen relevant als res.ok ook false is
  }
  if (!res.ok) {
    throw new Error(`n8n-datatabel gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  }
  return data;
}

function filterEq(velden) {
  return {
    type: 'and',
    filters: Object.keys(velden).map((columnName) => ({ columnName, condition: 'eq', value: velden[columnName] }))
  };
}

function regelId(tekst) {
  const schoon = String(tekst).toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update(schoon).digest('hex').slice(0, 12);
}

// Haalt de herkomst achter een feit weg, bijvoorbeeld "(PDF, website: /contact)".
function splitsHerkomst(regel) {
  const m = regel.match(/^(.*?)\s*\(([^()]*(?:PDF|website|kennisdocument)[^()]*)\)\s*$/);
  if (!m) return { tekst: regel.trim(), herkomst: { pdf: false, website: false, kennisdocument: false, paginas: [] } };
  const bron = m[2];
  const paginas = [];
  const re = /website:\s*(\/[^\s,)]*)/g;
  let p;
  while ((p = re.exec(bron)) !== null) paginas.push(p[1]);
  const extraPaden = bron.match(/,\s*(\/[^\s,)]+)/g) || [];
  extraPaden.forEach((x) => {
    const pad = x.replace(/^,\s*/, '');
    if (!paginas.includes(pad)) paginas.push(pad);
  });
  return {
    tekst: m[1].trim(),
    herkomst: { pdf: /PDF/.test(bron), website: /website/.test(bron), kennisdocument: /kennisdocument/.test(bron), paginas }
  };
}

function isOpenPunt(tekst) {
  return /niet gevonden op de website|nog te bevestigen|nog niet bevestigd/i.test(tekst);
}

// Zet de profieltekst om in tien secties. Geeft null terug als de tekst niet
// de vaste kopjes heeft, zodat het tabblad dan "nog niet vastgesteld" toont.
function parseProfiel(tekst) {
  const regels = String(tekst || '').split(/\r?\n/);
  const secties = [];
  let huidig = null;
  let subkop = '';
  for (const rauw of regels) {
    const regel = rauw.trim();
    if (!regel) continue;
    const kop = regel.match(/^(\d{1,2})\.\s+(.+)$/);
    const volgende = secties.length + 1;
    if (kop && Number(kop[1]) === volgende && volgende <= KOPJES.length &&
        kop[2].toLowerCase().startsWith(KOPJES[volgende - 1].toLowerCase().slice(0, 8))) {
      huidig = { nr: volgende, titel: KOPJES[volgende - 1], feiten: [] };
      secties.push(huidig);
      subkop = '';
      continue;
    }
    if (!huidig) continue;
    if (/^Log:/i.test(regel)) continue;
    const { tekst: schoon, herkomst } = splitsHerkomst(regel);
    const heeftHerkomst = herkomst.pdf || herkomst.website || herkomst.kennisdocument;
    if (!heeftHerkomst && schoon.length < 70 && !/[.!?:]$/.test(schoon) && !isOpenPunt(schoon)) {
      subkop = schoon;
      continue;
    }
    huidig.feiten.push({
      id: regelId(schoon),
      tekst: schoon,
      herkomst,
      subkop,
      intern: /^prijzen/i.test(subkop),
      open: isOpenPunt(schoon)
    });
  }
  if (secties.length !== KOPJES.length) return null;
  return secties;
}

async function getProfielRij(clientNaam) {
  const filter = encodeURIComponent(JSON.stringify(filterEq({ client_name: clientNaam })));
  const result = await n8nRows(PROFIEL_TABLE_ID, `/rows?limit=250&filter=${filter}`);
  const rijen = (result.data || []).filter((r) => TOONBARE_STATUSSEN.includes(r.status));
  rijen.sort((a, b) => Number(a.id) - Number(b.id));
  return rijen.length ? rijen[rijen.length - 1] : null;
}

async function getBeoordelingen(clientNaam) {
  const filter = encodeURIComponent(JSON.stringify(filterEq({ client_name: clientNaam })));
  const result = await n8nRows(BEOORDELING_TABLE_ID, `/rows?limit=250&filter=${filter}`);
  const kaart = {};
  (result.data || []).forEach((r) => {
    kaart[r.regel_id] = { status: r.status, opmerking: r.opmerking || '', datum: r.datum || '' };
  });
  return kaart;
}

const SAMENVATTING_LABELS = ['Wie jullie zijn', 'Voor wie jullie er zijn', 'Wat jullie onderscheidt', 'Zo klinken jullie', 'Waar we niet over schrijven'];
const SAMENVATTING_ID = 'samenvatting';

// Zet de vijf regels van "In het kort" om in label en tekst. Geeft null terug
// als een van de vijf labels ontbreekt, dan toont het tabblad het blok niet.
function parseSamenvatting(tekst) {
  const regels = String(tekst || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const uit = [];
  for (const label of SAMENVATTING_LABELS) {
    const r = regels.find((x) => x.toLowerCase().indexOf(label.toLowerCase() + ':') === 0);
    if (!r) return null;
    uit.push({ label, tekst: r.slice(label.length + 1).trim() });
  }
  return uit;
}

// Combineert het blok met de reactie van de klant. Een aanpassing is dezelfde
// vijf regels met de tekst van de klant.
function bouwSamenvatting(rauw, beoordelingen) {
  const origineel = parseSamenvatting(rauw);
  if (!origineel) return null;
  const b = beoordelingen[SAMENVATTING_ID];
  const aangepast = b && b.status === 'aangepast' ? parseSamenvatting(b.opmerking) : null;
  return {
    regels: aangepast || origineel,
    aangepast: Boolean(aangepast),
    bevestigd: Boolean(b && (b.status === 'klopt' || aangepast)),
    bevestigdOp: b ? b.datum : '',
    origineelTekst: origineel.map((r) => `${r.label}: ${r.tekst}`).join('\n')
  };
}

// Combineert de secties met de reacties van de klant en rekent de voortgang uit.
function bouwWeergave(secties, beoordelingen, meta) {
  let aantalBevestigd = 0;
  const openVragen = [];
  const tegenstrijdigheden = [];
  const uit = secties.map((s) => {
    const sectieBeoordeling = beoordelingen[`sectie-${s.nr}`];
    const bevestigd = Boolean(sectieBeoordeling && sectieBeoordeling.status === 'klopt');
    if (bevestigd) aantalBevestigd += 1;
    const feiten = s.feiten.map((f) => {
      const b = beoordelingen[f.id];
      const aangepast = Boolean(b && b.status === 'aangepast' && b.opmerking);
      if (isTegenstrijdigheid(f.tekst)) {
        const besluit = aangepast ? 'gekozen' : (b && b.status === 'niet_gebruiken' ? 'niet_noemen' : '');
        tegenstrijdigheden.push({
          id: f.id,
          sectie: s.titel,
          tekst: f.tekst,
          besluit,
          keuzeTekst: aangepast ? b.opmerking : '',
          ...leesTegenstrijdigheid(f.tekst)
        });
        return { ...f, tegenstrijdig: true, status: b ? b.status : 'geen', origineel: '', opmerking: '', beschermd: true };
      }
      if (f.open && !(b && b.status === 'klopt') && !aangepast) openVragen.push({ sectie: s.titel, tekst: f.tekst });
      return {
        ...f,
        origineel: aangepast ? f.tekst : '',
        tekst: aangepast ? b.opmerking : f.tekst,
        open: aangepast ? false : f.open,
        beschermd: s.nr === BESCHERMDE_SECTIE,
        status: b ? b.status : 'geen',
        opmerking: b && b.status !== 'aangepast' ? b.opmerking : ''
      };
    });
    return {
      nr: s.nr,
      titel: s.titel,
      bevestigd,
      bevestigdOp: sectieBeoordeling ? sectieBeoordeling.datum : '',
      feiten
    };
  });
  return {
    beschikbaar: true,
    bijgewerkt: meta.bijgewerkt,
    aantalPaginas: meta.aantalPaginas,
    aantalSecties: secties.length,
    aantalBevestigd,
    secties: uit,
    openVragen,
    tegenstrijdigheden,
    aantalOpenTegenstrijdigheden: tegenstrijdigheden.filter((t) => !t.besluit).length
  };
}

function aantalPaginasUitBron(bron) {
  // Het bronveld bevat de gebruikte pagina's gescheiden door " | ". De
  // samengevoegde variant begint met "Samengevoegd uit"; dan tellen we niet.
  const delen = String(bron || '').split(' | ').filter((x) => /^https?:\/\//.test(x.trim()));
  return delen.length;
}

const CLIENTS_TABLE_ID = process.env.N8N_CLIENTS_TABLE_ID || '42vYfT6ktan72bpa';

// Zoektermen die de blog automation niet als kans toont (merknamen, ruimtenamen,
// adressen). Staan in Clients.merktermen, gescheiden door puntkomma.
function parseMerktermen(tekst) {
  const gezien = new Set();
  return String(tekst || '')
    .split(';')
    .map((t) => t.trim())
    .filter((t) => {
      const sleutel = t.toLowerCase();
      if (!t || gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    });
}

async function getUitgeslotenZoektermen(clientNaam) {
  try {
    const filter = encodeURIComponent(JSON.stringify(filterEq({ client_name: clientNaam })));
    const result = await n8nRows(CLIENTS_TABLE_ID, `/rows?limit=1&filter=${filter}`);
    const rij = (result.data || [])[0];
    return rij ? parseMerktermen(rij.merktermen) : [];
  } catch (err) {
    // Extra informatie: ontbreekt die, dan werkt het profiel gewoon.
    return [];
  }
}

// Termen die we in blogs niet gebruiken (verboden_termen) en vaste schrijfwijzen
// (vaste_termen), beide puntkomma gescheiden in de Clients rij. De reden per term
// staat in de tabel klant_termen. Die tabel is optioneel: alleen als
// N8N_TERMEN_TABLE_ID (of TERMEN_TABLE_ID hieronder) gevuld is, wordt hij gelezen.
const TERMEN_TABLE_ID = '';

function termenTableId() {
  return process.env.N8N_TERMEN_TABLE_ID || TERMEN_TABLE_ID || '';
}

function bouwKlantTermen(rij, redenRijen) {
  const redenen = {};
  (redenRijen || []).forEach((r) => {
    if (!r || !r.term) return;
    redenen[`${String(r.soort || '').toLowerCase()}|${String(r.term).trim().toLowerCase()}`] = String(r.reden || '').trim();
  });
  const maak = (tekst, soort) => parseMerktermen(tekst).map((term) => ({
    term,
    reden: redenen[`${soort}|${term.toLowerCase()}`] || ''
  }));
  return {
    verboden: maak(rij && rij.verboden_termen, 'verboden'),
    vast: maak(rij && rij.vaste_termen, 'vast')
  };
}

async function getKlantTermen(clientNaam) {
  const leeg = { verboden: [], vast: [] };
  try {
    const filter = encodeURIComponent(JSON.stringify(filterEq({ client_name: clientNaam })));
    const result = await n8nRows(CLIENTS_TABLE_ID, `/rows?limit=1&filter=${filter}`);
    const rij = (result.data || [])[0];
    if (!rij) return leeg;
    let redenRijen = [];
    const tabel = termenTableId();
    if (tabel) {
      try {
        const res = await n8nRows(tabel, `/rows?limit=250&filter=${filter}`);
        redenRijen = res.data || [];
      } catch (err) {
        // Zonder redenen tonen we de termen gewoon zonder uitleg.
      }
    }
    return bouwKlantTermen(rij, redenRijen);
  } catch (err) {
    return leeg;
  }
}

// Sleutel voor het vergelijken van termen. Gelijk aan de berekening in de n8n
// workflow BA - Shared - Termen Afleiden: kleine letters, zonder accenten, ß als ss,
// streepjes en leestekens als spatie.
function termSleutel(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('\u00df').join('ss')
    .replace(/[\u2010-\u2015\-_]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Eindlijst = automatische termen zonder de uitgezonderde, plus de handmatige.
// Dezelfde regel als bouwEind in de n8n workflow, zodat de nachtelijke run niets
// terugdraait.
function bouwVerbodenEindlijst(auto, handmatig, uitgezonderd) {
  const uit = new Set(uitgezonderd.map(termSleutel));
  const gezien = new Set();
  const eind = [];
  auto.concat(handmatig).forEach((term) => {
    const k = termSleutel(term);
    if (!k || gezien.has(k) || uit.has(k)) return;
    gezien.add(k);
    eind.push(term);
  });
  return eind;
}

function schoneTerm(term) {
  const t = String(term || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 40) throw new Error('Een term moet tussen 3 en 40 tekens zijn.');
  if (t.includes(';')) throw new Error('Gebruik geen puntkomma in een term.');
  return t;
}

async function leesClientsRij(clientNaam) {
  const filter = encodeURIComponent(JSON.stringify(filterEq({ client_name: clientNaam })));
  const result = await n8nRows(CLIENTS_TABLE_ID, `/rows?limit=1&filter=${filter}`);
  return (result.data || [])[0] || null;
}

async function getVerbodenBeheer(clientNaam) {
  try {
    const rij = await leesClientsRij(clientNaam);
    return {
      handmatig: parseMerktermen(rij && rij.verboden_handmatig),
      uitgezonderd: parseMerktermen(rij && rij.verboden_uitgezonderd)
    };
  } catch (err) {
    return { handmatig: [], uitgezonderd: [] };
  }
}

// actie: voeg (term erbij, of een eerder verwijderde automatische term terugzetten),
// verwijder (handmatige term weg, of automatische term uitzonderen).
// Schrijft de eindlijst meteen mee, zodat de eerstvolgende blogrun hem gebruikt.
async function wijzigVerbodenTerm(clientNaam, { actie, term }) {
  if (actie !== 'voeg' && actie !== 'verwijder') throw new Error('Onbekende actie.');
  const schoon = schoneTerm(term);
  const sleutel = termSleutel(schoon);
  if (!sleutel) throw new Error('Deze term is niet geldig.');
  const rij = await leesClientsRij(clientNaam);
  if (!rij) throw new Error('Klant niet gevonden.');
  const auto = parseMerktermen(rij.verboden_auto);
  let handmatig = parseMerktermen(rij.verboden_handmatig);
  let uitgezonderd = parseMerktermen(rij.verboden_uitgezonderd);
  const gelijk = (t) => termSleutel(t) === sleutel;
  const inAuto = auto.some(gelijk);
  if (actie === 'voeg') {
    if (uitgezonderd.some(gelijk)) uitgezonderd = uitgezonderd.filter((t) => !gelijk(t));
    else if (!inAuto && !handmatig.some(gelijk)) handmatig = handmatig.concat([schoon]);
  } else if (handmatig.some(gelijk)) {
    handmatig = handmatig.filter((t) => !gelijk(t));
  } else if (inAuto && !uitgezonderd.some(gelijk)) {
    uitgezonderd = uitgezonderd.concat([auto.find(gelijk)]);
  }
  const eind = bouwVerbodenEindlijst(auto, handmatig, uitgezonderd);
  const data = {
    verboden_handmatig: handmatig.join('; '),
    verboden_uitgezonderd: uitgezonderd.join('; '),
    verboden_termen: eind.join('; ')
  };
  await n8nRows(CLIENTS_TABLE_ID, '/rows/upsert', {
    method: 'POST',
    body: JSON.stringify({ filter: filterEq({ client_name: clientNaam }), data })
  });
  return { verboden: eind, handmatig, uitgezonderd };
}

async function getMerkprofiel(clientNaam) {
  const rij = await getProfielRij(clientNaam);
  if (!rij) return { beschikbaar: false };
  const secties = parseProfiel(rij.concept);
  if (!secties) return { beschikbaar: false };
  const [beoordelingen, uitgeslotenZoektermen, klantTermen, verbodenBeheer] = await Promise.all([
    getBeoordelingen(clientNaam),
    getUitgeslotenZoektermen(clientNaam),
    getKlantTermen(clientNaam),
    getVerbodenBeheer(clientNaam)
  ]);
  return {
    ...bouwWeergave(secties, beoordelingen, {
      bijgewerkt: rij.aangemaakt || '',
      aantalPaginas: aantalPaginasUitBron(rij.bron_paginas)
    }),
    samenvatting: bouwSamenvatting(rij.samenvatting, beoordelingen),
    uitgeslotenZoektermen,
    verbodenTermen: klantTermen.verboden,
    vasteTermen: klantTermen.vast,
    verbodenHandmatig: verbodenBeheer.handmatig,
    verbodenUitgezonderd: verbodenBeheer.uitgezonderd
  };
}

async function saveBeoordeling(clientNaam, { regelId: id, status, opmerking, regelTekst }) {
  if (!id || typeof id !== 'string' || id.length > 40) throw new Error('Onbekend onderdeel.');
  if (!TOEGESTANE_STATUSSEN.includes(status)) throw new Error('Onbekende keuze.');
  const vandaag = new Date().toISOString().split('T')[0];
  await n8nRows(BEOORDELING_TABLE_ID, '/rows/upsert', {
    method: 'POST',
    body: JSON.stringify({
      filter: filterEq({ client_name: clientNaam, regel_id: id }),
      data: {
        client_name: clientNaam,
        regel_id: id,
        status,
        opmerking: String(opmerking || '').slice(0, id === SAMENVATTING_ID ? 2000 : 1000),
        regel_tekst: String(regelTekst || '').slice(0, 500),
        datum: vandaag
      }
    })
  });
  return { datum: vandaag };
}

// Stelt de tekst van het Kennisdocument samen uit het profiel en de reacties
// van de klant: uitgesloten feiten en onbeantwoorde open punten vallen weg,
// aangepaste feiten krijgen de tekst van de klant.
function bouwKennisdocument(secties, beoordelingen) {
  const regels = [];
  secties.forEach((s) => {
    // Alleen voor Advertisr en de klant: concurrenten (staan in Clients) komen niet bij de schrijver.
    if (s.nr === CONCURRENTEN_SECTIE) return;
    const uit = [];
    let subkop = '';
    s.feiten.forEach((f) => {
      // Prijzen mogen nooit in blogs.
      if (f.intern) return;
      const b = beoordelingen[f.id];
      // Website en kennisdocument spreken elkaar tegen: de keuze van de klant gaat voor,
      // zonder keuze komt er een waarschuwing dat dit niet genoemd mag worden.
      if (isTegenstrijdigheid(f.tekst)) {
        if (f.subkop && f.subkop !== subkop) uit.push(f.subkop);
        subkop = f.subkop;
        uit.push(tegenstrijdigheidRegel(f.tekst, b));
        return;
      }
      const status = b ? b.status : 'geen';
      if (status === 'niet_gebruiken' && s.nr !== BESCHERMDE_SECTIE) return;
      const aangepast = status === 'aangepast' && b.opmerking;
      if (f.open && !aangepast && status !== 'klopt') return;
      if (f.subkop && f.subkop !== subkop) uit.push(f.subkop);
      subkop = f.subkop;
      const label = aangepast || status === 'klopt' ? ' (klant bevestigd)' : '';
      uit.push((aangepast ? b.opmerking : f.tekst) + label);
    });
    regels.push(`${s.nr}. ${s.titel}`, ...uit, '');
  });
  return regels.join('\n').trim() + '\n';
}

// Schrijft het Kennisdocument opnieuw na een reactie van de klant. Alleen
// aangeroepen voor klanten met merkprofielNaarKennisdocument aan in clients.js.
const SYNC_BRON = 'Merkprofiel (bevestigd door klant)';

// Bewaart het Kennisdocument zoals het was, de eerste keer dat het profiel het
// overneemt, zodat de overstap terug te draaien is. De rij krijgt een status
// die het tabblad niet toont en komt in dezelfde tabel als de profielen.
async function bewaarBackup(clientNaam, huidig) {
  if (!huidig.tekst || !huidig.tekst.trim() || huidig.bron === SYNC_BRON) return false;
  await n8nRows(PROFIEL_TABLE_ID, '/rows', {
    method: 'POST',
    body: JSON.stringify({
      data: [{
        client_name: clientNaam,
        concept: huidig.tekst,
        bron_paginas: huidig.bron || '',
        aangemaakt: new Date().toISOString().split('T')[0],
        status: 'backup kennisdocument',
        verslag: 'Back-up van het Kennisdocument voor de overstap naar het merkprofiel',
        verschillen: ''
      }],
      returnType: 'count'
    })
  });
  return true;
}

async function syncKennisdocument(clientNaam) {
  const rij = await getProfielRij(clientNaam);
  if (!rij) throw new Error('Geen vastgesteld profiel gevonden.');
  const secties = parseProfiel(rij.concept);
  if (!secties) throw new Error('Het profiel heeft niet de vaste kopjes.');
  const beoordelingen = await getBeoordelingen(clientNaam);
  const tekst = bouwKennisdocument(secties, beoordelingen);
  const huidig = await kennisdocument.getKennisdocument(clientNaam);
  const backup = await bewaarBackup(clientNaam, huidig);
  const result = await kennisdocument.saveKennisdocument(clientNaam, tekst, SYNC_BRON);
  return { ...result, backup };
}


// ---- Profiel opbouwen vanuit /admin of de intake ----

const PROFIEL_WEBHOOK = process.env.N8N_KLANTPROFIEL_WEBHOOK || '';
const BEZIG_MAX_MINUTEN = 20;

// Bepaalt uit alle rijen van een klant wat de stand is: nog niet gemaakt, bezig,
// klaar (definitief concept), bevestigd, leeg of mislukt. Een run die langer dan
// 20 minuten bezig staat geldt als mislukt (een normale run duurt ongeveer 4).
function bepaalProfielStatus(rijen, nu = new Date()) {
  const relevant = (rijen || []).filter((r) => ['bezig', 'mislukt', 'leeg', 'definitief concept', 'bevestigd'].includes(r.status));
  if (!relevant.length) return { status: 'geen' };
  relevant.sort((a, b) => Number(a.id) - Number(b.id));
  const laatste = relevant[relevant.length - 1];
  const heeftBevestigd = relevant.some((r) => r.status === 'bevestigd');
  let status = laatste.status;
  if (status === 'bezig') {
    const sinds = new Date(laatste.createdAt || laatste.aangemaakt || 0).getTime();
    if (!sinds || (nu.getTime() - sinds) / 60000 > BEZIG_MAX_MINUTEN) status = 'mislukt';
  }
  return { status, aangemaakt: laatste.aangemaakt || '', verslag: laatste.verslag || '', heeftBevestigd };
}

async function getProfielStatus(clientNaam) {
  const filter = encodeURIComponent(JSON.stringify(filterEq({ client_name: clientNaam })));
  const result = await n8nRows(PROFIEL_TABLE_ID, `/rows?limit=250&filter=${filter}`);
  const stand = bepaalProfielStatus(result.data || []);
  if (stand.status === 'definitief concept' || stand.status === 'bevestigd') {
    const reacties = await getBeoordelingen(clientNaam);
    stand.heeftReacties = Object.keys(reacties).length > 0;
  }
  return stand;
}

async function schrijfStatusRij(clientNaam, status, verslag) {
  await n8nRows(PROFIEL_TABLE_ID, '/rows', {
    method: 'POST',
    body: JSON.stringify({
      data: [{
        client_name: clientNaam,
        concept: '',
        bron_paginas: '',
        aangemaakt: new Date().toISOString(),
        status,
        verslag: verslag || '',
        verschillen: ''
      }],
      returnType: 'count'
    })
  });
}

async function startProfiel(clientNaam, website, { force = false } = {}) {
  const naam = String(clientNaam || '').trim();
  const site = String(website || '').trim();
  if (!naam) throw new Error('Vul de klantnaam in.');
  if (!site) throw new Error('Vul de website van de klant in.');
  if (!PROFIEL_WEBHOOK) throw new Error('N8N_KLANTPROFIEL_WEBHOOK is niet gezet, het profiel kan niet gestart worden.');
  const stand = await getProfielStatus(naam);
  if (stand.status === 'bezig') throw new Error('Het profiel wordt al opgebouwd. Wacht tot dit klaar is.');
  if ((stand.heeftBevestigd || stand.heeftReacties) && !force) {
    const err = new Error('De klant heeft dit profiel al bevestigd of er al op gereageerd. Opnieuw opbouwen maakt een nieuw concept. Bevestig dat om door te gaan.');
    err.code = 'BEVESTIGING_NODIG';
    throw err;
  }
  await schrijfStatusRij(naam, 'bezig', 'Profiel wordt opgebouwd vanaf ' + site);
  let res;
  try {
    res = await fetch(PROFIEL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ klant: naam, website: site })
    });
  } catch (err) {
    await schrijfStatusRij(naam, 'mislukt', 'n8n was niet bereikbaar: ' + err.message);
    throw new Error('n8n is niet bereikbaar. Probeer het later opnieuw.');
  }
  if (!res.ok) {
    await schrijfStatusRij(naam, 'mislukt', 'n8n gaf status ' + res.status + '. Is de workflow gepubliceerd?');
    throw new Error('n8n nam de opdracht niet aan (status ' + res.status + '). Staat de workflow Klantprofiel Concept gepubliceerd?');
  }
  return { ok: true };
}

module.exports = {
  bepaalProfielStatus,
  getProfielStatus,
  startProfiel,
  bouwKennisdocument,
  syncKennisdocument,
  isTegenstrijdigheid,
  leesTegenstrijdigheid,
  KOPJES,
  parseProfiel,
  regelId,
  splitsHerkomst,
  parseSamenvatting,
  bouwSamenvatting,
  bouwWeergave,
  getMerkprofiel,
  parseMerktermen,
  bouwKlantTermen,
  getKlantTermen,
  termSleutel,
  bouwVerbodenEindlijst,
  wijzigVerbodenTerm,
  saveBeoordeling
};
