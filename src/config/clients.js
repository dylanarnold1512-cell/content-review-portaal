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
      wordpressPostId: 'WordPress Post ID'
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
