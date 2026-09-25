// Gedeelde hulpfuncties om een LP Fabriek pagina te renderen, gebruikt door zowel de interne routes
// (src/routes/lp.js: voorbeeld en publiceren) als de publieke deellink (src/routes/share.js).
// Eerder stonden deze twee functies los in routes/lp.js; verplaatst zodat beide routes exact
// dezelfde logica gebruiken en er nooit een verschil kan ontstaan tussen wat je in het portaal
// ziet en wat de klant via de deellink ziet.

// Bouwt de juiste render-invoer op basis van het sjabloonformaat.
function buildRenderPage({ blueprint, content, clientId, slug, invoer }) {
  if (blueprint.templateFormat === 'slots') {
    // invoer (bv. de plaatsnaam) is nodig voor het dienst-schema, zie seoSchema.js.
    return { clientId, slug, template: blueprint, slotData: (content && content.slotData) || {}, invoer: invoer || {} };
  }
  return { clientId, slug, blocks: (content && content.blocks) || [] };
}

function contentIsEmpty(blueprint, content) {
  if (!content) return true;
  if (blueprint.templateFormat === 'slots') {
    return !content.slotData || !Object.keys(content.slotData).length;
  }
  return !Array.isArray(content.blocks) || !content.blocks.length;
}

module.exports = { buildRenderPage, contentIsEmpty };
