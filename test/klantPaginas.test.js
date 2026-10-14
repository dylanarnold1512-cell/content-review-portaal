// Tests voor wat een klant ziet van zijn landingspagina's (Pagr. stap 5, 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { maakKlantLijst, telKerncijfers } = require('../src/lp/klantPaginas');
const { standVan, STAND } = require('../src/lp/standen');

test('standen: alle negen Notion statussen hebben een stand van de klant', () => {
  assert.equal(Object.keys(STAND).length, 9);
  assert.equal(standVan('Gepubliceerd'), 'Live');
  assert.equal(standVan('Idee'), 'Gepland');
  assert.equal(standVan('Ter review'), 'Ter controle');
  assert.equal(standVan('onbekend'), 'In de maak');
});

test('maakKlantLijst toont url en datum alleen bij live pagina\'s en geeft geen interne velden mee', () => {
  const lijst = maakKlantLijst([
    { id: '1', titel: 'Haarlem', status: 'Gepubliceerd', wpUrl: 'https://x.nl/haarlem', liveDatum: '2026-10-03', blueprint: 'geheim', slug: 's' },
    { id: '2', titel: 'Lisse', status: 'Content klaar', wpUrl: 'https://x.nl/concept' },
    { id: '3', titel: '', status: 'Idee' }
  ]);
  assert.equal(lijst.length, 2);
  assert.equal(lijst[0].url, 'https://x.nl/haarlem');
  assert.equal(lijst[1].url, '');
  assert.equal(lijst[1].stand, 'Ter controle');
  assert.equal(lijst[0].blueprint, undefined);
  assert.equal(lijst[0].slug, undefined);
});

test('geplande pagina toont de reden uit het plan, een idee van de klant krijgt een eigen tekst', () => {
  const lijst = maakKlantLijst(
    [{ id: 'a', titel: 'Dakkapel', status: 'Idee' }, { id: 'b', titel: 'Zolder', status: 'Idee' }],
    { a: { plan: { status: 'goedgekeurd', reden: 'Veel gezocht.' } }, b: { plan: { status: 'idee van klant' } } }
  );
  assert.equal(lijst[0].reden, 'Veel gezocht.');
  assert.equal(lijst[1].vanKlant, true);
  assert.match(lijst[1].reden, /Jullie idee/);
});

test('telKerncijfers telt per stand en pagina\'s live deze maand', () => {
  const lijst = [
    { stand: 'Live', liveDatum: '2026-10-03' }, { stand: 'Live', liveDatum: '2026-09-20' },
    { stand: 'Gepland' }, { stand: 'In de maak' }, { stand: 'Ter controle' }
  ];
  assert.deepEqual(telKerncijfers(lijst, new Date('2026-10-14')), { live: 2, gepland: 1, inDeMaak: 2, dezeMaandLive: 1 });
});
