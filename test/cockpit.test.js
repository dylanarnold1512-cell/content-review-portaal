const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/cockpit');
const model = require('../public/cockpit.js');

const NU = new Date('2026-10-27T12:00:00Z').getTime();
const sv = { idea: 'Idee', planned: 'Gepland', generating: 'In generatie', review: 'Ter review', approved: 'Goedgekeurd', published: 'Gepubliceerd' };
const blog = (status, datum, extra = {}) => ({ titel: `Blog ${status} ${datum || ''}`, status, publicatiedatum: datum || '', laatstGewijzigd: '2026-10-27T11:00:00Z', ...extra });
const signalen = (blogs, opts = {}) => c.blogSignalen(blogs, { statussen: sv, blogsPerMaand: null, nu: NU, ...opts }).signalen;
const niveaus = (lijst) => lijst.map((s) => s.niveau);

test('een gezonde planning geeft geen rode of oranje signalen', () => {
  const s = signalen([blog('Gepubliceerd', '2026-10-20'), blog('Gepland', '2026-11-03')]);
  assert.deepEqual(niveaus(s).filter((n) => n !== 'info'), []);
});

test('een blog op Fout is rood en noemt de titel', () => {
  const s = signalen([blog('Fout', '2026-10-26'), blog('Gepubliceerd', '2026-10-20'), blog('Gepland', '2026-11-03')]);
  assert.equal(s[0].niveau, 'rood');
  assert.match(s[0].tekst, /1 blog staat op Fout/);
  assert.equal(s[0].details.length, 1);
});

test('In generatie is pas vastgelopen na 6 uur', () => {
  const kort = signalen([blog('In generatie', '2026-10-28', { laatstGewijzigd: '2026-10-27T09:00:00Z' }), blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(!kort.some((x) => /hangt/.test(x.tekst)));
  const lang = signalen([blog('In generatie', '2026-10-28', { laatstGewijzigd: '2026-10-26T20:00:00Z' }), blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(lang.some((x) => x.niveau === 'rood' && /hangt/.test(x.tekst)));
});

test('een geplande blog met een datum die ruim voorbij is, is oranje', () => {
  const s = signalen([blog('Gepland', '2026-10-20'), blog('Gepland', '2026-11-01'), blog('Gepubliceerd', '2026-10-19')]);
  assert.ok(s.some((x) => x.niveau === 'oranje' && /niet geschreven/.test(x.tekst)));
  const gisteren = signalen([blog('Gepland', '2026-10-26'), blog('Gepubliceerd', '2026-10-19')]);
  assert.ok(!gisteren.some((x) => /niet geschreven/.test(x.tekst)));
});

test('een lege planning geeft oranje, behalve bij 0 blogs per maand', () => {
  const s = signalen([blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(s.some((x) => x.niveau === 'oranje' && /Geen blog gepland/.test(x.tekst)));
  assert.ok(!signalen([blog('Gepubliceerd', '2026-10-20')], { blogsPerMaand: 0 }).some((x) => /Geen blog gepland/.test(x.tekst)));
  assert.ok(!signalen([blog('Gepubliceerd', '2026-10-20'), blog('Ter review', '2026-12-20')]).some((x) => /Geen blog gepland/.test(x.tekst)));
});

test('lang geen publicatie is oranje, nog nooit gepubliceerd is alleen info', () => {
  assert.ok(signalen([blog('Gepubliceerd', '2026-09-01'), blog('Gepland', '2026-11-01')]).some((x) => x.niveau === 'oranje' && /Laatste publicatie/.test(x.tekst)));
  const nieuw = signalen([blog('Gepland', '2026-11-01')]);
  assert.deepEqual(niveaus(nieuw), ['info']);
});

test('mislukte runs: laatste 48 uur rood, ouder oranje, gegroepeerd per workflow', () => {
  const s = c.foutSignalen([
    { id: '1', workflowId: 'a', workflowNaam: 'BA - BCU - Blog Generatie', startedAt: '2026-10-27T06:00:00Z', bericht: 'Notion 400', node: 'Haal blogs op' },
    { id: '2', workflowId: 'a', workflowNaam: 'BA - BCU - Blog Generatie', startedAt: '2026-10-24T06:00:00Z' },
    { id: '3', workflowId: 'b', workflowNaam: 'BA - BCU - Publicatie Sync', startedAt: '2026-10-22T06:00:00Z' }
  ], NU);
  assert.equal(s.length, 2);
  const a = s.find((x) => /Blog Generatie/.test(x.tekst));
  assert.equal(a.niveau, 'rood');
  assert.match(a.tekst, /2 mislukte runs/);
  assert.match(a.details[0], /Haal blogs op: Notion 400/);
  assert.match(a.link, /\/workflow\/a\/executions\/1$/);
  assert.equal(s.find((x) => /Publicatie/.test(x.tekst)).niveau, 'oranje');
});

test('workflows worden aan de juiste klant gekoppeld', () => {
  assert.equal(c.klantVanWorkflow('BA - BCU - Blog Generatie'), 'basecamp-utrecht');
  assert.equal(c.klantVanWorkflow('BA - PPE - Topic Generator'), 'ppe');
  assert.equal(c.klantVanWorkflow('BA - Shared - Blog Generatie'), null);
  assert.ok(c.isBlogWorkflow('BA - Shared - Blog Generatie'));
  assert.ok(!c.isBlogWorkflow('BA - Test - Blogprompt Shared TBG'));
  assert.ok(!c.isBlogWorkflow('Excel Rapportages - Alle Klanten'));
});

test('verwacht interval uit de schedule trigger', () => {
  const wf = (rule) => ({ nodes: [{ type: 'n8n-nodes-base.scheduleTrigger', parameters: { rule } }] });
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'hours' }] })), 1);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'days', triggerAtHour: 8 }] })), 24);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'weeks' }] })), 168);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'months' }] })), 744);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'cronExpression', expression: '0 9 * * *' }] })), 24);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'cronExpression', expression: '0 * * * 1' }] })), 168);
  assert.equal(c.verwachtInterval({ nodes: [{ type: 'n8n-nodes-base.webhook' }] }), null);
});

test('stilgevallen pas na twee keer het interval plus marge', () => {
  assert.equal(c.isStilgevallen(24, '2026-10-26T08:00:00Z', NU), false);
  assert.equal(c.isStilgevallen(24, '2026-10-24T08:00:00Z', NU), true);
  assert.equal(c.isStilgevallen(1, '2026-10-27T10:00:00Z', NU), false);
  assert.equal(c.isStilgevallen(1, '2026-10-27T06:00:00Z', NU), true);
  assert.equal(c.isStilgevallen(24, null, NU), false);
});

test('kleur en volgorde: rood boven oranje boven groen boven uit', () => {
  assert.equal(c.kleurVan([{ niveau: 'info' }]), 'groen');
  assert.equal(c.kleurVan([{ niveau: 'oranje' }, { niveau: 'rood' }]), 'rood');
  const lijst = c.sorteerKlanten([{ naam: 'B', kleur: 'groen' }, { naam: 'A', kleur: 'uit' }, { naam: 'C', kleur: 'rood' }, { naam: 'D', kleur: 'oranje' }]);
  assert.deepEqual(lijst.map((k) => k.naam), ['C', 'D', 'B', 'A']);
});

test('menu teller telt rode en oranje klanten en de gedeelde workflows', () => {
  const data = { klanten: [{ kleur: 'rood' }, { kleur: 'oranje' }, { kleur: 'groen' }, { kleur: 'uit' }], gedeeld: { kleur: 'rood' } };
  assert.equal(model.aandacht(data), 3);
  assert.equal(model.aandacht({ klanten: [{ kleur: 'groen' }], gedeeld: { kleur: 'groen' } }), 0);
});

test('bekijk als klant: een admin komt door requireLogin, ook bij een gepauzeerde klant', async () => {
  const settings = require('../src/services/settings');
  const { requireLogin } = require('../src/middleware/auth');
  const origineel = settings.getClientSettings;
  settings.getClientSettings = async () => ({ klantstatus: 'gepauzeerd' });
  try {
    let door = false;
    await requireLogin({ params: { clientId: 'ppe' }, body: {}, session: { clientId: 'ppe', isAdmin: true } }, {}, () => { door = true; });
    assert.equal(door, true);
  } finally {
    settings.getClientSettings = origineel;
  }
});
