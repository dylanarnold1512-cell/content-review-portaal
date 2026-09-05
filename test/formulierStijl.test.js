// Geautomatiseerde tests voor src/lp/formulierStijl.js - de CSS-herstyling van een ingesloten
// klantformulier. Belangrijkste invariant om te bewaken: ELKE geproduceerde selector moet onder de
// meegegeven rootClass vallen, anders zou deze CSS kunnen lekken naar de rest van de WordPress-pagina
// (zie de scoping-regel in style.js, dezelfde regel geldt hier).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFormulierCss, PLUGIN_CSS_BUILDERS } = require('../src/lp/formulierStijl');

// Grove maar effectieve check: elke regel die met "." begint (een selector-start) moet de rootClass
// noemen. We knippen op "{" om alleen de selector-kant van elke regel te bekijken.
function alleSelectorsBevattenRootClass(css, rootClass) {
  const selectorRegels = css
    .split('\n')
    .filter((regel) => regel.trim().startsWith('.') || regel.trim().startsWith(','));
  return selectorRegels.every((regel) => regel.includes(`.${rootClass}`));
}

test('buildFormulierCss: zonder plugin krijg je alleen de generieke basisregels, netjes gescoped', () => {
  const css = buildFormulierCss('lp-root-test-pagina', null);
  assert.ok(css.startsWith('<style>') && css.trim().endsWith('</style>'));
  assert.ok(css.includes('var(--lp-border)'));
  assert.ok(css.includes('var(--lp-radius)'));
  assert.ok(css.includes('var(--lp-cta-bg)'));
  assert.ok(alleSelectorsBevattenRootClass(css, 'lp-root-test-pagina'), 'elke selector moet onder de rootClass vallen');
  // Geen enkele plugin-specifieke klasse hoort hier in te zitten zonder plugin.
  assert.ok(!css.includes('wpcf7'));
  assert.ok(!css.includes('gform_wrapper'));
});

test('buildFormulierCss: met een onbekende pluginnaam val je gewoon terug op de generieke regels', () => {
  const css = buildFormulierCss('lp-root-test-pagina', 'EenPluginDieNietBestaat');
  assert.ok(css.includes('var(--lp-border)'));
  assert.ok(!css.includes('wpcf7'));
  assert.ok(!css.includes('gform_wrapper'));
});

test('buildFormulierCss: Contact Form 7 krijgt de wpcf7-specifieke overrides erbij, nog steeds gescoped', () => {
  const css = buildFormulierCss('lp-root-roots-boeken', 'Contact Form 7');
  assert.ok(css.includes('.wpcf7-form-control'));
  assert.ok(css.includes('.wpcf7-submit'));
  assert.ok(alleSelectorsBevattenRootClass(css, 'lp-root-roots-boeken'));
});

test('buildFormulierCss: Gravity Forms krijgt !important-overrides (nodig om de eigen standaardstijlen te verslaan)', () => {
  const css = buildFormulierCss('lp-root-test', 'Gravity Forms');
  assert.ok(css.includes('.gform_wrapper'));
  assert.ok(css.includes('!important'));
  assert.ok(alleSelectorsBevattenRootClass(css, 'lp-root-test'));
});

test('buildFormulierCss: elk plugin uit PLUGIN_CSS_BUILDERS levert geldige, gescopede CSS op', () => {
  for (const plugin of Object.keys(PLUGIN_CSS_BUILDERS)) {
    const css = buildFormulierCss('lp-root-alle-plugins', plugin);
    assert.ok(css.startsWith('<style>'));
    assert.ok(alleSelectorsBevattenRootClass(css, 'lp-root-alle-plugins'), `plugin "${plugin}" moet gescoped blijven`);
  }
});

test('buildFormulierCss: gooit een duidelijke fout zonder rootClass, om nooit ongescoped CSS te produceren', () => {
  assert.throws(() => buildFormulierCss('', 'Contact Form 7'), /rootClass/);
  assert.throws(() => buildFormulierCss(null, null), /rootClass/);
});
