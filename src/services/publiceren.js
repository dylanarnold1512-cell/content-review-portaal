// Automatisch publiceren (12-11-2026). De klant kiest in het tabblad Publiceren of hij blogs zelf
// nakijkt of dat wij ze na onze controle automatisch plaatsen. De keuze staat in de Clients tabel
// in n8n (auto_publiceren ja/nee, publiceer_modus inkijk/direct, inkijk_uren 24/48/72).
//
// Per blog houdt de n8n tabel auto_publicatie bij wat er gebeurt:
//   gepland       de blog gaat op live_op automatisch live (BA - Shared - Automatisch Publiceren zet hem dan op Goedgekeurd)
//   tegengehouden de klant hield hem tegen, de blog wacht weer op een gewone beoordeling
//   handmatig     herschreven na feedback, of automatisch publiceren is uitgezet: gewone beoordeling
//   goedgekeurd / gepubliceerd / afgewezen   volgt de Notion status
// De rij wordt aangemaakt door BA - Shared - Stuur Review Email op het moment dat de blog klaar is.
//
// Alleen voor klanten op de gedeelde workflows. Basecamp Utrecht en PPExport hebben eigen workflows.

const workflowGegevens = require('./workflowGegevens');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const CLIENTS_TABLE_ID = process.env.N8N_CLIENTS_TABLE_ID || '42vYfT6ktan72bpa';
const AUTO_TABLE_ID = process.env.N8N_AUTO_PUBLICATIE_TABLE_ID || 'uXuHu6NGcQuu8WRq';
const EIGEN_WORKFLOWS = ['basecamp-utrecht', 'ppe'];
const MODI = ['inkijk', 'direct'];
const UREN = [24, 48, 72];

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, dus het portaal kan de publicatie instellingen niet lezen.');
  return key;
}

async function n8nTabel(tabelId, pad, options = {}) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${tabelId}${pad}`, {
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

// Notion id's komen met en zonder streepjes voor. De tabel bewaart ze met streepjes.
function metStreepjes(id) {
  const h = String(id || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (h.length !== 32) return String(id || '');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function beschikbaar(clientId) {
  return !EIGEN_WORKFLOWS.includes(clientId);
}

function leesKeuze(rij) {
  const aan = String((rij && rij.auto_publiceren) || '').toLowerCase() === 'ja';
  const modus = MODI.includes(String((rij && rij.publiceer_modus) || '').toLowerCase()) ? String(rij.publiceer_modus).toLowerCase() : 'inkijk';
  const u = Number(rij && rij.inkijk_uren);
  const inkijkUren = UREN.includes(u) ? u : 48;
  return { aan, modus, inkijkUren };
}

function schoneRij(r) {
  return {
    pageId: r.page_id,
    titel: r.titel || '',
    modus: r.modus || '',
    status: r.status || '',
    klaarOp: r.klaar_op || '',
    liveOp: r.live_op || ''
  };
}

async function rijenVanKlant(klantNaam) {
  const data = await n8nTabel(AUTO_TABLE_ID, `/rows?limit=250&filter=${filter([['klant', klantNaam]])}`);
  return data.data || [];
}

async function getInstellingen({ clientId, naam }) {
  if (!beschikbaar(clientId)) return { beschikbaar: false };
  const rij = await workflowGegevens.zoekRij(clientId, naam);
  if (!rij) return { beschikbaar: false };
  const keuze = leesKeuze(rij);
  let gepland = [];
  try {
    gepland = (await rijenVanKlant(rij.client_name)).filter((r) => r.status === 'gepland').map(schoneRij);
  } catch (err) {
    gepland = [];
  }
  return { beschikbaar: true, ...keuze, gepland };
}

async function bewaarInstellingen({ clientId, naam, aan, modus, inkijkUren }) {
  if (!beschikbaar(clientId)) throw new Error('Automatisch publiceren is voor deze klant nog niet beschikbaar.');
  const m = String(modus || '').toLowerCase();
  if (!MODI.includes(m)) throw new Error('Kies met inkijktijd of direct na controle.');
  const u = Number(inkijkUren);
  if (!UREN.includes(u)) throw new Error('Kies een inkijktijd van 24, 48 of 72 uur.');
  const rij = await workflowGegevens.zoekRij(clientId, naam);
  if (!rij) throw new Error('Geen rij gevonden in de Clients tabel in n8n voor deze klant.');
  await n8nTabel(CLIENTS_TABLE_ID, '/rows/update', {
    method: 'PATCH',
    body: JSON.stringify({
      filter: { type: 'and', filters: [{ columnName: 'client_name', condition: 'eq', value: rij.client_name }] },
      data: { auto_publiceren: aan ? 'ja' : 'nee', publiceer_modus: m, inkijk_uren: u },
      returnData: false
    })
  });
  return { ok: true, aan: Boolean(aan), modus: m, inkijkUren: u };
}

async function getBlog({ clientId, naam, pageId }) {
  if (!beschikbaar(clientId)) return { beschikbaar: false };
  const rij = await workflowGegevens.zoekRij(clientId, naam);
  if (!rij) return { beschikbaar: false };
  const keuze = leesKeuze(rij);
  const id = metStreepjes(pageId);
  const data = await n8nTabel(AUTO_TABLE_ID, `/rows?limit=1&filter=${filter([['page_id', id], ['klant', rij.client_name]])}`);
  const r = (data.data || [])[0];
  return { beschikbaar: true, ...keuze, blog: r ? schoneRij(r) : null };
}

async function tegenhouden({ clientId, naam, pageId }) {
  if (!beschikbaar(clientId)) throw new Error('Automatisch publiceren is voor deze klant niet beschikbaar.');
  const rij = await workflowGegevens.zoekRij(clientId, naam);
  if (!rij) throw new Error('Geen rij gevonden in de Clients tabel in n8n voor deze klant.');
  const id = metStreepjes(pageId);
  const data = await n8nTabel(AUTO_TABLE_ID, `/rows?limit=1&filter=${filter([['page_id', id], ['klant', rij.client_name]])}`);
  const r = (data.data || [])[0];
  if (!r) throw new Error('Deze blog staat niet ingepland voor automatisch publiceren.');
  if (r.status !== 'gepland') throw new Error('Deze blog kan niet meer worden tegengehouden.');
  await n8nTabel(AUTO_TABLE_ID, '/rows/update', {
    method: 'PATCH',
    body: JSON.stringify({
      filter: { type: 'and', filters: [{ columnName: 'page_id', condition: 'eq', value: id }, { columnName: 'klant', condition: 'eq', value: rij.client_name }] },
      data: { status: 'tegengehouden', bijgewerkt: new Date().toISOString() },
      returnData: false
    })
  });
  return { ok: true };
}

module.exports = { getInstellingen, bewaarInstellingen, getBlog, tegenhouden, leesKeuze, metStreepjes, beschikbaar, MODI, UREN };
