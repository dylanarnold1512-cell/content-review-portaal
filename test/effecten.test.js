const test = require('node:test');
const assert = require('node:assert');
const { bouwEffecten, linkItem } = require('../src/services/effecten');

const rij = (extra) => ({ soort: 'interne_link', blog_pad: '/doel', blog_titel: 'Doelpagina', blog_url: 'https://x.nl/doel', actiedatum: '2026-09-01', details: JSON.stringify({ aantal: 2, voor: { vertoningen: 100, positie: 12, betrouwbaar: true } }), ...extra });

test('interne link zonder meting wacht op de eerste meting', () => {
  const i = linkItem(rij(), null);
  assert.strictEqual(i.gemetenNa, null);
  assert.match(i.regels[0], /2 links/);
  assert.match(i.regels[1], /31 dagen/);
});

test('interne link met meting vergelijkt met de 28 dagen ervoor', () => {
  const i = linkItem(rij({ meting_28: JSON.stringify({ vertoningen: 150, clicks: 3, positie: 9.5, gemeten_op: '2026-10-02' }) }), null);
  assert.strictEqual(i.gemetenNa, 28);
  assert.match(i.regels.join(' '), /150 keer getoond, tegenover 100/);
  assert.match(i.regels.join(' '), /van 12,0 naar 9,5/);
});

test('interne link zonder betrouwbare baseline toont alleen de meting', () => {
  const det = JSON.stringify({ aantal: 1, voor: { vertoningen: 0, betrouwbaar: false } });
  const i = linkItem(rij({ details: det, meting_28: JSON.stringify({ vertoningen: 40, gemeten_op: '2026-10-02' }) }), null);
  assert.doesNotMatch(i.regels.join(' '), /tegenover/);
  assert.match(i.regels.join(' '), /40 keer getoond/);
  assert.match(i.regels[0], /1 link /);
});

test('bouwEffecten neemt interne links mee en filtert op maand', () => {
  const r = rij({ meting_28: JSON.stringify({ vertoningen: 5, gemeten_op: '2026-10-02' }) });
  assert.strictEqual(bouwEffecten([r], [], null).items.length, 1);
  assert.strictEqual(bouwEffecten([r], [], '2026-10').items.length, 1);
  assert.strictEqual(bouwEffecten([r], [], '2026-11').items.length, 0);
});
