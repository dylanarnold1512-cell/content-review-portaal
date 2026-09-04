// Tests voor src/lp/render.js — met name het exacte contract dat "opts.forPreview" bepaalt:
// preview-HTML (voorbeeldscherm) krijgt data-lp-*-attributen, publish-HTML (naar WordPress) NOOIT.
// Zie besluiten.md, "Voorbeeldscherm vergroten" (04-09-2026) voor waarom dit onderscheid bestaat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPageHtml } = require('../src/lp/render');

function maakTestPagina() {
  return {
    clientId: 'test-klant',
    slug: 'test-slug',
    template: {
      templateFormat: 'slots',
      htmlTemplate:
        '<h1>{{heroTitle}}</h1><img src="{{heroImageSrc}}">' +
        '<div>{{#each faqItems}}<details><summary>{{question}}</summary><p>{{answer}}</p></details>{{/each}}</div>',
      cssTemplate: '.lpt h1 { color: red; }',
      slots: [
        { key: 'heroTitle', type: 'text', verplicht: true },
        { key: 'heroImageSrc', type: 'text', verplicht: true },
        { key: 'faqItems', type: 'list', itemFields: ['question', 'answer'], verplicht: false }
      ]
    },
    slotData: {
      heroTitle: 'Testtitel',
      heroImageSrc: 'https://x.test/foto.jpg',
      faqItems: [{ question: 'Q1', answer: 'A1' }]
    }
  };
}

test('renderPageHtml met forPreview:true bevat data-lp-slot/data-lp-text-slot, maar nooit op <summary>', () => {
  const html = renderPageHtml(maakTestPagina(), { forPreview: true });
  assert.match(html, /data-lp-slot="heroImageSrc"/);
  assert.match(html, /data-lp-text-slot="heroTitle"/);
  assert.ok(!/<summary[^>]*data-lp-text-slot/.test(html), '<summary> mag nooit klikbaar-voor-tekst gemaakt worden');
});

test('renderPageHtml ZONDER forPreview bevat geen enkel data-lp-*-attribuut (dit gaat naar WordPress)', () => {
  const html = renderPageHtml(maakTestPagina(), {});
  assert.ok(!/data-lp/.test(html), 'de HTML richting WordPress moet altijd schoon zijn');
});

test('renderPageHtml genereert automatisch FAQPage JSON-LD zodra faqItems gevuld is', () => {
  const html = renderPageHtml(maakTestPagina(), {});
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /"name":"Q1"/);
});
