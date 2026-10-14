// Meting per landingspagina (Pagr. stap 6, 14-10-2026).
// Google: een n8n data table (env N8N_PAGR_METING_TABLE_ID) met een rij per klant en pagina, gevuld door een n8n workflow
// die Search Console per pagina uitleest. Kolommen: klant_id, url, periode_type (28d), vertoningen, klikken, positie,
// vorige_vertoningen, vorige_klikken. Zonder tabel is Google gewoon "nog niet gemeten".
// AI: de bestaande AI meting (aiZichtbaarheid.js). Per pagina tellen we hoe vaak de AI de pagina als bron noemde.
// Alles is optioneel en nooit blokkerend: een fout geeft een lege meting, geen kapot scherm.

const aiService = require('../services/aiZichtbaarheid');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
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

async function haalGoogle(klantId, { tabelId = process.env.N8N_PAGR_METING_TABLE_ID, tabelFn } = {}) {
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

function trend(nu, vorig) {
  if (!vorig || vorig < 20) return 'onbekend';
  const v = (nu - vorig) / vorig;
  if (v <= -0.3) return 'zakt';
  if (v >= 0.3) return 'stijgt';
  return 'stabiel';
}

// Zet de metingen bij de pagina's van de klant.
function verrijkMetMeting(lijst, google, ai) {
  return (lijst || []).map((p) => {
    if (p.stand !== 'Live' || !p.url) return { ...p, google: null, ai: null };
    const sleutel = schoon(p.url);
    const g = google && google.beschikbaar ? (google.perUrl[sleutel] || { vertoningen: 0, klikken: 0, positie: null, vorigeVertoningen: 0, vorigeKlikken: 0 }) : null;
    const a = ai && ai.beschikbaar ? (ai.perUrl[sleutel] || { geciteerd: 0, vragen: [] }) : null;
    return { ...p, google: g ? { ...g, trend: trend(g.klikken, g.vorigeKlikken) } : null, ai: a };
  });
}

module.exports = { schoon, bouwGoogle, haalGoogle, bouwAiPerUrl, haalAi, haalAiVragen, verrijkMetMeting, trend };
