// Tests voor src/lp/style.js — met name het laden van een Google Font. Zie besluiten.md,
// "Lettertype overnemen van de klantsite" (05-09-2026): tokens.googleFonts bepaalt of er een
// <link> naar fonts.googleapis.com wordt toegevoegd, los van de CSS-waarde in fontHeading/fontBody.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStyle, buildGoogleFontsHref } = require('../src/lp/style');

function maakTokens(overrides) {
  return {
    primary: '#000', primaryDark: '#000', secondary: '#000', text: '#000', textMuted: '#000',
    bg: '#fff', bgAlt: '#fff', border: '#eee', maxWidth: '1200px', radius: '8px',
    fontHeading: 'inherit', fontBody: 'inherit', googleFonts: [], ctaBg: '#000', ctaText: '#fff',
    ...overrides
  };
}

test('renderStyle voegt GEEN <link> toe zonder googleFonts (bestaand gedrag, bv. "inherit")', () => {
  const html = renderStyle('lp-root-test', maakTokens());
  assert.ok(!/<link/.test(html), 'zonder googleFonts hoort er geen <link>-tag in te staan');
  assert.match(html, /^<style>/, 'de <style>-tag hoort dan meteen vooraan te staan');
});

test('renderStyle voegt GEEN <link> toe als googleFonts ontbreekt (bestaande klanten zonder dit veld)', () => {
  const tokens = maakTokens();
  delete tokens.googleFonts;
  const html = renderStyle('lp-root-test', tokens);
  assert.ok(!/<link/.test(html));
});

test('renderStyle laadt een Google Font als tokens.googleFonts gevuld is', () => {
  const html = renderStyle('lp-root-test', maakTokens({ fontBody: "'Ubuntu', sans-serif", fontHeading: "'Ubuntu', sans-serif", googleFonts: ['Ubuntu'] }));
  assert.match(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Ubuntu:wght@400;500;600;700&display=swap">/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
  assert.match(html, /--lp-font-body: 'Ubuntu', sans-serif;/, 'de CSS-variabele moet nog gewoon de opgegeven waarde krijgen');
});

test('renderStyle ondersteunt meerdere Google Fonts tegelijk (bv. los lettertype voor koppen)', () => {
  const html = renderStyle('lp-root-test', maakTokens({ googleFonts: ['Poppins', 'Open Sans'] }));
  assert.match(html, /family=Poppins:wght@400;500;600;700&family=Open\+Sans:wght@400;500;600;700&display=swap/);
});

test('buildGoogleFontsHref zet spaties in een fontnaam om naar een "+"', () => {
  assert.match(buildGoogleFontsHref(['Open Sans']), /family=Open\+Sans:/);
});
