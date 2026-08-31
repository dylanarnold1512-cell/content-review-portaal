const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ title, text }] }
function render(data) {
  const items = (data.items || [])
    .map(
      (item) => `<div class="lp-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
    </div>`
    )
    .join('\n    ');
  return `<section class="lp-section lp-section--alt lp-usp-grid">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <div class="lp-grid">
      ${items}
    </div>
  </div>
</section>`;
}

module.exports = { render };
