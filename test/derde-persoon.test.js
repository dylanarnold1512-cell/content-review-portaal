const test = require('node:test');
const assert = require('node:assert');
const verhaal = require('../src/lp/verhaal');
const { derdePersoonBlok } = require('../src/lp/klantverhaal');

const slotData = {
  heroTitle: 'Badkamer renoveren in Haarlem',
  heroIntro: 'Wil je een nieuwe badkamer? Wij verzorgen de hele renovatie.',
  directAnswer: 'Hirs Installaties pakt de badkamer van begin tot eind aan. Nick plant het werk zelf.'
};

test('derde persoon: wij-vorm wordt gemeld', () => {
  const punten = verhaal.redactieControle(slotData, { bedrijfsnaam: 'Hirs Installaties', derdePersoon: true });
  assert.ok(punten.some((p) => /derde persoon/.test(p.tekst)));
});

test('derde persoon: hero zonder wij is geen afstandelijk punt', () => {
  const punten = verhaal.redactieControle({ heroIntro: 'Wil je een nieuwe badkamer? Nick plant het werk zelf en je weet vooraf waar je aan toe bent.' }, { bedrijfsnaam: 'Hirs Installaties', derdePersoon: true });
  assert.ok(!punten.some((p) => /afstandelijk/.test(p.tekst)));
});

test('standaard klanten behouden de wij-eis', () => {
  const punten = verhaal.redactieControle({ heroTitle: 'Badkamer renoveren', heroIntro: 'Wil je een nieuwe badkamer? Hirs Installaties pakt dat aan.', directAnswer: 'Een badkamer duurt ongeveer vier weken en je weet vooraf de prijs.' }, { bedrijfsnaam: 'Hirs Installaties' });
  assert.ok(punten.some((p) => /afstandelijk/.test(p.tekst)));
});

test('blok verbiedt wij', () => {
  assert.match(derdePersoonBlok('Hirs Installaties'), /NOOIT "wij"/);
});
