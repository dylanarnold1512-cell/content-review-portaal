const test = require('node:test');
const assert = require('node:assert/strict');
const { maakControle, oplossingVoor } = require('../src/lp/controle');

test('geen fouten en geen waarschuwingen is ok', () => {
  const c = maakControle({ errors: [], warnings: [] });
  assert.equal(c.ok, true);
  assert.match(c.samenvatting, /Alles is in orde/);
});

test('fouten blokkeren en krijgen een oplosknop als de AI het kan oplossen', () => {
  const c = maakControle({ errors: ['Meta title ontbreekt.', 'Iets onbekends.'], warnings: [] });
  assert.equal(c.ok, false);
  assert.equal(c.fouten[0].soort, 'opnieuw');
  assert.ok(c.fouten[0].knop);
  assert.equal(c.fouten[1].knop, null);
  assert.match(c.samenvatting, /2 fouten blokkeren/);
});

test('waarschuwingen blokkeren niet', () => {
  const c = maakControle({ errors: [], warnings: ['De sectie met "Projecten" heeft geen inhoud en wordt niet gepubliceerd.'] });
  assert.equal(c.ok, true);
  assert.equal(c.letOp[0].soort, 'info');
  assert.match(c.samenvatting, /1 aandachtspunt\./);
});

test('lege invoer geeft geen fout', () => {
  assert.equal(maakControle().ok, true);
  assert.equal(oplossingVoor('x').knop, null);
});

test('pushDraft stuurt status publish alleen als erom gevraagd wordt', async () => {
  const verstuurd = [];
  process.env.T_URL = 'https://x.nl'; process.env.T_USER = 'u'; process.env.T_PW = 'p';
  const orig = global.fetch;
  global.fetch = async (url, opt) => { verstuurd.push(JSON.parse(opt.body)); return { ok: true, status: 200, json: async () => ({ id: 1, link: 'https://x.nl/a', status: 'publish', meta: {} }) }; };
  try {
    const { pushDraft } = require('../src/lp/wordpress');
    const profile = { id: 't', wordpress: { urlEnv: 'T_URL', usernameEnv: 'T_USER', appPasswordEnv: 'T_PW' } };
    await pushDraft({ profile, titel: 'a', html: '<p>x</p>' });
    await pushDraft({ profile, titel: 'a', html: '<p>x</p>', status: 'publish' });
    assert.equal(verstuurd[0].status, 'draft');
    assert.equal(verstuurd[1].status, 'publish');
  } finally { global.fetch = orig; }
});
