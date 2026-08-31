const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ title, text, href?, image?: { src, alt } }] }
function render(data) {
  const items = (data.items || [])
    .map((item) => {
      const image = item.image
        ? `<img src="${escapeHtml(item.image.src)}" alt="${escapeHtml(item.image.alt || '')}">`
        : '';
      const title = item.href
        ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      return `<div class="lp-card">
      ${image}
      <h3>${title}</h3>
      <p>${escapeHtml(item.text)}</p>
    </div>`;
    })
    .join('\n    ');
  return `<section class="lp-section lp-aanbod-grid">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <div class="lp-grid">
      ${items}
    </div>
  </div>
</section>`;
}

module.exports = { render };
