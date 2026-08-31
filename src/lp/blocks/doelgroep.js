const { escapeHtml } = require('../utils');

// data: { heading?, text, items?: string[] }
function render(data) {
  const list = data.items && data.items.length
    ? `<ul>
      ${data.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n      ')}
    </ul>`
    : '';
  return `<section class="lp-section lp-section--alt lp-doelgroep">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <p>${escapeHtml(data.text)}</p>
    ${list}
  </div>
</section>`;
}

module.exports = { render };
