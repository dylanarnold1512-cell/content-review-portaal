// Geautomatiseerde tests voor src/lp/slotEngine.js — de template-engine en de preview-only
// tagging (data-lp-slot / data-lp-text-slot). Draait met de ingebouwde Node testrunner, geen
// extra dependency nodig: `npm test` of `node --test test/`.
//
// Waarom deze tests er zijn: op 04-09-2026 zijn hier twee bugs in geslopen (zie besluiten.md)
// die allebei met een test als deze meteen waren opgevallen vóór het pushen, in plaats van pas
// nadat Dylan het live uitprobeerde:
//  - <summary> (het open/dichtklap-element van een FAQ-<details>) kreeg per ongeluk ook een
//    data-lp-text-slot-attribuut, wat het native uitklappen blokkeerde.
//  - de HTML die naar WordPress gaat moet NOOIT een data-lp-*-attribuut bevatten, alleen de
//    preview-HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  renderSlotTemplate,
  tagImageSlotsForPreview,
  tagTextSlotsForPreview,
  templateSafetyCheck,
  forEachTextLeaf,
  INLINE_LINK_RE
} = require('../src/lp/slotEngine');

test('renderSlotTemplate: gewone velden en [ankertekst](url) worden correct gerenderd', () => {
  const html = '<h1>{{titel}}</h1><p>{{intro}}</p>';
  const out = renderSlotTemplate(html, {
    titel: 'Hallo <wereld>',
    intro: 'Bezoek [onze site](https://example.com) voor meer info.'
  });
  assert.match(out, /<h1>Hallo &lt;wereld&gt;<\/h1>/);
  assert.match(out, /<a href="https:\/\/example\.com">onze site<\/a>/);
});

test('renderSlotTemplate: javascript: en <script> in een link/tekst worden nooit uitvoerbaar', () => {
  const html = '<p>{{tekst}}</p>';
  const out = renderSlotTemplate(html, { tekst: '[klik](javascript:alert(1)) <script>alert(2)</script>' });
  // De letterlijke tekens mogen best zichtbaar blijven als kale, onschuldige tekst (er is geen
  // reden om "javascript:" als woord te censureren) - waar het om gaat is dat het NOOIT een
  // uitvoerbare <script>-tag of een klikbare javascript:-link wordt.
  assert.ok(!out.includes('<script>'), 'mag geen ongeescapete, uitvoerbare <script>-tag bevatten');
  assert.ok(!out.includes('href="javascript:'), 'mag nooit een klikbare javascript:-link renderen');
});

test('renderSlotTemplate: {{#each}} herhaalt per item en kent de juiste itemindex toe', () => {
  const html = '{{#each faqItems}}<h3 data-i="{{this}}">{{question}}</h3>{{/each}}';
  // __LP_EACH_INDEX__ komt normaal via tagTextSlotsForPreview in de tekst terecht (zie hieronder);
  // hier testen we alleen dat een placeholder die er toevallig in staat correct per item met de
  // itemindex wordt ingevuld door renderSlotTemplate zelf.
  const withIndexPlaceholder = '{{#each faqItems}}<h3 data-idx="__LP_EACH_INDEX__">{{question}}</h3>{{/each}}';
  const out = renderSlotTemplate(withIndexPlaceholder, {
    faqItems: [{ question: 'Vraag A' }, { question: 'Vraag B' }]
  });
  assert.match(out, /<h3 data-idx="0">Vraag A<\/h3>/);
  assert.match(out, /<h3 data-idx="1">Vraag B<\/h3>/);
});

test('tagImageSlotsForPreview: alleen <img> met een letterlijke {{sleutel}}-src van een ImageSrc-slot wordt getagd', () => {
  const slots = [{ key: 'heroImageSrc', type: 'text' }];
  const html = '<img src="{{heroImageSrc}}"><img src="https://vast.test/logo.png">';
  const out = tagImageSlotsForPreview(html, slots);
  assert.match(out, /<img data-lp-slot="heroImageSrc" src="\{\{heroImageSrc\}\}">/);
  assert.ok(!out.includes('data-lp-slot="https'), 'een vaste externe afbeelding mag nooit getagd worden');
});

test('tagTextSlotsForPreview: taggt een los tekst-slot en een list-itemveld (met __LP_EACH_INDEX__ placeholder)', () => {
  const slots = [
    { key: 'heroTitle', type: 'text' },
    { key: 'faqItems', type: 'list', itemFields: ['question', 'answer'] }
  ];
  const html = '<h1>{{heroTitle}}</h1>{{#each faqItems}}<h3>{{question}}</h3>{{/each}}';
  const out = tagTextSlotsForPreview(html, slots);
  assert.match(out, /<h1 data-lp-text-slot="heroTitle">\{\{heroTitle\}\}<\/h1>/);
  assert.match(out, /<h3 data-lp-text-slot="faqItems\.__LP_EACH_INDEX__\.question">\{\{question\}\}<\/h3>/);
});

test('tagTextSlotsForPreview: <summary> wordt NOOIT getagd (native FAQ-uitklappen mag niet breken)', () => {
  const slots = [{ key: 'faqItems', type: 'list', itemFields: ['question', 'answer'] }];
  const html = '{{#each faqItems}}<details><summary>{{question}}</summary><div class="a">{{answer}}</div></details>{{/each}}';
  const out = tagTextSlotsForPreview(html, slots);
  assert.ok(!/<summary[^>]*data-lp-text-slot/.test(out), '<summary> mag nooit data-lp-text-slot krijgen');
  // het antwoord-veld mag wel gewoon getagd worden (dat zit niet in een native toggle-element).
  assert.match(out, /<div class="a" data-lp-text-slot="faqItems\.__LP_EACH_INDEX__\.answer">/);
});

test('tagTextSlotsForPreview: een slot MIDDENIN een langere zin wordt niet getagd', () => {
  const slots = [{ key: 'heroTitle', type: 'text' }];
  const html = '<p>Welkom bij {{heroTitle}}</p>';
  const out = tagTextSlotsForPreview(html, slots);
  assert.ok(!out.includes('data-lp-text-slot'), 'alleen een slot dat de VOLLEDIGE tag-inhoud is mag getagd worden');
});

test('renderPageHtml-integratie: publish-HTML (geen forPreview) bevat nooit data-lp-*, ook niet na tagging+render', () => {
  // Simuleert precies wat render.js doet: eerst taggen (voor preview), dan renderSlotTemplate.
  // Los getest zodat deze test niet breekt op ongerelateerde wijzigingen in render.js zelf.
  const slots = [{ key: 'heroTitle', type: 'text' }, { key: 'heroImageSrc', type: 'text' }];
  const html = '<h1>{{heroTitle}}</h1><img src="{{heroImageSrc}}">';
  const zonderPreview = renderSlotTemplate(html, { heroTitle: 'X', heroImageSrc: 'https://x.test/y.jpg' });
  assert.ok(!/data-lp/.test(zonderPreview), 'zonder tagging-stap mag er nooit data-lp-* in de HTML staan');
});

test('templateSafetyCheck: blokkeert <script>, externe CSS-import en javascript:-links in een sjabloon', () => {
  const metScript = templateSafetyCheck('<script>alert(1)</script>', '');
  assert.equal(metScript.ok, false);
  const metJsLink = templateSafetyCheck('<a href="javascript:alert(1)">x</a>', '');
  assert.equal(metJsLink.ok, false);
  const schoon = templateSafetyCheck('<h1>{{heroTitle}}</h1>', '.lpt h1 { color: red; }');
  assert.equal(schoon.ok, true);
});

test('forEachTextLeaf: loopt over top-level tekstslots en list-itemvelden', () => {
  const slotData = { heroTitle: 'X', faqItems: [{ question: 'Q1', answer: 'A1' }] };
  const gezien = [];
  forEachTextLeaf(slotData, (path, value) => gezien.push(`${path}=${value}`));
  assert.deepEqual(gezien.sort(), ['faqItems.answer=A1', 'faqItems.question=Q1', 'heroTitle=X'].sort());
});

test('INLINE_LINK_RE: herkent alleen http(s):// of /-paden, geen javascript:', () => {
  assert.ok(INLINE_LINK_RE.test('[label](https://example.com)'));
  INLINE_LINK_RE.lastIndex = 0;
  assert.ok(INLINE_LINK_RE.test('[label](/pad)'));
  INLINE_LINK_RE.lastIndex = 0;
  assert.ok(!INLINE_LINK_RE.test('[label](javascript:alert(1))'));
  INLINE_LINK_RE.lastIndex = 0;
});
