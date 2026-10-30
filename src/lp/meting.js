// Meting per landingspagina (Pagr. stap 6, 14-10-2026).
// Google: de n8n data table pagr_meting (standaard bBaHDpJwm1h7vl5a, te overschrijven met env N8N_PAGR_METING_TABLE_ID) met een rij per klant en pagina, gevuld door een n8n workflow
// die Search Console per pagina uitleest. Kolommen: klant_id, url, periode_type (28d), vertoningen, klikken, positie,
// vorige_vertoningen, vorige_klikken. Zonder tabel is Google gewoon "nog niet gemeten".
// AI: de bestaande AI meting (aiZichtbaarheid.js). Per pagina tellen we hoe vaak de AI de pagina als bron noemde.
// Alles is optioneel en nooit blokkerend: een fout geeft een lege meting, geen kapot scherm.

const aiService = require('../services/aiZichtbaarheid');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const PAGR_METING_TABEL = 'bBaHDpJwm1h7vl5a';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

function schoon(url) {
  return String(url || '').replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
}

function getal(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function metCache(sleutel, fn) {
  const c = cache.get(sleutel);
  if (c && Date.now() - c.tijd < CACHE_MS) return c.waarde;
  const waarde = await fn();
  cache.set(sleutel, { tijd: Date.now(), waarde });
  return waarde;
}

// { [schone url]: { vertoningen, klikken, positie, vorigeVertoningen, vorigeKlikken } }
function bouwGoogle(rijen) {
  const uit = {};
  (rijen || []).forEach((r) => {
    if (!r || !r.url) return;
    if (r.periode_type && r.periode_type !== '28d') return;
    uit[schoon(r.url)] = {
      vertoningen: getal(r.vertoningen),
      klikken: getal(r.klikken),
      positie: r.positie == null || r.positie === '' ? null : Math.round(getal(r.positie) * 10) / 10,
      vorigeVertoningen: getal(r.vorige_vertoningen),
      vorigeKlikken: getal(r.vorige_klikken)
    };
  });
  return uit;
}

async function haalGoogle(klantId, { tabelId = process.env.N8N_PAGR_METING_TABLE_ID || PAGR_METING_TABEL, tabelFn } = {}) {
  if (!tabelId) return { beschikbaar: false, perUrl: {} };
  try {
    const rijen = await metCache(`g:${klantId}`, () => (tabelFn || aiService.n8nTabel)(tabelId, [{ columnName: 'klant_id', condition: 'eq', value: klantId }]));
    return { beschikbaar: true, perUrl: bouwGoogle(rijen) };
  } catch (err) {
    return { beschikbaar: false, perUrl: {}, fout: err.message };
  }
}

// Per pagina: hoe vaak de AI de pagina als bron noemde, bij welke vragen. Plus een klanttotaal.
function bouwAiPerUrl(vragenData) {
  const perUrl = {};
  let genoemd = 0;
  const vragen = (vragenData && vragenData.vragen) || [];
  vragen.forEach((v) => {
    const keerGenoemd = ((v.chatgpt || {}).genoemd || 0) + ((v.gemini || {}).genoemd || 0);
    if (keerGenoemd > 0) genoemd += 1;
    (v.urls || []).forEach((u) => {
      const sleutel = schoon(u);
      if (!sleutel) return;
      if (!perUrl[sleutel]) perUrl[sleutel] = { geciteerd: 0, vragen: [] };
      perUrl[sleutel].geciteerd += ((v.chatgpt || {}).geciteerd || 0) + ((v.gemini || {}).geciteerd || 0) || 1;
      if (perUrl[sleutel].vragen.length < 3) perUrl[sleutel].vragen.push(v.vraag);
    });
  });
  return { perUrl, totaal: { vragen: vragen.length, genoemd } };
}

async function haalAi(klantNaam, { aiVragenFn } = {}) {
  try {
    const data = await metCache(`a:${klantNaam}`, () => (aiVragenFn || aiService.getAiVragen)(klantNaam));
    if (!data || data.status !== 'ok') return { beschikbaar: false, perUrl: {}, totaal: null };
    const b = bouwAiPerUrl(data);
    return { beschikbaar: true, perUrl: b.perUrl, totaal: b.totaal, vragen: (data.vragen || []).map((v) => v.vraag).filter(Boolean) };
  } catch (err) {
    return { beschikbaar: false, perUrl: {}, totaal: null, vragen: [], fout: err.message };
  }
}

// De vragen die AI assistenten over de klant stellen, als bron voor het plan en de FAQ.
async function haalAiVragen(klantNaam, opties) {
  const ai = await haalAi(klantNaam, opties);
  return ai.vragen || [];
}

// Website per pagina (30-10-2026): bezoeken, AI bezoeken, aanvragen, doorkliks en eerder gelezen uit GA4 (tabel pagina_conversies,
// gevuld door BA - Shared - Prestatie Conversies) en de klikprijs per pagina (tabel pagina_cpc, BA - Shared - Prestatie Waarde).
// Sleutel is het pad, omdat GA4 paden geeft en geen volledige url's. Ontbreekt de data, dan is de meting "niet beschikbaar".
const PAGINA_CONVERSIES_TABEL = 'NaN8CfgSzlgDIb90';
const PAGINA_CPC_TABEL = '0prVEroS2ZmyVH1r';

function padVan(url) {
  let p = String(url || '').trim().replace(/^https?:[/][/][^/]+/i, '').split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch (err) { /* laat zoals het is */ }
  p = p.toLowerCase();
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

const leegOfGetal = (v) => (v === null || v === undefined || v === '' ? null : getal(v));

function bouwWebsite(convRijen, cpcRijen) {
  const perPad = {};
  (convRijen || []).forEach((r) => {
    if (!r || !r.pad || (r.periode_type && r.periode_type !== '28d')) return;
    perPad[padVan(r.pad)] = {
      sessies: leegOfGetal(r.sessies_totaal),
      sessiesGoogle: leegOfGetal(r.sessies_google),
      sessiesAi: leegOfGetal(r.sessies_ai),
      leads: leegOfGetal(r.leads),
      boekingen: leegOfGetal(r.boekingen),
      doorkliks: (leegOfGetal(r.doorkliks_contact) || 0) + (leegOfGetal(r.doorkliks_boeken) || 0),
      eerderGelezen: r.ondersteund_leads == null && r.ondersteund_boekingen == null ? null : (getal(r.ondersteund_leads) + getal(r.ondersteund_boekingen))
    };
  });
  const cpc = {};
  (cpcRijen || []).forEach((r) => { if (r && r.pad && r.cpc != null && getal(r.cpc) >= 0) cpc[padVan(r.pad)] = getal(r.cpc); });
  return { perPad, cpc };
}

async function haalWebsite(klantNaam, { tabelFn } = {}) {
  if (!klantNaam) return { beschikbaar: false, perPad: {}, cpc: {} };
  try {
    const lees = tabelFn || aiService.n8nTabel;
    const [conv, cpc] = await metCache(`w:${klantNaam}`, () => Promise.all([
      lees(PAGINA_CONVERSIES_TABEL, [{ columnName: 'client_name', condition: 'eq', value: klantNaam }, { columnName: 'periode_type', condition: 'eq', value: '28d' }]),
      lees(PAGINA_CPC_TABEL, [{ columnName: 'client_name', condition: 'eq', value: klantNaam }])
    ]));
    const b = bouwWebsite(conv, cpc);
    return { beschikbaar: conv.length > 0 || cpc.length > 0, perPad: b.perPad, cpc: b.cpc, metConversies: conv.length > 0 };
  } catch (err) {
    return { beschikbaar: false, perPad: {}, cpc: {}, fout: err.message };
  }
}

// Meting staat uit voor deze klant (schakelaar Paginameting): geen cijfers ophalen en tonen.
function leegMeting() {
  return {
    google: { beschikbaar: false, perUrl: {}, uit: true },
    ai: { beschikbaar: false, perUrl: {}, totaal: null, vragen: [], uit: true },
    website: { beschikbaar: false, perPad: {}, cpc: {}, uit: true }
  };
}

function trend(nu, vorig) {
  if (!vorig || vorig < 20) return 'onbekend';
  const v = (nu - vorig) / vorig;
  if (v <= -0.3) return 'zakt';
  if (v >= 0.3) return 'stijgt';
  return 'stabiel';
}

// Zet de metingen bij de pagina's van de klant.
function verrijkMetMeting(lijst, google, ai, website) {
  return (lijst || []).map((p) => {
    if (p.stand !== 'Live' || !p.url) return { ...p, google: null, ai: null, website: null };
    const sleutel = schoon(p.url);
    const pad = padVan(p.url);
    const g = google && google.beschikbaar ? (google.perUrl[sleutel] || { vertoningen: 0, klikken: 0, positie: null, vorigeVertoningen: 0, vorigeKlikken: 0 }) : null;
    const a = ai && ai.beschikbaar ? (ai.perUrl[sleutel] || { geciteerd: 0, vragen: [] }) : null;
    const cpc = website && website.beschikbaar && Object.prototype.hasOwnProperty.call(website.cpc, pad) ? website.cpc[pad] : null;
    const w = website && website.beschikbaar && website.metConversies
      ? (website.perPad[pad] || { sessies: 0, sessiesGoogle: 0, sessiesAi: 0, leads: null, boekingen: null, doorkliks: 0, eerderGelezen: null })
      : null;
    const gUit = g ? { ...g, trend: trend(g.klikken, g.vorigeKlikken), waarde: cpc !== null ? Math.round(g.klikken * cpc) : null } : null;
    return { ...p, google: gUit, ai: a, website: w };
  });
}

module.exports = { leegMeting, schoon, padVan, bouwGoogle, haalGoogle, bouwAiPerUrl, haalAi, haalAiVragen, bouwWebsite, haalWebsite, verrijkMetMeting, trend };
