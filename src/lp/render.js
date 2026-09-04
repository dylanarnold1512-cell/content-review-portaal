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
const { renderSlotTemplate, tagImageSlotsForPreview, tagTextSlotsForPreview } = require('./slotEngine');
const { slugify } = require('./utils');

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
        tagImageSlotsForPreview(htmlTemplateRaw, page.template && page.template.slots),
        page.template && page.template.slots
      )
    : htmlTemplateRaw;
  const body = renderSlotTemplate(htmlTemplate, slotData);
  const schemas = collectSlotSchemas(slotData);
  const schemaScript = schemas.length
    ? `\n<script type="application/ld+json">${JSON.stringify(schemas.length === 1 ? schemas[0] : schemas)}</script>`
    : '';
  return `${baseStyle}
<style>
${templateCss}
</style>
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
