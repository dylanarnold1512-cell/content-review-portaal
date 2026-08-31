const { escapeHtml } = require('../utils');

// data: { heading?, text } — text mag lege-regel-gescheiden alinea's bevatten.
function render(data) {
  const paragraphs = String(data.text || '')
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join('\n    ');
  return `<section class="lp-section lp-tekstblok">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    ${paragraphs}
  </div>
</section>`;
}

module.exports = { render };
