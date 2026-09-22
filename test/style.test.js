// Tests voor src/lp/style.js — met name het laden van een Google Font. Zie besluiten.md,
// "Lettertype overnemen van de klantsite" (05-09-2026): tokens.googleFonts bepaalt of er een
// <link> naar fonts.googleapis.com wordt toegevoegd, los van de CSS-waarde in fontHeading/fontBody.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStyle, buildGoogleFontsHref, renderCustomFontFaces, resolveAssetBaseUrl } = require('../src/lp/style');

function maakTokens(overrides) {
  return {
    primary: '#000', primaryDark: '#000', secondary: '#000', text: '#000', textMuted: '#000',
    bg: '#fff', bgAlt: '#fff', border: '#eee', maxWidth: '1200px', radius: '8px',
    fontHeading: 'inherit', fontBody: 'inherit', googleFonts: [], ctaBg: '#000', ctaText: '#fff',
    ...overrides
  };
}

test('renderStyle voegt GEEN <link> toe zonder googleFonts (bestaand gedrag, bv. "inherit")', () => {
  const html = renderStyle('lp-root-test', maakTokens());
  assert.ok(!/<link/.test(html), 'zonder googleFonts hoort er geen <link>-tag in te staan');
  assert.match(html, /^<style>/, 'de <style>-tag hoort dan meteen vooraan te staan');
});

test('renderStyle voegt GEEN <link> toe als googleFonts ontbreekt (bestaande klanten zonder dit veld)', () => {
  const tokens = maakTokens();
  delete tokens.googleFonts;
  const html = renderStyle('lp-root-test', tokens);
  assert.ok(!/<link/.test(html));
});

test('renderStyle laadt een Google Font als tokens.googleFonts gevuld is', () => {
  const html = renderStyle('lp-root-test', maakTokens({ fontBody: "'Ubuntu', sans-serif", fontHeading: "'Ubuntu', sans-serif", googleFonts: ['Ubuntu'] }));
  assert.match(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Ubuntu:wght@400;500;600;700&display=swap">/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
  assert.match(html, /--lp-font-body: 'Ubuntu', sans-serif;/, 'de CSS-variabele moet nog gewoon de opgegeven waarde krijgen');
});

test('renderStyle ondersteunt meerdere Google Fonts tegelijk (bv. los lettertype voor koppen)', () => {
  const html = renderStyle('lp-root-test', maakTokens({ googleFonts: ['Poppins', 'Open Sans'] }));
  assert.match(html, /family=Poppins:wght@400;500;600;700&family=Open\+Sans:wght@400;500;600;700&display=swap/);
});

test('buildGoogleFontsHref zet spaties in een fontnaam om naar een "+"', () => {
  assert.match(buildGoogleFontsHref(['Open Sans']), /family=Open\+Sans:/);
});


// Regressietests voor het zelf-gehoste Yikes-lettertype van Roots (21-09-2026, zie
// besluiten.md "Yikes-lettertype van Roots"): net als googleFonts hierboven, maar dan met een
// eigen @font-face in plaats van een <link> naar Google.
test('renderStyle voegt GEEN @font-face toe zonder customFonts (bestaand gedrag)', () => {
  const html = renderStyle('lp-root-test', maakTokens());
  assert.ok(!/@font-face/.test(html));
});

test('renderStyle voegt GEEN @font-face toe als customFonts ontbreekt (bestaande klanten zonder dit veld)', () => {
  const tokens = maakTokens();
  delete tokens.customFonts;
  const html = renderStyle('lp-root-test', tokens);
  assert.ok(!/@font-face/.test(html));
});

test('renderStyle bouwt een @font-face regel voor elk item in customFonts', () => {
  const oud = process.env.LP_ASSETS_BASE_URL;
  process.env.LP_ASSETS_BASE_URL = 'https://portaal.test';
  try {
    const html = renderStyle('lp-root-test', maakTokens({
      customFonts: [{ family: 'Yikes', bestand: 'yikes-medium.ttf', gewicht: 500, stijl: 'normal' }]
    }));
    assert.match(html, /@font-face \{[\s\S]*font-family: 'Yikes';[\s\S]*\}/);
    assert.match(html, /src: url\('https:\/\/portaal\.test\/fonts\/yikes-medium\.ttf'\) format\('truetype'\);/);
    assert.match(html, /font-weight: 500;/);
  } finally {
    if (oud === undefined) delete process.env.LP_ASSETS_BASE_URL; else process.env.LP_ASSETS_BASE_URL = oud;
  }
});

test('resolveAssetBaseUrl: LP_ASSETS_BASE_URL wint van RENDER_EXTERNAL_URL, anders die laatste, anders localhost-terugval', () => {
  const oudLp = process.env.LP_ASSETS_BASE_URL;
  const oudRender = process.env.RENDER_EXTERNAL_URL;
  try {
    delete process.env.LP_ASSETS_BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    assert.equal(resolveAssetBaseUrl(), 'http://localhost:3000');
    process.env.RENDER_EXTERNAL_URL = 'https://content-review-portaal.onrender.com/';
    assert.equal(resolveAssetBaseUrl(), 'https://content-review-portaal.onrender.com');
    process.env.LP_ASSETS_BASE_URL = 'https://override.test/';
    assert.equal(resolveAssetBaseUrl(), 'https://override.test');
  } finally {
    if (oudLp === undefined) delete process.env.LP_ASSETS_BASE_URL; else process.env.LP_ASSETS_BASE_URL = oudLp;
    if (oudRender === undefined) delete process.env.RENDER_EXTERNAL_URL; else process.env.RENDER_EXTERNAL_URL = oudRender;
  }
});

test('renderStyle: h1/h2/h3 krijgen font-synthesis:none (voorkomt lelijke faux-bold bij een lettertype zonder eigen bold-bestand)', () => {
  const html = renderStyle('lp-root-test', maakTokens());
  assert.match(html, /h1,[\s\S]*?h2,[\s\S]*?h3[\s\S]*?\{[\s\S]*?font-synthesis: none;/);
});

// Regressietests voor de fontAccent/.lp-kicker-precisering (21-09-2026, zie besluiten.md
// "Yikes-lettertype van Roots, precisering op basis van devtools-cascade-bewijs"): Yikes bleek in
// werkelijkheid alleen op de losse .fl-heading-klasse te staan (een kort "WELKOM BIJ"-label), niet
// op alle koppen. Vandaar een aparte --lp-font-accent-variabele + .lp-kicker-hulpklasse, in plaats
// van fontHeading zelf te gebruiken.
test('renderStyle: --lp-font-accent valt terug op fontHeading als fontAccent leeg/ontbrekend is (bestaande klanten, geen gedragsverandering)', () => {
  const html = renderStyle('lp-root-test', maakTokens({ fontHeading: "'Ubuntu', sans-serif" }));
  assert.match(html, /--lp-font-accent: 'Ubuntu', sans-serif;/);
});

test('renderStyle: --lp-font-accent gebruikt fontAccent als dat apart is gezet (Roots/Yikes)', () => {
  const html = renderStyle('lp-root-test', maakTokens({
    fontHeading: "'Ubuntu', sans-serif",
    fontAccent: "'Yikes', 'Ubuntu', sans-serif"
  }));
  assert.match(html, /--lp-font-accent: 'Yikes', 'Ubuntu', sans-serif;/);
});

test('renderStyle: .lp-kicker gebruikt var(--lp-font-accent), en h1/h2/h3 blijven op var(--lp-font-heading) staan (niet automatisch Yikes op alle koppen)', () => {
  const html = renderStyle('lp-root-test', maakTokens({
    fontHeading: "'Ubuntu', sans-serif",
    fontAccent: "'Yikes', 'Ubuntu', sans-serif"
  }));
  assert.match(html, /\.lp-kicker \{[\s\S]*?font-family: var\(--lp-font-accent\);/);
  assert.match(html, /h1,[\s\S]*?h2,[\s\S]*?h3[\s\S]*?\{[\s\S]*?font-family: var\(--lp-font-heading\);/);
});

test('renderStyle: .lp-kicker krijgt ook font-synthesis:none (zelfde reden als bij h1-h3)', () => {
  const html = renderStyle('lp-root-test', maakTokens({ fontAccent: "'Yikes', 'Ubuntu', sans-serif" }));
  assert.match(html, /\.lp-kicker \{[\s\S]*?font-synthesis: none;/);
});

test('renderStyle zet thema clearfix pseudo elementen uit binnen de eigen pagina (geen extra griditems)', () => {
  const { renderStyle } = require('../src/lp/style');
  const { getTokens } = require('../src/lp/tokens');
  const css = renderStyle('lp-root-x', getTokens('roots'));
  for (const cls of ['container', 'container-fluid', 'row', 'clearfix']) {
    assert.ok(css.includes(`.lp-root-x .${cls}::before`), `${cls}::before ontbreekt`);
    assert.ok(css.includes(`.lp-root-x .${cls}::after`), `${cls}::after ontbreekt`);
  }
  assert.match(css, /content: none !important; display: none !important;/);
});

test('renderStyle verbergt het Beaver Builder Theme paginatitel-blok (header.fl-post-header), los van de rootClass', () => {
  const { renderStyle } = require('../src/lp/style');
  const { getTokens } = require('../src/lp/tokens');
  const css = renderStyle('lp-root-x', getTokens('roots'));
  assert.match(css, /header\.fl-post-header\s*\{\s*display:\s*none\s*!important;\s*\}/);
  // Bewust NIET geschaald onder de rootClass: dit element staat buiten onze eigen wrapper.
  assert.ok(!css.includes('.lp-root-x header.fl-post-header'), 'mag niet onder de rootClass geschaald zijn');
});

test('renderStyle zet de margin-top van bb-theme\'s content-kolom (.fl-content.col-md-12) op 0, los van de rootClass', () => {
  const { renderStyle } = require('../src/lp/style');
  const { getTokens } = require('../src/lp/tokens');
  const css = renderStyle('lp-root-x', getTokens('roots'));
  assert.match(css, /\.fl-content\.col-md-12\s*\{\s*margin-top:\s*0\s*!important;\s*\}/);
  assert.ok(!css.includes('.lp-root-x .fl-content.col-md-12'), 'mag niet onder de rootClass geschaald zijn');
});

test('renderStyle voegt GEEN extra CSS toe als tokens.themeOverrideCss leeg/ontbrekend is (bestaande klanten, geen gedragsverandering)', () => {
  const { renderStyle } = require('../src/lp/style');
  const { getTokens } = require('../src/lp/tokens');
  const zonderVeld = renderStyle('lp-root-x', getTokens('roots'));
  const metLegeString = renderStyle('lp-root-x', { ...getTokens('roots'), themeOverrideCss: '' });
  assert.equal(zonderVeld, metLegeString);
});

test('renderStyle voegt tokens.themeOverrideCss ongewijzigd (rauw) toe aan het <style>-blok, voor een klant-specifieke thema-uitzondering', () => {
  const { renderStyle } = require('../src/lp/style');
  const { getTokens } = require('../src/lp/tokens');
  const css = renderStyle('lp-root-x', {
    ...getTokens('roots'),
    themeOverrideCss: '.een-ander-thema-element { display: none !important; }'
  });
  assert.ok(css.includes('.een-ander-thema-element { display: none !important; }'));
});
