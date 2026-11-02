// Rapportages starten vanuit het portaal. De drie datacollectie workflows in n8n starten met een n8n formulier.
// Het portaal stuurt hetzelfde formulier in als Dylan zelf zou doen. De workflows zelf blijven ongewijzigd.
// Elke start wordt vastgelegd in de n8n data table "Rapport Starts", zodat de handmatige invoer later
// (bij het learningspakket) terug te vinden is.

const { ORGANISATIES } = require('../config/rapportStart');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const STARTS_TABLE_ID = process.env.N8N_RAPPORT_STARTS_TABLE_ID || 'xwFXvnAkrOkX3Rgp';

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, het portaal kan niet bij n8n.');
  return key;
}

function zoekOrganisatie(id) {
  const o = ORGANISATIES.find((x) => x.id === id);
  if (!o) throw new Error('Onbekende organisatie.');
  return o;
}

function configVoorScherm() {
  return ORGANISATIES.map((o) => ({
    id: o.id, naam: o.naam, klantLabel: o.klantLabel, klanten: o.klanten,
    velden: o.velden.map((v) => ({ label: v.label, type: v.type, groep: v.groep, klanten: v.klanten || null }))
  }));
}

function schoon(tekst) {
  return String(tekst || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

// n8n zet elk veld als input met name="field-0", "field-1" en zo verder, met een label erbij. We lezen de pagina,
// zodat we op de tekst van het label koppelen en niet op een volgnummer dat kan verschuiven.
async function leesFormulier(org) {
  const url = `${N8N_BASE_URL}/form/${org.formPad}`;
  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Het n8n formulier is niet bereikbaar (${res.status}). Staat de workflow aan?`);
  const html = await res.text();
  const kaart = {};
  // n8n gebruikt in de pagina enkele of dubbele aanhalingstekens, en het for attribuut kan ook voor de class staan.
  const re = /<label\b[^>]*\bfor\s*=\s*["']?(field-\d+)["']?[^>]*>([\s\S]*?)<\/label>/gi;
  let m;
  while ((m = re.exec(html)) !== null) kaart[schoon(m[2])] = m[1];
  // Reserve: lees de velden uit de workflow zelf. n8n nummert de velden in de volgorde van het formulier.
  if (!Object.keys(kaart).length) {
    try {
      const wf = await n8nTabel(`/workflows/${org.workflowId}`);
      const trigger = (wf.nodes || []).find((n) => n.type === 'n8n-nodes-base.formTrigger');
      const velden = (trigger && trigger.parameters && trigger.parameters.formFields && trigger.parameters.formFields.values) || [];
      velden.forEach((v, i) => { if (v && v.fieldLabel) kaart[schoon(v.fieldLabel)] = `field-${i}`; });
    } catch (err) { /* hieronder volgt de duidelijke fout */ }
  }
  if (!Object.keys(kaart).length) throw new Error('Kon de velden van het n8n formulier niet lezen.');
  return { url, kaart };
}

function vorigeMaand(nu) {
  const d = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
  return { maand: d.getMonth() + 1, jaar: d.getFullYear() };
}

async function n8nTabel(pad, opties) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1${pad}`, {
    ...opties,
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json', ...((opties && opties.headers) || {}) }
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen json */ }
  if (!res.ok) throw new Error(`n8n gaf een fout (${res.status}): ${data.message || raw.slice(0, 200)}`);
  return data;
}

async function start({ organisatieId, klant, maand, jaar, velden, notities }) {
  const org = zoekOrganisatie(organisatieId);
  if (!org.klanten.includes(klant)) throw new Error('Kies een klant uit de lijst.');
  const standaard = vorigeMaand(new Date());
  const m = Number(maand) || standaard.maand;
  const j = Number(jaar) || standaard.jaar;
  if (m < 1 || m > 12 || j < 2024 || j > 2100) throw new Error('Maand of jaar klopt niet.');

  const { url, kaart } = await leesFormulier(org);
  const waarden = {};
  waarden[org.klantLabel] = klant;
  // Alleen overschrijven als de gekozen maand afwijkt van de vorige maand. Zo gedraagt een standaard run zich precies
  // als wanneer Dylan deze velden leeg laat in n8n.
  if (m !== standaard.maand || j !== standaard.jaar) {
    waarden[org.maandLabel] = String(m);
    waarden[org.jaarLabel] = String(j);
  }
  const toegestaan = new Map(org.velden.filter((v) => !v.klanten || v.klanten.includes(klant)).map((v) => [v.label, v]));
  const ingevuld = {};
  for (const [label, waarde] of Object.entries(velden || {})) {
    if (!toegestaan.has(label)) continue;
    const tekst = String(waarde === null || waarde === undefined ? '' : waarde).trim().replace(',', '.');
    if (tekst === '') continue;
    if (!isFinite(Number(tekst))) throw new Error(`"${label}" moet een getal zijn.`);
    waarden[label] = tekst;
    ingevuld[label] = tekst;
  }
  if (notities && String(notities).trim()) waarden[org.notitiesLabel] = String(notities).trim();

  const body = new FormData();
  for (const [label, waarde] of Object.entries(waarden)) {
    const veld = kaart[label];
    if (!veld) throw new Error(`Het veld "${label}" staat niet meer in het n8n formulier. Het formulier is aangepast.`);
    body.append(veld, waarde);
  }
  const gestart = new Date().toISOString();
  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) throw new Error(`Het formulier versturen mislukte (${res.status}).`);

  try {
    await n8nTabel(`/data-tables/${STARTS_TABLE_ID}/rows`, {
      method: 'POST',
      body: JSON.stringify({ data: [{ organisatie: org.id, klant, maand: `${j}-${String(m).padStart(2, '0')}`, velden: JSON.stringify({ ...ingevuld, notities: notities || '' }), gestart, workflow_id: org.workflowId, status: 'gestart' }], returnType: 'count' })
    });
  } catch (err) {
    console.error('Vastleggen van de start mislukte:', err.message);
  }
  return { ok: true, gestart };
}

function statusVan(execution) {
  if (!execution) return 'wacht';
  if (execution.status === 'success') return 'klaar';
  if (execution.status === 'error' || execution.status === 'crashed' || execution.status === 'canceled') return 'fout';
  return 'bezig';
}

async function recent(limiet) {
  const data = await n8nTabel(`/data-tables/${STARTS_TABLE_ID}/rows?limit=100`);
  const rijen = (data.data || []).sort((a, b) => String(b.gestart).localeCompare(String(a.gestart))).slice(0, limiet || 15);
  const perWorkflow = {};
  for (const id of [...new Set(rijen.map((r) => r.workflow_id))]) {
    try {
      const e = await n8nTabel(`/executions?workflowId=${id}&limit=30`);
      perWorkflow[id] = (e.data || []).map((x) => ({ id: x.id, status: x.status, startedAt: x.startedAt, stoppedAt: x.stoppedAt }));
    } catch (err) {
      perWorkflow[id] = [];
    }
  }
  return rijen.map((r) => {
    const t = new Date(r.gestart).getTime() - 10000;
    const kandidaten = (perWorkflow[r.workflow_id] || []).filter((x) => new Date(x.startedAt).getTime() >= t).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    const org = ORGANISATIES.find((o) => o.id === r.organisatie);
    return {
      organisatie: org ? org.naam : r.organisatie, klant: r.klant, maand: r.maand, gestart: r.gestart,
      status: statusVan(kandidaten[0]), executionId: kandidaten[0] ? kandidaten[0].id : null
    };
  });
}

module.exports = { configVoorScherm, start, recent };
