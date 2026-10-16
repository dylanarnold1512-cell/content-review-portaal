const test = require('node:test');
const assert = require('node:assert/strict');
const { verwijderReviewAanhalingstekens, schoonReviewTekst } = require('../src/lp/aanhalingstekens');
const { buildRenderPage } = require('../src/lp/pageRender');

test('dubbele en gekrulde aanhalingstekens rond een review verdwijnen', () => {
  assert.equal(schoonReviewTekst('“”Hele fijne samenwerking gehad!!””'), 'Hele fijne samenwerking gehad!!');
  assert.equal(schoonReviewTekst('"Duidelijke uitleg, nette communicatie."'), 'Duidelijke uitleg, nette communicatie.');
  assert.equal(schoonReviewTekst('Hij zei "top" tegen ons'), 'Hij zei "top" tegen ons');
});

test('alleen de reviewtekst wordt aangepast, niet de naam of andere lijsten', () => {
  const data = {
    reviewItems: [{ quote: '“Vakkundig.”', author: '"Fung"' }],
    faqItems: [{ question: '"Hoe?"', answer: '"Zo."' }]
  };
  verwijderReviewAanhalingstekens(data);
  assert.equal(data.reviewItems[0].quote, 'Vakkundig.');
  assert.equal(data.reviewItems[0].author, '"Fung"');
  assert.equal(data.faqItems[0].question, '"Hoe?"');
});

test('bestaande pagina\'s worden bij het renderen schoongemaakt, zonder de opgeslagen data te wijzigen', () => {
  const content = { slotData: { reviewItems: [{ quote: '“”Goed””', author: 'A' }] } };
  const r = buildRenderPage({ blueprint: { templateFormat: 'slots' }, content, clientId: 'x', slug: 's', invoer: {} });
  assert.equal(r.slotData.reviewItems[0].quote, 'Goed');
  assert.equal(content.slotData.reviewItems[0].quote, '“”Goed””');
});
