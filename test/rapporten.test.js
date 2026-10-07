const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwRapport, maandLabel } = require('../src/services/rapporten');

test('maandLabel geeft Nederlandse maandnaam', () => {
  assert.equal(maandLabel('2026-09'), 'september 2026');
  assert.equal(maandLabel('2027-01'), 'januari 2027');
  assert.equal(maandLabel('rommel'), 'rommel');
});

test('bouwRapport leest JSON en blijft heel bij kapotte velden', () => {
  const r = bouwRapport({
    maand: '2026-09', periode_start: '2026-09-01', periode_eind: '2026-09-30', voortgang: '9 blogs staan live.',
    totalen: '{"clicks":2,"vertoningen":2207}', blogs: 'kapot', nieuwe_blogs: '[{"titel":"A","datum":"2026-09-10"}]',
    kansen: '[]', terugblik: '{"alinea":["Een.","","Twee."],"gemaakt_door":"regels"}', vooruitblik: null
  });
  assert.equal(r.label, 'september 2026');
  assert.equal(r.totalen.vertoningen, 2207);
  assert.deepEqual(r.blogs, []);
  assert.equal(r.nieuweBlogs.length, 1);
  assert.deepEqual(r.terugblik, ['Een.', 'Twee.']);
  assert.deepEqual(r.vooruitblik, []);
});
