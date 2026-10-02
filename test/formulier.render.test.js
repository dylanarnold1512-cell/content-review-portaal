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
  assert.ok(html.includes('[contact-form-7 id="9898a61" title="Offerte aanvraag MAC Bouw"]'));
  assert.ok(!html.includes('{{formulier}}'));
  assert.ok(html.includes('.wpcf7-radio'));
  assert.ok(html.includes('.lp-root-test-pagina .wpcf7-form .wpcf7-radio'), 'opmaak valt onder de rootClass');
});

test('formulier-marker: portaalvoorbeeld toont een voorbeeldformulier met controle, nooit de kale shortcode', () => {
  const html = renderPageHtml(pagina('macbouw', TEMPLATE), { forPreview: true });
  assert.ok(!html.includes('[contact-form-7'));
  assert.ok(!html.includes('{{formulier}}'));
  assert.ok(html.includes('lp-voorbeeldformulier'));
  assert.ok(html.includes('lp-formulier-check'));
  assert.ok(html.includes('@container lpform'));
});

test('formulier-marker: deellink toont een placeholder, nooit de kale shortcode', () => {
  for (const opts of [undefined, {}]) {
    const html = renderPageHtml(pagina('macbouw', TEMPLATE), opts);
    assert.ok(!html.includes('[contact-form-7'), 'geen kale shortcode in het voorbeeld');
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
  assert.ok(!html.includes('wpcf7'));
  assert.ok(html.includes('<h1>Titel</h1>'));
});
