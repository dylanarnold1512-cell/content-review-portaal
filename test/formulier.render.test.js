const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPageHtml } = require('../src/lp/render');

function pagina(clientId, htmlTemplate) {
  return {
    clientId,
    slug: 'test-pagina',
    template: { htmlTemplate, cssTemplate: '', slots: [] },
    slotData: { heroTitle: 'Titel' }
  };
}

const TEMPLATE = '<h1>{{heroTitle}}</h1><div class="contact">{{formulier}}</div>';

test('formulier-marker: op WordPress de shortcode plus opmaak, marker verdwijnt', () => {
  const html = renderPageHtml(pagina('macbouw', TEMPLATE), { forWordPress: true });
  assert.ok(html.includes('[metform form_id="3048"]'));
  assert.ok(!html.includes('{{formulier}}'));
  assert.ok(html.includes('.metform-form-content .mf-input'));
  assert.ok(html.includes('.lp-root-test-pagina .metform-form-content'), 'opmaak valt onder de rootClass');
});

test('formulier-marker: voorbeeld en deellink tonen een placeholder, nooit de kale shortcode', () => {
  for (const opts of [undefined, {}, { forPreview: true }]) {
    const html = renderPageHtml(pagina('macbouw', TEMPLATE), opts);
    assert.ok(!html.includes('[metform'), 'geen kale shortcode in het voorbeeld');
    assert.ok(html.includes('lp-formulier-placeholder'));
    assert.ok(!html.includes('{{formulier}}'));
  }
});

test('formulier-marker: klant zonder formulier, marker verdwijnt op WordPress en geeft een melding in het voorbeeld', () => {
  const wp = renderPageHtml(pagina('roots', TEMPLATE), { forWordPress: true });
  assert.ok(!wp.includes('{{formulier}}'));
  assert.ok(!wp.includes('lp-formulier'));
  const voorbeeld = renderPageHtml(pagina('roots', TEMPLATE));
  assert.ok(voorbeeld.includes('nog geen formulier ingesteld'));
});

test('formulier-marker: sjabloon zonder marker blijft ongewijzigd (geen formulier-CSS)', () => {
  const html = renderPageHtml(pagina('macbouw', '<h1>{{heroTitle}}</h1>'), { forWordPress: true });
  assert.ok(!html.includes('metform'));
  assert.ok(html.includes('<h1>Titel</h1>'));
});
