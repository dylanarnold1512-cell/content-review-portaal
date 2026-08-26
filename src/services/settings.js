// Live schakelaars per klant (reviewEnabled / performanceEnabled), opgeslagen
// in een eigen Notion-database "Portaal Instellingen" (los van de klanten hun
// eigen werkruimtes — dit is Advertisr's eigen interne database). Zo kan Dylan
// dit via het adminpaneel (of rechtstreeks in Notion) aanpassen zonder dat er
// een nieuwe deploy nodig is.
//
// clients.js blijft de fallback: als deze database niet bereikbaar is (token
// mist, Notion plat) valt het portaal terug op de waarden die daar hardcoded
// staan, zodat een storing in deze laag nooit het hele portaal platlegt.

const { Client } = require('@notionhq/client');

const SETTINGS_DATABASE_ID = process.env.NOTION_SETTINGS_DATABASE_ID || 'ab1545ee0ed04c4ba361450554a8dace';
const CACHE_TTL_MS = 30 * 1000;

const PROPERTY_BY_FIELD = {
  reviewEnabled: 'Review ingeschakeld',
  performanceEnabled: 'Prestaties ingeschakeld',
  ideaEnrichmentEnabled: 'Ideeën-verrijking ingeschakeld'
};

let notion = null;
function getNotionClient() {
  if (notion) return notion;
  const token = process.env.NOTION_TOKEN_ADMIN;
  if (!token) {
    throw new Error(
      'NOTION_TOKEN_ADMIN is niet gezet — het adminpaneel kan niet bij de "Portaal Instellingen"-database. Zie README.'
    );
  }
  notion = new Client({ auth: token });
  return notion;
}

let cache = null; // { byClientId: Map<string, {pageId, naam, reviewEnabled, performanceEnabled}>, fetchedAt }

async function fetchAllFromNotion() {
  const client = getNotionClient();
  const byClientId = new Map();
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: SETTINGS_DATABASE_ID,
      start_cursor: cursor,
      page_size: 100
    });
    for (const page of res.results) {
      const props = page.properties;
      const clientId = (props['Client ID']?.rich_text || []).map((t) => t.plain_text).join('').trim();
      if (!clientId) continue;
      byClientId.set(clientId, {
        pageId: page.id,
        naam: (props['Klant']?.title || []).map((t) => t.plain_text).join('') || clientId,
        reviewEnabled: Boolean(props['Review ingeschakeld']?.checkbox),
        performanceEnabled: Boolean(props['Prestaties ingeschakeld']?.checkbox),
        ideaEnrichmentEnabled: Boolean(props['Ideeën-verrijking ingeschakeld']?.checkbox)
      });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return byClientId;
}

async function getSettingsMap({ forceRefresh = false } = {}) {
  const isStale = !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (forceRefresh || isStale) {
    try {
      const byClientId = await fetchAllFromNotion();
      cache = { byClientId, fetchedAt: Date.now() };
    } catch (err) {
      if (!cache) throw err;
      console.error('Kon "Portaal Instellingen" niet verversen, val terug op de laatst bekende waarden:', err.message);
    }
  }
  return cache ? cache.byClientId : new Map();
}

// Voor de publieke portaal-routes: geeft altijd een bruikbaar antwoord terug,
// valt stil terug op de waarden uit clients.js als Notion niet bereikbaar is.
async function getClientSettings(clientId, fallback = {}) {
  try {
    const map = await getSettingsMap();
    const settings = map.get(clientId);
    if (settings) {
      return {
        reviewEnabled: settings.reviewEnabled,
        performanceEnabled: settings.performanceEnabled,
        ideaEnrichmentEnabled: settings.ideaEnrichmentEnabled
      };
    }
  } catch (err) {
    console.error(`Kon portaalinstellingen niet ophalen voor "${clientId}", val terug op clients.js:`, err.message);
  }
  return {
    reviewEnabled: Boolean(fallback.reviewEnabled),
    performanceEnabled: Boolean(fallback.performanceEnabled),
    ideaEnrichmentEnabled: Boolean(fallback.ideaEnrichmentEnabled)
  };
}

// Voor het adminpaneel: overzicht van alle klanten uit clients.js met hun
// huidige stand, inclusief een vlag of een klant nog geen rij in Notion heeft.
async function listAllSettings(clientsConfig) {
  const map = await getSettingsMap({ forceRefresh: true });
  return clientsConfig.map((c) => {
    const settings = map.get(c.id);
    return {
      id: c.id,
      naam: c.naam,
      heeftPrestaties: Boolean(c.performanceLogDatabaseId),
      reviewEnabled: settings ? settings.reviewEnabled : Boolean(c.reviewEnabled),
      performanceEnabled: settings ? settings.performanceEnabled : Boolean(c.performanceEnabled),
      ideaEnrichmentEnabled: settings ? settings.ideaEnrichmentEnabled : Boolean(c.ideaEnrichmentEnabled),
      inNotion: Boolean(settings)
    };
  });
}

async function updateClientSetting(clientId, field, value) {
  const propertyName = PROPERTY_BY_FIELD[field];
  if (!propertyName) throw new Error(`Onbekend instellingveld: ${field}`);

  const client = getNotionClient();
  const map = await getSettingsMap();
  const existing = map.get(clientId);

  if (existing) {
    await client.pages.update({
      page_id: existing.pageId,
      properties: { [propertyName]: { checkbox: Boolean(value) } }
    });
  } else {
    // Nog geen rij voor deze klant in Notion — maak 'm aan op basis van clients.js.
    const { getClient } = require('../config/clients');
    const config = getClient(clientId);
    await client.pages.create({
      parent: { database_id: SETTINGS_DATABASE_ID },
      properties: {
        Klant: { title: [{ text: { content: config.naam } }] },
        'Client ID': { rich_text: [{ text: { content: clientId } }] },
        [propertyName]: { checkbox: Boolean(value) }
      }
    });
  }

  // Meteen verversen zodat de wijziging direct terugkomt, ook in andere tabbladen.
  await getSettingsMap({ forceRefresh: true });
}

module.exports = { getClientSettings, listAllSettings, updateClientSetting };
