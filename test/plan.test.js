// Tests voor src/lp/plan.js (Pagr. stap 3, 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterVoorstellen, maakPlanVoorstel, invoerVoorGoedgekeurd, bouwPlanPrompt } = require('../src/lp/plan');

test('filterVoorstellen haalt bestaande en dubbele pagina\'s weg', () => {
  const { behouden, dubbel } = filterVoorstellen([
    { titel: 'Bouwbedrijf Zandvoort', dienst: 'bouwbedrijf', plaats: 'Zandvoort' },
    { titel: 'Dakkapel plaatsen', dienst: 'dakkapel', plaats: '' },
    { titel: 'Dakkapel plaatsen', dienst: 'dakkapel', plaats: '' },
    { titel: 'Badkamer verbouwen Lisse', dienst: 'badkamer verbouwen', plaats: 'Lisse' }
  ], [{ titel: 'Bouwbedrijf Zandvoort' }]);
  assert.deepEqual(behouden.map((v) => v.titel), ['Dakkapel plaatsen', 'Badkamer verbouwen Lisse']);
  assert.equal(dubbel.length, 2);
});

test('filterVoorstellen ziet een plaatspagina met andere titel als bestaand', () => {
  const { behouden, dubbel } = filterVoorstellen(
    [{ titel: 'Aannemer in Haarlem', dienst: 'aannemer', plaats: 'Haarlem' }],
    [{ titel: 'Aannemer Haarlem en omstreken' }]
  );
  assert.equal(behouden.length, 0);
  assert.equal(dubbel.length, 1);
});

test('maakPlanVoorstel gebruikt de AI, filtert en voegt een zoeksignaal toe', async () => {
  const aiFn = async ({ userPrompt }) => {
    assert.match(userPrompt, /Bouwbedrijf Haarlem/);
    return { voorstellen: [
      { titel: 'Bouwbedrijf Haarlem', dienst: 'bouwbedrijf', plaats: 'Haarlem', reden: 'bestaat al' },
      { titel: 'Dakkapel plaatsen', soort: 'dienst', dienst: 'dakkapel plaatsen', plaats: '', reden: 'Veel gezocht' }
    ] };
  };
  const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify(['x', ['dakkapel plaatsen kosten', 'dakkapel plaatsen vergunning']]) });
  const uit = await maakPlanVoorstel({
    klant: 'macbouw', aantal: 4, bestaandePaginas: [{ titel: 'Bouwbedrijf Haarlem' }], klantTekst: 'tekst', aiFn, fetchImpl
  });
  assert.equal(uit.voorstellen.length, 1);
  assert.equal(uit.voorstellen[0].titel, 'Dakkapel plaatsen');
  assert.equal(uit.voorstellen[0].signaal, 2);
  assert.equal(uit.dubbel.length, 1);
});

test('maakPlanVoorstel begrenst het aantal en overleeft een fout in het zoeksignaal', async () => {
  const aiFn = async () => ({ voorstellen: Array.from({ length: 10 }, (_, i) => ({ titel: `Pagina ${i}`, dienst: `dienst${i}`, plaats: '' })) });
  const kapot = async () => { throw new Error('netwerk'); };
  const uit = await maakPlanVoorstel({ klant: 'k', aantal: 3, bestaandePaginas: [], klantTekst: '', aiFn, fetchImpl: kapot });
  assert.equal(uit.voorstellen.length, 3);
  assert.equal(uit.voorstellen[0].signaal, 0);
});

test('invoerVoorGoedgekeurd zet plaats, dienst en plan in de invoer', () => {
  const inv = invoerVoorGoedgekeurd({ titel: 'Dakkapel plaatsen', dienst: 'dakkapel', plaats: 'Lisse', soort: 'dienst in plaats', reden: 'x', signaal: 5 });
  assert.equal(inv.plaatsnaam, 'Lisse');
  assert.equal(inv.dienstFocus, 'dakkapel');
  assert.equal(inv.plan.status, 'goedgekeurd');
  assert.equal(inv.plan.signaal, 5);
});

test('bouwPlanPrompt noemt het aantal en de bestaande pagina\'s', () => {
  const { systeem, user } = bouwPlanPrompt({ klantTekst: 'KLANT', bestaande: ['A', 'B'], aantal: 4, wens: 'meer plaatsen' });
  assert.match(systeem, /Verzin geen/);
  assert.match(user, /- A/);
  assert.match(user, /meer plaatsen/);
});
