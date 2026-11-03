const test = require('node:test');
const assert = require('node:assert/strict');
const { kiesVoorbeelden, bouwMailTekst, sectieSheet, sectieVoorbeelden, OPDRACHT_MAIL } = require('../src/services/mailPakket');

const rijen = [
  { klant: 'JMB Bouw', periode: '2026-09', tekst: 'Mail JMB sep', toegevoegd: '2026-11-03T10:00:00Z' },
  { klant: 'Bubbelbroeders', periode: '2026-08', tekst: 'BB aug oud', toegevoegd: '2026-11-03T10:00:00Z' },
  { klant: 'Bubbelbroeders', periode: '2026-08', tekst: 'BB aug nieuw', toegevoegd: '2026-11-03T11:00:00Z' },
  { klant: 'Bubbelbroeders', periode: '2026-09', tekst: 'BB sep', toegevoegd: '2026-11-03T10:00:00Z' },
  { klant: 'Bubbelbroeders', periode: '2026-07', tekst: 'BB jul', toegevoegd: '2026-11-03T10:00:00Z' },
  { klant: 'Bubbelbroeders', periode: '2026-06', tekst: '   ', toegevoegd: '2026-11-03T10:00:00Z' }
];

test('kiesVoorbeelden pakt per klant de nieuwste twee perioden en de laatst toegevoegde tekst', () => {
  const v = kiesVoorbeelden(rijen, 'Bubbelbroeders', 2);
  assert.deepEqual(v.map((x) => x.periode), ['2026-09', '2026-08']);
  assert.equal(v[1].tekst, 'BB aug nieuw');
  assert.equal(kiesVoorbeelden(rijen, 'JMB Bouw', 2).length, 1);
  assert.deepEqual(kiesVoorbeelden(rijen, 'Onbekend', 2), []);
});

test('sectieSheet toont de rijen per tabblad en meldt een fout', () => {
  const t = sectieSheet({ tabbladen: [{ tabblad: '2026', rijen: [['Resultaten Google Ads', 'januari', 'februari'], ['Klikken', '10', '12']] }] }, 2, 2026).join('\n');
  assert.match(t, /Tabblad 2026:/);
  assert.match(t, /Klikken \| 10 \| 12/);
  assert.match(sectieSheet({ fout: 'status 500' }, 2, 2026).join('\n'), /kon niet worden gelezen/);
});

test('sectieVoorbeelden meldt ontbrekende en te weinig voorbeelden', () => {
  assert.match(sectieVoorbeelden([]).join('\n'), /nog geen voorbeeldmails/);
  assert.match(sectieVoorbeelden([{ periode: '2026-09', tekst: 'Hoi' }]).join('\n'), /maar 1 voorbeeldmail/);
  assert.ok(!/maar \d voorbeeldmail/.test(sectieVoorbeelden([{ periode: '2026-09', tekst: 'a' }, { periode: '2026-08', tekst: 'b' }]).join('\n')));
});

test('bouwMailTekst zet de mailopdracht bovenaan en neemt sheet, voorbeelden en wens mee', () => {
  const t = bouwMailTekst({
    klant: 'JMB Bouw', jaar: 2026, maand: 9, context: 'Budget verhoogd', mailWens: 'Vraag naar werkgebied',
    verdieping: { google: null, linkedin: null, meta: null }, opties: {},
    sheet: { tabbladen: [{ tabblad: '2026', rijen: [['Klikken', '167']] }], fouten: [{ tabblad: '2025', fout: 'geen gegevens' }] },
    voorbeeldMails: [{ periode: '2026-08', tekst: 'Jesse! Bij deze de rapportage.' }], kanttekeningen: ['Test kanttekening']
  });
  assert.ok(t.startsWith('MAILPAKKET JMB BOUW, SEPTEMBER 2026'));
  assert.ok(t.indexOf(OPDRACHT_MAIL[0]) < t.indexOf('CONTEXT VAN DYLAN'));
  assert.match(t, /WAT DYLAN IN DEZE MAIL KWIJT WIL\nVraag naar werkgebied/);
  assert.match(t, /Jesse! Bij deze de rapportage\./);
  assert.match(t, /Klikken \| 167/);
  assert.match(t, /Test kanttekening/);
  assert.match(t, /tabblad 2025 van het Sheet kon niet worden gelezen/);
  assert.ok(!/ACTIEPUNTEN VAN VORIGE MAAND/.test(t));
  assert.ok(!/ - /.test(OPDRACHT_MAIL.join('\n')));
});
