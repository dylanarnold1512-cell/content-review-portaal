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
  assert.match(Buffer.from(/atob\("([^"]+)"\)/.exec(wp)[1], 'base64').toString('utf8'), /querySelectorAll\('h1'\)/);
  assert.doesNotMatch(voorbeeld, /100vw/);
  assert.doesNotMatch(voorbeeld, /querySelectorAll\('h1'\)/);
});

test('scripts gaan als base64 naar WordPress, zodat WordPress er geen tekens in verandert', () => {
  const html = renderPageHtml({ ...pagina, template: { ...pagina.template, htmlTemplate: '<section><h1>{{heroTitle}}</h1>{{galerij}}</section>' } }, { forWordPress: true });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2);
  for (const s of scripts) {
    assert.doesNotMatch(s, /[&<>]/);
    const b64 = /atob\("([^"]+)"\)/.exec(s)[1];
    const js = Buffer.from(b64, 'base64').toString('utf8');
    assert.doesNotThrow(() => new Function(js));
  }
  assert.match(Buffer.from(/atob\("([^"]+)"\)/.exec(scripts[0])[1], 'base64').toString('utf8') + Buffer.from(/atob\("([^"]+)"\)/.exec(scripts[1])[1], 'base64').toString('utf8'), /lp-galerij/);
});

test('themaScript haalt thema ruimte weg: padding en marge van de ouders en lege blokken naast de pagina', () => {
  const s = themaScript('lp-root-x');
  assert.match(s, /padding-bottom/);
  assert.match(s, /header,footer,nav/);
  assert.match(s, /s\.contains\(r\)/);
});
