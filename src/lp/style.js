// Genereert het <style> blok voor een pagina: basis layout/typografie (gedeeld
// over alle klanten) plus de tokens van de specifieke klant als CSS variabelen.
// Alles geschaald onder de root-class, zodat het nooit buiten onze eigen content
// lekt naar de rest van de klantsite (header/footer blijven van het thema). Eén
// bewuste, smalle uitzondering hierop: het verbergen van header.fl-post-header
// (Beaver Builder Theme's eigen paginatitel-blok), zie de toelichting daar.
//
// Lettertype-laden (05-09-2026, vervolg op de Roots-Ubuntu-feedback): tokens.fontHeading/
// fontBody zijn alleen de CSS-waarde (bv. "'Ubuntu', sans-serif" of "inherit"). Of dat
// lettertype ook echt BESCHIKBAAR is in de browser hangt af van tokens.googleFonts — een array
// met exacte Google Font-familienamen die WIJ vertrouwen (nooit door de AI vrij verzonnen, zie
// huisstijl.js: alleen namen die letterlijk als <link>/@import op de klant-site zelf gevonden
// zijn komen hier terecht). Is googleFonts leeg (bv. "inherit", of een systeemfont, of een font
// dat de WordPress-theme toch al zelf laadt), dan wordt er niets extra's geladen — precies het
// oude gedrag. Dit mag WEL een <link>/@import bevatten: dat is onze eigen vaste code, niet een
// AI-gegenereerd sjabloon, dus de veiligheidscheck in slotEngine.js (die externe resources in
// sjablonen blokkeert) is hier niet van toepassing.

// Zelf-gehoste (niet-Google) lettertypen (21-09-2026, Roots/Yikes-lettertype): sommige klanten
// hebben een eigen, custom lettertype dat geen Google Font is (dus geen <link>/@import naar
// fonts.googleapis.com mogelijk, zie hierboven). tokens.customFonts (array, zie tokens.js) beschrijft
// zo'n lettertype: { family, bestand, gewicht, stijl }. "bestand" verwijst naar een bestand in
// public/fonts/ (statisch geserveerd door server.js, met een losse CORS-header omdat de pagina zelf
// straks op een ANDER domein staat, namelijk de site van de klant). We bouwen hier zelf een
// @font-face-regel — dit mag, want dit is onze eigen vaste systeemcode, geen AI-gegenereerd sjabloon
// (zelfde uitzondering als bij de Google Fonts <link> hierboven).
//
// Nodig: een ABSOLUTE URL naar het font-bestand (relatief werkt niet, de pagina draait straks
// binnen de WordPress-pagina van de klant, dus relatief zou naar de klant-site zelf verwijzen in
// plaats van naar ons). Render zet RENDER_EXTERNAL_URL automatisch — geen handmatige configuratie
// nodig in productie. LP_ASSETS_BASE_URL kan dat overschrijven (bv. lokaal testen), anders is er een
// localhost-terugval voor lokale ontwikkeling.
function resolveAssetBaseUrl() {
  const waarde = process.env.LP_ASSETS_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  return waarde.replace(/\/$/, '');
}

function renderCustomFontFaces(tokens) {
  const fonts = Array.isArray(tokens.customFonts)
    ? tokens.customFonts.filter((f) => f && f.family && f.bestand)
    : [];
  if (!fonts.length) return '';
  const baseUrl = resolveAssetBaseUrl();
  return fonts
    .map(
      (f) => `@font-face {
  font-family: '${f.family}';
  src: url('${baseUrl}/fonts/${f.bestand}') format('truetype');
  font-weight: ${f.gewicht || 400};
  font-style: ${f.stijl || 'normal'};
  font-display: swap;
}`
    )
    .join('\n') + '\n';
}

function fontFamilyParam(naam) {
  return String(naam).trim().replace(/\s+/g, '+');
}

function buildGoogleFontsHref(families) {
  const parts = families.map((naam) => `family=${fontFamilyParam(naam)}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
}

function renderGoogleFontsLink(tokens) {
  const families = Array.isArray(tokens.googleFonts) ? tokens.googleFonts.filter(Boolean) : [];
  if (!families.length) return '';
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${buildGoogleFontsHref(families)}">
`;
}

function renderStyle(rootClass, tokens) {
  return `${renderGoogleFontsLink(tokens)}<style>
${renderCustomFontFaces(tokens)}.${rootClass} {
  --lp-primary: ${tokens.primary};
  --lp-primary-dark: ${tokens.primaryDark};
  --lp-secondary: ${tokens.secondary};
  --lp-text: ${tokens.text};
  --lp-text-muted: ${tokens.textMuted};
  --lp-bg: ${tokens.bg};
  --lp-bg-alt: ${tokens.bgAlt};
  --lp-border: ${tokens.border};
  --lp-max-width: ${tokens.maxWidth};
  --lp-radius: ${tokens.radius};
  --lp-font-heading: ${tokens.fontHeading};
  --lp-font-body: ${tokens.fontBody};
  /* fontAccent (21-09-2026, precisering Yikes/Roots): apart van fontHeading, alleen bedoeld
     voor de losse .lp-kicker-hulpklasse hieronder (korte hoofdletter-labels/kickers), nooit
     automatisch op h1-h6. Valt terug op fontHeading als een klant geen aparte accent kiest,
     zodat bestaande klanten zonder fontAccent geen gedragsverandering zien. */
  --lp-font-accent: ${tokens.fontAccent || tokens.fontHeading};
  --lp-cta-bg: ${tokens.ctaBg};
  --lp-cta-text: ${tokens.ctaText};
  color: var(--lp-text);
  font-family: var(--lp-font-body);
  background: var(--lp-bg);
}
.${rootClass} * { box-sizing: border-box; }
/* Thema botsing (21-09-2026, gevonden op hostelroots.nl): het Bootstrap gebaseerde Beaver Builder thema
   geeft .container, .row en .clearfix een clearfix (::before en ::after met display:table). Bij een
   sjabloon dat zo'n klasse op een grid of flex element zet worden die pseudo elementen extra
   griditems, waardoor de eerste cel leeg blijft en de kolommen door elkaar schuiven (op Roots kwam de
   hero afbeelding onder de tekst te staan). Alleen binnen onze eigen pagina uitgezet. */
.${rootClass} .container::before, .${rootClass} .container::after,
.${rootClass} .container-fluid::before, .${rootClass} .container-fluid::after,
.${rootClass} .row::before, .${rootClass} .row::after,
.${rootClass} .clearfix::before, .${rootClass} .clearfix::after { content: none !important; display: none !important; }
/* WordPress-thema-titel boven de content (22-09-2026, gevonden op hostelroots.nl/testival-tilburg):
   het Beaver Builder Theme (bb-theme) rendert altijd een eigen <header class="fl-post-header"> met
   de paginatitel (en voor ingelogde beheerders een "Bewerken"-link) BOVEN de content, dus vóór onze
   eigen root-class-wrapper. Dat gaf niet alleen een storend wit vlak boven elk sjabloon, maar ook een
   TWEEDE H1 op de pagina naast onze eigen heroTitle-H1 (zie seoRegels.exactEenH1 in elk sjabloon) —
   een SEO-probleem, niet alleen cosmetisch. Bewuste, smalle uitzondering op "nooit buiten de eigen
   root-class stijlen" (zie bovenaan dit bestand): precies dit ene, bevestigde thema-element
   verbergen, niets breders. Bestaat dit element niet (ander thema), dan doet deze regel niets.
   Niet geschaald onder rootClass: dit element staat immers BUITEN onze eigen wrapper. */
header.fl-post-header { display: none !important; }
/* Zelfde WordPress-thema-eigenaardigheid, vervolg (22-09-2026, ontdekt nadat de vorige regel al
   live stond): bb-theme geeft de content-kolom zelf altijd een margin-top van 40px, kennelijk
   bedoeld als ruimte ONDER de paginatitel hierboven. Nu die titel weg is, bleef er een leeg wit
   vlak over tussen het menu en onze hero-sectie. Live bevestigd op hostelroots.nl (getBoundingClientRect):
   zonder deze regel stond de hero 40px onder de rand van het menu, met deze regel precies gelijk. */
.fl-content.col-md-12 { margin-top: 0 !important; }
/* Ontsnappingsluik voor EEN VOLGENDE, nog onbekende thema-eigenaardigheid bij een andere klant
   (22-09-2026): de twee regels hierboven werken alleen voor sites op het Beaver Builder Theme
   (bb-theme) — bij een klant op een ander thema/bouwer heten de vergelijkbare elementen anders, dus
   deze twee regels doen daar simpelweg niets (geen risico), maar lossen ook niets op. In plaats van
   voor elke nieuwe klant opnieuw code te moeten schrijven en deployen zodra zoiets wordt gevonden,
   kan een klant een eigen, kant-en-klare CSS-aanvulling meekrijgen via tokens.themeOverrideCss (zie
   tokens.js) — precies zo'n narrow, live-geverifieerde uitzondering als hierboven, maar dan per
   klant instelbaar zonder code-wijziging. Leeg (standaard) = geen wijziging t.o.v. bestaand gedrag. */
${tokens.themeOverrideCss || ''}
.${rootClass} img { max-width: 100%; display: block; }
.${rootClass} a { color: var(--lp-primary-dark); }
.${rootClass} h1, .${rootClass} h2, .${rootClass} h3 {
  font-family: var(--lp-font-heading);
  margin: 0 0 16px;
  line-height: 1.2;
  /* Voorkomt dat de browser zelf een "bold"-variant verzint (faux bold, vaak lelijk/vervormd) van
     een zelf-gehost lettertype dat geen eigen bold-bestand heeft (zie renderCustomFontFaces
     hierboven) — bij klanten met een Google Font/systeemfont met een echte bold-variant heeft dit
     gewoon geen effect, de browser gebruikt dan al die echte variant. */
  font-synthesis: none;
}
/* .lp-kicker (21-09-2026, Roots/Yikes-precisering): losse hulpklasse voor een kort accent-label
   BOVEN een kop (bv. "WELKOM BIJ"), naar het voorbeeld van hostelroots.nl's eigen .fl-heading-
   gebruik (bevestigd via devtools-cascade door Dylan: die klasse wint van de algemene h1-h6-regel
   op specificiteit, en wordt alleen op dat ene decoratieve label toegepast, niet op gewone koppen).
   Een sjabloon moet deze klasse zelf expliciet toevoegen aan een element — er is geen automatische
   toepassing op h1-h6, precies om de eerdere te-brede fontHeading-fout niet te herhalen. */
.${rootClass} .lp-kicker {
  display: block;
  font-family: var(--lp-font-accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
  font-synthesis: none;
  margin: 0 0 8px;
}
.${rootClass} .lp-container {
  max-width: var(--lp-max-width);
  margin: 0 auto;
  padding: 0 24px;
}
.${rootClass} .lp-section { padding: 56px 0; }
.${rootClass} .lp-section--alt { background: var(--lp-bg-alt); }
.${rootClass} .lp-cta-button {
  display: inline-block;
  padding: 12px 24px;
  border-radius: var(--lp-radius);
  background: var(--lp-cta-bg);
  color: var(--lp-cta-text);
  text-decoration: none;
  font-weight: 600;
}
.${rootClass} .lp-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.${rootClass} .lp-card {
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  padding: 24px;
  background: var(--lp-bg);
}
.${rootClass} .lp-stat { text-align: center; }
.${rootClass} .lp-stat strong { display: block; font-size: 2rem; color: var(--lp-primary-dark); }
.${rootClass} .lp-faq-item { border-bottom: 1px solid var(--lp-border); padding: 20px 0; }
.${rootClass} .lp-practical dt { font-weight: 600; }
.${rootClass} .lp-practical dd { margin: 0 0 12px; }
</style>`;
}

module.exports = { renderStyle, buildGoogleFontsHref, renderCustomFontFaces, resolveAssetBaseUrl };
