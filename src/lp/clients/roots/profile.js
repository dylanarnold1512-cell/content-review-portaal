// Klantprofiel Hostel Roots voor de LP Fabriek. Dit is een ANDER bestand dan
// src/config/clients.js (dat is voor de blogautomatisering/Notion-klantzone).
// Voor de LP Fabriek geldt: per klant of paginatype hoort in Git (dit bestand,
// de feiten, de blueprints), per pagina hoort in Notion. Zie besluiten.md,
// besluit 4.

const profile = {
  id: 'roots',
  naam: 'Hostel Roots',
  taal: 'nl',
  wordpress: {
    // Env vars staan in .env, nooit hier de echte waarden.
    urlEnv: 'WP_URL_ROOTS',
    usernameEnv: 'WP_USERNAME_ROOTS',
    appPasswordEnv: 'WP_APP_PASSWORD_ROOTS'
  },
  // Bedrijfsgegevens (28-09-2026, toegevoegd naar aanleiding van Dylans vraag of de sjabloon-
  // feedback de echte site kan uitlezen). url is het veld dat formatKlantSiteVoorPrompt (ai.js)
  // gebruikt om bij ELKE sjabloonfeedback-ronde (refineTemplateProposal) de homepage van de klant op
  // te halen en te meten (kleuren/fonts per rol, koppen- en knoppenstructuur) — dat mechanisme
  // bestond al sinds 25-09-2026 maar stond voor Roots nog niet aan omdat dit veld ontbrak (Roots is
  // vóór 25-09-2026 onboard, MAC Bouw kreeg het al wel meteen mee). Adres en telefoon komen uit
  // feiten.js (bron: hostelroots.nl, voettekst, gecontroleerd 31-08-2026), geen nieuwe aanname.
  bedrijf: {
    naam: 'Hostel Roots',
    url: 'https://www.hostelroots.nl/',
    telefoon: '+31 6 52 30 85 18',
    adres: { straat: 'Stationsstraat 41', postcode: '5038 EC', plaats: 'Tilburg', land: 'NL' },
    werkgebied: ['Tilburg']
  },
  // Verwijst naar de tokens in src/lp/tokens.js (clientTokens.roots).
  tokensId: 'roots',
  // Bronprincipe (besluit 8): geen aparte claimlijst, wel een korte lijst met
  // wat zeker niet mag. Elk feit in feiten.js heeft z'n eigen bron.
  nietToegestaan: [
    'Beweringen over "goedkoopste" of "beste" hostel van Tilburg zonder bron.',
    'Kortingen of acties noemen die niet in de feiten staan.',
    'Concurrenten bij naam noemen.'
  ],
  // Korte notitie over toon, voor wie een pagina reviewt of prompts schrijft.
  toonNotitie:
    'Informeel-vriendelijk, richting festivalgangers en jonge reizigers. ' +
    'Korte zinnen, geen overdreven marketingtaal.'
};

module.exports = profile;
