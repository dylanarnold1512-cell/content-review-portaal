// Structuurtest op public/lp.html en public/lp.js — geen echte browser nodig. Vangt de
// "volledig scherm"-regressie van 04-09-2026 af (zie besluiten.md): #lpPreviewFrame en de twee
// bewerk-overlays gingen niet SAMEN in fullscreen, waardoor een klik in fullscreen een
// overlay-element opende dat je niet kon zien (alles buiten het fullscreen-element wordt niet
// getoond zolang iets anders fullscreen is). Dit is puur HTML/JS-brontekst-onderzoek: geen jsdom
// of browser nodig, dus geen nieuwe dependency.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');

// Zoekt het element met het gegeven id en geeft de volledige buitenste tag (incl. z'n complete
// inhoud tot en met de matchende sluit-tag) terug, door simpelweg openings-/sluit-tags van
// dezelfde tagnaam te tellen (goed genoeg voor deze ene, bekende bestandsstructuur).
function pakElementMetId(bron, id) {
  const openMatch = new RegExp(`<([a-zA-Z][\\w-]*)[^>]*\\bid="${id}"[^>]*>`).exec(bron);
  assert.ok(openMatch, `element met id="${id}" niet gevonden`);
  const tagName = openMatch[1];
  const startIndex = openMatch.index;
  const tagRe = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}>`, 'g');
  tagRe.lastIndex = startIndex;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(bron))) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return bron.slice(startIndex, m.index + m[0].length);
      }
    } else {
      depth += 1;
    }
  }
  assert.fail(`geen sluitende tag gevonden voor id="${id}"`);
}

test('lpImageSwapOverlay en lpTextEditOverlay zitten BINNEN lpPreviewWrapper (samen fullscreen)', () => {
  const wrapper = pakElementMetId(html, 'lpPreviewWrapper');
  assert.ok(wrapper.includes('id="lpImageSwapOverlay"'), 'de afbeelding-wissel-overlay moet in de preview-wrapper zitten, anders is hij onzichtbaar in fullscreen');
  assert.ok(wrapper.includes('id="lpTextEditOverlay"'), 'de tekst-bewerk-overlay moet in de preview-wrapper zitten, anders is hij onzichtbaar in fullscreen');
  assert.ok(wrapper.includes('id="lpPreviewFrame"'), 'de preview-iframe zelf moet ook in de wrapper zitten');
});

test('de "Volledig scherm"-knop vraagt fullscreen aan op lpPreviewWrapper, niet (alleen) op de iframe', () => {
  const knopBlok = js.slice(js.indexOf("lpPreviewFullscreenBtn').addEventListener"));
  const eersteAlinea = knopBlok.slice(0, knopBlok.indexOf('});') + 3);
  assert.match(eersteAlinea, /getElementById\('lpPreviewWrapper'\)/, 'fullscreen moet op de wrapper aangevraagd worden, niet op #lpPreviewFrame alleen');
});
