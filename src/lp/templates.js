// LP Fabriek: Notion-service voor de "Sjablonen"-database (blueprints als
// data, niet als code-bestand). Zie besluiten.md, sectie "Verduidelijking:
// tweestappenproces per klant" — sjablonen worden hier eenmalig per klant/
// paginatype ontworpen (straks met AI-hulp) en pas daarna gebruikt om
// landingspagina's mee te maken.
//
// Gebruikt BEWUST dezelfde NOTION_TOKEN_ADMIN-integratie als notion.js
// (Landingspagina's) — ook dit is een klant-overstijgende, Advertisr-interne
// database, geen aparte Notion-integratie nodig.
//
// Elke sjabloon-pagina heeft in de body precies één code-block met de
// blueprint-JSON (invoervelden, verplichte/optionele blokken, uniciteits-
// budget, linkregels, ctaregel, seoregels). Werk dus nooit handmatig in de
// body van een Sjablonen-pagina in Notion — dat wordt bij de eerstvolgende
// wijziging vanuit het portaal overschreven.

const { Client } = require('@notionhq/client');

const TEMPLATES_DATABASE_ID = process.env.LP_SJABLONEN_DATABASE_ID || '641a9960-ceed-4d11-a2c4-19aa68f8f7b0';

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) {
    throw new Error(
      'NOTION_TOKEN_ADMIN is niet gezet — de LP Fabriek kan niet bij de "Sjablonen"-database. Zie README.'
    );
  }
  notion = new Client({ auth: token });
  return notion;
}

function plainText(richTextArray) {
  if (!Array.isArray(richTextArray)) return '';
  return richTextArray.map((t) => t.plain_text).join('');
}

function readProperty(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return plainText(prop.title);
    case 'rich_text':
      return plainText(prop.rich_text);
    case 'select':
      return prop.select?.name || '';
    default:
      return null;
  }
}

// Zelfde 1900-tekens-chunking als notion.js, om Notion's 2000-per-segment
// rich_text-limiet nooit te raken.
function chunkText(text, size = 1900) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [''];
}

function codeBlockPayload(jsonValue) {
  const text = JSON.stringify(jsonValue === undefined ? null : jsonValue, null, 2);
  return {
    code: {
      rich_text: chunkText(text).map((chunk) => ({ type: 'text', text: { content: chunk } }))
    }
  };
}

async function listChildrenAll(client, blockId) {
  const all = [];
  let cursor;
  do {
    const res = await client.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    all.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

async function readBlueprintJson(pageId) {
  const client = getNotionClient();
  const children = await listChildrenAll(client, pageId);
  const codeBlock = children.find((b) => b.type === 'code');
  if (!codeBlock) return null;
  const raw = plainText(codeBlock.code.rich_text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { __parseError: err.message, __raw: raw };
  }
}

function summarize(page) {
  return {
    id: page.id,
    naam: readProperty(page, 'Naam'),
    klant: readProperty(page, 'Klant'),
    blueprintId: readProperty(page, 'BlueprintId'),
    status: readProperty(page, 'Status'),
    laatstGewijzigd: page.last_edited_time
  };
}

async function listTemplates({ klant, status } = {}) {
  const client = getNotionClient();
  const filters = [];
  if (klant) filters.push({ property: 'Klant', select: { equals: klant } });
  if (status) filters.push({ property: 'Status', select: { equals: status } });
  const filter = filters.length ? (filters.length === 1 ? filters[0] : { and: filters }) : undefined;

  const results = [];
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: TEMPLATES_DATABASE_ID,
      filter,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(summarize);
}

async function getTemplate(templateId) {
  const client = getNotionClient();
  const page = await client.pages.retrieve({ page_id: templateId });
  const blueprint = await readBlueprintJson(templateId);
  return { ...summarize(page), blueprint };
}

// Zoekt het ACTIEVE sjabloon voor een klant + blueprintId (bv. "roots-event").
// Dit vervangt de oude src/lp/clients/*/blueprints/*.js-bestanden als bron
// van waarheid voor blueprints (zie routes/lp.js). Geeft er BEWUST hetzelfde
// platte object bij terug als de oude code-bestanden hadden (id/naam/
// clientId erin gemixt met de regels zelf), zodat validator.js, render.js en
// public/lp.js niet aangepast hoeven te worden.
async function getActiveTemplateByBlueprintId(klant, blueprintId) {
  const client = getNotionClient();
  const res = await client.databases.query({
    database_id: TEMPLATES_DATABASE_ID,
    filter: {
      and: [
        { property: 'Klant', select: { equals: klant } },
        { property: 'BlueprintId', rich_text: { equals: blueprintId } },
        { property: 'Status', select: { equals: 'Actief' } }
      ]
    },
    page_size: 1
  });
  const page = res.results[0];
  if (!page) {
    throw new Error(`Geen actief sjabloon "${blueprintId}" gevonden voor klant "${klant}".`);
  }
  const blueprintJson = await readBlueprintJson(page.id);
  const meta = summarize(page);
  return { id: meta.blueprintId, naam: meta.naam, clientId: meta.klant, ...blueprintJson };
}

async function createTemplate({ klant, naam, blueprintId, status = 'Concept', blueprint }) {
  const client = getNotionClient();
  const payload = codeBlockPayload(blueprint);
  const page = await client.pages.create({
    parent: { database_id: TEMPLATES_DATABASE_ID },
    properties: {
      Naam: { title: [{ text: { content: naam } }] },
      Klant: { select: { name: klant } },
      BlueprintId: { rich_text: [{ text: { content: blueprintId } }] },
      Status: { select: { name: status } }
    },
    children: [
      { type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'Blueprint' } }] } },
      { type: 'code', code: { language: 'json', ...payload.code } }
    ]
  });
  return getTemplate(page.id);
}

// Patcht het bestaande blueprint-code-block in place. Met maar één sectie per
// pagina is er geen race zoals bij notion.js (Landingspagina's had 3
// secties) — maar we patchen toch in place i.p.v. de body te vervangen, uit
// gewoonte en omdat het net zo makkelijk is.
async function updateTemplateBlueprint(templateId, blueprint) {
  const client = getNotionClient();
  const children = await listChildrenAll(client, templateId);
  const codeBlock = children.find((b) => b.type === 'code');
  const payload = codeBlockPayload(blueprint);
  if (codeBlock) {
    await client.blocks.update({ block_id: codeBlock.id, ...payload });
  } else {
    await client.blocks.children.append({
      block_id: templateId,
      children: [
        { type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'Blueprint' } }] } },
        { type: 'code', code: { language: 'json', ...payload.code } }
      ]
    });
  }
  return getTemplate(templateId);
}

async function setTemplateStatus(templateId, status) {
  const client = getNotionClient();
  await client.pages.update({ page_id: templateId, properties: { Status: { select: { name: status } } } });
}

// Verwijdert een sjabloon (archiveert de Notion-pagina — Notion's eigen
// prullenbak, geen harde delete). De aanroeper (routes/lp.js) weigert dit
// bewust als het sjabloon nog op Status "Actief" staat, zodat er nooit
// per ongeluk het sjabloon onder bestaande/live pagina's wordt weggehaald.
async function deleteTemplate(templateId) {
  const client = getNotionClient();
  await client.pages.update({ page_id: templateId, archived: true });
}

module.exports = {
  TEMPLATES_DATABASE_ID,
  listTemplates,
  getTemplate,
  getActiveTemplateByBlueprintId,
  createTemplate,
  updateTemplateBlueprint,
  setTemplateStatus,
  deleteTemplate
};
