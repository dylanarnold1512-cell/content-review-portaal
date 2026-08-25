const { Client } = require('@notionhq/client');
const { getClient } = require('../config/clients');

// Eén Notion SDK-client per klant, want elke werkruimte heeft zijn eigen token.
const clientCache = new Map();

function getNotionClient(clientId) {
  if (clientCache.has(clientId)) return clientCache.get(clientId);
  const config = getClient(clientId);
  const token = process.env[config.notionTokenEnv];
  if (!token) {
    throw new Error(
      `Geen Notion-token gevonden voor klant "${clientId}". Zet ${config.notionTokenEnv} in de environment variables.`
    );
  }
  const notion = new Client({ auth: token });
  clientCache.set(clientId, notion);
  return notion;
}

function plainText(richTextArray) {
  if (!Array.isArray(richTextArray)) return '';
  return richTextArray.map((t) => t.plain_text).join('');
}

function readProperty(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop) return '';
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
    default:
      return '';
  }
}

function summarizePage(page, fields) {
  return {
    id: page.id,
    titel: readProperty(page, fields.title),
    status: readProperty(page, fields.status),
    categorie: readProperty(page, fields.category),
    cta: readProperty(page, fields.cta),
    seoTitle: readProperty(page, fields.seoTitle),
    seoDescription: readProperty(page, fields.seoDescription),
    publicatiedatum: readProperty(page, fields.publishDate),
    opmerkingenKlant: readProperty(page, fields.customerNotes),
    wordpressPostId: readProperty(page, fields.wordpressPostId),
    liveUrl: fields.liveUrl ? readProperty(page, fields.liveUrl) : '',
    clicks30d: fields.clicks30d ? readProperty(page, fields.clicks30d) : null,
    impressions30d: fields.impressions30d ? readProperty(page, fields.impressions30d) : null,
    avgPosition30d: fields.avgPosition30d ? readProperty(page, fields.avgPosition30d) : null,
    pageviews30d: fields.pageviews30d ? readProperty(page, fields.pageviews30d) : null,
    laatstGewijzigd: page.last_edited_time
  };
}

// Simpele block-naar-HTML renderer voor de meest voorkomende bloktypes die in
// de bloginhoud voorkomen (paragraaf, tussenkopjes, lijsten). Genoeg om de
// content leesbaar te tonen in het portaal; geen volledige Notion-renderer.
function blockToHtml(block) {
  const text = (key) => plainText(block[key]?.rich_text || []);
  switch (block.type) {
    case 'paragraph':
      return `<p>${text('paragraph')}</p>`;
    case 'heading_1':
      return `<h2>${text('heading_1')}</h2>`;
    case 'heading_2':
      return `<h3>${text('heading_2')}</h3>`;
    case 'heading_3':
      return `<h4>${text('heading_3')}</h4>`;
    case 'bulleted_list_item':
      return `<li>${text('bulleted_list_item')}</li>`;
    case 'numbered_list_item':
      return `<li>${text('numbered_list_item')}</li>`;
    case 'quote':
      return `<blockquote>${text('quote')}</blockquote>`;
    default:
      return '';
  }
}

async function getPageContentHtml(notion, pageId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  // Simpele groepering van opeenvolgende list-items in <ul>, zodat de HTML geldig is.
  let html = '';
  let inList = false;
  for (const block of blocks) {
    const isListItem = block.type === 'bulleted_list_item' || block.type === 'numbered_list_item';
    if (isListItem && !inList) {
      html += '<ul>';
      inList = true;
    }
    if (!isListItem && inList) {
      html += '</ul>';
      inList = false;
    }
    html += blockToHtml(block);
  }
  if (inList) html += '</ul>';
  return html;
}

async function listItems(clientId, statusFilter) {
  const config = getClient(clientId);
  const notion = getNotionClient(clientId);
  const filter = statusFilter
    ? { property: config.fields.status, select: { equals: statusFilter } }
    : undefined;
  const res = await notion.databases.query({
    database_id: config.databaseId,
    ...(filter ? { filter } : {}),
    page_size: 100
  });
  return res.results.map((page) => summarizePage(page, config.fields));
}

async function getItemDetail(clientId, pageId) {
  const config = getClient(clientId);
  const notion = getNotionClient(clientId);
  const page = await notion.pages.retrieve({ page_id: pageId });
  const contentHtml = await getPageContentHtml(notion, pageId);
  return { ...summarizePage(page, config.fields), contentHtml };
}

async function approveItem(clientId, pageId) {
  const config = getClient(clientId);
  const notion = getNotionClient(clientId);
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [config.fields.status]: { select: { name: config.statusValues.approved } }
    }
  });
}

async function rejectItem(clientId, pageId, feedback) {
  const config = getClient(clientId);
  const notion = getNotionClient(clientId);
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [config.fields.status]: { select: { name: config.statusValues.rejected } },
      [config.fields.customerNotes]: { rich_text: [{ text: { content: feedback.slice(0, 2000) } }] }
    }
  });
}

// Leest de dagelijkse aggregate prestatie-log (vaste kolomnamen, niet per klant
// configureerbaar zoals de contentplanning — deze database heeft altijd dezelfde
// vorm, gevuld door de dagelijkse n8n-sync).
async function getPerformanceLog(clientId, days = 90) {
  const config = getClient(clientId);
  if (!config.performanceLogDatabaseId) return [];
  const notion = getNotionClient(clientId);
  const res = await notion.databases.query({
    database_id: config.performanceLogDatabaseId,
    sorts: [{ property: 'Datum', direction: 'descending' }],
    page_size: days
  });
  return res.results
    .map((page) => {
      const p = page.properties;
      return {
        datum: p['Datum']?.date?.start || '',
        totaalClicks: p['Totaal clicks']?.number ?? 0,
        totaalVertoningen: p['Totaal vertoningen']?.number ?? 0,
        totaalPaginaweergaven: p['Totaal paginaweergaven']?.number ?? 0,
        blogsGepubliceerd: p['Blogs gepubliceerd (cumulatief)']?.number ?? 0,
        blogsPipeline: p['Blogs in pipeline']?.number ?? 0
      };
    })
    .filter((row) => row.datum)
    .reverse(); // weer oplopend van oud naar nieuw voor de grafiek
}

module.exports = { listItems, getItemDetail, approveItem, rejectItem, getPerformanceLog };
