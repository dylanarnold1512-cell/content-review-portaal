// Kleine hulpfuncties voor de LP Fabriek renderer. Puur en zonder afhankelijkheden,
// zodat blokken en tests niet aan Express of Notion hoeven te denken.

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function stripHtml(value, maxLength) {
  const zonderTags = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (typeof maxLength === 'number' && zonderTags.length > maxLength) {
    return `${zonderTags.slice(0, maxLength).trim()}...`;
  }
  return zonderTags;
}

// Notion geeft een validatiefout ("select option ... not found for property ...") als je filtert op een
// keuzewaarde die (nog) niet in het keuzeveld staat. Bij een NIEUWE klant is dat normaal: de klant
// bestaat in de code, maar er is nog geen sjabloon of pagina, dus de klantwaarde is nog nooit in Notion
// gebruikt (Notion maakt de optie pas aan bij het eerste aanmaken). Dat betekent gewoon "nog niets
// gevonden" en is geen fout. Zonder deze check faalde de hele klantenlijst zodra er een klant zonder
// sjablonen bijkwam (25-09-2026, MAC Bouw).
function isOntbrekendeSelectOptie(err) {
  return !!(err && /select option .* not found/i.test(String(err.message || '')));
}

module.exports = { escapeHtml, slugify, stripHtml, isOntbrekendeSelectOptie };
