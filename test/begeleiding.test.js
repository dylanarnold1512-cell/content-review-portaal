// Tests voor src/lp/begeleiding.js (Pagr. stap 12, 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { maakSlug, schoonPaginaAdvies, adviesNieuwePagina, schoonSjabloonAdvies, adviesNieuwSjabloon } = require('../src/lp/begeleiding');

const sjablonen = [
  { blueprintId: 'dienst', naam: 'Dienstpagina', invoerVelden: [{ key: 'plaatsnaam', label: 'Plaats', verplicht: true }, { key: 'dienstFocus', label: 'Dienst' }] },
  { blueprintId: 'event', naam: 'Eventpagina', invoerVelden: [] }
];

test('maakSlug maakt een nette slug', () => {
  assert.equal(maakSlug('Dakkapel plaatsen in Zandvoort!'), 'dakkapel-plaatsen-in-zandvoort');
  assert.equal(maakSlug('Café Ünïcode'), 'cafe-unicode');
});

test('schoonPaginaAdvies houdt alleen een bestaand sjabloon en bekende velden', () => {
  const a = schoonPaginaAdvies({ blueprintId: 'dienst', titel: 'Dakkapel Zandvoort', invoer: { plaatsnaam: 'Zandvoort', onzin: 'x', dienstFocus: '' }, waarom: 'Past bij een dienst in een plaats.' }, sjablonen, []);
  assert.equal(a.blueprintId, 'dienst');
  assert.deepEqual(a.invoer, { plaatsnaam: 'Zandvoort' });
  assert.equal(a.slug, 'dakkapel-zandvoort');
  assert.equal(a.waarschuwing, '');
});

test('schoonPaginaAdvies waarschuwt bij onbekend sjabloon en bestaande titel', () => {
  const a = schoonPaginaAdvies({ blueprintId: 'verzonnen', titel: 'Dakkapel Zandvoort' }, sjablonen, ['dakkapel zandvoort']);
  assert.equal(a.blueprintId, '');
  assert.match(a.waarschuwing, /bestaat al/);
  const b = schoonPaginaAdvies({ blueprintId: 'verzonnen', titel: 'Nieuw' }, sjablonen, []);
  assert.match(b.waarschuwing, /geen passend sjabloon/);
});

test('adviesNieuwePagina stuurt de beschrijving en sjablonen mee en eist invoer', async () => {
  let prompt = '';
  const aiFn = async ({ userPrompt }) => { prompt = userPrompt; return { blueprintId: 'event', titel: 'Testival Tilburg', slug: '', invoer: {}, waarom: 'Een event.' }; };
  const a = await adviesNieuwePagina({ klantNaam: 'Roots', onderwerp: 'pagina voor Testival Tilburg', sjablonen, bestaandeTitels: [], aiFn });
  assert.match(prompt, /dienst: Dienstpagina/);
  assert.match(prompt, /Testival Tilburg/);
  assert.equal(a.blueprintId, 'event');
  await assert.rejects(adviesNieuwePagina({ klantNaam: 'Roots', onderwerp: '', sjablonen, aiFn }), /Beschrijf/);
  await assert.rejects(adviesNieuwePagina({ klantNaam: 'Roots', onderwerp: 'iets', sjablonen: [], aiFn }), /geen actief sjabloon/);
});

test('schoonSjabloonAdvies filtert onderdelen en richting en voorkomt dubbele namen', () => {
  const onderdelen = [{ key: 'faq', label: 'FAQ' }, { key: 'usps', label: 'USPs' }];
  const a = schoonSjabloonAdvies({ naam: 'Dienstpagina', onderdelen: ['faq', 'faq', 'nepkey'], visueleRichting: 'raar', conversiedoel: 'Offerte aanvragen' }, onderdelen, ['Dienstpagina']);
  assert.deepEqual(a.onderdelen, ['faq']);
  assert.equal(a.visueleRichting, '');
  assert.equal(a.naam, 'Dienstpagina 2');
});

test('adviesNieuwSjabloon roept de AI aan en eist een doel', async () => {
  const aiFn = async () => ({ naam: 'Plaatspagina', paginatype: 'dienst in plaats', onderdelen: ['usps'], visueleRichting: 'fotografie-gedreven', conversiedoel: 'Contact', waarom: 'Lokaal.' });
  const a = await adviesNieuwSjabloon({ klantNaam: 'X', doel: 'pagina per plaats', onderdelen: [{ key: 'usps', label: 'USPs' }], aiFn });
  assert.equal(a.visueleRichting, 'fotografie-gedreven');
  await assert.rejects(adviesNieuwSjabloon({ klantNaam: 'X', doel: '', onderdelen: [], aiFn }), /Beschrijf/);
});

test('schoonVerbeterpunten houdt maximaal vier bruikbare punten', () => {
  const { schoonVerbeterpunten } = require('../src/lp/begeleiding');
  const punten = schoonVerbeterpunten({ punten: [
    { titel: 'A', uitleg: 'u', opdracht: 'doe a' }, { titel: '', opdracht: 'x' }, { titel: 'B', opdracht: 'doe b' },
    { titel: 'C', opdracht: 'doe c' }, { titel: 'D', opdracht: 'doe d' }
  ] });
  assert.deepEqual(punten.map((p) => p.titel), ['A', 'B', 'C', 'D']);
  assert.deepEqual(schoonVerbeterpunten(null), []);
});

test('adviesVerbeterpunten eist een sjabloon met HTML', async () => {
  const { adviesVerbeterpunten } = require('../src/lp/begeleiding');
  await assert.rejects(adviesVerbeterpunten({ klantNaam: 'X', blueprint: {}, aiFn: async () => ({}) }), /geen opzet/);
  const p = await adviesVerbeterpunten({ klantNaam: 'X', naam: 'N', blueprint: { htmlTemplate: '<h1>x</h1>' }, aiFn: async () => ({ punten: [{ titel: 'T', opdracht: 'O' }] }) });
  assert.equal(p.length, 1);
});

test('verbeterpunten: met afbeeldingen gaan ze mee en telt ontwerp mee, zonder afbeeldingen geen oordeel over uitstraling', async () => {
  const { adviesVerbeterpunten, bouwVerbeterPrompt } = require('../src/lp/begeleiding');
  let gezien;
  const aiFn = async (a) => { gezien = a; return { punten: [{ soort: 'ontwerp', titel: 'T', uitleg: 'U', opdracht: 'O' }, { soort: 'raar', titel: 'T2', opdracht: 'O2' }, { titel: 'T3', opdracht: 'O3' }, { titel: 'T4', opdracht: 'O4' }, { titel: 'T5', opdracht: 'O5' }] }; };
  const punten = await adviesVerbeterpunten({ klantNaam: 'X', naam: 'N', blueprint: { htmlTemplate: '<h1>x</h1>' }, beelden: ['data:image/jpeg;base64,AAAA'], aiFn });
  assert.deepStrictEqual(gezien.beelden, ['data:image/jpeg;base64,AAAA']);
  assert.match(gezien.systemPrompt, /LOOK AND FEEL/);
  assert.strictEqual(punten.length, 4);
  assert.strictEqual(punten[0].soort, 'ontwerp');
  assert.strictEqual(punten[1].soort, 'inhoud');
  const zonder = bouwVerbeterPrompt({ klantNaam: 'X', naam: 'N', html: '<h1>x</h1>', css: '' });
  assert.doesNotMatch(zonder.systeem, /LOOK AND FEEL/);
  assert.match(zonder.systeem, /geen oordeel over kleur/);
});
