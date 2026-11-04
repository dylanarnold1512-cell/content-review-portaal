const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/services/backlog');
const m = require('../public/backlog.js');

const page = (titel, status, prioriteit, extra = {}) => ({
  id: titel, url: 'https://notion.so/' + titel, created_time: extra.aangemaakt || '2026-11-04T10:00:00Z', last_edited_time: '2026-11-04T10:00:00Z',
  properties: {
    Titel: { title: [{ plain_text: titel }] },
    Status: { type: 'status', status: { name: status } },
    Prioriteit: { select: prioriteit ? { name: prioriteit } : null },
    Type: { select: { name: 'Bouwen' } },
    Onderdeel: { select: { name: extra.onderdeel || 'Portaal' } },
    Klant: { select: { name: extra.klant || 'Alle klanten' } },
    Notitie: { rich_text: [{ plain_text: extra.notitie || '' }] },
    Bron: { rich_text: [] }
  }
});

test('een Notion pagina wordt een eenvoudig punt', () => {
  const r = s.normaliseerRij(page('Cockpit afmaken', 'Open', 'Binnenkort', { onderdeel: 'Admin' }));
  assert.equal(r.titel, 'Cockpit afmaken');
  assert.equal(r.status, 'Open');
  assert.equal(r.prioriteit, 'Binnenkort');
  assert.equal(r.onderdeel, 'Admin');
});

test('sorteren: Nu, Binnenkort, Later, Klaar onderaan', () => {
  const rijen = [page('a', 'Klaar', 'Nu'), page('b', 'Open', 'Later'), page('c', 'Open', 'Nu'), page('d', 'Open', 'Binnenkort')].map(s.normaliseerRij);
  assert.deepEqual(s.sorteer(rijen).map((r) => r.titel), ['c', 'd', 'b', 'a']);
});

test('afgeronde punten zijn standaard verborgen, tenzij erom gevraagd wordt', () => {
  const rijen = [page('a', 'Klaar', 'Nu'), page('b', 'Open', 'Nu')].map(s.normaliseerRij);
  assert.equal(m.filterPunten(rijen, {}).length, 1);
  assert.equal(m.filterPunten(rijen, { toonKlaar: true }).length, 2);
  assert.equal(m.filterPunten(rijen, { status: 'Klaar' }).length, 1);
});

test('filteren op onderdeel en zoeken in de notitie', () => {
  const rijen = [page('a', 'Open', 'Nu', { onderdeel: 'Pagr.' }), page('b', 'Open', 'Nu', { notitie: 'Sanity adapter' })].map(s.normaliseerRij);
  assert.deepEqual(m.filterPunten(rijen, { onderdeel: 'Pagr.' }).map((r) => r.titel), ['a']);
  assert.deepEqual(m.filterPunten(rijen, { zoek: 'sanity' }).map((r) => r.titel), ['b']);
});

test('groeperen op prioriteit en tellen wat op Dylan wacht', () => {
  const rijen = [page('a', 'Wacht op Dylan', 'Later'), page('b', 'Open', 'Nu'), page('c', 'Klaar', 'Nu')].map(s.normaliseerRij);
  assert.deepEqual(m.groepeer(rijen).map((g) => g.naam), ['Nu', 'Later', 'Klaar']);
  assert.equal(m.telWachtOpDylan(rijen), 1);
});

test('een onbekende status of prioriteit wordt geweigerd', async () => {
  await assert.rejects(() => s.zet('x', { status: 'Verzonnen' }), /Onbekende status/);
  await assert.rejects(() => s.zet('x', { prioriteit: 'Gisteren' }), /Onbekende prioriteit/);
  await assert.rejects(() => s.zet('x', {}), /Niets om aan te passen/);
});
