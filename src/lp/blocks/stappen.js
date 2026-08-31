const { escapeHtml } = require('../utils');

// data: { heading?, steps: [{ title, text }] }
function render(data) {
  const steps = (data.steps || [])
    .map(
      (step, index) => `<div class="lp-card">
      <h3>${index + 1}. ${escapeHtml(step.title)}</h3>
      <p>${escapeHtml(step.text)}</p>
    </div>`
    )
    .join('\n    ');
  return `<section class="lp-section lp-stappen">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}
    <div class="lp-grid">
      ${steps}
    </div>
  </div>
</section>`;
}

module.exports = { render };
