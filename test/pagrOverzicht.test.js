const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwKlantRij, bouwTotalen } = require('../src/lp/pagrOverzicht');
const { ovInboxItems, ovAutoLiveTekst, ovKerncijfers, ovRijHtml } = require('../public/lp-overzicht.js');

const nu = new Date('2026-10-23T12:00:00+02:00');
const pagina = (status, extra) => ({ id: Math.random().toString(36), titel: 't', status, aangemaakt: '2026-10-10T10:00:00Z', laatstGewijzigd: '2026-10-22T10:00:00Z', ...extra });

test('rij telt per stand en trekt voorstellen af van gepland', () => {
  const rij = bouwKlantRij({
    id: 'hirs', naam: 'Hirs', soort: 'pagr', paginasPerMaand: 5, autoLive: false, nu,
    pages: [pagina('Gepubliceerd'), pagina('Gepubliceerd'), pagina('Klaar voor live'), pagina('Content klaar'), pagina('Fout'), pagina('Idee'), pagina('Idee'), pagina('Idee')],
    tel: { ideeen: 0, voorstellen: 2, voorstellenPerMaand: { '2026-11': 2 } }
  });
  assert.equal(rij.live, 2);
  assert.equal(rij.klaar, 1);
  assert.equal(rij.controleren, 1);
  assert.equal(rij.fout, 1);
  assert.equal(rij.gepland, 1);
  assert.equal(rij.voorstellen, 2);
  assert.equal(rij.volgendeMaand.voorstellen, 2);
  assert.equal(rij.dezeMaand.gemaakt, 5);
  assert.equal(rij.dezeMaand.doel, 5);
  assert.equal(rij.autoLive.aan, false);
  assert.equal(rij.wacht, 1 + 1 + 1 + 2);
});

test('automatisch live werkt pas vanaf 5 live pagina\'s', () => {
  const vijf = Array.from({ length: 5 }, () => pagina('Gepubliceerd'));
  assert.equal(bouwKlantRij({ id: 'a', naam: 'A', soort: 'pagr', autoLive: true, pages: vijf, nu }).autoLive.actief, true);
  assert.equal(bouwKlantRij({ id: 'a', naam: 'A', soort: 'pagr', autoLive: true, pages: vijf.slice(0, 2), nu }).autoLive.actief, false);
});

test('totalen tellen eigen werk niet mee', () => {
  const a = bouwKlantRij({ id: 'a', naam: 'A', soort: 'pagr', paginasPerMaand: 4, pages: [pagina('Fout')], nu });
  const b = bouwKlantRij({ id: 'b', naam: 'B', soort: 'eigen', pages: [pagina('Fout'), pagina('Fout')], nu });
  const t = bouwTotalen([a, b]);
  assert.equal(t.klanten, 1);
  assert.equal(t.fout, 1);
  assert.equal(t.doel, 4);
});

test('inbox: belangrijkste eerst, alleen Pagr. klanten', () => {
  const klanten = [
    { id: 'a', naam: 'A', soort: 'pagr', fout: 0, klaar: 2, controleren: 0, voorstellen: 1, ideeen: 0 },
    { id: 'b', naam: 'B', soort: 'pagr', fout: 1, klaar: 0, controleren: 1, voorstellen: 0, ideeen: 1 },
    { id: 'c', naam: 'C', soort: 'eigen', fout: 3, klaar: 0, controleren: 0, voorstellen: 0, ideeen: 0 }
  ];
  const soorten = ovInboxItems(klanten).map((i) => `${i.soort}:${i.naam}`);
  assert.deepEqual(soorten, ['Mislukt:B', 'Live zetten:A', 'Controleren:B', 'Plan:A', 'Idee van de klant:B']);
});

test('teksten voor automatisch live en kerncijfers', () => {
  assert.equal(ovAutoLiveTekst({ aan: false }).tekst, 'Uit');
  assert.equal(ovAutoLiveTekst({ aan: true, actief: false, nodig: 5, live: 2 }).tekst, 'Aan vanaf 5 live (nu 2)');
  assert.equal(ovAutoLiveTekst({ aan: true, actief: true, nodig: 5, live: 7 }).tekst, 'Aan');
  const kern = ovKerncijfers({ gemaakt: 5, doel: 10, wacht: 3, fout: 1, klaar: 1, voorstellen: 1, controleren: 0, ideeen: 0, klanten: 2 });
  assert.equal(kern[0].waarde, '5 van 10');
  assert.equal(kern[1].sub, '1 mislukt, 1 live zetten, 1 voorstel');
});

test('rij html escapet de klantnaam', () => {
  const rij = bouwKlantRij({ id: 'x', naam: '<b>Evil</b>', soort: 'pagr', pages: [], nu });
  assert.ok(!ovRijHtml(rij).includes('<b>Evil</b>'));
});
