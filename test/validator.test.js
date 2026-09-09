// Tests voor src/lp/validator.js — met name het beleid "kwaliteit boven kwantiteit" voor interne
// links (besluiten.md, 04-09-2026): 0 links mag NOOIT een blokkerende fout zijn, op twee plekken
// tegelijk (de linkRegels-minima EN de algemene verplichte-lijst-slot-check). Dat tweede addertje
// onder het gras zat er in de praktijk pas ná een live test in (zie besluiten.md), vandaar dat
// beide expliciet hier staan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePage, validateTemplateStructure } = require('../src/lp/validator');

function basisBlueprint(overrides = {}) {
  return {
    templateFormat: 'slots',
    slots: [
      { key: 'heroTitle', type: 'text', verplicht: true },
      { key: 'linksItems', type: 'list', verplicht: true, itemFields: ['label', 'href', 'reason', 'zusterpagina'] }
    ],
    linkRegels: { minimumInterneLinks: 6, minimumNaarZusterpaginas: 2, reasonRequired: true },
    seoRegels: { metaTitleMin: 1, metaTitleMax: 999, metaDescriptionMin: 1, metaDescriptionMax: 999 },
    ...overrides
  };
}

function basisContent(overrides = {}) {
  return {
    slotData: { heroTitle: 'X', linksItems: [], ...overrides },
    meta: { metaTitle: 'T', metaDescription: 'D' }
  };
}

test('een lege linksItems-lijst is GEEN blokkerende fout (alleen een waarschuwing)', () => {
  const result = validatePage({ blueprint: basisBlueprint(), contentJson: basisContent() });
  assert.equal(result.ok, true, `verwacht geen blokkerende fouten, kreeg: ${JSON.stringify(result.errors)}`);
  assert.ok(result.warnings.some((w) => /richtaantal/.test(w)), 'verwacht wel een waarschuwing over het richtaantal');
});

test('een andere verplichte lijst-slot (niet linksItems) is nog gewoon een blokkerende fout als hij leeg is', () => {
  const blueprint = basisBlueprint({
    slots: [
      { key: 'heroTitle', type: 'text', verplicht: true },
      { key: 'faqItems', type: 'list', verplicht: true, itemFields: ['question', 'answer'] }
    ]
  });
  const content = basisContent({ faqItems: [] });
  delete content.slotData.linksItems;
  const result = validatePage({ blueprint, contentJson: content });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /faqItems|Veelgestelde/.test(e) || /Verplichte lijst-slot/.test(e)));
});

test('een linksItems-item zonder "reason" blijft een blokkerende fout, ook als er wel links zijn', () => {
  const content = basisContent({ linksItems: [{ label: 'X', href: 'https://x.test', zusterpagina: false }] });
  const result = validatePage({ blueprint: basisBlueprint(), contentJson: content });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /reden \(reason\)/.test(e)));
});

test('inline links ([tekst](url) middenin een tekst-slot) tellen mee voor het richtaantal', () => {
  const content = basisContent({
    heroTitle: 'X',
    linksItems: [],
    heroIntro: '[link 1](https://a.test) en [link 2](https://b.test)'
  });
  const blueprint = basisBlueprint({
    slots: [
      { key: 'heroTitle', type: 'text', verplicht: true },
      { key: 'heroIntro', type: 'text', verplicht: false },
      { key: 'linksItems', type: 'list', verplicht: true, itemFields: ['label', 'href', 'reason', 'zusterpagina'] }
    ],
    linkRegels: { minimumInterneLinks: 2, reasonRequired: false }
  });
  const result = validatePage({ blueprint, contentJson: content });
  assert.equal(result.ok, true);
  assert.ok(!result.warnings.some((w) => /richtaantal/.test(w)), '2 inline links moet aan het richtaantal van 2 voldoen, geen waarschuwing verwacht');
});

test('een ontbrekende heroTitle blijft altijd een blokkerende fout', () => {
  const content = basisContent();
  delete content.slotData.heroTitle;
  const result = validatePage({ blueprint: basisBlueprint(), contentJson: content });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /heroTitle/.test(e)));
});

// Regressietest voor de "USP-kaarten niet gecentreerd"-bug (09-09-2026, zie systeem-logboek.md):
// validateTemplateStructure moet een rigid-grid-waarschuwing doorgeven, maar mag een sjabloon
// daar NOOIT om blokkeren (het is een aandachtspunt, geen harde eis zoals de veiligheidschecks).
test('validateTemplateStructure: waarschuwt bij een vast kolomaantal om een lijst-slot, blokkeert niet', () => {
  const blueprint = {
    templateFormat: 'slots',
    htmlTemplate:
      '<h1>{{heroTitle}}</h1>' +
      '<div class="usp-grid">{{#each uspItems}}<div class="usp-card">{{title}}</div>{{/each}}</div>',
    cssTemplate: '.lpt .usp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}',
    slots: [{ key: 'heroTitle', type: 'text', verplicht: true }]
  };
  const result = validateTemplateStructure(blueprint);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => /usp-grid/.test(w) && /auto-fit/.test(w)));
});

test('validateTemplateStructure: geen waarschuwing bij repeat(auto-fit,...)', () => {
  const blueprint = {
    templateFormat: 'slots',
    htmlTemplate:
      '<h1>{{heroTitle}}</h1>' +
      '<div class="usp-grid">{{#each uspItems}}<div class="usp-card">{{title}}</div>{{/each}}</div>',
    cssTemplate: '.lpt .usp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}',
    slots: [{ key: 'heroTitle', type: 'text', verplicht: true }]
  };
  const result = validateTemplateStructure(blueprint);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});
