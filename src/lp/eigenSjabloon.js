// Pagina's met een eigen sjabloon (23-10-2026): een pagina die in de chat is gebouwd (zie chatBouwer.js) heeft haar
// sjabloon in de pagina zelf (Notion sectie "Eigen sjabloon"), niet in de Sjablonen database. Overal waar de code het
// sjabloon van een pagina ophaalt, kijkt hij eerst hier. Geeft null terug voor een gewone pagina, dan geldt het actieve
// sjabloon uit de Sjablonen database zoals altijd.
const { zorgVoorGalerijSlot } = require('./galerij');

const CHAT_BLUEPRINT = 'chat';

function eigenSjabloonVan(page) {
  const s = page && page.sjabloon;
  const bp = s && s.blueprint;
  if (!bp || typeof bp !== 'object' || bp.templateFormat !== 'slots' || typeof bp.htmlTemplate !== 'string') return null;
  return { id: page.blueprint || CHAT_BLUEPRINT, naam: page.titel || 'Eigen sjabloon', clientId: page.klant, ...zorgVoorGalerijSlot(bp) };
}

module.exports = { eigenSjabloonVan, CHAT_BLUEPRINT };
