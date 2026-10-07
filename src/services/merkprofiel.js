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
  const m = regel.match(/^(.*?)\s*\(([^()]*(?:PDF|website)[^()]*)\)\s*$/);
  if (!m) return { tekst: regel.trim(), herkomst: { pdf: false, website: false, paginas: [] } };
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
    herkomst: { pdf: /PDF/.test(bron), website: /website/.test(bron), paginas }
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
    const heeftHerkomst = herkomst.pdf || herkomst.website;
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

// Combineert de secties met de reacties van de klant en rekent de voortgang uit.
function bouwWeergave(secties, beoordelingen, meta) {
  let aantalBevestigd = 0;
  const openVragen = [];
  const uit = secties.map((s) => {
    const sectieBeoordeling = beoordelingen[`sectie-${s.nr}`];
    const bevestigd = Boolean(sectieBeoordeling && sectieBeoordeling.status === 'klopt');
    if (bevestigd) aantalBevestigd += 1;
    const feiten = s.feiten.map((f) => {
      const b = beoordelingen[f.id];
      const aangepast = Boolean(b && b.status === 'aangepast' && b.opmerking);
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
    openVragen
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

async function getMerkprofiel(clientNaam) {
  const rij = await getProfielRij(clientNaam);
  if (!rij) return { beschikbaar: false };
  const secties = parseProfiel(rij.concept);
  if (!secties) return { beschikbaar: false };
  const [beoordelingen, uitgeslotenZoektermen] = await Promise.all([
    getBeoordelingen(clientNaam),
    getUitgeslotenZoektermen(clientNaam)
  ]);
  return {
    ...bouwWeergave(secties, beoordelingen, {
      bijgewerkt: rij.aangemaakt || '',
      aantalPaginas: aantalPaginasUitBron(rij.bron_paginas)
    }),
    uitgeslotenZoektermen
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
        opmerking: String(opmerking || '').slice(0, 1000),
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
    const uit = [];
    let subkop = '';
    s.feiten.forEach((f) => {
      const b = beoordelingen[f.id];
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
  KOPJES,
  parseProfiel,
  regelId,
  splitsHerkomst,
  bouwWeergave,
  getMerkprofiel,
  parseMerktermen,
  saveBeoordeling
};
