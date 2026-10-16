// Sjabloon dupliceren (16-10-2026). De kopie neemt de opzet (HTML, CSS, slots, volgorde van de secties en de
// voorbeeldtekst) letterlijk over, zodat de look and feel gelijk blijft. Daarna pas je alleen aan wat anders moet.
// De kopie staat los van het origineel en start altijd als Concept, zodat er niet per ongeluk pagina's op worden gemaakt.
// Alleen pure functies. Het aanmaken in Notion staat in routes/lp.js.

const { maakSlug } = require('./begeleiding');

function diepKopie(x) {
  return JSON.parse(JSON.stringify(x));
}

// Een blueprintId die nog niet bestaat bij deze klant: de naam als slug, zo nodig met een volgnummer erachter.
function uniekBlueprintId(naam, bestaande) {
  const basis = maakSlug(naam) || 'sjabloon';
  const gebruikt = new Set((bestaande || []).map((x) => String(x || '').toLowerCase()));
  if (!gebruikt.has(basis)) return basis;
  for (let i = 2; i < 100; i += 1) {
    const kandidaat = `${basis.slice(0, 56)}-${i}`;
    if (!gebruikt.has(kandidaat)) return kandidaat;
  }
  throw new Error('Kies een andere naam, er bestaan al te veel sjablonen met deze naam.');
}

function bouwSjabloonKopie(origineel, { naam, bestaandeSjablonen = [] } = {}) {
  const nieuweNaam = String(naam || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (nieuweNaam.length < 3) throw new Error('Geef de kopie een naam van minstens 3 tekens.');
  const o = origineel || {};
  if (!o.blueprint || typeof o.blueprint !== 'object' || !String(o.blueprint.htmlTemplate || '').trim()) {
    throw new Error('Dit sjabloon heeft nog geen opzet om te kopiëren.');
  }
  if (bestaandeSjablonen.some((s) => String(s.naam || '').trim().toLowerCase() === nieuweNaam.toLowerCase())) {
    throw new Error(`Er is al een sjabloon met de naam "${nieuweNaam}". Kies een andere naam.`);
  }
  return {
    klant: o.klant,
    naam: nieuweNaam,
    blueprintId: uniekBlueprintId(nieuweNaam, bestaandeSjablonen.map((s) => s.blueprintId)),
    status: 'Concept',
    blueprint: diepKopie(o.blueprint)
  };
}

module.exports = { bouwSjabloonKopie, uniekBlueprintId };
