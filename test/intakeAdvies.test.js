// Stap 15 (14-10-2026): AI advies bij de intake.
const test = require('node:test');
const assert = require('node:assert/strict');
const { schoonAdvies, adviesVoorIntake, bouwAdviesPrompt, adviesAlsNotitie } = require('../src/services/intakeAdvies');

test('schoonAdvies haalt streepjes weg, begrenst lijsten en kent alleen toegestane aantallen', () => {
  const a = schoonAdvies({
    samenvatting: 'Bouwbedrijf – lokaal', kansen: ['a', 'b', 'c', 'd', 'e', 'f'],
    concurrenten: [{ naam: 'X', url: 'javascript:alert(1)', opvallend: 'snel' }, { naam: '' }],
    blogr: { onderwerpsrichtingen: ['een'], blogsPerMaand: 5 },
    pagr: { werkgebied: ['Haarlem'], paginasPerMaand: 4 }
  }, 'Beide');
  assert.equal(a.samenvatting, 'Bouwbedrijf, lokaal');
  assert.equal(a.kansen.length, 5);
  assert.equal(a.concurrenten.length, 1);
  assert.equal(a.concurrenten[0].url, '');
  assert.equal(a.blogr.blogsPerMaand, null);
  assert.equal(a.pagr.paginasPerMaand, 4);
});

test('bij Pagr. geen blogr deel en bij Blogr. geen pagr deel', () => {
  assert.equal(schoonAdvies({}, 'Pagr.').blogr, undefined);
  assert.ok(schoonAdvies({}, 'Pagr.').pagr);
  assert.equal(schoonAdvies({}, 'Blogr.').pagr, undefined);
});

test('adviesVoorIntake gebruikt de AI, de sitetekst en bronnen', async () => {
  const aiFn = async ({ userPrompt, systemPrompt }) => {
    assert.match(userPrompt, /SITETEKST/);
    assert.match(systemPrompt, /zelf op internet/);
    return { json: { samenvatting: 'ok', kansen: ['k'] }, bronnen: ['https://a.nl/x', 'ftp://slecht'], zocht: true };
  };
  const a = await adviesVoorIntake({ klant: 'K', website: 'k.nl', producten: 'Blogr.', aiFn, siteTekstFn: async () => 'SITETEKST' });
  assert.equal(a.websiteGelezen, true);
  assert.equal(a.zelfOnderzoek, true);
  assert.deepEqual(a.bronnen, ['https://a.nl/x']);
  assert.match(a.notitie, /AI advies: ok/);
});

test('adviesVoorIntake overleeft een site die niet te lezen is en vraagt om invoer', async () => {
  const aiFn = async () => ({ json: { samenvatting: 's' }, bronnen: [], zocht: false });
  const a = await adviesVoorIntake({ klant: 'K', producten: 'Pagr.', aiFn, siteTekstFn: async () => { throw new Error('x'); } });
  assert.equal(a.websiteGelezen, false);
  await assert.rejects(() => adviesVoorIntake({ aiFn }), /website of de klantnaam/);
});

test('prompt noemt het product en de extra input', () => {
  const { user } = bouwAdviesPrompt({ klant: 'K', website: 'k.nl', producten: 'Pagr.', extra: 'wil Haarlem', siteTekst: '' });
  assert.match(user, /Pagr\./);
  assert.match(user, /wil Haarlem/);
  assert.equal(adviesAlsNotitie({}), '');
});
