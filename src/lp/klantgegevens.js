// LP Fabriek klantgegevens in Notion (Pagr. stap 10, 14-10-2026).
//
// Profiel en feiten per klant staan in de Notion database "LP Klantgegevens" (een rij per klant, de gegevens
// als twee JSON blokken in de pagina, net als de pagina's in de LP database). Zo is een nieuwe klant of een
// nieuw feit een kwestie van invullen in het portaal, zonder deploy.
//
// De code in src/lp/clients blijft het vangnet en de basis:
//  - Een klant die in code staat (MAC Bouw, Roots) krijgt de bewerkbare velden uit Notion eroverheen. Staat
//    er niets in Notion, dan geldt gewoon de code. Technische velden (WordPress variabelen, formulier, SEO
//    plugin, kloonbronnen, tokens) blijven altijd uit de code.
//  - Een klant die alleen in Notion staat, krijgt standaardwaarden voor die technische velden. Wachtwoorden en
//    tokens staan nooit in Notion, alleen op Render (WP_URL_<ID>, WP_USERNAME_<ID>, WP_APP_PASSWORD_<ID>).
//
// getLpClient blijft synchroon: de gegevens staan in het geheugen en worden elke paar minuten ververst.
// Het exportobject "clients" wordt ter plekke aangepast, omdat andere bestanden er een verwijzing naar vasthouden.
// Een storing in Notion laat de laatst bekende stand staan en breekt nooit de LP Fabriek.

const { Client } = require('@notionhq/client');
const { clients } = require('./clients');
const { slugify } = require('./utils');

const DATABASE_ID = process.env.LP_KLANTGEGEVENS_DATABASE_ID || '926632fa-da31-464a-ad31-24ee36592459';
const VERVERS_MS = 5 * 60 * 1000;
const MAX_FEITEN = 200;

// Wat uit Notion mag komen. Alles daarbuiten blijft uit de code.
const PROFIEL_VELDEN = ['naam', 'bedrijf', 'nietToegestaan', 'toonNotitie', 'fotoRichtlijn'];

const diepKopie = (v) => JSON.parse(JSON.stringify(v));

// De stand zoals in code, vastgelegd bij het laden van dit bestand. Zo kan een rij uit Notion later weer
// verdwijnen en gaat de klant terug naar de code.
const CODE_BASIS = {};
Object.keys(clients).forEach((id) => { CODE_BASIS[id] = { profile: diepKopie(clients[id].profile), feiten: diepKopie(clients[id].feiten) }; });

let notion = null;
function getNotion() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) throw new Error('NOTION_TOKEN_ADMIN is niet gezet, de klantgegevens in Notion zijn niet bereikbaar.');
  notion = new Client({ auth: token });
  return notion;
}

let notionData = new Map(); // klantId -> { pageId, profiel, feiten }
let laatsteVerversing = 0;
let laatsteFout = '';

// ---- Opschonen (alles wat van buiten komt) ----

function tekst(v, max = 500) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function lijst(v, max = 20, lengte = 300) {
  const bron = Array.isArray(v) ? v : String(v || '').split('\n');
  return bron.map((x) => tekst(x, lengte)).filter(Boolean).slice(0, max);
}

function schoonKlantId(id) {
  const s = slugify(String(id || '')).replace(/-/g, '');
  return s.slice(0, 40);
}

function schoonProfiel(invoer) {
  const i = invoer || {};
  const b = i.bedrijf || {};
  const a = b.adres || {};
  const bedrijf = {
    naam: tekst(b.naam, 120),
    url: tekst(b.url, 300),
    telefoon: tekst(b.telefoon, 40),
    email: tekst(b.email, 120),
    adres: { straat: tekst(a.straat, 120), postcode: tekst(a.postcode, 20), plaats: tekst(a.plaats, 80), land: tekst(a.land || 'NL', 5) || 'NL' },
    werkgebied: lijst(b.werkgebied, 30, 80)
  };
  if (bedrijf.url && !/^https?:\/\//i.test(bedrijf.url)) bedrijf.url = 'https://' + bedrijf.url;
  return {
    naam: tekst(i.naam, 120),
    bedrijf,
    nietToegestaan: lijst(i.nietToegestaan, 20, 300),
    toonNotitie: tekst(i.toonNotitie, 600),
    fotoRichtlijn: tekst(i.fotoRichtlijn, 600)
  };
}

function schoonFeiten(invoer) {
  const uit = [];
  const gebruikt = new Set();
  (Array.isArray(invoer) ? invoer : []).slice(0, MAX_FEITEN).forEach((f, i) => {
    const label = tekst(f && f.label, 120);
    const waarde = tekst(f && f.waarde, 1000);
    const bron = tekst(f && f.bron, 300);
    if (!label && !waarde && !bron) return; // lege regel in het formulier
    if (!label || !waarde) throw new Error(`Feit ${i + 1}: vul een naam en een waarde in.`);
    if (!bron) throw new Error(`Feit "${label}" heeft nog geen bron. Een feit zonder bron mag er niet in.`);
    let id = slugify(tekst(f.id, 80) || label) || `feit-${i + 1}`;
    let n = 2;
    const basis = id;
    while (gebruikt.has(id)) id = `${basis}-${n++}`;
    gebruikt.add(id);
    const feit = { id, label, waarde, bron };
    if (f.standaard) feit.standaard = true;
    uit.push(feit);
  });
  return uit;
}

// ---- Samenvoegen met de code ----

function standaardProfiel(id, p) {
  const sleutel = id.toUpperCase();
  return {
    id,
    naam: p.naam || id,
    taal: 'nl',
    wordpress: { urlEnv: `WP_URL_${sleutel}`, usernameEnv: `WP_USERNAME_${sleutel}`, appPasswordEnv: `WP_APP_PASSWORD_${sleutel}` },
    tokensId: id,
    nietToegestaan: [],
    toonNotitie: ''
  };
}

function bouwKlant(id, notionKlant) {
  const basis = CODE_BASIS[id];
  const p = notionKlant.profiel || {};
  const profile = basis ? diepKopie(basis.profile) : standaardProfiel(id, p);
  PROFIEL_VELDEN.forEach((veld) => {
    if (p[veld] === undefined) return;
    if (veld === 'bedrijf') {
      const b = p.bedrijf || {};
      // Een leeg veld in Notion mag de code niet leegmaken: alleen ingevulde waarden gaan erover.
      const samen = { ...(profile.bedrijf || {}) };
      ['naam', 'url', 'telefoon', 'email'].forEach((k) => { if (b[k]) samen[k] = b[k]; });
      if (b.adres && Object.values(b.adres).some(Boolean)) samen.adres = { ...(samen.adres || {}), ...Object.fromEntries(Object.entries(b.adres).filter(([, w]) => w)) };
      if (Array.isArray(b.werkgebied) && b.werkgebied.length) samen.werkgebied = b.werkgebied;
      profile.bedrijf = samen;
    } else if (veld === 'naam') {
      if (p.naam) profile.naam = p.naam;
    } else {
      profile[veld] = p[veld];
    }
  });
  const feiten = Array.isArray(notionKlant.feiten) ? notionKlant.feiten : (basis ? basis.feiten : []);
  return { profile, feiten: diepKopie(feiten) };
}

// Zet de stand in het geheugen (het gedeelde "clients" object) gelijk aan code plus Notion.
function pasToe() {
  Object.keys(clients).forEach((id) => {
    if (!CODE_BASIS[id]) delete clients[id]; // een klant die uit Notion is verdwenen
  });
  Object.keys(CODE_BASIS).forEach((id) => {
    clients[id] = notionData.has(id) ? bouwKlant(id, notionData.get(id)) : { profile: diepKopie(CODE_BASIS[id].profile), feiten: diepKopie(CODE_BASIS[id].feiten) };
  });
  notionData.forEach((k, id) => {
    if (!CODE_BASIS[id]) clients[id] = bouwKlant(id, k);
  });
}

// ---- Notion ----

function platteTekst(rt) { return (rt || []).map((t) => t.plain_text).join(''); }

function chunk(text, size = 1900) {
  const uit = [];
  for (let i = 0; i < text.length; i += size) uit.push(text.slice(i, i + size));
  return uit.length ? uit : [''];
}
function codeBlok(waarde) {
  return { type: 'code', code: { language: 'json', rich_text: chunk(JSON.stringify(waarde, null, 2)).map((c) => ({ type: 'text', text: { content: c } })) } };
}
function kop(t) { return { type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: t } }] } }; }

async function kinderen(client, blockId) {
  const alles = [];
  let cursor;
  do {
    const r = await client.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    alles.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return alles;
}

async function leesRij(client, page) {
  const klantId = platteTekst(page.properties['Klant ID'] && page.properties['Klant ID'].title).trim();
  if (!klantId) return null;
  const blokken = (await kinderen(client, page.id)).filter((b) => b.type === 'code');
  const lees = (b) => {
    if (!b) return undefined;
    try { return JSON.parse(platteTekst(b.code.rich_text)); } catch (e) { return undefined; }
  };
  const profiel = lees(blokken[0]);
  const feiten = lees(blokken[1]);
  return { klantId, pageId: page.id, profiel: profiel && typeof profiel === 'object' ? profiel : undefined, feiten: Array.isArray(feiten) ? feiten : undefined };
}

async function haalAlles() {
  const client = getNotion();
  const kaart = new Map();
  let cursor;
  do {
    const r = await client.databases.query({ database_id: DATABASE_ID, start_cursor: cursor, page_size: 100 });
    for (const page of r.results) {
      const rij = await leesRij(client, page);
      if (rij) kaart.set(rij.klantId, { pageId: rij.pageId, profiel: rij.profiel, feiten: rij.feiten });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return kaart;
}

// Haalt de gegevens op en past ze toe. Bij een fout blijft de vorige stand staan.
async function ververs() {
  try {
    notionData = await haalAlles();
    pasToe();
    laatsteVerversing = Date.now();
    laatsteFout = '';
    return { ok: true, klanten: notionData.size };
  } catch (err) {
    laatsteFout = err.message;
    return { ok: false, fout: err.message };
  }
}

let timer = null;
function start() {
  if (timer) return;
  ververs().then((r) => { if (!r.ok) console.warn('LP klantgegevens: Notion niet bereikbaar, de code geldt.', r.fout); });
  timer = setInterval(ververs, VERVERS_MS);
  if (timer.unref) timer.unref();
}

// ---- Lezen en bewaren voor het scherm ----

function bewerkbaar(id) {
  const c = clients[id];
  if (!c) return null;
  const p = c.profile || {};
  const b = p.bedrijf || {};
  return {
    id,
    naam: p.naam || '',
    inNotion: notionData.has(id),
    inCode: Boolean(CODE_BASIS[id]),
    wordpressVariabelen: p.wordpress ? [p.wordpress.urlEnv, p.wordpress.usernameEnv, p.wordpress.appPasswordEnv] : [],
    profiel: {
      naam: p.naam || '',
      bedrijf: { naam: b.naam || '', url: b.url || '', telefoon: b.telefoon || '', email: b.email || '', adres: { straat: '', postcode: '', plaats: '', land: 'NL', ...(b.adres || {}) }, werkgebied: b.werkgebied || [] },
      nietToegestaan: p.nietToegestaan || [],
      toonNotitie: p.toonNotitie || '',
      fotoRichtlijn: p.fotoRichtlijn || ''
    },
    feiten: (c.feiten || []).map((f) => ({ id: f.id, label: f.label, waarde: f.waarde, bron: f.bron, standaard: Boolean(f.standaard) }))
  };
}

function overzicht() {
  return Object.keys(clients).map((id) => ({
    id,
    naam: (clients[id].profile || {}).naam || id,
    inNotion: notionData.has(id),
    inCode: Boolean(CODE_BASIS[id]),
    aantalFeiten: (clients[id].feiten || []).length
  }));
}

function status() {
  return { laatsteVerversing: laatsteVerversing ? new Date(laatsteVerversing).toISOString() : null, fout: laatsteFout, klantenInNotion: notionData.size };
}

// Bewaart profiel en feiten van een klant in Notion (maakt de rij aan als die er nog niet is) en past ze direct toe.
async function bewaar(klantIdInvoer, { profiel, feiten, nieuw = false } = {}) {
  const id = schoonKlantId(klantIdInvoer);
  if (!id) throw new Error('Geef de klant een korte naam zonder spaties of streepjes, bijvoorbeeld "jansen".');
  if (nieuw && clients[id]) throw new Error('Deze klant bestaat al.');
  if (!nieuw && !clients[id]) throw new Error('Onbekende klant.');
  const p = schoonProfiel(profiel);
  if (!p.naam) throw new Error('Vul de naam van de klant in.');
  const f = schoonFeiten(feiten);

  const client = getNotion();
  const bestaand = notionData.get(id);
  const eigenschappen = {
    'Klant ID': { title: [{ type: 'text', text: { content: id } }] },
    Naam: { rich_text: [{ type: 'text', text: { content: p.naam } }] },
    'Aantal feiten': { number: f.length }
  };
  if (p.bedrijf.url) eigenschappen.Website = { url: p.bedrijf.url };
  let pageId = bestaand && bestaand.pageId;
  if (pageId) {
    await client.pages.update({ page_id: pageId, properties: eigenschappen });
    for (const b of await kinderen(client, pageId)) await client.blocks.delete({ block_id: b.id });
  } else {
    const page = await client.pages.create({ parent: { database_id: DATABASE_ID }, properties: eigenschappen });
    pageId = page.id;
  }
  await client.blocks.children.append({ block_id: pageId, children: [kop('Profiel'), codeBlok(p), kop('Feiten'), codeBlok(f)] });

  notionData.set(id, { pageId, profiel: p, feiten: f });
  pasToe();
  return bewerkbaar(id);
}

module.exports = { start, ververs, bewaar, bewerkbaar, overzicht, status, schoonProfiel, schoonFeiten, schoonKlantId, bouwKlant, pasToe, PROFIEL_VELDEN, _zetNotionData: (m) => { notionData = m; } };
