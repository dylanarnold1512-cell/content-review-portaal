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

// Trefwoorden uit het onderwerp, om op de klantsite de pagina's over dat onderwerp voorrang te geven.
// "Dakkapellen" geeft ["dakkapellen", "dakkapel"]. Lidwoorden en kleine woorden blijven weg.
function trefwoordenUitOnderwerp(onderwerp) {
  const uit = new Set();
  String(onderwerp || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).forEach((w) => {
    if (w.length < 4 || ['voor', 'naar', 'over', 'met', 'van', 'een', 'het'].includes(w)) return;
    uit.add(w);
    let stam = w.replace(/(en|s)$/, '');
    if (/([bdfgklmnprst])\1$/.test(stam)) stam = stam.slice(0, -1);
    if (stam.length >= 4) uit.add(stam);
  });
  return [...uit].slice(0, 8);
}

// Waar de pagina's van dit sjabloon over gaan. Leeg onderwerp en lege instructie betekent: geen focus.
function schoonFocus(invoer) {
  const i = invoer || {};
  const onderwerp = String(i.onderwerp || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const instructie = String(i.instructie || '').replace(/[ \t]+/g, ' ').trim().slice(0, 1200);
  if (!onderwerp && !instructie) return null;
  return { onderwerp, instructie, trefwoorden: trefwoordenUitOnderwerp(onderwerp) };
}

function bouwSjabloonKopie(origineel, { naam, onderwerp, instructie, bestaandeSjablonen = [] } = {}) {
  const nieuweNaam = String(naam || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (nieuweNaam.length < 3) throw new Error('Geef de kopie een naam van minstens 3 tekens.');
  const o = origineel || {};
  if (!o.blueprint || typeof o.blueprint !== 'object' || !String(o.blueprint.htmlTemplate || '').trim()) {
    throw new Error('Dit sjabloon heeft nog geen opzet om te kopiëren.');
  }
  if (bestaandeSjablonen.some((s) => String(s.naam || '').trim().toLowerCase() === nieuweNaam.toLowerCase())) {
    throw new Error(`Er is al een sjabloon met de naam "${nieuweNaam}". Kies een andere naam.`);
  }
  const blueprint = diepKopie(o.blueprint);
  const focus = schoonFocus({ onderwerp, instructie });
  // Alleen de focus verschilt: HTML, CSS, slots en volgorde blijven precies gelijk aan het origineel.
  if (focus) blueprint.focus = focus; else delete blueprint.focus;
  return {
    klant: o.klant,
    naam: nieuweNaam,
    blueprintId: uniekBlueprintId(nieuweNaam, bestaandeSjablonen.map((s) => s.blueprintId)),
    status: 'Concept',
    blueprint
  };
}

module.exports = { bouwSjabloonKopie, uniekBlueprintId, schoonFocus, trefwoordenUitOnderwerp };
