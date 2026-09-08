// Genereert het <style> blok voor een pagina: basis layout/typografie (gedeeld
// over alle klanten) plus de tokens van de specifieke klant als CSS variabelen.
// Alles geschaald onder de root-class, zodat het nooit buiten onze eigen content
// lekt naar de rest van de klantsite (header/footer blijven van het thema).
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
.${rootClass} {
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
  --lp-cta-bg: ${tokens.ctaBg};
  --lp-cta-text: ${tokens.ctaText};
  color: var(--lp-text);
  font-family: var(--lp-font-body);
  background: var(--lp-bg);
}
.${rootClass} * { box-sizing: border-box; }
.${rootClass} img { max-width: 100%; display: block; }
.${rootClass} a { color: var(--lp-primary-dark); }
.${rootClass} h1, .${rootClass} h2, .${rootClass} h3 {
  font-family: var(--lp-font-heading);
  margin: 0 0 16px;
  line-height: 1.2;
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

module.exports = { renderStyle, buildGoogleFontsHref };
