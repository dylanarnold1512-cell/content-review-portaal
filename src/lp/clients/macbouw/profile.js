// Klantprofiel MAC Bouw voor de LP Fabriek. Aangemaakt op 25-09-2026 uit de intake in Notion
// ("Klant Intake (LP Fabriek)", KlantId macbouw). Dit is een ANDER bestand dan
// src/config/clients.js (dat is voor de blogautomatisering/Notion-klantzone).
// Voor de LP Fabriek geldt: per klant of paginatype hoort in Git (dit bestand,
// de feiten), per pagina hoort in Notion. Zie besluiten.md, besluit 4.

const profile = {
  id: 'macbouw',
  naam: 'MAC Bouw',
  taal: 'nl',
  wordpress: {
    // Env vars staan in .env en Render, nooit hier de echte waarden.
    urlEnv: 'WP_URL_MACBOUW',
    usernameEnv: 'WP_USERNAME_MACBOUW',
    appPasswordEnv: 'WP_APP_PASSWORD_MACBOUW'
  },
  // Formulier voor op de landingspagina (25-09-2026): een sjabloon met de marker {{formulier}} krijgt op
  // de echte WordPress-pagina deze shortcode (WordPress rendert 'm zelf), in het portaalvoorbeeld een
  // nette placeholder. plugin bepaalt de opmaakregels (src/lp/formulierStijl.js). Bron van id en plugin:
  // zie feiten.js (contactformulier, contactformulier-shortcode).
  formulier: {
    plugin: 'MetForm',
    shortcode: '[metform form_id="3048"]'
  },
  // Verwijst naar de tokens in src/lp/tokens.js (clientTokens.macbouw).
  tokensId: 'macbouw',
  // Bronprincipe (besluit 8): geen aparte claimlijst, wel een korte lijst met
  // wat zeker niet mag. Elk feit in feiten.js heeft z'n eigen bron.
  nietToegestaan: [
    'Aannames doen die je niet kunt verifiëren.'
  ],
  // Korte notitie over toon, voor wie een pagina reviewt of prompts schrijft.
  toonNotitie:
    'Kijk qua toon naar hoe de huidige website opgebouwd is qua teksten.'
};

module.exports = profile;
