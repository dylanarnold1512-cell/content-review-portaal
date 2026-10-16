// CTA's die naar het formulier op de pagina zelf springen (jumplink), in plaats van naar een andere pagina.
//
// Geldt alleen voor pagina's waar het sjabloon een formulier heeft ({{formulier}}, zie render.js) en dat
// formulier ook echt getoond wordt. Dan doen we twee dingen, bij het renderen (het sjabloon en de opgeslagen
// content blijven ongemoeid):
//  1. Elke knop met href="{{ctaHref}}" (kop, hero, enzovoort) wordt een jumplink naar #lp-formulier.
//  2. Ergens in het midden van de pagina komt een CTA-balk met dezelfde knoptekst (ctaLabel), tenzij het
//     sjabloon zelf al een CTA-knop tussen de hero en het formulier heeft.
//  3. (16-10-2026) Een klant kan een tweede balk krijgen met profile.ctaBalken = { aantal: 2 }: direct na de sectie
//     met klantervaringen. Standaard is er een balk, dus bestaande klanten veranderen niet.
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

// Index van de sectie waarin het formulier staat (of het aantal secties als het formulier buiten een sectie valt).
function formulierSectieIndex(bron, secties) {
  const markerPos = bron.search(MARKER_RE);
  const f = secties.findIndex((s) => markerPos >= s.start && markerPos < s.end);
  return f < 0 ? secties.length : f;
}

// Sectie met klantervaringen, herkend aan een lijst-slot of klasse met review, recensie, testimonial of ervaring.
// Zo werkt het voor elk sjabloon en elke klant, zonder vaste sectienamen.
const REVIEW_LIJST_RE = /\{\{#each\s+\w*(review|recensie|testimonial|ervaring)\w*/i;
const REVIEW_KLASSE_RE = /<section[^>]*\sclass=["'][^"']*(review|recensie|testimonial)[^"']*["']/i;
function vindReviewSectie(bron, secties) {
  return secties.findIndex((s) => {
    const deel = bron.slice(s.start, s.end);
    return REVIEW_LIJST_RE.test(deel) || REVIEW_KLASSE_RE.test(deel);
  });
}

// Plek van een TWEEDE CTA-balk (alleen als de klant dat wil, profile.ctaBalken.aantal = 2). Direct na de sectie met
// klantervaringen: dan zijn bezoekers het meest overtuigd. Zonder zo'n sectie ongeveer driekwart door de pagina.
// De balk moet minstens twee secties na de eerste balk komen en minstens twee secties voor het formulier, anders -1.
function kiesTweedeBalkPositie(html, secties, eersteBalk) {
  if (eersteBalk < 0) return -1;
  const bron = String(html || '');
  const f = formulierSectieIndex(bron, secties);
  const geldig = (i) => i >= eersteBalk + 2 && i <= f - 2;
  const review = vindReviewSectie(bron, secties);
  if (review >= 0 && geldig(review)) return review;
  const terugval = Math.floor((f * 3) / 4);
  return geldig(terugval) ? terugval : -1;
}

const BALK_CSS = (rootClass) => `<style>
.${rootClass} .lp-cta-balk { padding: 40px 24px; text-align: center; font-family: var(--lp-font-body); }
.${rootClass} .lp-cta-balk-tekst { margin: 0 0 16px; font-family: var(--lp-font-heading); font-size: 1.5rem; line-height: 1.25; color: var(--lp-text); }
.${rootClass} .lp-formulier { scroll-margin-top: 110px; }
</style>`;

// Zoekt de eerste CTA-knop die naar het formulier springt en geeft zijn klassen terug, zodat de balk
// dezelfde knop krijgt als de hero of de kop van het sjabloon. Altijd aangevuld met de centrale klasse
// lp-cta-button (zie style.js), die de vormtaal van de klant regelt.
const FORMULIER_ANKER_RE = new RegExp('<a\\b[^>]*\\bhref=(["\'])#' + FORMULIER_ID + '\\1[^>]*>', 'i');
function knopKlassen(html) {
  const m = FORMULIER_ANKER_RE.exec(String(html || ''));
  const cls = m ? /\sclass=(["'])([^"']*)\1/i.exec(m[0]) : null;
  const eigen = cls ? cls[2].split(/\s+/).filter((c) => c && c !== 'lp-cta-button') : [];
  return [...eigen, 'lp-cta-button'].join(' ');
}

// html: sjabloon-HTML na het verbergen van secties, vóór het taggen voor het voorbeeld.
// actief: true als er een formulier is dat getoond wordt. slotData wordt alleen gelezen (ctaBandTekst is optioneel).
function pasFormulierCtaToe(html, { actief, rootClass, slotData, aantalBalken }) {
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
      `<a class="${knopKlassen(out)}" href="#${FORMULIER_ID}">{{ctaLabel}}</a></div>`;
    // Eerst de latere plek invoegen, zodat de eerste positie niet verschuift.
    const k2 = Number(aantalBalken) >= 2 ? kiesTweedeBalkPositie(out, secties, k) : -1;
    if (k2 >= 0) out = out.slice(0, secties[k2].end) + balk + out.slice(secties[k2].end);
    out = out.slice(0, secties[k].end) + balk + out.slice(secties[k].end);
    balkToegevoegd = true;
  }
  return { html: out, css: balkToegevoegd || out !== bron ? BALK_CSS(rootClass) : '', balkToegevoegd };
}

module.exports = { pasFormulierCtaToe, FORMULIER_ID, kiesBalkPositie, kiesTweedeBalkPositie, vindReviewSectie, knopKlassen };
