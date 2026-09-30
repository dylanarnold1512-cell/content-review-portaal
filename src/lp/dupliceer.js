// Pagina dupliceren (30-09-2026). Voor pagina's die op elkaar lijken: een dienst per plaats (MAC Bouw), een
// event per datum of locatie (Roots). Twee manieren:
//  'opzet'   (standaard, aanbevolen): klant, sjabloon, invoer en feitensheet worden gekopieerd, de TEKST niet.
//            De AI schrijft de tekst opnieuw voor de nieuwe plaats. Zo ontstaat er geen kopie.
//  'kopieer' : ook de tekst wordt gekopieerd, met de oude plaatsnaam vervangen door de nieuwe. Handig voor
//            kleine wijzigingen (een event met een andere datum), voor plaatsen afgeraden (doorway risico).
// Dit bestand bevat alleen pure functies. Het aanmaken in Notion staat in routes/lp.js.

const { plaatsWaarde, PLAATS_SLEUTEL_RE } = require('./gelijkenis');
const { slugify } = require('./utils');

function escRe(t) {
  return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Vervangt een plaatsnaam als heel woord, hoofdletterongevoelig.
function vervangPlaats(tekst, oud, nieuw) {
  if (typeof tekst !== 'string' || !oud || !nieuw) return tekst;
  return tekst.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(oud)}(?![\\p{L}\\p{N}])`, 'giu'), (m, voor) => `${voor}${nieuw}`);
}

const NIET_AANRAKEN = /(imagesrc|href|url|slug)$/i;

function vervangDiep(waarde, oud, nieuw, sleutel) {
  if (typeof waarde === 'string') return sleutel && NIET_AANRAKEN.test(sleutel) ? waarde : vervangPlaats(waarde, oud, nieuw);
  if (Array.isArray(waarde)) return waarde.map((w) => vervangDiep(w, oud, nieuw, sleutel));
  if (waarde && typeof waarde === 'object') {
    const uit = {};
    Object.entries(waarde).forEach(([k, v]) => { uit[k] = vervangDiep(v, oud, nieuw, k); });
    return uit;
  }
  return waarde;
}

// De sleutels van de invoer die een plaats bevatten (plaatsnaam, stad, gemeente, locatie, regio).
function plaatsSleutels(invoer) {
  return Object.keys(invoer || {}).filter((k) => !k.startsWith('_') && PLAATS_SLEUTEL_RE.test(k));
}

// Titel voor een nieuwe plaats: staat de oude plaats in de titel, dan vervangen, anders erachter zetten.
function titelVoorPlaats(titel, oudePlaats, nieuwePlaats) {
  const t = String(titel || '').trim();
  if (oudePlaats && new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(oudePlaats)}(?![\\p{L}\\p{N}])`, 'iu').test(t)) return vervangPlaats(t, oudePlaats, nieuwePlaats);
  return `${t} ${nieuwePlaats}`.trim();
}

// Lokale gegevens (een per regel) als extra feiten. Alleen wat Dylan zelf opgeeft, dus met die bron.
function lokaleFeiten(tekst, plaats, datum) {
  return String(tekst || '')
    .split(/\r?\n/)
    .map((r) => r.replace(/^[\s*•]+/, '').trim())
    .filter(Boolean)
    .map((regel) => ({
      label: `Lokale informatie${plaats ? ` ${plaats}` : ''}`,
      waarde: regel,
      bron: `opgegeven door de beheerder voor de pagina in ${plaats || 'deze plaats'}, ${datum}`
    }));
}

// origineel: { klant, blueprint, titel, invoer, feitensheet, content }
// opties: { titel, slug, invoer (volledige nieuwe invoer, optioneel), modus, lokaleGegevens, datum }
function bouwKopie(origineel, opties = {}) {
  const datum = opties.datum || new Date().toISOString().slice(0, 10);
  const oudeInvoer = origineel.invoer && typeof origineel.invoer === 'object' ? origineel.invoer : {};
  const invoer = { ...oudeInvoer, ...(opties.invoer && typeof opties.invoer === 'object' ? opties.invoer : {}) };
  const oudePlaats = plaatsWaarde(oudeInvoer);
  const nieuwePlaats = plaatsWaarde(invoer);
  const modus = opties.modus === 'kopieer' ? 'kopieer' : 'opzet';
  const titel = String(opties.titel || '').trim() || titelVoorPlaats(origineel.titel, oudePlaats, nieuwePlaats);
  const slug = String(opties.slug || '').trim() || slugify(titel);

  // Feitensheet: alles behalve de lokale informatie van de oude plaats, plus de nieuwe lokale gegevens.
  const oud = origineel.feitensheet && typeof origineel.feitensheet === 'object' ? origineel.feitensheet : null;
  const extra = ((oud && oud.extra) || []).filter((f) => !(f && /^lokale informatie/i.test(String(f.label || ''))));
  const nieuweLokaal = lokaleFeiten(opties.lokaleGegevens, nieuwePlaats, datum);
  const feitensheet = oud || nieuweLokaal.length
    ? { ...(oud || { gebruikt: [] }), gebruikt: (oud && oud.gebruikt) || [], extra: [...extra, ...nieuweLokaal] }
    : null;

  let content = null;
  if (modus === 'kopieer' && origineel.content && typeof origineel.content === 'object') {
    content = oudePlaats && nieuwePlaats && oudePlaats.toLowerCase() !== nieuwePlaats.toLowerCase()
      ? vervangDiep(origineel.content, oudePlaats, nieuwePlaats)
      : JSON.parse(JSON.stringify(origineel.content));
  }
  return { klant: origineel.klant, blueprint: origineel.blueprint, titel, slug, invoer, feitensheet, content, modus, oudePlaats, nieuwePlaats };
}

module.exports = { bouwKopie, vervangPlaats, titelVoorPlaats, lokaleFeiten, plaatsSleutels };
