// Stap 14 (14-10-2026): dynamische Nieuwe klant en geen product tonen dat niet aanstaat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lees = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('de klant komt nooit bij een tab van een product dat niet aanstaat', () => {
  const app = lees('public/app.js');
  assert.match(app, /!pr\.pagr\) tab = 'overzicht'/);
  assert.match(app, /!pr\.blogr[^\n]*tab = 'pagrOverzicht'/);
});

test('het intakeformulier heeft productkeuze en secties per product', () => {
  const html = lees('public/admin.html');
  for (const w of ['Blogr.', 'Pagr.', 'Beide']) assert.ok(html.includes(`name="ikProduct" value="${w}"`), w);
  assert.match(html, /data-voor="Pagr\. Beide"/);
  assert.match(html, /data-voor="Blogr\. Beide"/);
  assert.match(html, /id="ikWatGebeurt"/);
});

test('het formulier stuurt bij Pagr. geen blogvelden mee', () => {
  const js = lees('public/admin.js');
  assert.match(js, /blogsPerMaand: ikBlogr\(\)/);
  assert.match(js, /tier: ikBlogr\(\)/);
  assert.match(js, /paginasPerMaand: ikPagr\(\)/);
});

test('zetNieuweKlant weigert een lege Client ID', async () => {
  const s = require('../src/services/settings');
  await assert.rejects(() => s.zetNieuweKlant('', 'X', {}), /Client ID/);
});
