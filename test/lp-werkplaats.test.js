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

test('stand Voorstel: pagina met stand Idee die op besluit wacht telt niet als Gepland', () => {
  const { wpStandPagina } = require('../public/lp-werkplaats.js');
  assert.equal(wpStandPagina({ status: 'Idee', voorstel: true }), 'Voorstel');
  assert.equal(wpStandPagina({ status: 'Idee' }), 'Gepland');
  assert.equal(wpStandPagina({ status: 'Ter review', voorstel: true }), 'Ter controle');
  const { tellers } = wpBouwAdvies({
    templates: [{ status: 'Actief' }],
    pages: [{ id: 'a', status: 'Idee', voorstel: true }, { id: 'b', status: 'Idee', voorstel: true }, { id: 'c', status: 'Idee' }]
  });
  assert.equal(tellers['Voorstel'], 2);
  assert.equal(tellers['Gepland'], 1);
});

test('fase 3: volgende maand toont alleen voorstellen van die maand', () => {
  const { wpVolgendeInfo, wpVolgendeMaand } = require('../public/lp-werkplaats.js');
  assert.equal(wpVolgendeMaand('2026-12'), '2027-01');
  const nu = new Date('2026-10-23T12:00:00+02:00');
  const info = wpVolgendeInfo([{ id: 'a', maand: '2026-11' }, { id: 'b', maand: '2026-11' }, { id: 'c', maand: '2026-10' }], nu);
  assert.equal(info.naam, 'november');
  assert.equal(info.voorstellen.length, 2);
});

test('fase 3: Onderweg heeft vijf kolommen en toont de laatste vijf live', () => {
  const { wpOnderwegKolommen } = require('../public/lp-werkplaats.js');
  const live = Array.from({ length: 7 }, (_, i) => ({ id: 'l' + i, titel: 'L' + i, status: 'Gepubliceerd', laatstGewijzigd: `2026-10-0${i + 1}T10:00:00Z` }));
  const k = wpOnderwegKolommen([
    { id: 'v', titel: 'V', status: 'Idee', voorstel: true },
    { id: 'g', titel: 'G', status: 'Idee' },
    { id: 'm', titel: 'M', status: 'Fout' },
    { id: 'c', titel: 'C', status: 'Content klaar' },
    { id: 'k', titel: 'K', status: 'Klaar voor live' },
    ...live
  ], 5);
  assert.equal(k.length, 5);
  assert.deepEqual(k.map((x) => x.paginas.length), [1, 2, 1, 1, 5]);
  assert.equal(k[4].meer, 2);
  assert.equal(k[4].paginas[0].id, 'l6');
  assert.equal(k[1].paginas.find((p) => p.id === 'm').fout, true);
});

test('fase 3: activiteit nieuwste eerst en zonder pagina\'s zonder datum', () => {
  const { wpActiviteit } = require('../public/lp-werkplaats.js');
  const a = wpActiviteit([
    { id: '1', titel: 'A', status: 'Gepubliceerd', laatstGewijzigd: '2026-10-20T10:00:00Z', liveDatum: '2026-10-22' },
    { id: '2', titel: 'B', status: 'Content klaar', laatstGewijzigd: '2026-10-23T08:00:00Z' },
    { id: '3', titel: 'C', status: 'Idee', voorstel: true, laatstGewijzigd: '2026-10-21T08:00:00Z' },
    { id: '4', titel: 'D', status: 'Idee' }
  ], 8);
  assert.deepEqual(a.map((x) => x.id), ['2', '1', '3']);
  assert.equal(a[2].tekst, 'staat als voorstel klaar');
});

test('fase 3: resultaat van een live pagina zonder meting legt uit waarom', () => {
  const { wpResultaatTekst } = require('../public/lp-werkplaats.js');
  const nu = new Date('2026-10-23T12:00:00Z');
  assert.equal(wpResultaatTekst({ liveDatum: '2026-10-22', google: null }, nu).google, 'Meting na 7 dagen');
  assert.equal(wpResultaatTekst({ liveDatum: '2026-09-01', google: null }, nu).google, 'Geen meting');
  const r = wpResultaatTekst({ google: { vertoningen: 120, klikken: 7, positie: 8.4 }, ai: { geciteerd: 2 } }, nu);
  assert.equal(r.google, '120 vertoningen, 7 klikken, positie 8.4');
  assert.equal(r.ai, '2x genoemd');
});
