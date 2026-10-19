// Projectfoto's zonder tekst (19-10-2026). Heeft een klant geen projectteksten op de eigen site, dan tonen we
// altijd een vaste rij van MIN_FOTOS echte foto's van afgerond werk, zonder verzonnen titels of plaatsen.
// Gebruik: eerst zorgVoorProjectItems (lege items erbij zodat de fotokiezer er slots voor heeft), na het
// kiezen van de foto's ruimOpProjectItems (items zonder foto weghalen, lege intro leegmaken).

const MIN_FOTOS = 3;
const PROJECT_LIJST_RE = /project/i;
const IMAGE_SRC_RE = /imagesrc$/i;
const TEKSTVELDEN_RE = /^(title|text|location|plaats|description|caption)$/i;

function projectLijsten(template) {
  const slots = Array.isArray(template && template.slots) ? template.slots : [];
  return slots.filter(
    (s) => s && s.type === 'list' && PROJECT_LIJST_RE.test(s.key) && Array.isArray(s.itemFields) && s.itemFields.some((f) => IMAGE_SRC_RE.test(f))
  );
}

function leegItem(slot) {
  const item = {};
  slot.itemFields.forEach((f) => { item[f] = ''; });
  return item;
}

function zorgVoorProjectItems(template, slotData, min = MIN_FOTOS) {
  for (const slot of projectLijsten(template)) {
    const items = Array.isArray(slotData[slot.key]) ? slotData[slot.key] : [];
    while (items.length < min) items.push(leegItem(slot));
    slotData[slot.key] = items;
  }
  return slotData;
}

function heeftTekst(item, slot) {
  return slot.itemFields.some((f) => TEKSTVELDEN_RE.test(f) && String((item && item[f]) || '').trim());
}

function ruimOpProjectItems(template, slotData) {
  const slots = Array.isArray(template && template.slots) ? template.slots : [];
  for (const slot of projectLijsten(template)) {
    const beeldVeld = slot.itemFields.find((f) => IMAGE_SRC_RE.test(f));
    const items = (Array.isArray(slotData[slot.key]) ? slotData[slot.key] : []).filter((i) => i && String(i[beeldVeld] || '').trim());
    slotData[slot.key] = items;
    // Zonder projectteksten is een intro over "de projecten" leeg gebabbel: leegmaken (alleen als het veld niet verplicht is).
    if (items.filter((i) => heeftTekst(i, slot)).length < 2) {
      const intro = slots.find((s) => s.key === slot.key.replace(/Items$/, 'Intro') && !s.verplicht);
      if (intro) slotData[intro.key] = '';
    }
  }
  return slotData;
}

module.exports = { zorgVoorProjectItems, ruimOpProjectItems, projectLijsten, MIN_FOTOS };
