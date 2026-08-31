const { escapeHtml } = require('../utils');

// data: { heading?, items: [{ label, href, reason? }] }
// reason is bedoeld voor de review (waarom deze link relevant is, zie besluit 9
// in besluiten.md), en wordt niet publiek getoond.
function render(data) {
  const items = (data.items || [])
    .map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`)
    .join('\n      ');
  return `<section class="lp-section lp-links">
  <div class="lp-container">
    ${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : '<h2>Lees ook</h2>'}
    <ul>
      ${items}
    </ul>
  </div>
</section>`;
}

module.exports = { render };
