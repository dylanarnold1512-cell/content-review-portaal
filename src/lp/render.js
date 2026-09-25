// Zet een pagina om in kant-en-klare WordPress-content: <style> met
// klanttokens + gerenderde inhoud, gewrapt in een Gutenberg custom-HTML
// block comment zodat wpautop de HTML niet kapotmaakt (zie besluiten.md,
// "WordPress publiceren: rauwe HTML wordt gemangeld").
//
// Sinds bouwvolgorde-stap 3 (koerswijziging naar vrije templates) bestaan er
// TWEE renderpaden naast elkaar:
//  - BLOKKEN-pad (oud, ongewijzigd): page.blocks is een array van
//    { type, data } die door het vaste blokkenpalet (src/lp/blocks/) wordt
//    gerenderd. Dit blijft de manier waarop bestaande sjablonen (bv. "Roots
//    Event") werken — geen gedwongen migratie, zie besluiten.md.
//  - SLOT-pad (nieuw): page.template is een AI-ontworpen bespoke
//    HTML/CSS-sjabloon met genoemde "slots"; page.slotData vult die slots.
// Welk pad gebruikt wordt hangt puur af van welke velden meegegeven worden
// (blocks vs. template+slotData) — de aanroeper (routes/lp.js) bepaalt dat
// op basis van blueprint.templateFormat.

const { getTokens } = require('./tokens');
const { renderStyle } = require('./style');
const { renderBlock, blocks } = require('./blocks');
const { renderSlotTemplate, tagImageSlotsForPreview, tagTextSlotsForPreview, tagLinkSlotsForPreview } = require('./slotEngine');
const { slugify } = require('./utils');
const { clients } = require('./clients');
const { buildFormulierCss } = require('./formulierStijl');

function renderPageHtml(page, opts) {
  if (page && page.template) {
    return renderSlotPageHtml(page, opts);
  }
  return renderBlockPageHtml(page);
}

// ---- Blokken-pad (ongewijzigd t.o.v. voor bouwvolgorde-stap 3) ----
function renderBlockPageHtml(page) {
  const tokens = getTokens(page.clientId);
  const rootClass = `lp-root-${slugify(page.slug)}`;
  const style = renderStyle(rootClass, tokens);
  const pageBlocks = Array.isArray(page.blocks) ? page.blocks : [];
  const body = pageBlocks.map(renderBlock).join('\n');
  const schemas = collectBlockSchemas(pageBlocks);
  const schemaScript = schemas.length
    ? `\n<script type="application/ld+json">${JSON.stringify(schemas.length === 1 ? schemas[0] : schemas)}</script>`
    : '';
  return `${style}
<div class="${rootClass}">
${body}
</div>${schemaScript}`;
}

// Verzamelt JSON-LD uit blokken die dat ondersteunen (nu alleen faq).
function collectBlockSchemas(pageBlocks) {
  const schemas = [];
  for (const block of pageBlocks) {
    const definition = blocks[block.type];
    if (definition && typeof definition.renderSchema === 'function') {
      const schema = definition.renderSchema(block.data || {});
      if (schema) schemas.push(schema);
    }
  }
  return schemas;
}

// ---- Slot-pad (nieuw, bouwvolgorde-stap 3) ----
// page: { clientId, slug, template: { htmlTemplate, cssTemplate, ... }, slotData }
// De vaste marker-class ".lpt" is waar het AI-gegenereerde cssTemplate zijn
// selectors onder scopet (zie ai.js systeemprompt) — de echte, per-pagina
// unieke rootClass zit op hetzelfde element, zodat twee gerenderde pagina's
// elkaars stijl nooit kunnen beinvloeden, ook al gebruiken ze hetzelfde
// sjabloon.
// Formulier-marker (25-09-2026): een sjabloon zet op de plek waar een formulier hoort exact {{formulier}}.
// Het is bewust GEEN slot (geen content van de AI): welk formulier het is bepaalt de klant
// (profile.formulier: plugin + shortcode, bron in feiten.js), het sjabloon bepaalt alleen de plek.
//  - Echte WordPress-pagina (opts.forWordPress): de shortcode, WordPress rendert het formulier zelf,
//    plus de opmaakregels van formulierStijl.js zodat het bij de pagina past.
//  - Alles anders (portaalvoorbeeld, deellink): een placeholder, zodat er nooit een kale shortcode
//    zichtbaar is. Heeft de klant geen formulier ingesteld, dan verdwijnt de marker op WordPress.
const FORMULIER_MARKER_RE = /\{\{\s*formulier\s*\}\}/g;

function getFormulierConfig(clientId) {
  const client = clients[clientId];
  const formulier = client && client.profile && client.profile.formulier;
  return formulier && formulier.shortcode ? formulier : null;
}

function applyFormulierMarker(html, clientId, rootClass, opts) {
  if (!FORMULIER_MARKER_RE.test(html)) {
    FORMULIER_MARKER_RE.lastIndex = 0;
    return { html, css: '' };
  }
  FORMULIER_MARKER_RE.lastIndex = 0;
  const config = getFormulierConfig(clientId);
  const naarWordPress = !!(opts && opts.forWordPress);
  if (naarWordPress) {
    if (!config) return { html: html.replace(FORMULIER_MARKER_RE, ''), css: '' };
    return {
      html: html.replace(FORMULIER_MARKER_RE, `<div class="lp-formulier">\n${config.shortcode}\n</div>`),
      css: buildFormulierCss(rootClass, config.plugin)
    };
  }
  const tekst = config
    ? 'Hier verschijnt het contactformulier op de echte pagina.'
    : 'Hier komt een formulier, maar voor deze klant is nog geen formulier ingesteld.';
  const css = `<style>\n.${rootClass} .lp-formulier-placeholder { padding: 24px; border: 2px dashed var(--lp-border); border-radius: var(--lp-radius); text-align: center; color: var(--lp-text-muted, var(--lp-text)); font-family: var(--lp-font-body); }\n</style>`;
  return {
    html: html.replace(FORMULIER_MARKER_RE, `<div class="lp-formulier lp-formulier-placeholder">${tekst}</div>`),
    css
  };
}

function renderSlotPageHtml(page, opts) {
  const tokens = getTokens(page.clientId);
  const rootClass = `lp-root-${slugify(page.slug)}`;
  const baseStyle = renderStyle(rootClass, tokens);
  const templateCss = String((page.template && page.template.cssTemplate) || '');
  const slotData = page.slotData || {};
  const htmlTemplateRaw = (page.template && page.template.htmlTemplate) || '';
  // Alleen voor het voorbeeldscherm (opts.forPreview) markeren we afbeeldingen én tekst-slots met
  // welke slot ze zijn, zodat je erop kan klikken om te wisselen/aan te passen — de HTML die naar
  // WordPress gaat blijft schoon (geen data-lp-*-attributen).
  const htmlTemplate = (opts && opts.forPreview)
    ? tagTextSlotsForPreview(
        tagLinkSlotsForPreview(
          tagImageSlotsForPreview(htmlTemplateRaw, page.template && page.template.slots),
          page.template && page.template.slots
        ),
        page.template && page.template.slots
      )
    : htmlTemplateRaw;
  const metFormulier = applyFormulierMarker(htmlTemplate, page.clientId, rootClass, opts);
  const body = renderSlotTemplate(metFormulier.html, slotData);
  const schemas = collectSlotSchemas(slotData);
  const schemaScript = schemas.length
    ? `\n<script type="application/ld+json">${JSON.stringify(schemas.length === 1 ? schemas[0] : schemas)}</script>`
    : '';
  return `${baseStyle}
<style>
${templateCss}
</style>${metFormulier.css ? '\n' + metFormulier.css : ''}
<div class="${rootClass} lpt">
${body}
</div>${schemaScript}`;
}

// FAQPage JSON-LD, zelfde schema-vorm als de oude src/lp/blocks/faq.js —
// automatisch gegenereerd zodra een sjabloon een "faqItems"-slot met inhoud
// heeft, ongeacht hoe het sjabloon die visueel vormgeeft.
function collectSlotSchemas(slotData) {
  const schemas = [];
  const faqItems = Array.isArray(slotData.faqItems) ? slotData.faqItems : [];
  const valid = faqItems.filter((item) => item && item.question && item.answer);
  if (valid.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: valid.map((item) => ({
        '@type': 'Question',
        name: String(item.question),
        acceptedAnswer: { '@type': 'Answer', text: String(item.answer) }
      }))
    });
  }
  return schemas;
}

// De verplichte wrapper voor het WordPress content-veld. Los aanroepbaar
// gehouden zodat andere publicatiecode 'm ook kan gebruiken zonder blokken.
function wrapForWordPress(html) {
  return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
}

module.exports = { renderPageHtml, wrapForWordPress };
