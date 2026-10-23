// Klantprofiel Hirs Installaties voor de LP Fabriek (Pagr.), aangemaakt op 21-10-2026.
// Alleen de technische velden staan hier in code. Bedrijfsgegevens, feiten, regels en huisstijl staan in
// Notion (database LP Klantgegevens, rij hirs-installaties) en worden daar bewerkt, zie src/lp/klantgegevens.js.
// De variabelen WP_URL_HIRS, WP_USERNAME_HIRS en WP_APP_PASSWORD_HIRS staan op Render. Een eigen naam zonder
// streepje, omdat de standaardnaam uit het klant id (WP_URL_HIRS-INSTALLATIES) geen geldige variabelenaam is.

const profile = {
  id: 'hirs-installaties',
  naam: 'Hirs Installaties',
  taal: 'nl',
  wordpress: {
    urlEnv: 'WP_URL_HIRS',
    usernameEnv: 'WP_USERNAME_HIRS',
    appPasswordEnv: 'WP_APP_PASSWORD_HIRS',
    // Hirs plaatst blogs als berichten in de categorie Kennisbank. De overige berichten zijn projecten
    // (zichtbaar op /projecten/) en tellen niet mee als blog voor links vanaf Pagr. pagina's.
    blogCategorie: 'kennisbank'
  },
  // Yoast SEO op hirs-installaties.nl (metatitel en beschrijving via de REST API werken zonder snippet).
  seo: { plugin: 'yoast' },
  // Het offerteformulier op de site is een Spectra formulier zonder shortcode. Daarom geen formulier hier:
  // Pagr. pagina's verwijzen met een knop naar https://www.hirs-installaties.nl/offerte-aanvragen/
  bedrijf: {
    naam: 'Hirs Installaties',
    url: 'https://www.hirs-installaties.nl',
    email: 'info@hirs-installaties.nl',
    werkgebied: ['Haarlem en omgeving']
  },
  // Hirs schrijft met een mix (23-10-2026): de bedrijfsnaam op vaste plekken (hero of antwoordblok, waarom, contact) en wij, we en ons in de rest.
  // Nooit een persoon bij naam, nooit hij of hem. Zie src/lp/klantverhaal.js (mixBlok). Opties: 'wij' (standaard), 'derde', 'mix'.
  schrijfvorm: 'mix',
  // Harde tekstcontrole na het schrijven aan (hij, Wie, getallen buiten de feiten, claims, reviews). Zie src/lp/tekstcontrole.js.
  tekstControle: true,
  // Geen fotokaarten zonder tekst bij projecten: zonder projectteksten verdwijnt de sectie.
  fotoKaartenZonderTekst: false,
  // Namen van personen die op de pagina's nooit genoemd worden: Pagr. schrijft altijd over het bedrijf Hirs Installaties.
  nietNoemen: ['Nick'],
  // Reviews staan pas op een pagina als Nick ze bevestigd heeft.
  reviewsBevestigd: false,
  // Google recensies widget die ook op hirs-installaties.nl staat (Widget Plugin for Google Reviews). Zie src/lp/reviewsWidget.js.
  reviewsWidget: { plugin: 'grw', shortcode: '[grw id=2306]' },
  tokensId: 'hirs-installaties',
  nietToegestaan: [
    'Aannames doen die je niet kunt verifiëren.'
  ],
  toonNotitie: 'Informeel met je en jij. De bedrijfsnaam Hirs Installaties op vaste plekken, wij en we in de rest.'
};

module.exports = profile;
