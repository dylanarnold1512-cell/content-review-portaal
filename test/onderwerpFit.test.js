const test = require('node:test');
const assert = require('node:assert/strict');
const { onderwerpFit, onderwerpStammen } = require('../src/lp/onderwerpFit');
const { inOrdePunten, maakControle } = require('../src/lp/controle');

const html = '<section><h1>{{heroTitle}}</h1></section><section><h2>Uitgevoerd werk</h2>{{#each projectItems}}<div>{{title}}</div>{{/each}}</section>';

test('onderwerpstammen laten plaatsen en algemene woorden weg', () => {
  assert.deepEqual(onderwerpStammen(['Dakkapel plaatsen in Noordwijkerhout'], ['Noordwijkerhout']), ['dakkap']);
});

test('projecten die het onderwerp niet noemen geven een punt met sectie', () => {
  const slotData = { projectItems: [{ title: 'Tuinhuis met loungehoek' }, { title: 'Zolder verbouwing' }] };
  const r = onderwerpFit({ slotData, htmlTemplate: html, onderwerpTeksten: ['Dakkapel plaatsen in Hillegom'], plaatsen: ['Hillegom'] });
  assert.equal(r.length, 1);
  assert.equal(r[0].lijst, 'projectItems');
  assert.equal(r[0].sectieIndex, 1);
});

test('een project dat het onderwerp noemt is geen punt', () => {
  const slotData = { projectItems: [{ title: 'Tuinhuis' }, { title: 'Prefab dakkapellen in Lisse' }] };
  assert.equal(onderwerpFit({ slotData, htmlTemplate: html, onderwerpTeksten: ['Dakkapel plaatsen'], plaatsen: [] }).length, 0);
});

test('zonder onderwerp of zonder projecten geen punt', () => {
  assert.equal(onderwerpFit({ slotData: { projectItems: [{ title: 'a b c' }, { title: 'd e f' }] }, htmlTemplate: html, onderwerpTeksten: [], plaatsen: [] }).length, 0);
  assert.equal(onderwerpFit({ slotData: {}, htmlTemplate: html, onderwerpTeksten: ['Dakkapel'], plaatsen: [] }).length, 0);
});

test('controle neemt extra punten met acties mee als aandachtspunt', () => {
  const c = maakControle({ errors: [], warnings: [] }, { extraPunten: [{ tekst: 'x', acties: [{ type: 'verberg', label: 'Verberg', sectie: 1 }], sectieIndex: 1 }], inOrde: ['a'] });
  assert.equal(c.ok, true);
  assert.equal(c.letOp[0].acties.length, 1);
  assert.deepEqual(c.inOrde, ['a']);
});

test('lijkende veelgestelde vraag krijgt een oplosknop', () => {
  const c = maakControle({ errors: [], warnings: ['De veelgestelde vraag "X" lijkt sterk op een vraag van een andere pagina ("Y").'] });
  assert.equal(c.letOp[0].soort, 'opnieuw');
});

test('in orde noemt alleen wat gecontroleerd is', () => {
  const lijst = inOrdePunten({ content: { slotData: { metaTitle: 'a', metaDescription: 'b', linksItems: [1, 2], faqItems: [1] } }, validatie: { errors: [], warnings: [] }, zusterAantal: 2, gelijkenisGemeld: false });
  assert.equal(lijst.length, 5);
  const geen = inOrdePunten({ content: { slotData: {} }, validatie: { errors: ['Meta title ontbreekt.'], warnings: [] }, zusterAantal: 0, gelijkenisGemeld: false });
  assert.equal(geen.length, 0);
});

const { kiesSjablonenVoorVoorstellen } = require('../src/lp/begeleiding');

test('sjabloon per voorstel: een sjabloon betekent geen AI aanroep', async () => {
  let aangeroepen = false;
  const r = await kiesSjablonenVoorVoorstellen({ klantNaam: 'K', voorstellen: [{ titel: 'a' }, { titel: 'b' }], sjablonen: [{ blueprintId: 'x', naam: 'X' }], aiFn: async () => { aangeroepen = true; return {}; } });
  assert.deepEqual(r, ['x', 'x']);
  assert.equal(aangeroepen, false);
});

test('sjabloon per voorstel: de AI kiest, onbekend valt terug op het eerste', async () => {
  const sjablonen = [{ blueprintId: 'loc', naam: 'Locatie' }, { blueprintId: 'dienst', naam: 'Dienst' }];
  const r = await kiesSjablonenVoorVoorstellen({ klantNaam: 'K', voorstellen: [{ titel: 'a' }, { titel: 'b' }, { titel: 'c' }], sjablonen, aiFn: async () => ({ keuzes: ['dienst', 'bestaatniet'] }) });
  assert.deepEqual(r, ['dienst', 'loc', 'loc']);
});

test('sjabloon per voorstel: een AI fout valt terug op het eerste sjabloon', async () => {
  const r = await kiesSjablonenVoorVoorstellen({ klantNaam: 'K', voorstellen: [{ titel: 'a' }], sjablonen: [{ blueprintId: 'loc', naam: 'L' }, { blueprintId: 'd', naam: 'D' }], aiFn: async () => { throw new Error('stuk'); } });
  assert.deepEqual(r, ['loc']);
});
