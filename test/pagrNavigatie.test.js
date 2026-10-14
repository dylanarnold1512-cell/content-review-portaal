const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lees = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

test('de admin zijbalk heeft een onderdeel per LP tab', () => {
  const html = lees('admin.html');
  ['werkplaats', 'nieuw', 'sjablonen', 'paginas', 'kloon', 'vervang', 'klantgegevens'].forEach((tab) => {
    assert.ok(html.includes(`data-pagr-tab="${tab}"`), tab);
    // Elke tab bestaat ook echt als knop in de LP.
    assert.ok(lees('lp.html').includes(`data-lp-tab="${tab}"`), tab);
  });
});

test('de admin kent de Pagr. tabs in de hash en stuurt ze door naar de LP', () => {
  const js = lees('admin.js');
  assert.ok(js.includes("PAGR_TABS = ['werkplaats', 'nieuw', 'sjablonen', 'paginas', 'kloon', 'vervang', 'klantgegevens']"));
  assert.ok(js.includes("type: 'pagr-tab'"));
  assert.ok(js.includes("'pagr-hoogte'"));
});

test('de LP verwerkt alleen berichten van dezelfde herkomst', () => {
  const js = lees('lp.js');
  assert.ok(js.includes('e.origin !== window.location.origin'));
  assert.ok(lees('admin.js').includes('e.origin !== window.location.origin'));
});

test('ingebed verbergt de eigen kopbalk van de LP', () => {
  assert.ok(lees('lp.html').includes('html.ingebed #lpApp .top { display: none; }'));
});
