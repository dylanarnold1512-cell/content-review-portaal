// Feitenbibliotheek MAC Bouw: elk feit heeft een eigen bron (besluit 8 in
// besluiten.md). Feiten zonder bron horen hier niet in. Aangemaakt op 25-09-2026 uit de intake
// (knop "Analyseer feiten & CTA" op https://mac-bouw.nl/, door Dylan gecontroleerd voor verzenden).
//
// Bewust NIET overgenomen uit de intake: drie van de vier gedetecteerde formulieren. Twee hadden
// alleen het veld "s" (de standaard WordPress zoekparameter) en een had geen enkel veld; dat bleken
// bij nakijken in de browser zoekformulieren te zijn (adminbalk, zoekbalk, zoekknop in de header).
// Het echte contactformulier staat hieronder (sinds 02-10-2026 Contact Form 7, eerder MetForm id 3048). Aanvullen per pagina met
// pagina-specifieke feiten uit de feitensheet: dit bestand is de vaste basis, niet de volledige
// lijst per pagina.
//
// Adres, telefoon en e-mail zijn op 25-09-2026 aangevuld uit de contactpagina. Openingstijden en KvK-nummer
// staan niet op de site en ontbreken dus bewust (nooit verzinnen).

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
    id: 'bedrijfsnaam',
    label: 'Bedrijfsnaam',
    waarde: 'Aannemersbedrijf MAC Bouw B.V.',
    bron: 'mac-bouw.nl/contact/, tekst in de voettekst, gecontroleerd 25-09-2026'
  },
  {
    id: 'adres',
    label: 'Kantoor (adres)',
    waarde: 'Marconistraat 31A, 2181 AK Hillegom',
    bron: 'mac-bouw.nl/contact/, voettekst onder "Kantoor", gecontroleerd 25-09-2026'
  },
  {
    id: 'telefoon',
    label: 'Telefoonnummer (vast)',
    waarde: '+31 (0) 252 34 95 23',
    bron: 'mac-bouw.nl/contact/, voettekst onder "Telefoonnummer" en tel:-link, gecontroleerd 25-09-2026'
  },
  {
    id: 'mobiel',
    label: 'Telefoonnummer (mobiel)',
    waarde: '+31 6 51370691',
    bron: 'mac-bouw.nl/contact/, hoofdtekst onder "Telefoonnummer" en tel:-link, gecontroleerd 25-09-2026'
  },
  {
    id: 'email',
    label: 'E-mailadres',
    waarde: 'info@mac-bouw.nl',
    bron: 'mac-bouw.nl/contact/, onder "E-mailadres" en mailto:-link, gecontroleerd 25-09-2026'
  },
  {
    id: 'werkgebied',
    label: 'Werkgebied',
    waarde: 'Hillegom en omstreken',
    bron: 'mac-bouw.nl/contact/, onder "Werkgebied", gecontroleerd 25-09-2026'
  },
  {
    id: 'contactformulier',
    label: 'Contactformulier op site (Contact Form 7)',
    waarde: 'Contact Form 7, formulier "Offerte aanvraag MAC Bouw" (id 9898a61).',
    bron: 'opgegeven door Dylan op 02-10-2026: MAC Bouw is overgegaan van MetForm naar Contact Form 7'
  },
  {
    id: 'contactformulier-shortcode',
    label: 'Shortcode contactformulier (Contact Form 7)',
    waarde: '[contact-form-7 id="9898a61" title="Offerte aanvraag MAC Bouw"]',
    bron: 'opgegeven door Dylan op 02-10-2026 (formulier "Offerte"). Nog niet getest op een landingspagina.'
  },
  // Veelgestelde vragen van de homepage (accordeon), letterlijk uit de pagina (DOM) gelezen op 29-09-2026.
  // Bewust NIET overgenomen: "Wat onderscheidt ..." (het antwoord bevat de sjabloonfout "meer dan elk jaar
  // ervaring", dus geen bruikbaar feit) en "Hoe gaat ... om met budgetten en deadlines" (algemene
  // belofte zonder concrete gegevens). Aan/uit te zetten per pagina in de feitensheet.
  {
    id: 'faq-soorten-projecten',
    label: 'Veelgestelde vraag',
    waarde: 'Vraag: Welke soorten projecten kan Aannemersbedrijf MAC Bouw B.V. aanpakken? Antwoord: Wij zijn ' +
      'gespecialiseerd in diverse soorten projecten, waaronder nieuwbouw, verbouwingen, renovaties, timmerwerk, ' +
      'onderhoud en dakkapellen. Of je nu een kleine reparatie nodig hebt, een complete renovatie plant of een ' +
      'nieuw huis wilt bouwen, wij hebben de expertise en ervaring om jouw project tot een succes te maken. Ons ' +
      'team van vakmensen staat klaar om aan al jouw bouwbehoeften te voldoen.',
    bron: 'mac-bouw.nl, homepage, veelgestelde vragen (accordeon), gecontroleerd 29-09-2026',
    standaard: true
  },
  {
    id: 'faq-offerte-aanvragen',
    label: 'Veelgestelde vraag',
    waarde: 'Vraag: Hoe kan ik een offerte aanvragen bij Aannemersbedrijf MAC Bouw B.V.? Antwoord: Het aanvragen ' +
      'van een offerte bij Aannemersbedrijf MAC Bouw B.V. is eenvoudig. Je kunt contact met ons opnemen via ' +
      'telefoon, e-mail of het contactformulier op onze website invullen. Onze vriendelijke en professionele ' +
      'medewerkers zullen graag naar jouw wensen luisteren, je vragen beantwoorden en een gedetailleerde offerte ' +
      'opstellen op basis van de specificaties van jouw project. We streven ernaar om zo snel mogelijk te ' +
      'reageren en je te voorzien van alle benodigde informatie.',
    bron: 'mac-bouw.nl, homepage, veelgestelde vragen (accordeon), gecontroleerd 29-09-2026',
    standaard: true
  }
];

function getFeit(id) {
  return feiten.find((f) => f.id === id);
}

module.exports = { feiten, getFeit };
