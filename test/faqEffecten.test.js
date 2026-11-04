const test = require('node:test');
const assert = require('node:assert');
const { faqItem, bouwFaqItems } = require('../src/services/faqEffecten');
const { bouwEffecten } = require('../src/services/effecten');

const rij = { klant: 'K', prompt_id: 'p1', vraag: 'Wat kost een badkamer?', pagina_titel: 'Badkamer', pagina_url: 'https://x.nl/b', status: 'toegepast', toegepast: '2026-10-01T08:00:00.000Z' };
const m = (datum, genoemd, platform = 'chatgpt', extra = {}) => ({ prompt_id: 'p1', datum, genoemd, platform, ...extra });
const metingen = [m('2026-09-10', false), m('2026-09-20', false, 'gemini'), m('2026-09-25', true), m('2026-10-05', true), m('2026-10-12', true, 'gemini'), m('2026-10-20', false), m('2026-10-28', true)];

test('minder dan 28 dagen na toepassen: wacht op de eerste meting', () => {
  const i = faqItem(rij, metingen, '2026-10-20', null);
  assert.strictEqual(i.gemetenNa, null);
  assert.match(i.regels.join(' '), /28 dagen na de aanpassing/);
});

test('na 28 dagen: vergelijkt dezelfde vraag voor en na', () => {
  const i = faqItem(rij, metingen, '2026-11-03', null);
  assert.strictEqual(i.gemetenNa, 28);
  assert.match(i.regels.join(' '), /1 van 3 antwoorden/);
  assert.match(i.regels.join(' '), /3 van 4 antwoorden/);
  assert.strictEqual(i.soortLabel, 'Veelgestelde vraag toegevoegd');
});

test('te weinig metingen voor of na telt niet als meting', () => {
  const i = faqItem(rij, [m('2026-10-05', true)], '2026-11-03', null);
  assert.strictEqual(i.gemetenNa, null);
});

test('fouten en andere vragen tellen niet mee', () => {
  const extra = metingen.concat([m('2026-10-06', true, 'chatgpt', { fout: 'timeout' }), { prompt_id: 'p2', datum: '2026-10-06', genoemd: true, platform: 'chatgpt' }]);
  assert.match(faqItem(rij, extra, '2026-11-03', null).regels.join(' '), /3 van 4 antwoorden/);
});

test('maandrapport: alleen metingen waarvan het meetmoment in die maand valt', () => {
  const okt = bouwFaqItems([rij], metingen, '2026-11-10', '2026-10');
  assert.strictEqual(okt[0].gemetenNa, 28);
  assert.strictEqual(bouwEffecten([], [], '2026-10', okt).items.length, 1);
  const nov = bouwFaqItems([rij], metingen, '2026-11-10', '2026-11');
  assert.strictEqual(bouwEffecten([], [], '2026-11', nov).items.length, 0);
});

test('alleen toegepaste rijen met datum tellen', () => {
  assert.strictEqual(bouwFaqItems([{ ...rij, status: 'goedgekeurd' }, { ...rij, toegepast: '' }], metingen, '2026-11-03').length, 0);
});
