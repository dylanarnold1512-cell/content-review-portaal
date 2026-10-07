// Maandrapporten per klant. De n8n workflow "BA - Shared - Maandrapport" legt
// op de 4e van elke maand een vast rapport (snapshot) vast in de data table
// maandrapporten. Het portaal leest dat alleen en rekent niets opnieuw uit,
// zodat cijfers achteraf niet verschuiven.

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_MAANDRAPPORTEN_TABLE_ID || 'uLdHsmHxDy1A0HU2';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, de Rapportages kunnen niet bij n8n.');
  return key;
}

async function n8nRows(klantNaam, limit) {
  const filter = encodeURIComponent(JSON.stringify({ type: 'and', filters: [{ columnName: 'client_name', condition: 'eq', value: klantNaam }] }));
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${TABLE_ID}/rows?limit=${limit}&filter=${filter}`, {
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

function bouwRapport(rij) {
  const terugblik = parseJson(rij.terugblik, {});
  const alinea = Array.isArray(terugblik.alinea) ? terugblik.alinea.filter((a) => typeof a === 'string' && a.trim()) : [];
  const lijst = (tekst) => {
    const l = parseJson(tekst, []);
    return Array.isArray(l) ? l : [];
  };
  const totalen = parseJson(rij.totalen, {});
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
    kansen: lijst(rij.kansen),
    terugblik: alinea,
    vooruitblik: lijst(rij.vooruitblik)
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
  return rij ? bouwRapport(rij) : null;
}

module.exports = { listRapporten, getRapport, bouwRapport, maandLabel };
