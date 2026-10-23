const test = require('node:test');
const assert = require('node:assert');
const leren = require('../src/lp/leren');

const pagina = (id, status, laatst, tekst) => ({ id, titel: `Pagina ${id}`, status, laatstGewijzigd: laatst, content: { slotData: { heroTitle: tekst } } });

test('kiesVoorbeelden: hoofd eerst, daarna recente live pagina\'s, maximaal drie, nooit de pagina zelf', () => {
  const hoofd = pagina('a', 'Gepubliceerd', '2026-10-01', 'A');
  const kand = [hoofd, pagina('b', 'Gepubliceerd', '2026-10-05', 'B'), pagina('c', 'Gepubliceerd', '2026-10-03', 'C'), pagina('d', 'Gepubliceerd', '2026-10-09', 'D'), pagina('e', 'Content klaar', '2026-10-10', 'E'), pagina('nu', 'Gepubliceerd', '2026-10-11', 'N')];
  const uit = leren.kiesVoorbeelden({ hoofd, kandidaten: kand, paginaId: 'nu' });
  assert.deepStrictEqual(uit.map((z) => z.id), ['a', 'd', 'b']);
});

test('kiesVoorbeelden: zonder hoofd de meest recente live pagina\'s, concepten tellen niet', () => {
  const kand = [pagina('b', 'Gepubliceerd', '2026-10-05', 'B'), pagina('e', 'Content klaar', '2026-10-10', 'E')];
  assert.deepStrictEqual(leren.kiesVoorbeelden({ hoofd: null, kandidaten: kand, paginaId: 'x' }).map((z) => z.id), ['b']);
  assert.deepStrictEqual(leren.kiesVoorbeelden({ hoofd: null, kandidaten: [], paginaId: 'x' }), []);
});

test('kiesVoorbeelden: het hoofd mag zelf de pagina zijn die wordt geschreven? Nee', () => {
  const hoofd = pagina('a', 'Gepubliceerd', '2026-10-01', 'A');
  assert.deepStrictEqual(leren.kiesVoorbeelden({ hoofd, kandidaten: [hoofd], paginaId: 'a' }), []);
});

test('verschillen: alleen aangepaste tekst, geen feiten of reviews', () => {
  const oud = { heroTitle: 'Hirs Installaties vermeldt een VCA certificering', heroIntro: 'zelfde', practicalItems: [{ label: 'Tijd', value: 'oud' }], faqItems: [{ question: 'Vraag?', answer: 'Antwoord een' }] };
  const nieuw = { heroTitle: 'Hirs heeft een VCA certificering', heroIntro: 'zelfde', practicalItems: [{ label: 'Tijd', value: 'nieuw' }], faqItems: [{ question: 'Vraag?', answer: 'Antwoord twee' }] };
  const v = leren.verschillen(oud, nieuw);
  assert.deepStrictEqual(v.map((x) => x.pad).sort(), ['faqItems[1].answer', 'heroTitle']);
  assert.strictEqual(v.find((x) => x.pad === 'heroTitle').na, 'Hirs heeft een VCA certificering');
});

test('voegToe: dezelfde plek op dezelfde pagina houdt het oorspronkelijke voor en het nieuwste na', () => {
  let l = leren.voegToe([], [{ pad: 'heroTitle', voor: 'AI', na: 'Tussen' }], { pagina: 'p1', datum: '2026-10-23' });
  l = leren.voegToe(l, [{ pad: 'heroTitle', voor: 'Tussen', na: 'Eind' }], { pagina: 'p1', datum: '2026-10-24' });
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].voor, 'AI');
  assert.strictEqual(l[0].na, 'Eind');
});

test('voegToe: terug naar het origineel haalt de correctie weg en de lijst is begrensd', () => {
  let l = leren.voegToe([], [{ pad: 'x', voor: 'AI', na: 'Mens' }], { pagina: 'p', datum: 'd' });
  l = leren.voegToe(l, [{ pad: 'x', voor: 'Mens', na: 'AI' }], { pagina: 'p', datum: 'd' });
  assert.strictEqual(l.length, 0);
  let veel = [];
  for (let i = 0; i < 30; i += 1) veel = leren.voegToe(veel, [{ pad: `p${i}`, voor: `a${i}`, na: `b${i}` }], { pagina: 'p', datum: 'd' });
  assert.strictEqual(veel.length, leren.MAX_CORRECTIES);
  assert.strictEqual(veel[veel.length - 1].pad, 'p29');
});

test('bouwCorrectiesBlok: leeg zonder correcties, anders voor en na', () => {
  assert.strictEqual(leren.bouwCorrectiesBlok([]), '');
  const blok = leren.bouwCorrectiesBlok([{ voor: 'vermeldt een VCA', na: 'heeft een VCA' }]);
  assert.match(blok, /voor: vermeldt een VCA/);
  assert.match(blok, /na: heeft een VCA/);
});

test('schoonCorrecties: onzin en gelijke teksten vallen weg', () => {
  assert.deepStrictEqual(leren.schoonCorrecties('x'), []);
  assert.strictEqual(leren.schoonCorrecties([{ voor: 'a', na: 'a' }, { voor: 'a', na: 'b' }]).length, 1);
});

test('de schrijfopdracht bevat extra voorbeelden en correcties', () => {
  const ai = require('../src/lp/ai');
  const blok = ai.bouwVoorbeeldBlok({ titel: 'Een', slotData: { heroTitle: 'Een lange genoeg titel voor het voorbeeld van deze pagina hier' }, extra: [{ titel: 'Twee', slotData: { heroTitle: 'Tweede titel' } }] });
  assert.match(blok, /NOG EEN LIVE PAGINA/);
  assert.match(blok, /Tweede titel/);
});
