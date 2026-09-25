const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStyle } = require('../src/lp/style');
const { getTokens } = require('../src/lp/tokens');
const { formatBrandingForPrompt } = require('../src/lp/ai');
const { findHuisstijlAfwijkingen } = require('../src/lp/slotEngine');
const { validateTemplateStructure } = require('../src/lp/validator');

test('vormtaal: MAC Bouw krijgt hoofdletter-koppen, bijna zwarte koppen en vierkante knoppen als CSS-variabelen', () => {
  const css = renderStyle('lp-root-x', getTokens('macbouw'));
  assert.match(css, /--lp-heading-transform: uppercase;/);
  assert.match(css, /--lp-heading-color: #0c0a0a;/);
  assert.match(css, /--lp-button-radius: 0px;/);
  assert.match(css, /--lp-card-radius: 2px;/);
});

test('vormtaal: een klant zonder vormtaal (Roots) valt terug op de oude waarden', () => {
  const t = getTokens('roots');
  const css = renderStyle('lp-root-x', t);
  assert.ok(css.includes(`--lp-heading-color: ${t.primaryDark};`));
  assert.match(css, /--lp-heading-transform: none;/);
  assert.ok(css.includes(`--lp-button-radius: ${t.radius};`));
  assert.ok(css.includes(`--lp-card-radius: ${t.radius};`));
});

test('vormtaal: de sjabloonprompt bevat de vormtaal en sfeer van de klant', () => {
  const tekst = formatBrandingForPrompt('macbouw');
  assert.match(tekst, /VORMTAAL van deze klant/);
  assert.match(tekst, /var\(--lp-button-radius\) \(0px\)/);
  assert.match(tekst, /Stoer, strak en betrouwbaar/);
});

test('huisstijlcheck: waarschuwt voor vaste kleuren en vergrote rondingen, niet voor variabelen', () => {
  assert.equal(findHuisstijlAfwijkingen('.lpt a{color:var(--lp-primary);border-radius:var(--lp-card-radius)}').length, 0);
  assert.equal(findHuisstijlAfwijkingen('.lpt a{color:#ff0000}').length, 1);
  assert.equal(findHuisstijlAfwijkingen('.lpt a{color:#fff;background:#000}').length, 0);
  assert.equal(findHuisstijlAfwijkingen('.lpt .k{border-radius:calc(var(--lp-radius) * 3)}').length, 1);
});

test('huisstijlcheck is een waarschuwing en blokkeert het opslaan niet', () => {
  const res = validateTemplateStructure({
    templateFormat: 'slots',
    htmlTemplate: '<div class="lpt"><h1>{{heroTitle}}</h1></div>',
    cssTemplate: '.lpt h1{color:#ff0000}',
    slots: [{ key: 'heroTitle', type: 'text', verplicht: true }]
  });
  assert.equal(res.errors.length, 0);
  assert.ok(res.warnings.some((w) => /vaste kleuren/.test(w)));
});

test('huisstijlcheck: waarschuwt voor een scroll-animatie met cover-bereik', () => {
  const w = findHuisstijlAfwijkingen('@supports (animation-timeline:view()){.lpt .r{animation-range:entry 8% cover 32%}}');
  assert.ok(w.some((t) => /cover/.test(t)));
  assert.equal(findHuisstijlAfwijkingen('.lpt .r{animation-range:entry 0% entry 60%}').length, 0);
});

test('MAC Bouw huisstijl: lichtgrijs vlak in plaats van de rozige tint, oranje spaarzaam', () => {
  const t = getTokens('macbouw');
  assert.equal(t.bgAlt, '#f6f6f6');
  assert.notEqual(t.border.toLowerCase(), '#eae2e2');
  assert.match(t.sfeer, /oranje/i);
});
