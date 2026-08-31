const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ quote, author, meta? }] }
function render(data) {
  const items = (data.items || [])
    .map(
      (item) => `<blockquote class="lp-card">
      <p>&ldquo;${escapeHtml(item.quote)}&rdquo;</p>
      <footer>${escapeHtml(item.author)}${item.meta ? `, ${escapeHtml(item.meta)}` : ''}</footer>
    </blockquote>`
    )
    .join('\n    ');
  return `<section class="lp-section lp-reviews">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <div class="lp-grid">
      ${items}
    </div>
  </div>
</section>`;
}

module.exports = { render };
