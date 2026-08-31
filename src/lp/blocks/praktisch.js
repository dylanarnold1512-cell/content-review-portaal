const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ label, value }] } — bijv. adres, openingstijden.
function render(data) {
  const rows = (data.items || [])
    .map(
      (item) => `<dt>${escapeHtml(item.label)}</dt>
    <dd>${escapeHtml(item.value)}</dd>`
    )
    .join('\n    ');
  return `<section class="lp-section lp-section--alt lp-praktisch">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <dl class="lp-practical">
      ${rows}
    </dl>
  </div>
</section>`;
}

module.exports = { render };
