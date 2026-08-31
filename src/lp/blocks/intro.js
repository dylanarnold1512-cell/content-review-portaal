const { escapeHtml } = require('../utils');

// data: { heading?, text }
function render(data) {
  return `<section class="lp-section lp-intro">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <p>${escapeHtml(data.text)}</p>
  </div>
</section>`;
}

module.exports = { render };
