// Dubbelingencontrole voor blogideeën (masterplan 0.6, stap 1: genormaliseerde
// vergelijking op hoofdkeyword in code). Semantische vergelijking via het
// taalmodel komt later.

const STOPWOORDEN = new Set([
  'de', 'het', 'een', 'en', 'van', 'voor', 'in', 'op', 'te', 'met', 'naar', 'bij', 'om', 'of', 'je', 'jouw', 'uw'
]);

function normaliseerKeyword(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWOORDEN.has(w))
    .sort()
    .join(' ');
}

// Geeft per overlap een reden: 'zelfde' (genormaliseerd gelijk) of 'deels'
// (alle woorden van het kortste keyword zitten in het andere, minimaal 2 woorden).
function vergelijkKeywords(a, b) {
  const na = normaliseerKeyword(a);
  const nb = normaliseerKeyword(b);
  if (!na || !nb) return null;
  if (na === nb) return 'zelfde';
  const wa = na.split(' ');
  const wb = nb.split(' ');
  const [kort, lang] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (kort.length >= 2 && kort.every((w) => lang.includes(w))) return 'deels';
  return null;
}

// idee: { id, mainKeyword }, anderen: lijst items met { id, titel, status, mainKeyword, liveUrl }
function vindOverlap(idee, anderen) {
  const resultaat = [];
  for (const ander of anderen) {
    if (ander.id === idee.id) continue;
    const reden = vergelijkKeywords(idee.mainKeyword, ander.mainKeyword);
    if (reden) {
      resultaat.push({
        id: ander.id,
        titel: ander.titel,
        status: ander.status,
        mainKeyword: ander.mainKeyword,
        liveUrl: ander.liveUrl || '',
        reden
      });
    }
  }
  return resultaat;
}

module.exports = { normaliseerKeyword, vergelijkKeywords, vindOverlap };
