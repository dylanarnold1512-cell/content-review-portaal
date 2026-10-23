const test = require('node:test');
const assert = require('node:assert');
const { tekstControle } = require('../src/lp/tekstcontrole');
const verhaal = require('../src/lp/verhaal');
const kv = require('../src/lp/klantverhaal');
const ai = require('../src/lp/ai');

const opt = { mix: true, bedrijfsnaam: 'Hirs Installaties', nietNoemen: ['Nick'], reviewsBevestigd: false };
const goed = {
  heroIntro: 'Wil je een nieuwe badkamer? Hirs Installaties helpt je van plan tot oplevering.',
  introText: 'We bespreken je wensen en denken mee over de indeling.',
  uspTitle: 'Daarom kies je voor Hirs Installaties',
  uspIntro: 'Wij werken veiligheidsbewust.',
  offerItems: [{ title: 'Badkamers', text: 'Wij verzorgen het leidingwerk en het sanitair.' }],
  stepItems: [{ title: 'Bespreek', text: 'We nemen contact met je op.' }],
  contactIntro: 'Vraag een offerte aan bij Hirs Installaties. We reageren snel.'
};

test('mix: naam op de vaste plekken en wij in de rest is goed', () => {
  const punten = tekstControle(goed, opt).filter((p) => /bedrijfsnaam|wij, we|installateur/i.test(p.tekst));
  assert.deepStrictEqual(punten, []);
});

test('mix: te weinig naam, te vaak naam en generieke verwijzing worden gemeld', () => {
  const weinig = tekstControle({ ...goed, heroIntro: 'Wil je een badkamer? We helpen je.', uspTitle: 'Daarom kiezen klanten voor ons', contactIntro: 'Vraag een offerte aan.' }, opt);
  assert.ok(weinig.some((p) => /staat \d+ keer op de pagina\. Dat moet minstens 3/.test(p.tekst)));
  const veel = tekstControle({ ...goed, introText: 'Hirs Installaties doet dit. Hirs Installaties doet dat.', offerItems: [{ text: 'Hirs Installaties en Hirs Installaties.' }] }, opt);
  assert.ok(veel.some((p) => /brochure/.test(p.tekst)));
  const generiek = tekstControle({ ...goed, introText: 'De installateur bespreekt je wensen.' }, opt);
  assert.ok(generiek.some((p) => /de installateur/i.test(p.tekst)));
});

test('mix: persoonsnaam en hij blijven verboden', () => {
  const punten = tekstControle({ ...goed, introText: 'Nick bespreekt je wensen en hij denkt mee.' }, opt);
  assert.ok(punten.some((p) => /persoonsnaam/.test(p.tekst)));
  assert.ok(punten.some((p) => /"hij"/.test(p.tekst)));
});

test('mix: de wij-controle van de derde persoon staat uit', () => {
  const punten = verhaal.redactieControle(goed, { bedrijfsnaam: 'Hirs Installaties', mix: true, plaats: '', onderwerpWoorden: [] });
  assert.ok(!punten.some((p) => /schrijft in de derde persoon/.test(p.tekst)));
  assert.ok(!punten.some((p) => /hero praat over het bedrijf/.test(p.tekst)));
});

test('mix: de prompts noemen naam en wij, zonder gezicht van de eigenaar', () => {
  assert.match(kv.mixBlok('Hirs Installaties', ['Nick']), /nooit: Nick/);
  assert.match(kv.mixBlok('Hirs Installaties', []), /hooguit 6 keer/);
  const regels = kv.paginaOpbouwRegels({ derde: false, mix: true });
  assert.match(regels, /noem daarna de bedrijfsnaam een keer bij naam/);
  const verhaalMetGezicht = { status: 'goedgekeurd', stem: {}, gezicht: { naam: 'Nick Hirs', tekst: 'eigenaar' }, waaromKiezen: [{ punt: 'x' }] };
  assert.ok(!/GEZICHT/.test(kv.bouwKlantverhaalBlok(verhaalMetGezicht, { bedrijfsnaam: 'Hirs Installaties', mix: true })));
});

test('Hirs staat op mix', () => {
  assert.strictEqual(require('../src/lp/clients/hirs-installaties/profile').schrijfvorm, 'mix');
  assert.strictEqual(ai.schrijftInMix('hirs-installaties'), true);
});
