// Feitenbibliotheek MAC Bouw: elk feit heeft een eigen bron (besluit 8 in
// besluiten.md). Feiten zonder bron horen hier niet in. Aangemaakt op 25-09-2026 uit de intake
// (knop "Analyseer feiten & CTA" op https://mac-bouw.nl/, door Dylan gecontroleerd voor verzenden).
//
// Bewust NIET overgenomen uit de intake: drie van de vier gedetecteerde formulieren. Twee hadden
// alleen het veld "s" (de standaard WordPress zoekparameter) en een had geen enkel veld; dat bleken
// bij nakijken in de browser zoekformulieren te zijn (adminbalk, zoekbalk, zoekknop in de header).
// Alleen het MetForm-formulier (id 3048) is het echte contactformulier en staat hieronder. Aanvullen per pagina met
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
    label: 'Contactformulier op site (MetForm)',
    waarde: 'MetForm, formulier-id 3048. Velden: mf-first-name (Voor- en achternaam), mf-email ' +
      '(E-mailadres), mf-subject (Onderwerp), mf-comment (Bericht). Verzendknop: "Verzenden". ' +
      'Geen captcha aangetroffen.',
    bron: 'mac-bouw.nl/contact/, formulier-id en velden rechtstreeks uit de pagina (DOM) gelezen in de ' +
      'browser, gecontroleerd 25-09-2026'
  },
  {
    id: 'contactformulier-shortcode',
    label: 'Shortcode contactformulier (MetForm)',
    waarde: '[metform form_id="3048"]',
    bron: 'Standaard MetForm-shortcode met het formulier-id 3048 dat op mac-bouw.nl/contact/ in de ' +
      'pagina staat (wrapper metform-wrap-cf10094-3048), gecontroleerd 25-09-2026. Nog niet in ' +
      'WordPress zelf getest op een landingspagina.'
  }
];

function getFeit(id) {
  return feiten.find((f) => f.id === id);
}

module.exports = { feiten, getFeit };
