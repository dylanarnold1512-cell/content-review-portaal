// Feitenbibliotheek MAC Bouw: elk feit heeft een eigen bron (besluit 8 in
// besluiten.md). Feiten zonder bron horen hier niet in. Aangemaakt op 25-09-2026 uit de intake
// (knop "Analyseer feiten & CTA" op https://mac-bouw.nl/, door Dylan gecontroleerd voor verzenden).
//
// Bewust NIET overgenomen uit de intake: drie van de vier gedetecteerde formulieren. Twee hadden
// alleen het veld "s" (de standaard WordPress zoekparameter, dus waarschijnlijk een zoekveld) en
// een had geen enkel veld. Alleen het formulier met de velden mf-first-name, mf-email, mf-subject
// en mf-comment lijkt een echt contactformulier en staat hieronder. Aanvullen per pagina met
// pagina-specifieke feiten uit de feitensheet: dit bestand is de vaste basis, niet de volledige
// lijst per pagina.
//
// Nog geen adres, openingstijden, telefoonnummer of e-mailadres: die kon de site-analyse niet
// betrouwbaar afleiden. Voeg ze toe zodra ze met een echte bron bevestigd zijn.

const feiten = [
  {
    id: 'dienst-nieuwbouw-verbouw',
    label: 'Dienst',
    waarde: 'Nieuwbouw en verbouw',
    bron: 'mac-bouw.nl, pagina Nieuwbouw en verbouw, gecontroleerd 25-09-2026'
  },
  {
    id: 'dienst-renovatie',
    label: 'Dienst',
    waarde: 'Renovatie',
    bron: 'mac-bouw.nl, pagina Renovatie, gecontroleerd 25-09-2026'
  },
  {
    id: 'dienst-timmerwerk-onderhoud',
    label: 'Dienst',
    waarde: 'Timmerwerk en onderhoud',
    bron: 'mac-bouw.nl, pagina Timmerwerk en onderhoud, gecontroleerd 25-09-2026'
  },
  {
    id: 'dienst-prefab-dakkapellen',
    label: 'Dienst',
    waarde: 'Prefab dakkapellen',
    bron: 'mac-bouw.nl, pagina Dakkapel, gecontroleerd 25-09-2026'
  },
  {
    id: 'dienst-dakkapel-samenstellen',
    label: 'Dienst',
    waarde: 'Dakkapel samenstellen',
    bron: 'mac-bouw.nl, pagina Configurator, gecontroleerd 25-09-2026'
  },
  {
    id: 'hoofd-cta',
    label: 'Hoofd-CTA (contactpagina)',
    waarde: 'https://mac-bouw.nl/contact/',
    bron: 'mac-bouw.nl/contact/, contactpagina die Dylan in de intake heeft opgegeven, ' +
      'gecontroleerd 25-09-2026 (interne WordPress-pagina, geen extern boekingssysteem)'
  },
  {
    id: 'contactformulier',
    label: 'Contactformulier op site (plugin onbekend)',
    waarde: 'velden: mf-first-name, mf-email, mf-subject, mf-comment',
    bron: 'mac-bouw.nl, automatisch gedetecteerd bij de site-analyse van de intake, gecontroleerd 25-09-2026'
  }
];

function getFeit(id) {
  return feiten.find((f) => f.id === id);
}

module.exports = { feiten, getFeit };
