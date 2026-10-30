// Maandrapporten per klant. De n8n workflow "BA - Shared - Maandrapport" legt
// op de 4e van elke maand een vast rapport (snapshot) vast in de data table
// maandrapporten. Het portaal leest dat alleen en rekent niets opnieuw uit,
// zodat cijfers achteraf niet verschuiven.

const { bouwEffecten } = require('./effecten');
const { conversieWoorden } = require('./prestaties');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_MAANDRAPPORTEN_TABLE_ID || 'uLdHsmHxDy1A0HU2';
const EFFECTEN_TABLE_ID = process.env.N8N_EFFECTEN_TABLE_ID || 'LvhL8FkJPDySGE7N';
const CONVERSIE_TOTALEN_TABLE_ID = process.env.N8N_CONVERSIE_TOTALEN_TABLE_ID || 'XPI7gsMhDIEoBc8o';
const VERBETERINGEN_TABLE_ID = process.env.N8N_VERBETERINGEN_TABLE_ID || 'comDCmDwMvzTSamB';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, de Rapportages kunnen niet bij n8n.');
  return key;
}

async function n8nRows(klantNaam, limit, tableId) {
  const filter = encodeURIComponent(JSON.stringify({ type: 'and', filters: [{ columnName: 'client_name', condition: 'eq', value: klantNaam }] }));
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${tableId || TABLE_ID}/rows?limit=${limit}&filter=${filter}`, {
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json' }
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    // niet JSON, alleen relevant als res.ok ook false is
  }
  if (!res.ok) throw new Error(`n8n data table gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  return data.data || [];
}

function parseJson(tekst, standaard) {
  try {
    const waarde = JSON.parse(tekst || '');
    return waarde === null || waarde === undefined ? standaard : waarde;
  } catch (err) {
    return standaard;
  }
}

function maandLabel(maand) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(maand || ''));
  if (!m) return String(maand || '');
  const naam = MAANDEN[Number(m[2]) - 1];
  return naam ? `${naam} ${m[1]}` : String(maand);
}

const GELDIG = /^\d{4}-(0[1-9]|1[0-2])$/;

const getalOfNull = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));

// De meting van precies deze kalendermaand (conversie_totalen, periode maand). Alleen als die rij bij de maand van het
// rapport hoort. Is er geen rij voor die maand, dan is er geen meting vastgelegd en blijft dit null.
// Het portaal legt dan uit waarom er geen cijfers staan, in plaats van nullen te tonen.
function bouwMeting(conversieRijen, maand, klantNaam) {
  const rij = (conversieRijen || []).find((r) => r && r.periode_type === 'maand' && String(r.periode_start || '').slice(0, 7) === maand);
  if (!rij) return null;
  const actief = rij.ondersteund_actief === true || String(rij.ondersteund_actief) === 'true';
  return {
    sessiesAi: getalOfNull(rij.sessies_ai),
    leadsAi: getalOfNull(rij.leads_ai),
    boekingenAi: getalOfNull(rij.boekingen_ai),
    leadsTotaal: getalOfNull(rij.leads_totaal),
    boekingenTotaal: getalOfNull(rij.boekingen_totaal),
    eerderActief: actief,
    eerderLeads: actief ? getalOfNull(rij.ondersteund_blog_leads) : null,
    eerderBoekingen: actief ? getalOfNull(rij.ondersteund_blog_boekingen) : null,
    woorden: conversieWoorden(klantNaam)
  };
}

function bouwRapport(rij, effectRijen, verbeterRijen, conversieRijen, klantNaam) {
  const terugblik = parseJson(rij.terugblik, {});
  const alinea = Array.isArray(terugblik.alinea) ? terugblik.alinea.filter((a) => typeof a === 'string' && a.trim()) : [];
  const lijst = (tekst) => {
    const l = parseJson(tekst, []);
    return Array.isArray(l) ? l : [];
  };
  const totalen = parseJson(rij.totalen, {});
  // Wat er in deze kalendermaand is gedaan: aantallen uit de gegevens die er al zijn.
  const inMaand = (d) => String(d || '').slice(0, 7) === rij.maand;
  const aangevuld = (verbeterRijen || []).filter((r) => r && (r.status === 'geplaatst' || r.status === 'gedeeltelijk') && inMaand(r.geplaatst_op || r.besluit_op)).length;
  const internelinks = (effectRijen || []).filter((r) => r && r.soort === 'interne_link' && inMaand(r.actiedatum)).reduce((t, r) => {
    const d = parseJson(r.details, {});
    return t + (Number(d && d.aantal) > 0 ? Number(d.aantal) : 1);
  }, 0);
  return {
    maand: rij.maand,
    label: maandLabel(rij.maand),
    periodeStart: rij.periode_start || null,
    periodeEind: rij.periode_eind || null,
    aangemaakt: rij.aangemaakt || null,
    bron: rij.bron || '',
    voortgang: rij.voortgang || '',
    totalen: totalen && typeof totalen === 'object' ? totalen : {},
    blogs: lijst(rij.blogs),
    nieuweBlogs: lijst(rij.nieuwe_blogs),
    gedaan: { nieuweBlogs: lijst(rij.nieuwe_blogs).length, aangevuld, internelinks },
    kansen: lijst(rij.kansen),
    terugblik: alinea,
    vooruitblik: lijst(rij.vooruitblik),
    effecten: bouwEffecten(effectRijen, verbeterRijen, rij.maand),
    meting: bouwMeting(conversieRijen, rij.maand, klantNaam)
  };
}

async function listRapporten(klantNaam) {
  const rijen = await n8nRows(klantNaam, 60);
  return rijen
    .filter((r) => GELDIG.test(String(r.maand || '')))
    .sort((a, b) => (a.maand < b.maand ? 1 : -1))
    .map((r) => ({ maand: r.maand, label: maandLabel(r.maand), aangemaakt: r.aangemaakt || null }));
}

async function getRapport(klantNaam, maand) {
  if (!GELDIG.test(String(maand || ''))) return null;
  const rijen = await n8nRows(klantNaam, 60);
  const rij = rijen.find((r) => r.maand === maand);
  if (!rij) return null;
  // Effecten zijn een extra: ontbreekt de tabel, dan blijft het rapport gewoon werken.
  const [effectRijen, verbeterRijen, conversieRijen] = await Promise.all([
    n8nRows(klantNaam, 250, EFFECTEN_TABLE_ID).catch(() => []),
    n8nRows(klantNaam, 250, VERBETERINGEN_TABLE_ID).catch(() => []),
    n8nRows(klantNaam, 20, CONVERSIE_TOTALEN_TABLE_ID).catch(() => [])
  ]);
  return bouwRapport(rij, effectRijen, verbeterRijen, conversieRijen, klantNaam);
}

module.exports = { listRapporten, getRapport, bouwRapport, bouwMeting, maandLabel };
