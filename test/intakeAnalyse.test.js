const test = require('node:test');
const assert = require('node:assert');
const { analyseerHtml, slugify, naamUitTitel, isPrivateIp, analyseerWebsite } = require('../src/services/intakeAnalyse');

test('slugify maakt een nette slug', () => {
  assert.strictEqual(slugify('Basecamp Utrecht'), 'basecamp-utrecht');
  assert.strictEqual(slugify('Café & Zo B.V.'), 'cafe-en-zo-b-v');
});

test('naamUitTitel pakt het eerste deel van de paginatitel', () => {
  assert.strictEqual(naamUitTitel('Basecamp Utrecht | Vergaderen'), 'Basecamp Utrecht');
  assert.strictEqual(naamUitTitel('Trockenblumen Großhandel - Home'), 'Trockenblumen Großhandel');
  assert.strictEqual(naamUitTitel(''), '');
});

test('analyseerHtml leest titel, omschrijving en taal', () => {
  const r = analyseerHtml('<html lang="nl-NL"><head><title>Acme &amp; Zn | Home</title><meta name="description" content="Wij maken ankers."><meta property="og:site_name" content="Acme en Zonen"></head></html>', 'https://www.acme.nl/');
  assert.strictEqual(r.naam, 'Acme en Zonen');
  assert.strictEqual(r.beschrijving, 'Wij maken ankers.');
  assert.strictEqual(r.taal, 'nl');
});

test('analyseerHtml valt terug op het domein zonder titel', () => {
  const r = analyseerHtml('<html></html>', 'https://www.mijn-bedrijf.nl/');
  assert.strictEqual(r.naam, 'Mijn Bedrijf');
});

test('interne adressen worden geweigerd', async () => {
  assert.ok(isPrivateIp('10.0.0.5'));
  assert.ok(isPrivateIp('192.168.1.1'));
  assert.ok(!isPrivateIp('8.8.8.8'));
  await assert.rejects(() => analyseerWebsite('http://localhost:3000'), /niet worden opgehaald/);
  await assert.rejects(() => analyseerWebsite('http://127.0.0.1'), /niet worden opgehaald/);
  await assert.rejects(() => analyseerWebsite(''), /website/);
});
