// Tests voor de blogkandidaten die Pagr. pagina's bij klanten met Blogr. (product Beide) krijgen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwBlogKandidaten, blogLinkRegels, MAX_BLOG_KANDIDATEN } = require('../src/lp/blogLinks');
const { verwijderVerzonnenLinks } = require('../src/lp/ai');

test('blogs worden kandidaten met blog: true en zusterpagina: false', () => {
  const k = bouwBlogKandidaten([{ url: 'https://site.test/blog/a', titel: 'Hoelang duurt een badkamerverbouwing', omschrijving: 'Uitleg' }]);
  assert.equal(k.length, 1);
  assert.equal(k[0].blog, true);
  assert.equal(k[0].zusterpagina, false);
  assert.equal(k[0].label, 'Hoelang duurt een badkamerverbouwing');
});

test('dubbele url, lege titel en lege url worden overgeslagen', () => {
  const k = bouwBlogKandidaten([
    { url: 'https://site.test/a', titel: 'A' },
    { url: 'https://site.test/a', titel: 'A nog een keer' },
    { url: '', titel: 'Zonder url' },
    { url: 'https://site.test/b', titel: '  ' }
  ]);
  assert.equal(k.length, 1);
});

test('html in de titel wordt verwijderd en het aantal is begrensd', () => {
  const veel = Array.from({ length: 50 }, (_, i) => ({ url: `https://site.test/${i}`, titel: `<b>Blog ${i}</b>` }));
  const k = bouwBlogKandidaten(veel);
  assert.equal(k.length, MAX_BLOG_KANDIDATEN);
  assert.equal(k[0].label, 'Blog 0');
});

test('geen blogs geeft geen promptregel, wel blogs geeft een regel met het aantal en de grens', () => {
  assert.equal(blogLinkRegels([{ url: 'x', zusterpagina: false }]), '');
  const regel = blogLinkRegels(bouwBlogKandidaten([{ url: 'https://site.test/a', titel: 'A' }]));
  assert.match(regel, /1 kandidaten/);
  assert.match(regel, /maximaal 3 blogs/);
});

test('een verzonnen bloglink wordt verwijderd, een echte blog blijft staan', () => {
  const kandidaten = bouwBlogKandidaten([{ url: 'https://site.test/blog/echt', titel: 'Echt' }]);
  const slotData = { intro: 'Lees [de blog](https://site.test/blog/echt) en [nep](https://nep.test/x).' };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.ok(slotData.intro.includes('https://site.test/blog/echt'));
  assert.ok(!slotData.intro.includes('nep.test'));
});
