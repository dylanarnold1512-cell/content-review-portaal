// Reviews staan op de klantsite met aanhalingstekens ("Hele fijne samenwerking"). De AI neemt de tekst letterlijk over en
// het sjabloon zet er zelf ook nog aanhalingstekens omheen, waardoor er dubbele tekens op de pagina stonden.
// Hier halen we de omhullende tekens uit de reviewtekst. Het sjabloon bepaalt de opmaak.
const OMHULLEND_RE = /^[\s"'“”„‟‘’‚‛«»″‶]+|[\s"'“”„‟‘’‚‛«»″‶]+$/g;
const REVIEW_SLOT_RE = /review|quote|testimonial|ervaring|citaat/i;
const REVIEW_VELD_RE = /^(quote|citaat|tekst|text|review|body|content)$/i;

function schoonReviewTekst(tekst) {
  const kaal = String(tekst).replace(OMHULLEND_RE, '');
  // Een apostrof of aanhalingsteken midden in de tekst blijft staan.
  return kaal || String(tekst);
}

// slotData: { reviewItems: [{ quote, author }], ... }. Past de data ter plekke aan en geeft hem terug.
function verwijderReviewAanhalingstekens(slotData) {
  if (!slotData || typeof slotData !== 'object') return slotData;
  for (const [key, value] of Object.entries(slotData)) {
    if (!Array.isArray(value) || !REVIEW_SLOT_RE.test(key)) continue;
    value.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      for (const [veld, waarde] of Object.entries(item)) {
        if (typeof waarde === 'string' && REVIEW_VELD_RE.test(veld)) item[veld] = schoonReviewTekst(waarde);
      }
    });
  }
  return slotData;
}

module.exports = { verwijderReviewAanhalingstekens, schoonReviewTekst };
