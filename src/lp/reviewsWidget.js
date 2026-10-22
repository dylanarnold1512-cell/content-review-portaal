// Google recensies widget (22-10-2026, Dylan): heeft een klant op de eigen site een widget met Google recensies,
// dan herkent de intake dat deterministisch (net als formulieren en de SEO plugin) en kan Pagr. dezelfde widget tonen.
// De widget laat echte recensies zien, de AI schrijft er niets bij. Op de echte pagina komt de shortcode, in het
// portaalvoorbeeld een placeholder (de shortcode werkt alleen op de klantsite zelf).
//
// Instellen per klant: profile.reviewsWidget = { plugin: 'grw', shortcode: '[grw id=2306]', titel?: 'Wat klanten zeggen' }.
// Het sjabloon bepaalt de plek met {{reviewsWidget}}. Staat die marker er niet in, dan komt het blok vlak voor het laatste
// onderdeel van de pagina (meestal het contactblok).

const MARKER_RE = /\{\{\s*reviewsWidget\s*\}\}/g;

// Herkenbare sporen in de gerenderde HTML. Alleen plugins met een shortcode zijn zelf te tonen (kanTonen).
const PLUGINS = [
  { plugin: 'grw', naam: 'Widget Plugin for Google Reviews', test: /\bwp-gr\b|\bgrw-|rplg-|wp-google-reviews|widget-google-reviews/i, kanTonen: true },
  { plugin: 'trustindex', naam: 'Trustindex', test: /trustindex|\bti-widget\b|\bti-review-/i, kanTonen: false },
  { plugin: 'elfsight', naam: 'Elfsight', test: /elfsight-app-|apps\.elfsight\.com/i, kanTonen: false },
  { plugin: 'embedsocial', naam: 'EmbedSocial', test: /embedsocial|embedsocial\.com/i, kanTonen: false },
  { plugin: 'reviews-io', naam: 'Google reviews widget (onbekend)', test: /google[-_ ]reviews?[-_ ]widget|gmb[-_]reviews/i, kanTonen: false }
];

function detecteerReviewWidget(html) {
  const h = String(html || '');
  for (const p of PLUGINS) {
    if (!p.test.test(h)) continue;
    let shortcode = null;
    if (p.plugin === 'grw') {
      // De plugin zet het widget id op het element (data-id). Niet altijd aanwezig; dan moet het id handmatig worden ingevuld.
      const m = h.match(/wp-gr\b[^>]*\bdata-id=["'](\d+)["']/i) || h.match(/\bdata-id=["'](\d+)["'][^>]*\bwp-gr\b/i);
      if (m) shortcode = `[grw id=${m[1]}]`;
    }
    return { plugin: p.plugin, naam: p.naam, shortcode, kanTonen: p.kanTonen };
  }
  return null;
}

function getConfig(profile) {
  const w = profile && profile.reviewsWidget;
  return w && typeof w.shortcode === 'string' && w.shortcode.trim() ? w : null;
}

// Zet het blok in de HTML. naarWordPress: de echte shortcode; anders een placeholder. Geeft { html, css }.
function pasReviewsWidgetToe(html, { profile, rootClass, naarWordPress }) {
  const config = getConfig(profile);
  MARKER_RE.lastIndex = 0;
  const heeftMarker = MARKER_RE.test(html);
  MARKER_RE.lastIndex = 0;
  if (!config) return { html: html.replace(MARKER_RE, ''), css: '' };
  const titel = config.titel || 'Wat klanten zeggen';
  const binnen = naarWordPress
    ? config.shortcode
    : '<div class="lp-reviews-placeholder">Hier verschijnen de Google recensies van de klant op de echte pagina.</div>';
  const blok = `<section class="lp-reviews-widget" id="recensies"><div class="lp-reviews-widget-in"><h2>${titel.replace(/[<>&]/g, '')}</h2>\n${binnen}\n</div></section>`;
  const css = `<style>
.${rootClass} .lp-reviews-widget { padding: 56px 0; }
.${rootClass} .lp-reviews-widget-in { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
.${rootClass} .lp-reviews-widget h2 { margin: 0 0 24px; }
.${rootClass} .lp-reviews-placeholder { padding: 24px; border: 2px dashed var(--lp-border, #ccc); border-radius: var(--lp-radius, 8px); text-align: center; opacity: .75; }
</style>`;
  if (heeftMarker) return { html: html.replace(MARKER_RE, blok), css };
  const laatste = html.lastIndexOf('<section');
  if (laatste === -1) return { html, css: '' };
  return { html: html.slice(0, laatste) + blok + '\n' + html.slice(laatste), css };
}

module.exports = { detecteerReviewWidget, pasReviewsWidgetToe, getConfig, PLUGINS };
