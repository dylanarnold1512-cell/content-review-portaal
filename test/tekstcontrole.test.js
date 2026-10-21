const test = require('node:test');
const assert = require('node:assert');
const { tekstControle, getallenIn } = require('../src/lp/tekstcontrole');

const basis = {
  heroTitle: 'Badkamer renoveren in Haarlem',
  heroIntro: 'Wil je een nieuwe badkamer? Hirs Installaties pakt dat van begin tot eind aan.',
  directAnswer: 'Nick Hirs verzorgt complete badkamers voor particulieren in Haarlem en omgeving.'
};

test('hij over de eigenaar wordt gemeld bij derde persoon', () => {
  const p = tekstControle({ ...basis, directAnswer: 'Nick Hirs realiseert badkamers. Bij grotere projecten schakelt hij vakmensen in.' }, { derdePersoon: true });
  assert.ok(p.some((x) => /"hij"/.test(x.tekst)));
});

test('hij wordt niet gemeld zonder derde persoon', () => {
  const p = tekstControle({ ...basis, directAnswer: 'Hij schakelt vakmensen in.' }, { derdePersoon: false });
  assert.ok(!p.some((x) => /"hij"/.test(x.tekst)));
});

test('stijve Wie zin wordt gemeld, een FAQ vraag niet', () => {
  const stijf = tekstControle({ ...basis, directAnswer: 'Wie plannen wil laten uitwerken, kan een offerte aanvragen.' }, {});
  assert.ok(stijf.some((x) => /Wie/.test(x.tekst)));
  const faq = tekstControle({ ...basis, faqItems: [{ question: 'Wie voert de renovatie uit?', answer: 'Nick met vaste vakmensen.' }] }, {});
  assert.ok(!faq.some((x) => /Wie/.test(x.tekst)));
});

test('getal buiten de feiten wordt gemeld, getal in de feiten niet', () => {
  const metFeit = tekstControle({ ...basis, usp: '7 werkdagen tot 4 weken, 70 euro per uur' }, { toegestaneTekst: 'Duur 7 werkdagen tot 4 weken. Uurtarief 70 euro exclusief btw.' });
  assert.ok(!metFeit.some((x) => /getal/.test(x.tekst)));
  const zonder = tekstControle({ ...basis, usp: 'Al 15 jaar ervaring en 1.500 klussen' }, { toegestaneTekst: 'Duur 7 werkdagen.' });
  assert.ok(zonder.some((x) => /getal/.test(x.tekst) && /15/.test(x.tekst)));
});

test('kleine getallen en niet meegegeven feiten geven geen melding', () => {
  assert.deepStrictEqual(getallenIn('4 stappen en 3 weken').length, 0);
  const p = tekstControle({ ...basis, usp: 'Al 15 jaar ervaring' }, {});
  assert.ok(!p.some((x) => /getal/.test(x.tekst)));
});

test('superlatief en ervaringsclaim worden gemeld', () => {
  const p = tekstControle({ ...basis, directAnswer: 'Hirs is de beste installateur met jarenlange ervaring.' }, {});
  assert.ok(p.some((x) => x.soort === 'claim'));
});

test('reviews zonder bevestiging worden gemeld', () => {
  const p = tekstControle({ ...basis, reviewItems: [{ quote: 'Top', name: 'A' }] }, { reviewsBevestigd: false });
  assert.ok(p.some((x) => /reviews/.test(x.tekst)));
  const ok = tekstControle({ ...basis, reviewItems: [{ quote: 'Top', name: 'A' }] }, { reviewsBevestigd: true });
  assert.ok(!ok.some((x) => /reviews/.test(x.tekst)));
});

test('persoonsnaam die niet genoemd mag worden wordt gemeld', () => {
  const p = tekstControle({ ...basis, directAnswer: 'Nick werkt zelfstandig aan je badkamer.' }, { nietNoemen: ['Nick'] });
  assert.ok(p.some((x) => /persoonsnaam "Nick"/.test(x.tekst)));
  const ok = tekstControle({ ...basis, directAnswer: 'Hirs Installaties verzorgt complete badkamers in Haarlem.' }, { nietNoemen: ['Nick'] });
  assert.ok(!ok.some((x) => /persoonsnaam/.test(x.tekst)));
});

test('een zinsdeel met een vraagteken wordt gemeld, een lang label niet', () => {
  const p = tekstControle({ ...basis, heroKicker: 'Een complete badkamer, zonder zelf alle vakmensen te organiseren?' }, {});
  assert.ok(p.some((x) => /klopt niet of is niet af/.test(x.tekst)));
  const lang = tekstControle({ ...basis, heroIntro: 'Wil je een nieuwe badkamer in Haarlem zonder gedoe met al die verschillende vakmensen en afspraken?' }, {});
  assert.ok(!lang.some((x) => /klopt niet of is niet af/.test(x.tekst)));
  const klein = tekstControle({ ...basis, heroKicker: 'zonder zelf te organiseren' }, {});
  assert.ok(klein.some((x) => /klopt niet of is niet af/.test(x.tekst)));
});

test('praktische gegevens in een lijst beginnen mogen met een kleine letter', () => {
  const p = tekstControle({ ...basis, practicalItems: [{ label: 'Bereikbaar', value: 'werkdagen van 09:00 tot 18:00' }] }, {});
  assert.ok(!p.some((x) => /klopt niet of is niet af/.test(x.tekst)));
});
