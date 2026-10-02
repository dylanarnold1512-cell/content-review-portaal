const test = require('node:test');
const assert = require('node:assert/strict');
const { responsiefFormulierCss, responsiefCf7Css, formulierAanpasScript, formulierControleScript, voorbeeldFormulierHtml } = require('../src/lp/formulierCheck');
const { buildFormulierCss } = require('../src/lp/formulierStijl');
const { renderPageHtml } = require('../src/lp/render');

const pagina = (clientId) => ({ clientId, slug: 'test-pagina', template: { htmlTemplate: '<h1>x</h1>{{formulier}}', cssTemplate: '', slots: [] }, slotData: {} });

test('responsieve CSS meet de breedte van het formulier zelf (container query) en blijft onder de rootClass', () => {
  for (const css of [responsiefFormulierCss('lp-root-x'), responsiefCf7Css('lp-root-x')]) {
    assert.match(css, /@container lpform \(max-width: 560px\)/);
    for (const regel of css.split('\n').filter((r) => r.includes('{') && !r.startsWith('@'))) {
      assert.ok(regel.trim().startsWith('.lp-root-x'), `niet gescoped: ${regel}`);
    }
  }
  assert.match(responsiefFormulierCss('lp-root-x'), /container-type: inline-size/);
});

test('elke formulierplugin krijgt de responsieve basis, Contact Form 7 ook de eigen regels', () => {
  assert.match(buildFormulierCss('lp-root-x', 'Gravity Forms'), /container-name: lpform/);
  assert.match(buildFormulierCss('lp-root-x', undefined), /container-name: lpform/);
  assert.match(buildFormulierCss('lp-root-x', 'Contact Form 7'), /wpcf7-list-item/);
  assert.doesNotMatch(buildFormulierCss('lp-root-x', 'Gravity Forms'), /wpcf7/);
});

test('scripts zijn een regel en geldig, het controlescript stuurt een bericht naar het portaal', () => {
  for (const s of [formulierAanpasScript(), formulierControleScript()]) {
    assert.ok(!s.includes('\n'));
    const js = s.replace(/^<script>|<\/script>$/g, '');
    assert.doesNotThrow(() => new Function(js));
  }
  assert.match(formulierControleScript(), /lp-formulier-check/);
  assert.doesNotMatch(formulierAanpasScript(), /postMessage/);
});

test('voorbeeldformulier bevat de lastige onderdelen', () => {
  const h = voorbeeldFormulierHtml();
  for (const stuk of ['wpcf7-radio', 'wpcf7-checkbox', 'type="file"', 'wpcf7-acceptance', 'wpcf7-submit', 'textarea', 'select']) assert.ok(h.includes(stuk), stuk);
});

test('portaalvoorbeeld: voorbeeldformulier met controle; WordPress: echte shortcode met alleen de aanpassing; deellink: placeholder', () => {
  const voorbeeld = renderPageHtml(pagina('macbouw'), { forPreview: true });
  assert.ok(voorbeeld.includes('lp-voorbeeldformulier') && voorbeeld.includes('lp-formulier-check'));
  const wp = renderPageHtml(pagina('macbouw'), { forWordPress: true });
  assert.ok(wp.includes('[contact-form-7') && !wp.includes('lp-voorbeeldformulier'));
  const scripts = [...wp.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => Buffer.from(/atob\("([^"]+)"\)/.exec(m[1])[1], 'base64').toString('utf8'));
  assert.ok(scripts.some((j) => j.includes('lpFormulierPas')));
  assert.ok(!scripts.some((j) => j.includes('postMessage')), 'op WordPress geen controlebericht');
  const deellink = renderPageHtml(pagina('macbouw'), {});
  assert.ok(deellink.includes('lp-formulier-placeholder') && !deellink.includes('lp-voorbeeldformulier'));
});

test('klant zonder formulier: geen voorbeeldformulier en geen script', () => {
  const html = renderPageHtml(pagina('roots'), { forPreview: true });
  assert.ok(!html.includes('lp-voorbeeldformulier') && !html.includes('lp-formulier-check'));
});
