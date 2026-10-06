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

async function getMerkprofiel(clientNaam) {
  const rij = await getProfielRij(clientNaam);
  if (!rij) return { beschikbaar: false };
  const secties = parseProfiel(rij.concept);
  if (!secties) return { beschikbaar: false };
  const beoordelingen = await getBeoordelingen(clientNaam);
  return bouwWeergave(secties, beoordelingen, {
    bijgewerkt: rij.aangemaakt || '',
    aantalPaginas: aantalPaginasUitBron(rij.bron_paginas)
  });
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
async function syncKennisdocument(clientNaam) {
  const rij = await getProfielRij(clientNaam);
  if (!rij) throw new Error('Geen vastgesteld profiel gevonden.');
  const secties = parseProfiel(rij.concept);
  if (!secties) throw new Error('Het profiel heeft niet de vaste kopjes.');
  const beoordelingen = await getBeoordelingen(clientNaam);
  const tekst = bouwKennisdocument(secties, beoordelingen);
  return kennisdocument.saveKennisdocument(clientNaam, tekst, 'Merkprofiel (bevestigd door klant)');
}

module.exports = {
  bouwKennisdocument,
  syncKennisdocument,
  KOPJES,
  parseProfiel,
  regelId,
  splitsHerkomst,
  bouwWeergave,
  getMerkprofiel,
  saveBeoordeling
};
