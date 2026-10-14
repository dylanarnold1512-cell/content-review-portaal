// Tests voor het Overzicht en de Resultaten van klanten met alleen Pagr. (stap 13).
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
global.document = { addEventListener() {} };
const { somResultaten, volgende, recentLive } = require('../public/paginas.js');

const paginas = [
  { titel: 'A', stand: 'Live', liveDatum: '2026-10-01', google: { klikken: 5, vertoningen: 100 }, ai: { geciteerd: 2 } },
  { titel: 'B', stand: 'Live', liveDatum: '2026-10-10', google: { klikken: 0, vertoningen: 0 }, ai: { geciteerd: 0 } },
  { titel: 'C', stand: 'Gepland' }, { titel: 'D', stand: 'Gepland' }, { titel: 'E', stand: 'In de maak' }
];

test('somResultaten telt alleen live pagina\'s met metingen mee', () => {
  assert.deepEqual(somResultaten(paginas), { live: 2, metGoogle: 1, klikken: 5, vertoningen: 100, genoemd: 1 });
  assert.equal(somResultaten([]).live, 0);
});

test('volgende en recentLive kiezen de juiste pagina\'s', () => {
  assert.deepEqual(volgende(paginas, 1).map((p) => p.titel), ['C']);
  assert.deepEqual(recentLive(paginas).map((p) => p.titel), ['B', 'A']);
});
