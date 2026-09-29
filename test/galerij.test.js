// Tests voor src/lp/galerij.js: galerij / slideshow als vaste bouwsteen ({{galerij}}).
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPageHtml } = require('../src/lp/render');
const { pasGalerijToe, zorgVoorGalerijSlot, heeftGalerijMarker } = require('../src/lp/galerij');
const { buildVasteOnderdelenTekst, VASTE_ONDERDELEN_OPTIES } = require('../src/lp/ai');

const HTML = '<section class="hero"><h1>{{heroTitle}}</h1></section><section class="werk"><h2>Ons werk</h2>{{galerij}}</section>';
function blueprint(slots) {
  return { templateFormat: 'slots', htmlTemplate: HTML, cssTemplate: '', slots: slots || [{ key: 'heroTitle', type: 'text' }] };
}

test('marker wordt herkend en het slot galleryItems wordt vanzelf toegevoegd', () => {
  assert.ok(heeftGalerijMarker(HTML));
  const bp = zorgVoorGalerijSlot(blueprint());
  const slot = bp.slots.find((s) => s.key === 'galleryItems');
  assert.equal(slot.type, 'list');
  assert.deepEqual(slot.itemFields, ['imageSrc', 'imageAlt', 'caption']);
  // idempotent
  assert.equal(zorgVoorGalerijSlot(bp), bp);
});

test('een half gedeclareerd slot wordt aangevuld, zonder marker gebeurt er niets', () => {
  const bp = zorgVoorGalerijSlot(blueprint([{ key: 'galleryItems', type: 'list', itemFields: ['imageSrc'] }]));
  assert.deepEqual(bp.slots.find((s) => s.key === 'galleryItems').itemFields, ['imageSrc', 'imageAlt', 'caption']);
  const zonder = { ...blueprint(), htmlTemplate: '<section><h1>{{heroTitle}}</h1></section>' };
  assert.equal(zorgVoorGalerijSlot(zonder), zonder);
  assert.deepEqual(pasGalerijToe(zonder.htmlTemplate, { rootClass: 'x' }), { html: zonder.htmlTemplate, css: '' });
});

test('render: foto\'s komen uit galleryItems, css en script zitten erbij, secties blijven gelijk genummerd', () => {
  const html = renderPageHtml({
    clientId: 'macbouw', slug: 's', template: blueprint(),
    slotData: { heroTitle: 'T', galleryItems: [{ imageSrc: 'https://x.nl/a.jpg', imageAlt: 'Dakkapel', caption: 'Hillegom' }, { imageSrc: 'https://x.nl/b.jpg', imageAlt: 'Keuken', caption: '' }] }
  }, { forWordPress: true });
  assert.ok(html.includes('class="lp-galerij"'));
  assert.equal((html.match(/class="lp-galerij-slide"/g) || []).length, 2);
  assert.ok(html.includes('src="https://x.nl/a.jpg"'));
  assert.ok(html.includes('.lp-galerij-track'));
  assert.ok(html.includes('var(--lp-button-radius)'));
  assert.ok(html.includes('<script>(function()'));
  assert.ok(!html.includes('{{galerij}}'));
});

test('in het voorbeeld zijn de foto\'s klikbaar (data-lp-slot) zoals bij elke andere lijst', () => {
  const html = renderPageHtml({
    clientId: 'macbouw', slug: 's', template: blueprint(),
    slotData: { heroTitle: 'T', galleryItems: [{ imageSrc: '', imageAlt: '', caption: '' }] }
  }, { forPreview: true });
  assert.ok(html.includes('data-lp-slot="galleryItems.0.imageSrc"'));
});

test('een tweede marker wordt verwijderd, er komt hoogstens een galerij', () => {
  const { html } = pasGalerijToe('{{galerij}}<p>x</p>{{galerij}}', { rootClass: 'r' });
  assert.equal((html.match(/data-lp-galerij/g) || []).length, 1);
});

test('galerij staat als vinkje bij Vaste onderdelen en de AI krijgt de marker-uitleg', () => {
  assert.ok(VASTE_ONDERDELEN_OPTIES.includes('galerij'));
  const tekst = buildVasteOnderdelenTekst(['faq', 'galerij']);
  assert.ok(tekst.includes('{{galerij}}'));
  assert.ok(!buildVasteOnderdelenTekst(['faq']).includes('{{galerij}}'));
});
