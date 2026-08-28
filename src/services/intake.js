// Intake van nieuwe klanten voor het content-systeem, ingevuld via het
// "Nieuwe klant"-tabblad op /admin. Slaat rechtstreeks op in de Notion-
// database "Klant Intake" (eigen Advertisr-werkruimte, los van de
// klant-werkruimtes) — dezelfde database die Claude leest om de opzet
// (Notion-schema, n8n-workflows, portal-entry) in één keer te bouwen.
//
// Gebruikt dezelfde NOTION_TOKEN_ADMIN-integratie als settings.js, zodat er
// geen los token nodig is. Belangrijk: de "Klant Intake"-database moet net
// als "Portaal Instellingen" gedeeld zijn met die integratie (··· →
// Connections) — anders kan deze service er niet bij.

const { Client } = require('@notionhq/client');

const INTAKE_DATABASE_ID = process.env.NOTION_INTAKE_DATABASE_ID || '8b120a5d90c747bf88143e5ab62b0ee0';

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) {
    throw new Error(
      'NOTION_TOKEN_ADMIN is niet gezet — het adminpaneel kan niet bij de "Klant Intake"-database. Zie README.'
    );
  }
  notion = new Client({ auth: token });
  return notion;
}

function plainText(richTextArray) {
  if (!Array.isArray(richTextArray)) return '';
  return richTextArray.map((t) => t.plain_text).join('');
}

function richText(value) {
  const text = (value || '').toString().slice(0, 2000);
  return { rich_text: text ? [{ text: { content: text } }] : [] };
}

function urlProp(value) {
  return { url: value ? value.toString().slice(0, 2000) : null };
}

function summarizeIntake(page) {
  const p = page.properties;
  return {
    id: page.id,
    klant: plainText(p['Klant']?.title),
    clientId: plainText(p['Client ID']?.rich_text),
    tier: p['Tier']?.select?.name || '',
    status: p['Status']?.select?.name || 'Nieuw',
    website: p['Website']?.url || '',
    businessOmschrijving: plainText(p['Business omschrijving']?.rich_text),
    toneOfVoice: plainText(p['Tone of voice']?.rich_text),
    onderwerpsrichtingen: plainText(p['Voorlopige onderwerpsrichtingen']?.rich_text),
    wordpressVanToepassing: Boolean(p['WordPress van toepassing']?.checkbox),
    wordpressUrl: p['WordPress site URL']?.url || '',
    searchConsoleUrl: p['Search Console property URL']?.url || '',
    ga4PropertyId: plainText(p['GA4 property ID']?.rich_text),
    portalWachtwoord: plainText(p['Portal wachtwoord wens']?.rich_text),
    blogsPerMaand: p['Blogs per maand']?.select?.name || '',
    driveMapUrl: p['Content Drive-map URL']?.url || '',
    notificatieEmails: plainText(p['Notificatie e-mailadres(sen)']?.rich_text),
    reviewEnabled: Boolean(p['Review inschakelen']?.checkbox),
    performanceEnabled: Boolean(p['Prestaties inschakelen']?.checkbox),
    ideaEnrichmentEnabled: Boolean(p['Ideeen-verrijking inschakelen']?.checkbox),
    notities: plainText(p['Notities']?.rich_text),
    aangemaaktOp: p['Aangemaakt op']?.created_time || page.created_time
  };
}

async function listIntakes() {
  const client = getNotionClient();
  const res = await client.databases.query({
    database_id: INTAKE_DATABASE_ID,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 100
  });
  return res.results.map(summarizeIntake);
}

async function createIntake(input) {
  const client = getNotionClient();
  const properties = {
    Klant: { title: [{ text: { content: (input.klant || '').slice(0, 200) } }] },
    Status: { select: { name: 'Nieuw' } },
    'Client ID': richText(input.clientId),
    Website: urlProp(input.website),
    'Business omschrijving': richText(input.businessOmschrijving),
    'Tone of voice': richText(input.toneOfVoice),
    'Voorlopige onderwerpsrichtingen': richText(input.onderwerpsrichtingen),
    'WordPress van toepassing': { checkbox: Boolean(input.wordpressVanToepassing) },
    'WordPress site URL': urlProp(input.wordpressUrl),
    'Search Console property URL': urlProp(input.searchConsoleUrl),
    'GA4 property ID': richText(input.ga4PropertyId),
    'Portal wachtwoord wens': richText(input.portalWachtwoord),
    'Review inschakelen': { checkbox: input.reviewEnabled !== false },
    'Prestaties inschakelen': { checkbox: Boolean(input.performanceEnabled) },
    'Ideeen-verrijking inschakelen': { checkbox: Boolean(input.ideaEnrichmentEnabled) },
    'Content Drive-map URL': urlProp(input.driveMapUrl),
    'Notificatie e-mailadres(sen)': richText(input.notificatieEmails),
    Notities: richText(input.notities)
  };
  if (input.tier) {
    properties.Tier = { select: { name: input.tier } };
  }
  if (input.blogsPerMaand) {
    properties['Blogs per maand'] = { select: { name: input.blogsPerMaand.toString() } };
  }
  const page = await client.pages.create({
    parent: { database_id: INTAKE_DATABASE_ID },
    properties
  });
  return { id: page.id };
}

async function updateIntakeStatus(pageId, status) {
  const client = getNotionClient();
  await client.pages.update({
    page_id: pageId,
    properties: { Status: { select: { name: status } } }
  });
}

module.exports = { listIntakes, createIntake, updateIntakeStatus };
