// Kennisdocument per klant: achtergrondkennis die de AI spaarzaam en natuurlijk
// gebruikt bij het schrijven van blogs (zie BA - BCU / BA - Shared - Blog
// Generatie en QA Gate — Shared in n8n). Staat NIET in Notion maar in een losse
// n8n Data Table ("Kennisdocumenten"), omdat dat de tabel is die de
// blog-generatie-workflows zelf ook lezen — dit tabblad is puur een frontend
// erop, geen eigen opslag. De n8n public API kent geen losse "Data Table"-node
// om vanuit een andere workflow aan te roepen, dus dit gaat rechtstreeks via de
// REST-API (https://docs.n8n.io/connect/n8n-api/data-table), met header
// X-N8N-API-KEY.
//
// Matching gebeurt op de kolom client_name, en die moet dus EXACT gelijk zijn
// aan het veld "naam" van de klant in src/config/clients.js (zo staat het ook
// al in de Clients-tabel die de Shared-workflow gebruikt).

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
// Optioneel overschrijfbaar (zie .env.example), standaard al hardcoded net als
// LP_LANDINGSPAGINAS_DATABASE_ID in src/lp/notion.js.
const TABLE_ID = process.env.N8N_KENNISDOCUMENTEN_TABLE_ID || 'Y0RM8H04QYBtFfne';

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) {
    throw new Error(
      'N8N_API_KEY is niet gezet — het Kennisdocument-tabblad kan niet bij n8n. Zie README, "Kennisdocument-tabblad".'
    );
  }
  return key;
}

async function n8nRows(path, options = {}) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${TABLE_ID}${path}`, {
    ...options,
    headers: {
      'X-N8N-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    // Leeg of niet-JSON antwoord — alleen relevant als res.ok ook false is.
  }
  if (!res.ok) {
    throw new Error(`n8n-datatabel "Kennisdocumenten" gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  }
  return data;
}

function clientNaamFilter(clientNaam) {
  return JSON.stringify({
    type: 'and',
    filters: [{ columnName: 'client_name', condition: 'eq', value: clientNaam }]
  });
}

async function getKennisdocument(clientNaam) {
  const filter = clientNaamFilter(clientNaam);
  const result = await n8nRows(`/rows?limit=1&filter=${encodeURIComponent(filter)}`);
  const row = (result.data || [])[0];
  return {
    tekst: row ? row.kennisdocument || '' : '',
    bron: row ? row.bron || '' : '',
    bijgewerkt: row ? row.laatst_bijgewerkt || '' : ''
  };
}

async function saveKennisdocument(clientNaam, tekst, bron) {
  const vandaag = new Date().toISOString().split('T')[0];
  await n8nRows('/rows/upsert', {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        type: 'and',
        filters: [{ columnName: 'client_name', condition: 'eq', value: clientNaam }]
      },
      data: {
        client_name: clientNaam,
        kennisdocument: tekst,
        bron: bron || 'Portaal',
        laatst_bijgewerkt: vandaag
      }
    })
  });
  return { bijgewerkt: vandaag };
}

module.exports = { getKennisdocument, saveKennisdocument };
