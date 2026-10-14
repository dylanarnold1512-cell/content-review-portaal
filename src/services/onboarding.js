// Onboarding van een nieuwe klant (Fase 8): de stand per stap staat in de Notion database "Onboarding stappen".
// Het admin portaal leest en schrijft hier, en Claude in de chat doet hetzelfde via de Notion koppeling.
// Zelfde integratie als settings.js (NOTION_TOKEN_ADMIN). De database moet daarmee gedeeld zijn; hij staat
// onder dezelfde pagina als Klant Intake en Portaal Instellingen, dus dat is normaal al zo.

const { Client } = require('@notionhq/client');
const { FASEN, STAPPEN, STATUSSEN } = require('../config/onboardingStappen');

const ONBOARDING_DATABASE_ID = process.env.NOTION_ONBOARDING_DATABASE_ID || 'b6cf624559ac4a448b80a8494aed5e9f';

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) throw new Error('NOTION_TOKEN_ADMIN is niet gezet: het adminpaneel kan niet bij de database "Onboarding stappen".');
  notion = new Client({ auth: token });
  return notion;
}

const pauze = (ms) => new Promise((r) => setTimeout(r, ms));

function tekst(rich) {
  return Array.isArray(rich) ? rich.map((t) => t.plain_text).join('') : '';
}
function rich(waarde) {
  const t = String(waarde || '').slice(0, 2000);
  return { rich_text: t ? [{ text: { content: t } }] : [] };
}

// Eén Notion pagina naar een eenvoudig object. De uitleg komt uit de vaste lijst, zodat die niet in Notion hoeft te staan.
function normaliseerRij(page) {
  const p = page.properties || {};
  const nr = p.Nr && typeof p.Nr.number === 'number' ? p.Nr.number : null;
  const sjabloon = STAPPEN.find((s) => s.nr === nr) || {};
  return {
    id: page.id,
    nr,
    titel: tekst(p.Stap && p.Stap.title) || sjabloon.titel || '',
    uitleg: sjabloon.uitleg || '',
    fase: sjabloon.fase || String((p.Fase && p.Fase.select && p.Fase.select.name) || '').charAt(0),
    status: (p.Status && p.Status.select && p.Status.select.name) || 'Nog niet gestart',
    aanZet: (p['Aan zet'] && p['Aan zet'].select && p['Aan zet'].select.name) || sjabloon.aanZet || '',
    uitkomst: tekst(p.Uitkomst && p.Uitkomst.rich_text),
    klant: tekst(p.Klant && p.Klant.rich_text),
    clientId: tekst(p['Client ID'] && p['Client ID'].rich_text),
    bijgewerkt: (p['Bijgewerkt op'] && p['Bijgewerkt op'].last_edited_time) || page.last_edited_time || '',
    bijgewerktDoor: (p['Bijgewerkt door'] && p['Bijgewerkt door'].select && p['Bijgewerkt door'].select.name) || ''
  };
}

// Samenvatting van de stappen van één klant: voortgang, wat op Dylan wacht, wat op de klant wacht, de volgende stap.
function samenvat(rijen) {
  const gesorteerd = [...rijen].sort((a, b) => (a.nr || 0) - (b.nr || 0));
  const totaal = gesorteerd.length;
  const klaar = gesorteerd.filter((r) => r.status === 'Klaar').length;
  const overgeslagen = gesorteerd.filter((r) => r.status === 'Overgeslagen').length;
  const afgerond = klaar + overgeslagen;
  const wachtOpDylan = gesorteerd.filter((r) => r.status === 'Wacht op Dylan');
  const wachtOpKlant = gesorteerd.filter((r) => r.status === 'Wacht op klant');
  const volgende = gesorteerd.find((r) => r.status !== 'Klaar' && r.status !== 'Overgeslagen') || null;
  const fase = volgende ? volgende.fase : (totaal ? 'E' : '');
  return {
    totaal, klaar, overgeslagen, afgerond,
    procent: totaal ? Math.round((afgerond / totaal) * 100) : 0,
    wachtOpDylan, wachtOpKlant, volgende,
    fase,
    faseNaam: (FASEN.find((f) => f.code === fase) || {}).naam || '',
    gereed: totaal > 0 && afgerond === totaal
  };
}

// Zin die Dylan in een nieuwe chat plakt om verder te gaan.
function chatZin(klantNaam) {
  return `Onboarding ${klantNaam}, ga verder.`;
}

async function alleRijen() {
  const client = getNotionClient();
  const rijen = [];
  let cursor;
  do {
    const res = await client.databases.query({ database_id: ONBOARDING_DATABASE_ID, start_cursor: cursor, page_size: 100 });
    rijen.push(...res.results.map(normaliseerRij));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rijen;
}

function groepeerPerKlant(rijen) {
  const perKlant = new Map();
  rijen.forEach((r) => {
    if (!r.clientId) return;
    if (!perKlant.has(r.clientId)) perKlant.set(r.clientId, { clientId: r.clientId, klant: r.klant || r.clientId, rijen: [] });
    perKlant.get(r.clientId).rijen.push(r);
  });
  return [...perKlant.values()].map((k) => ({
    clientId: k.clientId,
    klant: k.klant,
    samenvatting: samenvat(k.rijen)
  }));
}

async function overzicht() {
  return groepeerPerKlant(await alleRijen());
}

async function voorKlant(clientId) {
  const rijen = (await alleRijen()).filter((r) => r.clientId === clientId).sort((a, b) => (a.nr || 0) - (b.nr || 0));
  const klant = rijen.length ? rijen[0].klant : '';
  return { clientId, klant, rijen, samenvatting: samenvat(rijen), chatZin: chatZin(klant || clientId) };
}

// Maakt de 21 stappen voor een klant aan. Bestaan er al stappen voor dit Client ID, dan gebeurt er niets.
// klaar: stapnummers die al klaar zijn bij de start (bijvoorbeeld 1 na de websitescan).
async function start({ klant, clientId, klaar = [], door = 'Portaal' }) {
  if (!klant || !clientId) throw new Error('Klantnaam en Client ID zijn verplicht.');
  const bestaand = (await alleRijen()).filter((r) => r.clientId === clientId);
  if (bestaand.length) return { aangemaakt: 0, bestaand: bestaand.length };
  const client = getNotionClient();
  let aangemaakt = 0;
  for (const s of STAPPEN) {
    const fase = FASEN.find((f) => f.code === s.fase);
    const isKlaar = klaar.includes(s.nr);
    await client.pages.create({
      parent: { database_id: ONBOARDING_DATABASE_ID },
      properties: {
        Stap: { title: [{ text: { content: s.titel } }] },
        Klant: rich(klant),
        'Client ID': rich(clientId),
        Nr: { number: s.nr },
        Fase: { select: { name: fase.optie } },
        Status: { select: { name: isKlaar ? 'Klaar' : 'Nog niet gestart' } },
        'Aan zet': { select: { name: s.aanZet } },
        'Bijgewerkt door': { select: { name: door } }
      }
    });
    aangemaakt += 1;
    await pauze(350); // Notion laat ongeveer 3 verzoeken per seconde toe
  }
  return { aangemaakt, bestaand: 0 };
}

async function zetStap(pageId, { status, uitkomst, door = 'Portaal' }) {
  const properties = { 'Bijgewerkt door': { select: { name: door } } };
  if (status !== undefined) {
    if (!STATUSSEN.includes(status)) throw new Error(`Onbekende status: ${status}`);
    properties.Status = { select: { name: status } };
  }
  if (uitkomst !== undefined) properties.Uitkomst = rich(uitkomst);
  await getNotionClient().pages.update({ page_id: pageId, properties });
}

// Stap 4 (merkprofiel) volgt de status van het merkprofiel in n8n. Geeft de nieuwe status en uitkomst, of null als er niets verandert.
function bepaalMerkprofielStap(huidigeStatus, profielStatus) {
  if (huidigeStatus === 'Overgeslagen') return null;
  const kandidaat = {
    bezig: { status: 'Bezig', uitkomst: 'Het concept wordt opgebouwd, ongeveer 4 minuten.' },
    'definitief concept': { status: 'Klaar', uitkomst: 'Concept merkprofiel staat klaar in het portaal. Nog niet aan voor de klant.' },
    bevestigd: { status: 'Klaar', uitkomst: 'Het merkprofiel is bevestigd door de klant.' },
    leeg: { status: 'Wacht op Dylan', uitkomst: 'De workflow gaf een leeg profiel. Controleer de website en bouw opnieuw op.' },
    mislukt: { status: 'Wacht op Dylan', uitkomst: 'Het opbouwen van het merkprofiel is mislukt. Probeer opnieuw.' }
  }[profielStatus];
  if (!kandidaat) return null;
  if (kandidaat.status === huidigeStatus) return null;
  return kandidaat;
}

// Zoekt stap 4 van de klant op naam en past die aan. Best effort: een fout hier mag het merkprofiel niet blokkeren.
async function synchroniseMerkprofiel(klantNaam, profielStatus) {
  const res = await getNotionClient().databases.query({
    database_id: ONBOARDING_DATABASE_ID,
    filter: { and: [{ property: 'Klant', rich_text: { equals: String(klantNaam) } }, { property: 'Nr', number: { equals: 4 } }] },
    page_size: 1
  });
  if (!res.results.length) return false;
  const rij = normaliseerRij(res.results[0]);
  const nieuw = bepaalMerkprofielStap(rij.status, profielStatus);
  if (!nieuw) return false;
  await zetStap(rij.id, { ...nieuw, door: 'Workflow' });
  return true;
}

module.exports = { bepaalMerkprofielStap, synchroniseMerkprofiel, normaliseerRij, samenvat, chatZin, groepeerPerKlant, overzicht, voorKlant, start, zetStap };
