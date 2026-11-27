const test = require('node:test');
const assert = require('node:assert');
const { volgendePublicatie } = require('../src/services/publicatieMoment');
const Goedkeuren = require('../public/goedkeuren');

const om = (iso, extra) => volgendePublicatie({ clientId: 'hirs-installaties', nu: new Date(iso), ...extra });

test('voor 11:00 gaat een goedgekeurde blog vandaag om 11:00 live', () => {
  assert.deepStrictEqual(om('2026-11-27T09:55:00+01:00'), { moment: '2026-11-27T10:00:00.000Z', tekst: 'vandaag om 11:00' });
});

test('vanaf 11:00 is het morgen om 11:00', () => {
  assert.strictEqual(om('2026-11-27T11:00:00+01:00').tekst, 'morgen om 11:00');
  assert.strictEqual(om('2026-11-27T23:59:00+01:00').moment, '2026-11-28T10:00:00.000Z');
});

test('vlak na middernacht in Nederland is het alweer vandaag', () => {
  assert.strictEqual(om('2026-11-28T00:30:00+01:00').tekst, 'vandaag om 11:00');
});

test('zomertijd en de nacht van de wisseling blijven op 11:00 Nederlandse tijd', () => {
  assert.strictEqual(om('2026-07-01T08:00:00+02:00').moment, '2026-07-01T09:00:00.000Z');
  assert.strictEqual(om('2026-10-24T12:00:00+02:00').moment, '2026-10-25T10:00:00.000Z');
  assert.strictEqual(om('2027-03-27T12:00:00+01:00').moment, '2027-03-28T09:00:00.000Z');
});

test('PPExport publiceert elk uur', () => {
  const r = volgendePublicatie({ clientId: 'ppe', nu: new Date('2026-11-27T09:55:00+01:00') });
  assert.deepStrictEqual(r, { moment: '2026-11-27T09:00:00.000Z', tekst: 'binnen een uur' });
});

test('met vertraging: de eerste ronde na de wachttijd, met de dag erbij', () => {
  const r = om('2026-11-27T09:00:00+01:00', { vertragingUren: 48 });
  assert.strictEqual(r.tekst, 'zondag 29 november om 11:00');
  assert.strictEqual(om('2026-11-27T09:00:00+01:00', { vertragingUren: 1 }).tekst, 'vandaag om 11:00');
});

test('al goedgekeurd met vertraging: gerekend vanaf het moment van goedkeuren', () => {
  const r = om('2026-11-28T09:00:00+01:00', { vertragingUren: 24, goedgekeurdOp: '2026-11-27T08:00:00+01:00' });
  assert.strictEqual(r.tekst, 'vandaag om 11:00');
  // Langer geleden goedgekeurd en nog niet live: de eerstvolgende ronde.
  assert.strictEqual(om('2026-11-28T12:00:00+01:00', { goedgekeurdOp: '2026-11-20T08:00:00+01:00' }).tekst, 'morgen om 11:00');
});

test('Basecamp Utrecht kent geen vertraging', () => {
  const r = volgendePublicatie({ clientId: 'basecamp-utrecht', vertragingUren: 72, nu: new Date('2026-11-27T09:00:00+01:00') });
  assert.strictEqual(r.tekst, 'vandaag om 11:00');
});

test('de knop en de uitleg noemen het moment', () => {
  const live = om('2026-11-27T09:55:00+01:00');
  assert.strictEqual(Goedkeuren.knopTekst(live), 'Goedkeuren, vandaag om 11:00 live');
  assert.strictEqual(Goedkeuren.uitlegTekst(live, '2026-11-28'), 'Keur je deze blog goed, dan staat hij vandaag om 11:00 op je website. Dat is eerder dan de geplande datum van 28 november 2026.');
  assert.strictEqual(Goedkeuren.uitlegTekst(live, '2026-11-27'), 'Keur je deze blog goed, dan staat hij vandaag om 11:00 op je website.');
  assert.strictEqual(Goedkeuren.goedgekeurdTekst(live), 'Goedgekeurd. Deze blog gaat vandaag om 11:00 live.');
});

test('zonder moment blijft de knop gewoon Goedkeuren', () => {
  assert.strictEqual(Goedkeuren.knopTekst(undefined), 'Goedkeuren');
  assert.strictEqual(Goedkeuren.uitlegTekst(null, '2026-11-28'), '');
});
