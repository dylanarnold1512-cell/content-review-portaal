const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/lp/projecten');

const post = (id, titel, excerpt, foto = 'https://x.nl/f.jpg') => ({
  id, link: `https://x.nl/${id}/`, title: { rendered: titel }, excerpt: { rendered: `<p>${excerpt}</p>` },
  _embedded: { 'wp:featuredmedia': foto ? [{ source_url: foto, alt_text: 'alt' }] : [] }
});

test('haalProjecten sluit de blogcategorie uit en slaat berichten zonder foto over', async () => {
  P._wisCache();
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes('/categories')) return { ok: true, json: async () => [{ id: 7 }] };
    return { ok: true, json: async () => [post(1, 'Badkamer verbouwing in Heemstede', 'Een complete badkamer &amp; meer [&hellip;]'), post(2, 'Zonder foto', 'tekst', '')] };
  };
  const r = await P.haalProjecten({ bedrijf: { url: 'https://x.nl/' }, wordpress: { blogCategorie: 'kennisbank' } }, { fetchFn });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].tekst, 'Een complete badkamer & meer');
  assert.ok(urls.some((u) => u.includes('categories_exclude=7')));
});

test('haalProjecten gooit nooit bij een fout', async () => {
  P._wisCache();
  const r = await P.haalProjecten({ bedrijf: { url: 'https://kapot.nl' }, wordpress: {} }, { fetchFn: async () => { throw new Error('netwerk'); } });
  assert.deepStrictEqual(r, []);
});

test('kiesProjecten kiest alleen projecten die bij het onderwerp passen', () => {
  const lijst = [
    { id: 1, titel: 'Gasheater vervangen in Haarlem', tekst: 'Een gasheater.' },
    { id: 2, titel: 'Badkamer verbouwing in Heemstede', tekst: 'Complete badkamer.' },
    { id: 3, titel: 'Complete badkamerrenovatie', tekst: 'Renovatie van een badkamer.' }
  ];
  const k = P.kiesProjecten(lijst, { onderwerpWoorden: ['badkamer', 'renoveren'], plaats: 'haarlem' });
  assert.deepStrictEqual(k.map((p) => p.id).sort(), [2, 3]);
  assert.deepStrictEqual(P.kiesProjecten(lijst, { onderwerpWoorden: ['dakkapel'] }), []);
});

test('vulProjectItems zet items en vult lege koppen', () => {
  const slot = { key: 'projectItems', type: 'list', itemFields: ['title', 'text', 'imageSrc', 'imageAlt'] };
  const d = { projectKicker: '', projectTitle: '', projectIntro: '', projectItems: [] };
  P.vulProjectItems(slot, d, [{ id: 5, titel: 'T', foto: 'f.jpg', alt: 'a', link: 'l' }], { 5: 'Hirs Installaties verzorgt dit.' });
  assert.deepStrictEqual(d.projectItems, [{ title: 'T', text: 'Hirs Installaties verzorgt dit.', imageSrc: 'f.jpg', imageAlt: 'a' }]);
  assert.ok(d.projectKicker && d.projectTitle);
  assert.strictEqual(d.projectIntro, '');
});
