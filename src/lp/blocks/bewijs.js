const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ stat, label }] } — bijv. "12 jaar ervaring".
function render(data) {
  const items = (data.items || [])
    .map(
      (item) => `<div class="lp-stat">
      <strong>${escapeHtml(item.stat)}</strong>
      <span>${escapeHtml(item.label)}</span>
    </div>`
    )
    .join('\n    ');
  return `<section class="lp-section lp-section--alt lp-bewijs">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <div class="lp-grid">
      ${items}
    </div>
  </div>
</section>`;
}

module.exports = { render };
