const test = require('node:test');
const assert = require('node:assert/strict');
const { VISUELE_RICHTINGEN, ONTWERP_TOOLKIT, beschrijfVisueleRichting } = require('../src/lp/ai');
const { templateSafetyCheck } = require('../src/lp/slotEngine');

test('elke visuele richting in het portaal heeft een uitleg voor de AI', () => {
  for (const sleutel of ['dynamisch-modern', 'fotografie-gedreven', 'icoon-gedreven-zakelijk', 'minimalistisch-tekstueel']) {
    assert.ok(VISUELE_RICHTINGEN[sleutel], sleutel);
    assert.ok(beschrijfVisueleRichting(sleutel).startsWith(`${sleutel}:`));
  }
});

test('zonder voorkeur gebruikt de AI de toolkit met mate', () => {
  assert.match(beschrijfVisueleRichting(''), /toolkit met mate/);
});

test('de toolkit vraagt niets wat de sjabloon-veiligheidscheck blokkeert', () => {
  const css = '@keyframes lpt-zweef{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}\n' +
    '@supports (animation-timeline: view()){.lpt .kaart{animation:lpt-zweef 1s linear both;animation-timeline:view()}}\n' +
    '@media (prefers-reduced-motion: reduce){.lpt *{animation:none!important}}';
  const html = '<section class="lpt-hero"><svg viewBox="0 0 10 2" preserveAspectRatio="none"><path d="M0 1 C3 0 6 2 10 1"/></svg></section>';
  assert.equal(templateSafetyCheck(html, css).ok, true);
  assert.match(ONTWERP_TOOLKIT, /ZONDER JavaScript/);
  assert.match(ONTWERP_TOOLKIT, /lpt-/);
  assert.match(ONTWERP_TOOLKIT, /prefers-reduced-motion/);
});
