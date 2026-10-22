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
