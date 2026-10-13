const test = require('node:test');
const assert = require('node:assert');
const s = require('../public/portaal-shell.js');

test('elk tabblad heeft een eigen adres dat terug te vertalen is', () => {
  Object.keys(s.TITELS).forEach((tab) => {
    const woord = s.hashVoorTab(tab);
    assert.ok(woord, 'adres voor ' + tab);
    assert.strictEqual(s.tabUitHash('#' + woord), tab);
  });
});

test('het adres gebruikt de woorden uit het menu', () => {
  assert.strictEqual(s.hashVoorTab('prestaties'), 'google');
  assert.strictEqual(s.hashVoorTab('rapportages'), 'maandrapporten');
  assert.strictEqual(s.hashVoorTab('aiZichtbaarheid'), 'ai');
});

test('tabUitHash negeert hoofdletters en onbekende of lege adressen', () => {
  assert.strictEqual(s.tabUitHash('#Google'), 'prestaties');
  assert.strictEqual(s.tabUitHash('google'), 'prestaties');
  assert.strictEqual(s.tabUitHash('#bestaat-niet'), null);
  assert.strictEqual(s.tabUitHash(''), null);
  assert.strictEqual(s.tabUitHash(undefined), null);
  assert.strictEqual(s.tabUitHash('#__proto__'), null);
});

test('de interne tabnaam is geen geldig adres', () => {
  assert.strictEqual(s.tabUitHash('#prestaties'), null);
  assert.strictEqual(s.tabUitHash('#aiZichtbaarheid'), null);
});

test('initialen van een klantnaam', () => {
  assert.strictEqual(s.initialen('Basecamp Utrecht'), 'BU');
  assert.strictEqual(s.initialen('PPExport'), 'PP');
  assert.strictEqual(s.initialen('  Trockenblumen   Grosshandel '), 'TG');
  assert.strictEqual(s.initialen(''), '–');
  assert.strictEqual(s.initialen(null), '–');
});

test('de teller telt alleen blogs die wachten op review', () => {
  const sv = { review: 'Ter review', planned: 'Gepland' };
  const items = [{ status: 'Ter review' }, { status: 'Gepland' }, { status: 'Ter review' }, null];
  assert.strictEqual(s.telWachtendOpReview(items, sv), 2);
});

test('de teller is nul bij ontbrekende gegevens', () => {
  assert.strictEqual(s.telWachtendOpReview(undefined, { review: 'x' }), 0);
  assert.strictEqual(s.telWachtendOpReview([{ status: 'x' }], undefined), 0);
  assert.strictEqual(s.telWachtendOpReview([{ status: undefined }], {}), 0);
});

test('tellerTekst is leeg bij nul', () => {
  assert.strictEqual(s.tellerTekst(0), '');
  assert.strictEqual(s.tellerTekst(2), '2');
});
