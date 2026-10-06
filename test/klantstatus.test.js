const test = require('node:test');
const assert = require('node:assert');
const { normaliseerKlantstatus, klantstatusMelding, KLANTSTATUS_WAARDEN } = require('../src/services/settings');

test('leeg of onbekend telt als actief', () => {
  assert.strictEqual(normaliseerKlantstatus(undefined), 'actief');
  assert.strictEqual(normaliseerKlantstatus(''), 'actief');
  assert.strictEqual(normaliseerKlantstatus('iets anders'), 'actief');
});

test('de drie statussen worden herkend, ook met hoofdletters', () => {
  assert.deepStrictEqual(KLANTSTATUS_WAARDEN, ['actief', 'gepauzeerd', 'beëindigd']);
  assert.strictEqual(normaliseerKlantstatus('Gepauzeerd'), 'gepauzeerd');
  assert.strictEqual(normaliseerKlantstatus(' beëindigd '), 'beëindigd');
});

test('alleen een niet actieve klant krijgt een melding', () => {
  assert.strictEqual(klantstatusMelding('actief'), '');
  assert.match(klantstatusMelding('gepauzeerd'), /gepauzeerd/);
  assert.match(klantstatusMelding('beëindigd'), /niet meer beschikbaar/);
});

test('requireLogin sluit een gepauzeerde klant af en laat een actieve klant door', async () => {
  const settings = require('../src/services/settings');
  const { requireLogin } = require('../src/middleware/auth');
  const { clients } = require('../src/config/clients');
  const id = clients[0].id;
  const origineel = settings.getClientSettings;
  const draai = async (status) => {
    settings.getClientSettings = async () => ({ klantstatus: status });
    const req = { params: { clientId: id }, body: {}, session: { clientId: id } };
    let uitkomst = { doorgelaten: false };
    const res = { status(c) { uitkomst.code = c; return this; }, json(b) { uitkomst.body = b; } };
    await requireLogin(req, res, () => { uitkomst.doorgelaten = true; });
    return uitkomst;
  };
  try {
    assert.strictEqual((await draai('actief')).doorgelaten, true);
    const gepauzeerd = await draai('gepauzeerd');
    assert.strictEqual(gepauzeerd.doorgelaten, false);
    assert.strictEqual(gepauzeerd.code, 403);
    assert.strictEqual(gepauzeerd.body.code, 'KLANT_INACTIEF');
    assert.strictEqual((await draai('beëindigd')).code, 403);
    settings.getClientSettings = async () => { throw new Error('Notion plat'); };
    const req = { params: { clientId: id }, body: {}, session: { clientId: id } };
    let door = false;
    await requireLogin(req, { status() { return this; }, json() {} }, () => { door = true; });
    assert.strictEqual(door, true, 'bij een storing blijft de klant actief');
  } finally {
    settings.getClientSettings = origineel;
  }
});
