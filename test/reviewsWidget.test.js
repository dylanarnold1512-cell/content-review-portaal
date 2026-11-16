const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/lp/reviewsWidget');

test('detecteert de Google reviews plugin en haalt het id uit de HTML', () => {
  const w = R.detecteerReviewWidget('<div class="wp-gr wpac" data-id="2306"><div class="grw-row"></div></div>');
  assert.strictEqual(w.plugin, 'grw');
  assert.strictEqual(w.shortcode, '[grw id=2306]');
});

test('detecteert andere widgets maar toont ze niet zelf', () => {
  const w = R.detecteerReviewWidget('<div class="ti-widget"></div>');
  assert.strictEqual(w.plugin, 'trustindex');
  assert.strictEqual(w.kanTonen, false);
  assert.strictEqual(R.detecteerReviewWidget('<p>geen widget</p>'), null);
});

test('widget komt voor het laatste onderdeel, shortcode alleen op WordPress', () => {
  const profile = { reviewsWidget: { shortcode: '[grw id=2306]' } };
  const html = '<section>a</section><section>contact</section>';
  const wp = R.pasReviewsWidgetToe(html, { profile, rootClass: 'x', naarWordPress: true });
  assert.ok(wp.html.indexOf('[grw id=2306]') > html.indexOf('a') && wp.html.indexOf('[grw id=2306]') < wp.html.indexOf('contact'));
  const pv = R.pasReviewsWidgetToe(html, { profile, rootClass: 'x', naarWordPress: false });
  assert.ok(!pv.html.includes('[grw'));
  assert.ok(pv.html.includes('lp-reviews-placeholder'));
});

test('marker bepaalt de plek en zonder instelling verdwijnt alles', () => {
  const profile = { reviewsWidget: { shortcode: '[grw id=1]' } };
  const m = R.pasReviewsWidgetToe('<section>a</section>{{reviewsWidget}}<section>b</section>', { profile, rootClass: 'x', naarWordPress: true });
  assert.ok(m.html.indexOf('[grw id=1]') < m.html.indexOf('<section>b'));
  const leeg = R.pasReviewsWidgetToe('<section>a</section>{{reviewsWidget}}', { profile: {}, rootClass: 'x', naarWordPress: true });
  assert.strictEqual(leeg.html, '<section>a</section>');
});

const REVIEW_PAGINA = '<section class="hero">h</section><section class="lp-reviews"><h2>Wat opdrachtgevers vertellen</h2>{{#each reviewItems}}<blockquote>{{quote}}</blockquote>{{/each}}</section><section class="faq">faq</section><section>{{formulier}}</section>';
const MAC = { reviewsWidget: { plugin: 'trustindex', shortcode: '[trustindex no-registration=google]', titel: 'Wat opdrachtgevers vertellen', alleenCampagne: true, vervangReviews: true } };

test('alleenCampagne: campagnesjablonen krijgen de widget, andere sjablonen niet', () => {
  const camp = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: MAC, rootClass: 'x', naarWordPress: true, template: { id: 'campagne-2' } });
  assert.ok(camp.html.includes('[trustindex no-registration=google]'));
  const camp1 = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: MAC, rootClass: 'x', naarWordPress: true, template: { id: 'campagne' } });
  assert.ok(camp1.html.includes('[trustindex'));
  const eigen = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: MAC, rootClass: 'x', naarWordPress: true, template: { id: 'eigen', paginaSoort: 'campagne' } });
  assert.ok(eigen.html.includes('[trustindex'));
  const loc = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: MAC, rootClass: 'x', naarWordPress: true, template: { id: 'locatiegericht' } });
  assert.strictEqual(loc.html, REVIEW_PAGINA);
  assert.strictEqual(loc.css, '');
});

test('vervangReviews: de widget neemt de plek van de eigen reviewsectie in, op dezelfde plek in de pagina', () => {
  const r = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: MAC, rootClass: 'x', naarWordPress: true, template: { id: 'campagne-2' } });
  assert.ok(!r.html.includes('reviewItems'));
  assert.strictEqual((r.html.match(/<h2>/g) || []).length, 1);
  assert.ok(r.html.includes('<h2>Wat opdrachtgevers vertellen</h2>'));
  assert.ok(r.html.indexOf('hero') < r.html.indexOf('[trustindex') && r.html.indexOf('[trustindex') < r.html.indexOf('class="faq"'));
  assert.ok(r.html.includes('{{formulier}}'));
});

test('vervangReviews zonder reviewsectie: terugval vlak voor het laatste onderdeel; zonder vervangReviews blijven de eigen reviews staan', () => {
  const zonder = '<section>a</section><section>{{formulier}}</section>';
  const r = R.pasReviewsWidgetToe(zonder, { profile: MAC, rootClass: 'x', naarWordPress: true, template: { id: 'campagne' } });
  assert.ok(r.html.indexOf('[trustindex') < r.html.indexOf('{{formulier}}'));
  const profiel = { reviewsWidget: { ...MAC.reviewsWidget, vervangReviews: false } };
  const naast = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: profiel, rootClass: 'x', naarWordPress: true, template: { id: 'campagne' } });
  assert.ok(naast.html.includes('reviewItems') && naast.html.includes('[trustindex'));
});

test('portaalvoorbeeld toont een placeholder en geen kale shortcode', () => {
  const r = R.pasReviewsWidgetToe(REVIEW_PAGINA, { profile: MAC, rootClass: 'x', naarWordPress: false, template: { id: 'campagne-2' } });
  assert.ok(r.html.includes('lp-reviews-placeholder') && !r.html.includes('[trustindex'));
});

test('klantgegevens bewaart alleenCampagne en vervangReviews, en een leeg shortcode zet de widget uit', () => {
  const { schoonProfiel } = require('../src/lp/klantgegevens');
  const p = schoonProfiel({ naam: 'X', reviewsWidget: MAC.reviewsWidget });
  assert.strictEqual(p.reviewsWidget.alleenCampagne, true);
  assert.strictEqual(p.reviewsWidget.vervangReviews, true);
  assert.strictEqual(p.reviewsWidget.plugin, 'trustindex');
  assert.strictEqual(schoonProfiel({ naam: 'X', reviewsWidget: { shortcode: '' } }).reviewsWidget, null);
});

test('MAC Bouw profiel: widget alleen op campagnepagina\'s, volledige render op WordPress', () => {
  const { renderPageHtml } = require('../src/lp/render');
  const template = { id: 'campagne-2', templateFormat: 'slots', htmlTemplate: REVIEW_PAGINA, cssTemplate: '', slots: [{ key: 'reviewItems', type: 'list' }] };
  const pagina = (t) => ({ clientId: 'macbouw', slug: 's', template: t, slotData: { reviewItems: [{ quote: 'Top' }] } });
  const wp = renderPageHtml(pagina(template), { forWordPress: true });
  assert.ok(wp.includes('[trustindex no-registration=google]') && !wp.includes('Top'));
  const loc = renderPageHtml(pagina({ ...template, id: 'locatiegericht' }), { forWordPress: true });
  assert.ok(!loc.includes('[trustindex') && loc.includes('Top'));
});
