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
  assert.match(s, /r\.contains\(q\[k\]\)/, "footers binnen de eigen pagina tellen niet mee");
  assert.match(s, /s\.contains\(r\)/);
});

test('themaScript beoordeelt een blok op zichtbare tekst, zodat een alinea met alleen ons script (WordPress wikkelt het in een p) toch verdwijnt', () => {
  assert.match(themaScript('lp-root-x'), /n\(s\.innerText\)/);
});

test('het eerste blok binnen de pagina krijgt altijd de volle breedte, ook als het thema een maximale breedte zet (Astra, Hirs)', () => {
  const css = themaCss('lp-root-x');
  assert.match(css, /html body \.lp-root-x > \*/);
  assert.match(css, /max-width: none !important/);
});

test('wrapForWordPress: regelovergangen tussen tags worden spaties, scripts blijven intact', () => {
  const { wrapForWordPress } = require('../src/lp/render');
  const uit = wrapForWordPress('<li>\n  <span>1</span>\n  <div>x</div>\n</li>\n<script>\nvar a=1;\n</script>');
  assert.ok(uit.includes('<li> <span>1</span> <div>x</div> </li>'));
  assert.ok(uit.includes('<script>\nvar a=1;\n</script>'));
  assert.ok(!uit.includes('</script>script'));
});

test('themaCss: lege alinea en br als direct kind van een blok worden verborgen (wpautop vangnet)', () => {
  const css = themaCss('lpt');
  assert.ok(css.includes('.lpt p:empty { display: none; }'));
  assert.ok(css.includes('> br { display: none; }'));
});
