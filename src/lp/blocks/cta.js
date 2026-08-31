const { escapeHtml } = require('../utils');

// data: { heading?, text?, cta: { label, href } }
function render(data) {
  return `<section class="lp-section lp-section--alt lp-cta-band">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    ${data.text ? `<p>${escapeHtml(data.text)}</p>` : ''}
    <a class="lp-cta-button" href="${escapeHtml(data.cta.href)}">${escapeHtml(data.cta.label)}</a>
  </div>
</section>`;
}

module.exports = { render };
