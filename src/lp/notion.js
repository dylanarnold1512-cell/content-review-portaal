// LP Fabriek: Notion-service voor de gedeelde "Landingspagina's"-database.
//
// Bewust dezelfde NOTION_TOKEN_ADMIN-integratie als src/services/settings.js
// en src/services/intake.js (Advertisr's eigen interne werkruimte, niet een
// klant-werkruimte) — deze database is klant-overstijgend (besluit 3 in
// besluiten.md), dus hoort net als Portaal Instellingen/Klant Intake bij de
// interne integratie. De "Landingspagina's"-database moet WEL apart gedeeld
// zijn met die integratie in Notion (··· op de database -> Connections),
// dat gebeurt niet vanzelf alleen omdat het token al bestaat.
//
// Bewuste keuze voor eenvoud: de body van elke pagina bevat altijd exact drie
// vaste secties in een vaste volgorde — Invoer, Feitensheet, Content JSON,
// elk een heading_2 gevolgd door één code-block met JSON erin. Bij elke
// wijziging wordt de HELE body vervangen (oude children verwijderd, nieuwe
// toegevoegd) in plaats van losse blocks te zoeken en te patchen. Bij 1-2
// pagina's per klant per maand is dat ruim snel genoeg, en het voorkomt
// fragiele block-matching-logica. Werk dus nooit handmatig in de body van een
// LP Fabriek-pagina in Notion zelf — de structuur wordt bij de eerstvolgende
// wijziging vanuit het portaal overschreven.

const { Client } = require('@notionhq/client');
const { slugify } = require('./utils');

const LP_DATABASE_ID = process.env.LP_LANDINGSPAGINAS_DATABASE_ID || 'fb1c2997-0f01-4e1f-a1fe-e5049cb9e857';

const SECTION_HEADINGS = ['Invoer', 'Feitensheet', 'Content JSON'];
const SECTION_KEYS = ['invoer', 'feitensheet', 'content'];

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) {
    throw new Error(
      'NOTION_TOKEN_ADMIN is niet gezet — de LP Fabriek kan niet bij de "Landingspagina\'s"-database. Zie README.'
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
    case 'date':
      return prop.date?.start || '';
    case 'url':
      return prop.url || '';
    case 'number':
      return typeof prop.number === 'number' ? prop.number : null;
    case 'checkbox':
      return Boolean(prop.checkbox);
    default:
      return null;
  }
}

// Notion rich_text staat per stuk max 2000 tekens toe; splits lange JSON dus
// op in meerdere stukken binnen hetzelfde blok in plaats van 'm af te kappen.
function chunkText(text, size = 1900) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [''];
}

function codeBlock(jsonValue) {
  const text = JSON.stringify(jsonValue === undefined ? null : jsonValue, null, 2);
  return {
    type: 'code',
    code: {
      language: 'json',
      rich_text: chunkText(text).map((chunk) => ({ type: 'text', text: { content: chunk } }))
    }
  };
}

function headingBlock(text) {
  return {
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] }
  };
}

function buildBodyBlocks(sections) {
  const blocks = [];
  SECTION_HEADINGS.forEach((heading, i) => {
    blocks.push(headingBlock(heading));
    blocks.push(codeBlock(sections[SECTION_KEYS[i]] ?? null));
  });
  return blocks;
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

async function replaceBody(pageId, sections) {
  const client = getNotionClient();
  const existing = await listChildrenAll(client, pageId);
  for (const block of existing) {
    await client.blocks.delete({ block_id: block.id });
  }
  const blocks = buildBodyBlocks(sections);
  await client.blocks.children.append({ block_id: pageId, children: blocks });
}

// Leest de vaste sectiestructuur terug. Gaat uit van de vaste volgorde
// waarin replaceBody ze wegschrijft (heading, code, heading, code, heading,
// code) — zie de opmerking bovenaan dit bestand over waarom we niet los
// matchen op heading-tekst.
async function readSections(pageId) {
  const client = getNotionClient();
  const children = await listChildrenAll(client, pageId);
  const sections = { invoer: null, feitensheet: null, content: null };
  const codeBlocks = children.filter((b) => b.type === 'code');
  SECTION_KEYS.forEach((key, i) => {
    const block = codeBlocks[i];
    if (!block) return;
    const raw = plainText(block.code.rich_text);
    if (!raw) return;
    try {
      sections[key] = JSON.parse(raw);
    } catch (err) {
      sections[key] = { __parseError: err.message, __raw: raw };
    }
  });
  return sections;
}

function summarize(page) {
  return {
    id: page.id,
    titel: readProperty(page, 'Titel'),
    klant: readProperty(page, 'Klant'),
    blueprint: readProperty(page, 'Blueprint'),
    status: readProperty(page, 'Status'),
    slug: readProperty(page, 'Slug'),
    wpPaginaId: readProperty(page, 'WP Pagina ID'),
    wpUrl: readProperty(page, 'WP URL'),
    liveDatum: readProperty(page, 'Live datum'),
    adsActief: readProperty(page, 'Ads actief'),
    laatstGewijzigd: page.last_edited_time
  };
}

async function listPages({ klant, status } = {}) {
  const client = getNotionClient();
  const filters = [];
  if (klant) filters.push({ property: 'Klant', select: { equals: klant } });
  if (status) filters.push({ property: 'Status', select: { equals: status } });
  const filter = filters.length ? (filters.length === 1 ? filters[0] : { and: filters }) : undefined;

  const results = [];
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: LP_DATABASE_ID,
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

async function getPage(pageId) {
  const client = getNotionClient();
  const page = await client.pages.retrieve({ page_id: pageId });
  const sections = await readSections(pageId);
  return { ...summarize(page), ...sections };
}

async function createPage({ klant, blueprint, titel, slug, invoer }) {
  const client = getNotionClient();
  const finalSlug = slug || slugify(titel);
  const page = await client.pages.create({
    parent: { database_id: LP_DATABASE_ID },
    properties: {
      Titel: { title: [{ text: { content: titel } }] },
      Klant: { select: { name: klant } },
      Blueprint: { select: { name: blueprint } },
      Status: { select: { name: 'Formulier ingevuld' } },
      Slug: { rich_text: [{ text: { content: finalSlug } }] }
    }
  });
  await replaceBody(page.id, { invoer: invoer ?? null, feitensheet: null, content: null });
  return getPage(page.id);
}

async function updateSection(pageId, sectionKey, value) {
  if (!SECTION_KEYS.includes(sectionKey)) throw new Error(`Onbekende sectie: ${sectionKey}`);
  const current = await readSections(pageId);
  current[sectionKey] = value;
  await replaceBody(pageId, current);
  return getPage(pageId);
}

async function setStatus(pageId, status) {
  const client = getNotionClient();
  await client.pages.update({ page_id: pageId, properties: { Status: { select: { name: status } } } });
}

async function setWordpressInfo(pageId, { wpPaginaId, wpUrl }) {
  const client = getNotionClient();
  const properties = {};
  if (wpPaginaId !== undefined) properties['WP Pagina ID'] = { number: wpPaginaId };
  if (wpUrl !== undefined) properties['WP URL'] = { url: wpUrl };
  await client.pages.update({ page_id: pageId, properties });
}

module.exports = {
  LP_DATABASE_ID,
  listPages,
  getPage,
  createPage,
  updateSection,
  setStatus,
  setWordpressInfo
};
