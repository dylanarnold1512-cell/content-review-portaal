const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ question, answer }] }
function render(data) {
  const items = (data.items || [])
    .map(
      (item) => `<div class="lp-faq-item">
      <h3>${escapeHtml(item.question)}</h3>
      <p>${escapeHtml(item.answer)}</p>
    </div>`
    )
    .join('\n    ');
  return `<section class="lp-section lp-faq">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : '<h2>Veelgestelde vragen</h2>'}
    ${items}
  </div>
</section>`;
}

// Genereert het bijbehorende FAQPage schema (JSON-LD). Los van render()
// omdat schema los van de content-flow onderaan de pagina wordt geplaatst.
// Geen van de vijf bestaande voorbeeldpagina's heeft JSON-LD — zie
// besluiten.md — dit blok dicht dat gat meteen voor nieuwe pagina's.
function renderSchema(data) {
  if (!data.items || !data.items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}

module.exports = { render, renderSchema };
