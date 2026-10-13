const test = require('node:test');
const assert = require('node:assert');
const Z = require('../public/zoekwoorden');

const blogs = [
  { zoekwoorden: [{ q: 'Vergaderen Utrecht', c: 1, i: 100, p: 10 }, { q: 'teamdag', c: 0, i: 50, p: 20 }] },
  { zoekwoorden: [{ q: 'vergaderen utrecht', c: 2, i: 300, p: 6 }, { q: '', c: 1, i: 1 }] },
  { zoekwoorden: null }
];

test('zoekwoorden worden per blog opgeteld en positie weegt mee op vertoningen', () => {
  const l = Z.samenvoegen(blogs);
  assert.strictEqual(l.length, 2);
  assert.strictEqual(l[0].q, 'Vergaderen Utrecht');
  assert.strictEqual(l[0].i, 400);
  assert.strictEqual(l[0].c, 3);
  assert.strictEqual(l[0].blogs, 2);
  assert.strictEqual(l[0].p, 7);
});

test('sorteren op bezoekers zet zoekwoorden met clicks bovenaan', () => {
  const l = Z.samenvoegen([{ zoekwoorden: [{ q: 'a', c: 0, i: 900 }, { q: 'b', c: 3, i: 10 }] }], 'bezoekers');
  assert.strictEqual(l[0].q, 'b');
});

test('html is leeg zonder data en escapet tekst', () => {
  assert.strictEqual(Z.html([]), '');
  const h = Z.html(Z.samenvoegen([{ zoekwoorden: [{ q: '<b>x</b>', c: 1, i: 5, p: 3 }] }]));
  assert.ok(h.includes('&lt;b&gt;'));
  assert.ok(!h.includes('<b>x'));
});
