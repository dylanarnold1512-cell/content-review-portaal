// Eén rij per klant. Nieuwe klant toevoegen = hier een object bijzetten,
// geen nieuwe code. Zie README voor wat elk veld betekent en hoe je het invult.
//
// notionTokenEnv verwijst naar een environment variable omdat elke Notion-
// werkruimte zijn eigen integratie-token heeft (een integratie kan niet over
// werkruimtes heen werken). Zet de echte waarde nooit hier in dit bestand.

const clients = [
  {
    id: 'basecamp-utrecht',
    naam: 'Basecamp Utrecht',
    notionTokenEnv: 'NOTION_TOKEN_BASECAMP',
    databaseId: '41d12e87-c0ac-4f4f-816f-bd2f65f9bb8b', // "Basecamp Utrecht - Content Planning"
    // reviewEnabled/performanceEnabled hieronder zijn alleen nog de fallback-
    // waarden voor als de "Portaal Instellingen"-database in Notion niet
    // bereikbaar is. In het dagelijks gebruik zet je deze aan/uit via het
    // adminpaneel op /admin — zie README, "Klantinstellingen aan/uit zetten".
    reviewEnabled: true,
    // Zelfde soort fallback: bepaalt of de klant de "Idee aandragen"-knop en
    // de automatische idee-verrijking (GPT + jouw goedkeuring) krijgt. Live
    // aan/uit zetten via /admin.
    ideaEnrichmentEnabled: true,
    loginPasswordEnv: 'PORTAL_PASSWORD_BASECAMP',
    // Database met de dagelijkse aggregate prestatie-snapshot (Search Console +
    // GA4), gevuld door een losse n8n-workflow. Leeg laten bij een klant zonder
    // prestatie-koppeling — het portaal toont dan simpelweg geen Prestaties-blok.
    performanceLogDatabaseId: '93a731433ea6446fb31a6ba4ba9dc9cb',
    // Fallback-waarde (zie opmerking bij reviewEnabled hierboven). Pas 'm live
    // aan op /admin — pas aanzetten zodra er minstens ~1 maand aan data in de
    // Prestatie Log staat, anders ziet de klant vooral nullen.
    performanceEnabled: false,
    // Namen van de Notion-properties zoals ze in deze database heten.
    // Per klant configureerbaar, want niet elke database zal exact dezelfde
    // kolomnamen gebruiken.
    fields: {
      title: 'Titel',
      status: 'Status',
      category: 'Categorie',
      cta: 'CTA',
      seoTitle: 'SEO Meta Title',
      seoDescription: 'SEO Meta Description',
      publishDate: 'Publicatiedatum',
      customerNotes: 'Opmerkingen klant',
      wordpressPostId: 'WordPress Post ID',
      liveUrl: 'Live URL',
      mainKeyword: 'Hoofdkeyword',
      // Alleen gebruikt voor de idee-verrijking (admin-kant) — niet getoond
      // aan de klant, alleen relevant zodra Status = Idee.
      slug: 'Slug',
      secondaryKeywords: 'Secundaire keywords',
      searchIntent: 'Zoekintentie',
      cluster: 'Cluster',
      clicks30d: 'Clicks (30d)',
      impressions30d: 'Vertoningen (30d)',
      avgPosition30d: 'Gem. positie (30d)',
      pageviews30d: 'Paginaweergaven (30d)'
    },
    // Statuswaarden zoals ze echt in Notion staan (bevestigd op 24-08-2026).
    statusValues: {
      review: 'Ter review',
      approved: 'Goedgekeurd',
      rejected: 'Afgewezen',
      published: 'Gepubliceerd',
      idea: 'Idee',
      planned: 'Gepland'
    }
  },
  {
    id: 'ppe',
    naam: 'PPExport',
    notionTokenEnv: 'NOTION_TOKEN_PPE',
    databaseId: 'e85219a5-27a4-44f8-8651-4ef6b957658e', // "PPE Commercial Content Database"
    // reviewEnabled hieronder is alleen nog de fallback-waarde voor als de
    // "Portaal Instellingen"-database in Notion niet bereikbaar is. Sta uit
    // tot de nieuwe n8n-workflows ("PPE - SEO - Blog Automation" concept +
    // "PPE - Publicatie Sync") getest en geactiveerd zijn — pas daarna zelf
    // aanzetten via /admin. Dylan is de reviewer (logt in met
    // PORTAL_PASSWORD_PPE), net als bij Basecamp Utrecht: goedkeuren zet
    // de blog direct live, geen tussenstap.
    reviewEnabled: false,
    ideaEnrichmentEnabled: false,
    loginPasswordEnv: 'PORTAL_PASSWORD_PPE',
    fields: {
      title: 'Titel',
      status: 'Status',
      category: 'Categorie',
      cta: 'CTA',
      seoTitle: 'SEO Meta Title',
      seoDescription: 'SEO Meta Description',
      publishDate: 'Publicatiedatum',
      customerNotes: 'Opmerkingen',
      wordpressPostId: 'WordPress Post ID',
      liveUrl: 'URL',
      mainKeyword: 'Hoofdkeyword'
    },
    // Statuswaarden zoals ze echt in Notion staan (bijgewerkt op 25-08-2026:
    // "Review" hernoemd naar "Ter review", "Goedgekeurd"/"Afgewezen" toegevoegd).
    statusValues: {
      review: 'Ter review',
      approved: 'Goedgekeurd',
      rejected: 'Afgewezen',
      published: 'Gepubliceerd',
      idea: 'Idee',
      planned: 'Gepland'
    }
  }
];

function getClient(clientId) {
  const client = clients.find((c) => c.id === clientId);
  if (!client) throw new Error(`Onbekende klant: ${clientId}`);
  return client;
}

function listClients() {
  return clients.map((c) => ({ id: c.id, naam: c.naam, reviewEnabled: c.reviewEnabled }));
}

module.exports = { clients, getClient, listClients };
