// Backlog van Blogr. en Pagr.: de Notion database "Backlog" (onder Workflows & Automatiseringen).
// Het adminpaneel leest de punten en kan de status en prioriteit aanpassen. Claude vult en beheert hem in de chat.
// Zelfde integratie als onboarding.js (NOTION_TOKEN_ADMIN). De database moet daarmee gedeeld zijn.

const { Client } = require('@notionhq/client');

const BACKLOG_DATABASE_ID = process.env.NOTION_BACKLOG_DATABASE_ID || 'f4fca58f68264901bc3eaa049509e1a1';

const STATUSSEN = ['Open', 'Bezig', 'Wacht op Dylan', 'Klaar'];
const PRIORITEITEN = ['Nu', 'Binnenkort', 'Later'];

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) throw new Error('NOTION_TOKEN_ADMIN is niet gezet: het adminpaneel kan niet bij de database "Backlog".');
  notion = new Client({ auth: token });
  return notion;
}

function tekst(rich) {
  return Array.isArray(rich) ? rich.map((t) => t.plain_text).join('') : '';
}

function normaliseerRij(page) {
  const p = page.properties || {};
  const sel = (naam) => (p[naam] && p[naam].select && p[naam].select.name) || '';
  const status = (p.Status && p.Status.status && p.Status.status.name) || (p.Status && p.Status.select && p.Status.select.name) || '';
  return {
    id: page.id,
    url: page.url || '',
    titel: tekst(p.Titel && p.Titel.title),
    status,
    prioriteit: sel('Prioriteit'),
    type: sel('Type'),
    onderdeel: sel('Onderdeel'),
    klant: sel('Klant'),
    notitie: tekst(p.Notitie && p.Notitie.rich_text),
    bron: tekst(p.Bron && p.Bron.rich_text),
    aangemaakt: page.created_time || '',
    bijgewerkt: page.last_edited_time || ''
  };
}

// Volgorde: eerst wat Nu moet, dan Binnenkort, dan Later; Klaar onderaan. Binnen een groep nieuwste eerst.
function sorteer(rijen) {
  const prio = (r) => {
    if (r.status === 'Klaar') return 9;
    const i = PRIORITEITEN.indexOf(r.prioriteit);
    return i === -1 ? 5 : i;
  };
  return [...rijen].sort((a, b) => prio(a) - prio(b) || String(b.aangemaakt).localeCompare(String(a.aangemaakt)));
}

async function lijst() {
  const client = getNotionClient();
  const rijen = [];
  let cursor;
  do {
    const res = await client.databases.query({ database_id: BACKLOG_DATABASE_ID, start_cursor: cursor, page_size: 100 });
    rijen.push(...res.results.map(normaliseerRij));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return sorteer(rijen);
}

async function zet(pageId, { status, prioriteit }) {
  const properties = {};
  if (status !== undefined) {
    if (!STATUSSEN.includes(status)) throw new Error('Onbekende status.');
    properties.Status = { status: { name: status } };
  }
  if (prioriteit !== undefined) {
    if (!PRIORITEITEN.includes(prioriteit)) throw new Error('Onbekende prioriteit.');
    properties.Prioriteit = { select: { name: prioriteit } };
  }
  if (!Object.keys(properties).length) throw new Error('Niets om aan te passen.');
  await getNotionClient().pages.update({ page_id: pageId, properties });
}

module.exports = { lijst, zet, normaliseerRij, sorteer, STATUSSEN, PRIORITEITEN };
