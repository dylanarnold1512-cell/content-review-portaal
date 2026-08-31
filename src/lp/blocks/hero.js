const { escapeHtml } = require('../utils');

// data: { title, intro?, cta?: { label, href }, image?: { src, alt } }
function render(data) {
  const cta = data.cta
    ? `<a class="lp-cta-button" href="${escapeHtml(data.cta.href)}">${escapeHtml(data.cta.label)}</a>`
    : '';
  const image = data.image
    ? `<img src="${escapeHtml(data.image.src)}" alt="${escapeHtml(data.image.alt || '')}">`
    : '';
  return `<section class="lp-section lp-hero">
  <div class="lp-container">
    <h1>${escapeHtml(data.title)}</h1>
    ${data.intro ? `<p>${escapeHtml(data.intro)}</p>` : ''}
    ${image}
    ${cta}
  </div>
</section>`;
}

module.exports = { render };
