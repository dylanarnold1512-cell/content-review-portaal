// Vraag van de week (12-11-2026). Een korte vraag aan de klant waarvan het antwoord in het
// kennisdocument komt, zodat de blogs het kunnen gebruiken. De vragen staan in de n8n tabel
// klantvragen (klant, vraag, uitleg, soort ja_nee of open, status open/beantwoord/overgeslagen).
// Het portaal toont per klant de oudste open vraag. Wie de vragen vult is bewust los gehouden:
// dat kan met de hand, of later met een workflow die gaten in het kennisdocument opspoort.

const kennisdocument = require('./kennisdocument');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_KLANTVRAGEN_TABLE_ID || '8Cbmc1OpXVz1HJBg';
const MAX_ANTWOORD = 600;

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, dus het portaal kan de vraag van de week niet lezen.');
  return key;
}

async function n8nTabel(pad, options = {}) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${TABLE_ID}${pad}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen JSON */ }
  if (!res.ok) throw new Error(`n8n tabel gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  return data;
}

function filter(regels) {
  return encodeURIComponent(JSON.stringify({ type: 'and', filters: regels.map(([k, w]) => ({ columnName: k, condition: 'eq', value: w })) }));
}

function schoneVraag(r) {
  return { id: r.id, vraag: r.vraag || '', uitleg: r.uitleg || '', soort: r.soort === 'open' ? 'open' : 'ja_nee' };
}

async function getVraag({ naam }) {
  const data = await n8nTabel(`/rows?limit=50&filter=${filter([['klant', naam], ['status', 'open']])}`);
  const rijen = (data.data || []).slice().sort((a, b) => String(a.aangemaakt || '').localeCompare(String(b.aangemaakt || '')));
  return { vraag: rijen[0] ? schoneVraag(rijen[0]) : null };
}

// Het antwoord wordt een regel onderaan het kennisdocument.
function kennisRegel(vraag, antwoord) {
  return `${vraag} ${antwoord}`.replace(/\s+/g, ' ').trim();
}

async function beantwoord({ naam, id, antwoord, overslaan }) {
  const data = await n8nTabel(`/rows?limit=1&filter=${filter([['id', Number(id)], ['klant', naam]])}`);
  const rij = (data.data || [])[0];
  if (!rij) throw new Error('Deze vraag bestaat niet meer.');
  if (rij.status !== 'open') throw new Error('Deze vraag is al beantwoord.');
  const nu = new Date().toISOString();
  const filterBody = { type: 'and', filters: [{ columnName: 'id', condition: 'eq', value: Number(id) }, { columnName: 'klant', condition: 'eq', value: naam }] };
  if (overslaan) {
    await n8nTabel('/rows/update', { method: 'PATCH', body: JSON.stringify({ filter: filterBody, data: { status: 'overgeslagen', beantwoord_op: nu }, returnData: false }) });
    return { ok: true };
  }
  const tekst = String(antwoord || '').trim().slice(0, MAX_ANTWOORD);
  if (!tekst) throw new Error('Vul een antwoord in.');
  const huidig = await kennisdocument.getKennisdocument(naam);
  const regel = kennisRegel(rij.vraag, tekst);
  const nieuw = (huidig.tekst ? huidig.tekst.replace(/\s+$/, '') + '\n\n' : '') + regel;
  await kennisdocument.saveKennisdocument(naam, nieuw, huidig.bron || 'Portaal');
  await n8nTabel('/rows/update', { method: 'PATCH', body: JSON.stringify({ filter: filterBody, data: { status: 'beantwoord', antwoord: tekst, beantwoord_op: nu }, returnData: false }) });
  return { ok: true };
}

module.exports = { getVraag, beantwoord, kennisRegel, MAX_ANTWOORD };
