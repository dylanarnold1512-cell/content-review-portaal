const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lees = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

// Nieuwe pagina staat bewust niet meer in het menu (design 23-10-2026): je start hem met de knop in de werkplaats.
// Bouwen met chat is geen eigen onderdeel meer (24-10-2026): bijsturen met chat zit op elk paginascherm.
test('de admin zijbalk heeft een onderdeel per LP tab', () => {
  const html = lees('admin.html');
  ['overzicht', 'werkplaats', 'sjablonen', 'paginas', 'kloon', 'vervang', 'klantgegevens'].forEach((tab) => {
    assert.ok(html.includes(`data-pagr-tab="${tab}"`), tab);
    // Elke tab bestaat ook echt als knop in de LP.
    assert.ok(lees('lp.html').includes(`data-lp-tab="${tab}"`), tab);
  });
});

test('de admin kent de Pagr. tabs in de hash en stuurt ze door naar de LP', () => {
  const js = lees('admin.js');
  assert.ok(js.includes("PAGR_TABS = ['overzicht', 'werkplaats', 'nieuw', 'sjablonen', 'paginas', 'kloon', 'vervang', 'klantgegevens']"));
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

test('stap 13: de LP meldt zijn tab aan de admin en de admin volgt', () => {
  const lp = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  assert.ok(lp.includes("type: 'pagr-tab-actief'"));
  assert.ok(admin.includes("d.type === 'pagr-tab-actief'"));
  // De speciale panelen (kloon, vervang, klantgegevens, chat) worden ook bij een programmatische tabwissel getoond.
  assert.ok(lp.includes("const speciaal = ['kloon', 'vervang', 'klantgegevens', 'chat']"));
});

test('stap 13: meerdere pagina\'s en sjablonen tegelijk verwijderen heeft endpoints en keuzevakjes', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'lp.js'), 'utf8');
  assert.ok(routes.includes("'/pages/verwijder-meerdere'"));
  assert.ok(routes.includes("'/templates/verwijder-meerdere'"));
  const lp = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
  assert.ok(lp.includes('data-sel='));
});

test('de knop Pagina\'s in het klantmenu is standaard verborgen en verschijnt alleen bij Pagr.', () => {
  // Anders toont de zijbalk de groep Landingspagina's voor elke klant (werkGroepenBij in portaal-shell.js).
  assert.ok(/class="tab-btn p-nav-item hidden" data-tab="paginas" id="paginasTabBtn"/.test(lees('index.html')));
  assert.ok(lees('app.js').includes("paginasKnop.classList.toggle('hidden', !producten.pagr)"));
});
