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
const { clientTokens, defaultTokens, getTokens, checkFontLoadConsistency } = require('./tokens');

const DATABASE_ID = process.env.LP_KLANTGEGEVENS_DATABASE_ID || '926632fa-da31-464a-ad31-24ee36592459';
const VERVERS_MS = 5 * 60 * 1000;
const MAX_FEITEN = 200;

// Wat uit Notion mag komen. Alles daarbuiten blijft uit de code.
const PROFIEL_VELDEN = ['naam', 'bedrijf', 'nietToegestaan', 'toonNotitie', 'fotoRichtlijn', 'ctaBalken'];

const diepKopie = (v) => JSON.parse(JSON.stringify(v));

// De stand zoals in code, vastgelegd bij het laden van dit bestand. Zo kan een rij uit Notion later weer
// verdwijnen en gaat de klant terug naar de code.
const CODE_BASIS = {};
Object.keys(clients).forEach((id) => { CODE_BASIS[id] = { profile: diepKopie(clients[id].profile), feiten: diepKopie(clients[id].feiten) }; });

// Tokens zoals in code, zodat een huisstijl uit Notion later weer weg kan.
const CODE_TOKENS = {};
Object.keys(clientTokens).forEach((id) => { CODE_TOKENS[id] = diepKopie(clientTokens[id]); });

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
  const uit = {
    naam: tekst(i.naam, 120),
    bedrijf,
    nietToegestaan: lijst(i.nietToegestaan, 20, 300),
    toonNotitie: tekst(i.toonNotitie, 600),
    fotoRichtlijn: tekst(i.fotoRichtlijn, 600),
    huisstijl: schoonHuisstijl(i.huisstijl)
  };
  // Aantal offertebalken: 1 of 2. Alleen bewaren als het is meegestuurd, zodat de waarde uit de code blijft gelden.
  const balken = i.ctaBalken && typeof i.ctaBalken === 'object' ? Number(i.ctaBalken.aantal) : Number(i.ctaBalken);
  if (balken === 1 || balken === 2) uit.ctaBalken = { aantal: balken };
  return uit;
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

// ---- Huisstijl (tokens) ----
// Alleen deze velden komen uit Notion. customFonts, googleFontGewichten, themeOverrideCss en sfeer blijven in code,
// want een eigen lettertypebestand of een stuk CSS hoort niet in een formulier.
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAAT_RE = /^\d{1,4}(px|rem|%)$/;
const KLEUR_VELDEN = ['primary', 'primaryDark', 'secondary', 'text', 'textMuted', 'bg', 'bgAlt', 'bgDark', 'border', 'headingColor', 'kickerColor', 'ctaBg', 'ctaText'];
const MAAT_VELDEN = ['maxWidth', 'radius', 'buttonRadius', 'cardRadius'];
const TRANSFORM_VELDEN = ['headingTransform', 'buttonTransform'];
const TRANSFORMS = ['none', 'uppercase', 'capitalize'];
const FONT_VELDEN = ['fontHeading', 'fontBody', 'fontAccent'];
const HUISSTIJL_VELDEN = [...KLEUR_VELDEN, ...MAAT_VELDEN, ...TRANSFORM_VELDEN, 'headingWeight', ...FONT_VELDEN, 'googleFonts'];

// Een lege waarde betekent: geen eigen keuze, dus de code of de standaard blijft gelden.
function schoonHuisstijl(invoer) {
  const i = invoer || {};
  const uit = {};
  KLEUR_VELDEN.forEach((k) => {
    const w = tekst(i[k], 20);
    if (!w) return;
    if (!HEX_RE.test(w)) throw new Error(`Huisstijl: "${w}" is geen kleurcode. Gebruik bijvoorbeeld #0F5257.`);
    uit[k] = w.toUpperCase();
  });
  MAAT_VELDEN.forEach((k) => {
    const w = tekst(i[k], 12).toLowerCase();
    if (!w) return;
    if (!MAAT_RE.test(w)) throw new Error(`Huisstijl: "${w}" is geen maat. Gebruik bijvoorbeeld 8px of 1200px.`);
    uit[k] = w;
  });
  TRANSFORM_VELDEN.forEach((k) => {
    const w = tekst(i[k], 20).toLowerCase();
    if (!w) return;
    if (!TRANSFORMS.includes(w)) throw new Error('Huisstijl: hoofdletters kan alleen geen, hoofdletters of eerste letter.');
    uit[k] = w;
  });
  const gewicht = tekst(i.headingWeight, 4);
  if (gewicht) {
    if (!/^[1-9]00$/.test(gewicht)) throw new Error('Huisstijl: dikte van de koppen moet 100 tot en met 900 zijn.');
    uit.headingWeight = gewicht;
  }
  FONT_VELDEN.forEach((k) => {
    const w = tekst(i[k], 120);
    if (!w) return;
    if (!/^[A-Za-z0-9 ,'"\-]+$/.test(w)) throw new Error('Huisstijl: een lettertype mag alleen letters, cijfers, spaties, komma\'s en aanhalingstekens bevatten.');
    uit[k] = w;
  });
  const gf = (Array.isArray(i.googleFonts) ? i.googleFonts : String(i.googleFonts || '').split(',')).map((x) => tekst(x, 60)).filter(Boolean).slice(0, 5);
  gf.forEach((n) => { if (!/^[A-Za-z0-9 ]+$/.test(n)) throw new Error(`Huisstijl: "${n}" is geen geldige naam van een Google Font.`); });
  if (gf.length) uit.googleFonts = gf;
  return uit;
}

// Houdt alleen de velden over die afwijken van de basis (de tokens in code, of de standaard).
function alleenVerschil(h, id) {
  const basis = CODE_TOKENS[id] || defaultTokens;
  const uit = {};
  Object.keys(h || {}).forEach((k) => {
    if (JSON.stringify(h[k]).toLowerCase() !== JSON.stringify(basis[k] == null ? '' : basis[k]).toLowerCase()) uit[k] = h[k];
  });
  return uit;
}

// Voor een AI voorstel: een ongeldige waarde laten we weg in plaats van het hele voorstel te weigeren.
function huisstijlUitVoorstel(voorstel) {
  const uit = {};
  Object.keys(voorstel || {}).forEach((k) => {
    if (!HUISSTIJL_VELDEN.includes(k)) return;
    try { Object.assign(uit, schoonHuisstijl({ [k]: voorstel[k] })); } catch (e) { /* ongeldige waarde: weglaten */ }
  });
  return uit;
}

function huisstijlUitTokens(t) {
  const uit = {};
  HUISSTIJL_VELDEN.forEach((k) => { uit[k] = t[k] == null ? (k === 'googleFonts' ? [] : '') : t[k]; });
  return uit;
}

function huisstijlWaarschuwingen(id) {
  try { return checkFontLoadConsistency(getTokens(id)); } catch (e) { return []; }
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
  pasTokensToe();
}

// Legt de huisstijl uit Notion over de tokens in code. Het gedeelde object clientTokens wordt ter plekke aangepast.
function pasTokensToe() {
  Object.keys(clientTokens).forEach((id) => { if (!CODE_TOKENS[id]) delete clientTokens[id]; });
  Object.keys(CODE_TOKENS).forEach((id) => { clientTokens[id] = diepKopie(CODE_TOKENS[id]); });
  notionData.forEach((k, id) => {
    const h = k.profiel && k.profiel.huisstijl;
    if (!h || !Object.keys(h).length || !clients[id]) return;
    clientTokens[id] = { ...(CODE_TOKENS[id] ? diepKopie(CODE_TOKENS[id]) : diepKopie(defaultTokens)), ...diepKopie(h) };
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
      fotoRichtlijn: p.fotoRichtlijn || '',
      ctaBalken: { aantal: Number(p.ctaBalken && p.ctaBalken.aantal) === 2 ? 2 : 1 },
      huisstijl: huisstijlUitTokens(getTokens(id))
    },
    huisstijlEigen: Boolean(notionData.get(id) && notionData.get(id).profiel && notionData.get(id).profiel.huisstijl && Object.keys(notionData.get(id).profiel.huisstijl).length),
    huisstijlVanCode: Boolean(CODE_TOKENS[id]),
    eigenLettertypenInCode: (getTokens(id).customFonts || []).map((f) => f && f.family).filter(Boolean),
    waarschuwingen: huisstijlWaarschuwingen(id),
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
  const bestaandProfiel = notionData.get(id) && notionData.get(id).profiel;
  if (profiel && profiel.huisstijl === undefined) p.huisstijl = (bestaandProfiel && bestaandProfiel.huisstijl) || {};
  else p.huisstijl = alleenVerschil(p.huisstijl, id); // alleen wat afwijkt van de code of de standaard, zodat latere wijzigingen in code blijven gelden
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

module.exports = { start, ververs, bewaar, bewerkbaar, overzicht, status, schoonProfiel, schoonFeiten, schoonKlantId, schoonHuisstijl, huisstijlUitVoorstel, alleenVerschil, bouwKlant, pasToe, PROFIEL_VELDEN, _zetNotionData: (m) => { notionData = m; } };
