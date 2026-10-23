// Tests voor de statusvertaling en het advies van de Pagr. werkplaats (stap 2).
const test = require('node:test');
const assert = require('node:assert/strict');
const { wpStandVan, wpBouwAdvies, WP_STAND } = require('../public/lp-werkplaats.js');

test('alle tien Notion-statussen vallen in een van de vijf standen', () => {
  const alle = ['Idee', 'Formulier ingevuld', 'Feitensheet ter review', 'Content klaar', 'Ter review', 'Goedgekeurd', 'Klaar voor live', 'Afgewezen', 'Gepubliceerd', 'Fout'];
  alle.forEach((s) => assert.ok(['Gepland', 'In de maak', 'Ter controle', 'Klaar voor live', 'Live'].includes(wpStandVan(s)), s));
  assert.equal(Object.keys(WP_STAND).length, 10);
  assert.equal(wpStandVan('onbekend'), 'In de maak');
});

test('advies: zonder actief sjabloon eerst een sjabloon maken', () => {
  const { advies } = wpBouwAdvies({ pages: [], templates: [] });
  assert.equal(advies[0].actie, 'sjabloon');
});

test('advies: wachtende en mislukte pagina\'s worden genoemd', () => {
  const { advies, tellers } = wpBouwAdvies({
    templates: [{ status: 'Actief' }],
    pages: [{ id: 'a', status: 'Ter review' }, { id: 'b', status: 'Fout' }, { id: 'c', status: 'Gepubliceerd' }]
  });
  assert.equal(tellers['Ter controle'], 1);
  assert.ok(advies.some((a) => a.soort === 'fout' && a.pagina === 'b'));
  assert.ok(advies.some((a) => a.soort === 'plan' && a.pagina === 'a'));
});

test('advies: alles live geeft een positief advies met nieuwe pagina', () => {
  const { advies } = wpBouwAdvies({ templates: [{ status: 'Actief' }], pages: [{ id: 'c', status: 'Gepubliceerd' }] });
  assert.equal(advies[0].soort, 'goed');
  assert.equal(advies[0].actie, 'pagina');
});

test('advies: schone pagina\'s krijgen een knop om alles live te zetten', () => {
  const { advies, tellers } = wpBouwAdvies({ templates: [{ status: 'Actief' }], pages: [{ id: 'a', status: 'Klaar voor live' }, { id: 'b', status: 'Klaar voor live' }] });
  assert.equal(tellers['Klaar voor live'], 2);
  assert.ok(advies.some((a) => a.actie === 'zet-live-bulk' && a.knop === 'Zet alle live'));
});
