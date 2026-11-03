// De rapportage datacollectie workflows (Advertisr, Digital Impact, House of Talents en Excel) in n8n starten met een n8n formulier.
// Dit bestand beschrijft die formulieren, zodat het portaal ze kan nabootsen. De labels moeten letterlijk
// gelijk zijn aan de veldnamen in het n8n formulier, want het portaal koppelt daarop.
// Alle velden behalve de klant zijn optioneel. Leeg betekent: automatisch uit de API.

const MAAND = 'Maand overschrijven (1-12, leeglaten = vorige maand)';
const JAAR = 'Jaar overschrijven (bijv. 2026, leeglaten = huidig jaar)';

const ORGANISATIES = [
  {
    id: 'advertisr',
    naam: 'Advertisr',
    workflowId: 'emBzCd7U5jHZzK0s',
    formPad: 'advertisr-rapportage',
    klantLabel: 'Klant',
    klanten: ['Roots', 'BalkonMonteur', 'Relatiebureau', 'StartDock', 'Basecamp Utrecht'],
    maandLabel: MAAND,
    jaarLabel: JAAR,
    velden: [
      { label: 'Google Ads conversies handmatig (leeglaten = automatisch)', type: 'number', groep: 'Google Ads' },
      { label: 'Omzet handmatig in euro (alleen Roots, leeglaten = automatisch)', type: 'number', groep: 'Website', klanten: ['Roots'] },
      { label: 'Website conversies handmatig (leeglaten = automatisch)', type: 'number', groep: 'Website' }
    ],
    notitiesLabel: 'Notities'
  },
  {
    id: 'digital-impact',
    naam: 'Digital Impact',
    workflowId: 'yEQVoJ4cEXU9u82x',
    formPad: 'digital-impact-rapportage',
    klantLabel: 'Klant',
    klanten: ['SPAWW', 'UNIT45', 'Bonnewits', 'K-tainer', 'J. van Doorn', 'Interfastfood', 'UNIT53', 'Grep-Cat'],
    maandLabel: MAAND,
    jaarLabel: JAAR,
    velden: [
      { label: 'Google Ads - Conversies overschrijven (leeglaten = automatisch)', type: 'number', groep: 'Google Ads' },
      { label: 'Bing Ads - Vertoningen', type: 'number', groep: 'Bing Ads' },
      { label: 'Bing Ads - Klikken', type: 'number', groep: 'Bing Ads' },
      { label: 'Bing Ads - Conversies', type: 'number', groep: 'Bing Ads' },
      { label: 'Bing Ads - Kosten (euro)', type: 'number', groep: 'Bing Ads' },
      { label: 'Meta Ads - Bereik (handmatig, leeglaten = automatisch)', type: 'number', groep: 'Meta Ads' },
      { label: 'Meta Ads - Vertoningen (handmatig, leeglaten = automatisch)', type: 'number', groep: 'Meta Ads' },
      { label: 'Meta Ads - Klikken (handmatig, leeglaten = automatisch)', type: 'number', groep: 'Meta Ads' },
      { label: 'Meta Ads - Conversies (handmatig, leeglaten = automatisch)', type: 'number', groep: 'Meta Ads' },
      { label: 'Meta Ads - Kosten euro (handmatig, leeglaten = automatisch)', type: 'number', groep: 'Meta Ads' },
      { label: 'LinkedIn Ads - Bereik (handmatig invullen)', type: 'number', groep: 'LinkedIn Ads' },
      { label: 'J. van Doorn - Google Ads omzet overschrijven (euro, leeglaten = automatisch)', type: 'number', groep: 'J. van Doorn', klanten: ['J. van Doorn'] },
      { label: 'J. van Doorn - Contactformulier conversies overschrijven (leeglaten = automatisch)', type: 'number', groep: 'J. van Doorn', klanten: ['J. van Doorn'] },
      { label: 'J. van Doorn - Offerte conversies overschrijven (leeglaten = automatisch)', type: 'number', groep: 'J. van Doorn', klanten: ['J. van Doorn'] },
      { label: 'Totale website omzet (euro) - alleen voor J. van Doorn', type: 'number', groep: 'J. van Doorn', klanten: ['J. van Doorn'] },
      { label: 'J. van Doorn - Aankoop (purchase) conversies overschrijven (leeglaten = automatisch)', type: 'number', groep: 'J. van Doorn', klanten: ['J. van Doorn'] },
      { label: 'K-tainer - Contactformulier conversies (handmatig, leeglaten = automatisch, 0 mag)', type: 'number', groep: 'K-tainer', klanten: ['K-tainer'] },
      { label: 'K-tainer - Purchase conversies (handmatig, leeglaten = automatisch)', type: 'number', groep: 'K-tainer', klanten: ['K-tainer'] },
      { label: 'K-tainer - Offerte aanvragen (handmatig, leeglaten = automatisch)', type: 'number', groep: 'K-tainer', klanten: ['K-tainer'] },
      { label: 'K-tainer - Klik op telefoonnummer (handmatig, leeglaten = automatisch)', type: 'number', groep: 'K-tainer', klanten: ['K-tainer'] },
      { label: 'K-tainer - Klik op email (handmatig, leeglaten = automatisch)', type: 'number', groep: 'K-tainer', klanten: ['K-tainer'] }
    ],
    notitiesLabel: 'Notities (wat heb je gedaan deze maand?)'
  },
  {
    id: 'dram',
    naam: 'House of Talents',
    workflowId: '2tEYqFw97hucE6v9',
    formPad: 'hot-rapportage',
    klantLabel: 'Domein',
    klanten: ['Data Talents', 'Dev Talents', 'Digital Talents', 'Engi Talents', 'Business Solutions Talents', 'Integration & Application Talents', 'IT Infra Talents', 'IT Test Talents', 'HR Talents', 'Leadership Talents', 'L&D Talents', 'Project & Change Talents', 'Public Talents', 'AI Talents', 'SMC Amsterdam', 'SMC Rotterdam', 'StartDock', 'Basecamp Utrecht'],
    maandLabel: MAAND,
    jaarLabel: JAAR,
    velden: [
      { label: 'LinkedIn conversies handmatig (leeglaten = automatisch)', type: 'number', groep: 'LinkedIn Ads' },
      { label: 'Google Ads conversies handmatig (leeglaten = automatisch)', type: 'number', groep: 'Google Ads' },
      { label: 'Totale website conversies handmatig (leeglaten = automatisch)', type: 'number', groep: 'Website' },
      { label: 'Sollicitatie verzonden handmatig (leeglaten = automatisch)', type: 'number', groep: 'Website' },
      { label: 'Formulier verzonden handmatig (leeglaten = automatisch)', type: 'number', groep: 'Website' }
    ],
    notitiesLabel: 'Notities'
  },
  {
    id: 'excel',
    naam: 'Excel rapportages',
    workflowId: 'cLsCz9xKsiANzhvq',
    formPad: 'excel-rapportage',
    klantLabel: 'Klant',
    klanten: ['Ciao Italia', 'Haarlemse Fiets', 'PPExport', 'Staalconstructieonline', 'A.K. Dans & Sport', 'Mixt Creations', 'Durbuy Moments', 'Maxims', 'VariantZorg', 'Tattoo Heaven', 'Trockenblumen Grosshandel', 'JMB Bouw', 'Bubbelbroeders', 'Weddingmusthaves', 'Schuijt Klussenbedrijf'],
    maandLabel: MAAND,
    jaarLabel: JAAR,
    velden: [
      { label: 'Bestellingen/transacties handmatig (leeglaten = automatisch via GA4)', type: 'number', groep: 'Website' },
      { label: 'Netto omzet handmatig in euro (leeglaten = automatisch via GA4)', type: 'number', groep: 'Website' },
      { label: 'Google Ads conversies handmatig (leeglaten = automatisch)', type: 'number', groep: 'Google Ads' },
      { label: 'Meta Ads aankopen handmatig (leeglaten = automatisch/gedeelde tabel)', type: 'number', groep: 'Meta Ads' },
      { label: 'Meta Ads omzet handmatig in euro (leeglaten = automatisch/gedeelde tabel)', type: 'number', groep: 'Meta Ads' }
    ],
    notitiesLabel: 'Notities'
  }
];

module.exports = { ORGANISATIES };
