const test = require('node:test');
const assert = require('node:assert');
const V = require('../public/portaal-verhaal.js');

const punten = [
  { label: 'Week van 6 jul', waarde: 10 },
  { label: 'Week van 13 jul', waarde: 30, nieuw: 'Blog A' },
  { label: 'Week van 20 jul', waarde: 20, deels: true },
];

test('vlak: bevat data per week voor de hover en een x-as', () => {
  const h = V.vlak(punten, { titel: 'Verloop', eenheid: 'keer getoond' });
  assert.ok(h.includes('data-v-punten'));
  assert.ok(h.includes('data-v-eenheid="keer getoond"'));
  assert.ok(h.includes('v-vlak-x'));
  assert.ok(h.includes('Blog A'));
});

test('vlak: lege reeks geeft niets terug', () => {
  assert.strictEqual(V.vlak([], {}), '');
});

test('staven: label alleen bij elke n-de kolom, tooltip-data in elke kolom', () => {
  const weken = Array.from({ length: 24 }, (_, i) => ({ label: 'Week van ' + (i + 1) + ' jul', waarde: i }));
  const h = V.staven(weken, { eenheid: 'bezoekers' });
  assert.strictEqual((h.match(/data-v-tip=/g) || []).length, 24);
  const gevuld = (h.match(/v-staaf-lbl">[^<]+</g) || []).length;
  assert.ok(gevuld <= 6, 'maximaal 6 labels, kreeg ' + gevuld);
  assert.ok(!h.includes('>Week van'));
});

test('inklap: details-element met titel, aantal en inhoud, open op verzoek', () => {
  const dicht = V.inklap({ titel: 'Kansen', aantal: 3, inhoud: '<p>x</p>' });
  const open = V.inklap({ titel: 'Kansen', aantal: 3, open: true, inhoud: '<p>x</p>' });
  assert.ok(dicht.startsWith('<details'));
  assert.ok(!/<details[^>]*\sopen/.test(dicht));
  assert.ok(/<details[^>]*\sopen/.test(open));
  assert.ok(dicht.includes('Kansen') && dicht.includes('<p>x</p>'));
});

test('vlak en staven: periode maand komt in de markup voor de hover', () => {
  const v = V.vlak(punten, { periode: 'maand' });
  const s = V.staven(punten, { periode: 'maand' });
  assert.ok(v.includes('data-v-periode="maand"'));
  assert.ok(s.includes('data-v-periode="maand"'));
  assert.ok(V.vlak(punten, {}).includes('data-v-periode="week"'));
});
