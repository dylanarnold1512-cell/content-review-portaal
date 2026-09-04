// LP Fabriek: Notion-service voor de "Klant Intake"-database. Vangt de
// intake van een nieuwe klant op (basisgegevens, huisstijl-voorstel, feiten)
// zodat de uurlijkse automatische verwerking (zie besluiten.md, "Klant-
// intake in het portaal") 'm kan omzetten naar profile.js/feiten.js/
// tokens.js in de repo. Git blijft de bron van waarheid voor klantprofielen
// (besluit 4) — deze database is alleen een wachtruimte tussen "Dylan heeft
// de intake ingevuld" en "de bestanden staan in de repo en zijn gedeployed".
//
// BELANGRIJK: hier komen NOOIT echte WordPress-inloggegevens in te staan.
// Het intake-formulier vraagt alleen naar de NAMEN van de env-vars (zie
// profile.js-patroon bij Roots) — de echte waarden zet Dylan apart in
// Render/.env, nooit in Notion.
//
// Zelfde patroon als templates.js: precies één code-block met JSON in de
// body, nooit handmatig bewerken in Notion zelf.

const { Client } = require('@notionhq/client');

const INTAKE_DATABASE_ID = process.env.LP_KLANT_INTAKE_DATABASE_ID || 'aabdf198-4a68-4773-908d-c93281f946f0';

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) {
    throw new Error(
      'NOTION_TOKEN_ADMIN is niet gezet — de LP Fabriek kan niet bij de "Klant Intake"-database. Zie README.'
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

async function readIntakeJson(pageId) {
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
    klantnaam: readProperty(page, 'Klantnaam'),
    klantId: readProperty(page, 'KlantId'),
    status: readProperty(page, 'Status'),
    foutmelding: readProperty(page, 'Foutmelding'),
    aangemaakt: page.created_time,
    laatstGewijzigd: page.last_edited_time
  };
}

async function listIntakes({ status } = {}) {
  const client = getNotionClient();
  const filter = status ? { property: 'Status', select: { equals: status } } : undefined;
  const results = [];
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: INTAKE_DATABASE_ID,
      filter,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }]
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.map(summarize);
}

async function getIntake(intakeId) {
  const client = getNotionClient();
  const page = await client.pages.retrieve({ page_id: intakeId });
  const intake = await readIntakeJson(intakeId);
  return { ...summarize(page), intake };
}

// intake bevat: { klantnaam, taal, wpEnvNamen: {urlEnv, usernameEnv, appPasswordEnv}, nietToegestaan:
// [string], toonNotitie, referentieUrl, huisstijlVoorstel: {tokensVoorstel, samenvatting, twijfels},
// feiten: [{label, waarde, bron}] } — precies genoeg om er profile.js/feiten.js/tokens.js van te maken.
async function createIntake({ klantnaam, klantId, intake }) {
  const client = getNotionClient();
  const payload = codeBlockPayload(intake);
  const page = await client.pages.create({
    parent: { database_id: INTAKE_DATABASE_ID },
    properties: {
      Klantnaam: { title: [{ text: { content: klantnaam } }] },
      KlantId: { rich_text: [{ text: { content: klantId || '' } }] },
      Status: { select: { name: 'Nieuw' } }
    },
    children: [
      { type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: 'Intake' } }] } },
      { type: 'code', code: { language: 'json', ...payload.code } }
    ]
  });
  return getIntake(page.id);
}

async function setIntakeStatus(intakeId, status, foutmelding) {
  const client = getNotionClient();
  const properties = { Status: { select: { name: status } } };
  if (foutmelding !== undefined) {
    properties.Foutmelding = { rich_text: foutmelding ? [{ text: { content: String(foutmelding).slice(0, 1900) } }] : [] };
  }
  await client.pages.update({ page_id: intakeId, properties });
}

module.exports = {
  INTAKE_DATABASE_ID,
  listIntakes,
  getIntake,
  createIntake,
  setIntakeStatus
};
