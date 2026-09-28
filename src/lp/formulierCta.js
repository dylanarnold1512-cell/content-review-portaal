// CTA's die naar het formulier op de pagina zelf springen (jumplink), in plaats van naar een andere pagina.
//
// Geldt alleen voor pagina's waar het sjabloon een formulier heeft ({{formulier}}, zie render.js) en dat
// formulier ook echt getoond wordt. Dan doen we twee dingen, bij het renderen (het sjabloon en de opgeslagen
// content blijven ongemoeid):
//  1. Elke knop met href="{{ctaHref}}" (kop, hero, enzovoort) wordt een jumplink naar #lp-formulier.
//  2. Ergens in het midden van de pagina komt een CTA-balk met dezelfde knoptekst (ctaLabel), tenzij het
//     sjabloon zelf al een CTA-knop tussen de hero en het formulier heeft.
// Zo hoeft een sjabloonontwerper er niet aan te denken, en werkt het ook voor bestaande sjablonen.

const { vindSecties } = require('./overrides');

const FORMULIER_ID = 'lp-formulier';
const MARKER_RE = /\{\{\s*formulier\s*\}\}/;
const CTA_HREF_ATTR_RE = /(\shref=)(["'])\{\{\s*ctaHref\s*\}\}\2/g;
// Na het omzetten staan de CTA-links van het sjabloon al als #lp-formulier in de HTML.
const CTA_HREF_TOKEN_RE = new RegExp('\\{\\{\\s*ctaHref\\s*\\}\\}|href=["\']#' + FORMULIER_ID + '["\']');

// Bepaalt na welke sectie (index in vindSecties) de CTA-balk komt, of -1 als dat niet kan of niet nodig is.
function kiesBalkPositie(html, secties) {
  const bron = String(html || '');
  const markerPos = bron.search(MARKER_RE);
  let f = secties.findIndex((s) => markerPos >= s.start && markerPos < s.end);
  if (f < 0) f = secties.length; // formulier buiten een sectie: behandel als "na de laatste sectie"
  if (f < 3) return -1; // te korte pagina, een balk zou de pagina overladen
  const k = Math.floor(f / 2);
  if (k < 1 || k > f - 2) return -1;
  // Heeft het sjabloon zelf al een CTA-knop tussen de hero en het formulier? Dan niets toevoegen.
  for (let i = 1; i < f && i < secties.length; i += 1) {
    if (CTA_HREF_TOKEN_RE.test(bron.slice(secties[i].start, secties[i].end))) return -1;
  }
  return k;
}

const BALK_CSS = (rootClass) => `<style>
.${rootClass} .lp-cta-balk { padding: 40px 24px; text-align: center; font-family: var(--lp-font-body); }
.${rootClass} .lp-cta-balk-tekst { margin: 0 0 16px; font-family: var(--lp-font-heading); font-size: 1.5rem; line-height: 1.25; color: var(--lp-text); }
.${rootClass} .lp-cta-balk a { display: inline-block; padding: 14px 28px; border-radius: var(--lp-radius); background: var(--lp-cta-bg); color: var(--lp-cta-text); text-decoration: none; font-weight: 700; }
.${rootClass} .lp-formulier { scroll-margin-top: 110px; }
</style>`;

// html: sjabloon-HTML na het verbergen van secties, vóór het taggen voor het voorbeeld.
// actief: true als er een formulier is dat getoond wordt. slotData wordt alleen gelezen (ctaBandTekst is optioneel).
function pasFormulierCtaToe(html, { actief, rootClass, slotData }) {
  const bron = String(html || '');
  if (!actief || !MARKER_RE.test(bron)) return { html: bron, css: '', balkToegevoegd: false };
  let out = bron.replace(CTA_HREF_ATTR_RE, `$1$2#${FORMULIER_ID}$2`);

  const secties = vindSecties(out);
  const k = kiesBalkPositie(out, secties);
  let balkToegevoegd = false;
  if (k >= 0 && /{{\s*ctaLabel\s*}}/.test(bron) === true) {
    const heeftTekst = slotData && typeof slotData.ctaBandTekst === 'string' && slotData.ctaBandTekst.trim();
    const balk =
      `<div class="lp-cta-balk" data-lp-cta-balk="1">` +
      (heeftTekst ? `<p class="lp-cta-balk-tekst">{{ctaBandTekst}}</p>` : '') +
      `<a href="#${FORMULIER_ID}">{{ctaLabel}}</a></div>`;
    const pos = secties[k].end;
    out = out.slice(0, pos) + balk + out.slice(pos);
    balkToegevoegd = true;
  }
  return { html: out, css: balkToegevoegd || out !== bron ? BALK_CSS(rootClass) : '', balkToegevoegd };
}

module.exports = { pasFormulierCtaToe, FORMULIER_ID, kiesBalkPositie };
