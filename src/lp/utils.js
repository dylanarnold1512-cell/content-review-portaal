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

module.exports = { escapeHtml, slugify, stripHtml };
