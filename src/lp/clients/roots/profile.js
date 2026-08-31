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
