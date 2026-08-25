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
    reviewEnabled: true,
    loginPasswordEnv: 'PORTAL_PASSWORD_BASECAMP',
    // Database met de dagelijkse aggregate prestatie-snapshot (Search Console +
    // GA4), gevuld door een losse n8n-workflow. Leeg laten bij een klant zonder
    // prestatie-koppeling — het portaal toont dan simpelweg geen Prestaties-blok.
    performanceLogDatabaseId: '93a731433ea6446fb31a6ba4ba9dc9cb',
    // Zet dit pas op true zodra er minstens ~1 maand aan data in de Prestatie
    // Log staat — anders ziet de klant vooral nullen. Zie gesprek 25-08-2026.
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
      published: 'Gepubliceerd'
    }
  },
  {
    id: 'ppe',
    naam: 'PPExport',
    notionTokenEnv: 'NOTION_TOKEN_PPE',
    databaseId: '', // nog in te vullen zodra we de PPE-contentplanning database-ID hebben
    reviewEnabled: false, // Dylan beoordeelt zelf in WordPress, geen klant-reviewer
    loginPasswordEnv: 'PORTAL_PASSWORD_PPE',
    fields: {
      title: 'Titel',
      status: 'Status',
      category: 'Categorie',
      cta: 'CTA',
      seoTitle: 'SEO Meta Title',
      seoDescription: 'SEO Meta Description',
      publishDate: 'Publicatiedatum',
      customerNotes: 'Opmerkingen klant',
      wordpressPostId: 'WordPress Post ID'
    },
    statusValues: {
      review: 'Ter review',
      approved: 'Goedgekeurd',
      rejected: 'Afgewezen',
      published: 'Gepubliceerd'
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
