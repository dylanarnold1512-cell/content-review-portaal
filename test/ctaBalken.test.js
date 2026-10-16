// Tests voor de tweede CTA-balk na de klantervaringen (16-10-2026, profile.ctaBalken.aantal = 2).
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPageHtml } = require('../src/lp/render');
const { kiesTweedeBalkPositie, vindReviewSectie } = require('../src/lp/formulierCta');
const { vindSecties } = require('../src/lp/overrides');

const sec = (naam, binnen) => `<section class="${naam}"><h2>${naam}</h2>${binnen || ''}</section>`;
const MET_REVIEWS =
  '<section class="hero"><h1>{{heroTitle}}</h1><a href="{{ctaHref}}">{{ctaLabel}}</a></section>' +
  ['a', 'b', 'c', 'd', 'e'].map((n) => sec(n)).join('') +
  sec('ervaringen', '{{#each reviewItems}}<p>{{quote}}</p>{{/each}}') +
  sec('praktisch') +
  '<section class="contact">{{formulier}}</section>';
const ZONDER_REVIEWS =
  '<section class="hero"><h1>{{heroTitle}}</h1><a href="{{ctaHref}}">{{ctaLabel}}</a></section>' +
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => sec(n)).join('') +
  '<section class="contact">{{formulier}}</section>';
const KORT =
  '<section class="hero"><h1>{{heroTitle}}</h1><a href="{{ctaHref}}">{{ctaLabel}}</a></section>' +
  ['a', 'b', 'c'].map((n) => sec(n)).join('') +
  '<section class="contact">{{formulier}}</section>';

const slots = [{ key: 'heroTitle', type: 'text' }, { key: 'ctaLabel', type: 'text' }, { key: 'ctaHref', type: 'text' }, { key: 'reviewItems', type: 'list', itemFields: ['quote'] }];
const slotData = { heroTitle: 'T', ctaLabel: 'Vraag een offerte aan', ctaHref: '/contact/', reviewItems: [{ quote: 'Top' }] };
function render(html, clientId) {
  return renderPageHtml({ clientId, slug: 's', template: { templateFormat: 'slots', htmlTemplate: html, cssTemplate: '', slots }, slotData: { ...slotData } }, { forPreview: true });
}
const volgorde = (html) => [...html.matchAll(/<section[^>]*class="([\w-]+)"|data-lp-cta-balk/g)].map((m) => m[1] || 'BALK');

test('MAC Bouw: een tweede balk direct na de sectie met klantervaringen, naast de balk halverwege', () => {
  const v = volgorde(render(MET_REVIEWS, 'macbouw'));
  assert.deepEqual(v, ['hero', 'a', 'b', 'c', 'd', 'BALK', 'e', 'ervaringen', 'BALK', 'praktisch', 'contact']);
});

test('een klant zonder instelling houdt een balk, zoals voorheen', () => {
  const v = volgorde(render(MET_REVIEWS, 'roots'));
  assert.equal(v.filter((x) => x === 'BALK').length, 1);
});

test('zonder sectie met klantervaringen komt de tweede balk ongeveer driekwart door de pagina', () => {
  const v = volgorde(render(ZONDER_REVIEWS, 'macbouw'));
  assert.equal(v.filter((x) => x === 'BALK').length, 2);
  assert.ok(v.lastIndexOf('BALK') > v.indexOf('BALK') + 2);
  assert.ok(v.lastIndexOf('BALK') < v.indexOf('contact') - 1, 'niet vlak voor het formulier');
});

test('een korte pagina krijgt geen tweede balk', () => {
  const v = volgorde(render(KORT, 'macbouw'));
  assert.equal(v.filter((x) => x === 'BALK').length, 1);
});

test('de tweede balk heeft dezelfde knop en dezelfde link naar het formulier als de eerste', () => {
  const html = render(MET_REVIEWS, 'macbouw');
  const knoppen = [...html.matchAll(/data-lp-cta-balk="1"><a class="([^"]*)" href="#lp-formulier"[^>]*>([^<]*)<\/a>/g)];
  assert.equal(knoppen.length, 2);
  assert.equal(knoppen[0][0], knoppen[1][0]);
  assert.match(knoppen[1][1], /lp-cta-button/);
  assert.equal(knoppen[1][2], 'Vraag een offerte aan');
});

test('kiesTweedeBalkPositie: een sectie met klantervaringen vlak voor het formulier wordt niet gebruikt', () => {
  const html =
    '<section class="hero"></section>' + ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => sec(n)).join('') +
    sec('reviews', '{{#each reviewItems}}x{{/each}}') + '<section class="contact">{{formulier}}</section>';
  const secties = vindSecties(html);
  assert.equal(vindReviewSectie(html, secties), 7);
  const k2 = kiesTweedeBalkPositie(html, secties, 3);
  assert.notEqual(k2, 7);
  assert.ok(k2 === -1 || (k2 >= 5 && k2 <= 6));
  assert.equal(kiesTweedeBalkPositie(html, secties, -1), -1, 'zonder eerste balk ook geen tweede');
});
