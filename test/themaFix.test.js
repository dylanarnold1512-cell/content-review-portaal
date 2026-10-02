const test = require('node:test');
const assert = require('node:assert');
const { themaCss, themaScript } = require('../src/lp/themaFix');
const { renderPageHtml } = require('../src/lp/render');

const pagina = { clientId: 'macbouw', slug: 'test-pagina', template: { htmlTemplate: '<section><h1>{{heroTitle}}</h1></section>', cssTemplate: '', slots: [{ key: 'heroTitle', type: 'text' }] }, slotData: { heroTitle: 'Hallo' } };

test('themaCss laat de pagina de volle breedte gebruiken, alleen onder de eigen root', () => {
  const css = themaCss('lp-root-x');
  assert.match(css, /100vw/);
  assert.match(css, /body:has\(\.lp-root-x\)/);
});

test('themaScript is een regel zonder nieuwe regels en verbergt alleen H1 blokken buiten de pagina', () => {
  const s = themaScript('lp-root-x');
  assert.ok(!s.includes('\n'));
  assert.match(s, /querySelectorAll\('h1'\)/);
  assert.match(s, /img,input/);
});

test('alleen de echte WordPress pagina krijgt de thema correcties, het voorbeeld niet', () => {
  const wp = renderPageHtml(pagina, { forWordPress: true });
  const voorbeeld = renderPageHtml(pagina, { forPreview: true });
  assert.match(wp, /100vw/);
  assert.match(wp, /querySelectorAll\('h1'\)/);
  assert.doesNotMatch(voorbeeld, /100vw/);
  assert.doesNotMatch(voorbeeld, /querySelectorAll\('h1'\)/);
});
