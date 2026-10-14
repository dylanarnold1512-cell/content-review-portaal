// Pagr. (LP Fabriek): echte zoekvragen voor de veelgestelde vragen van een pagina, en een controle op dubbele vragen
// tussen zusterpagina's (Dylan, 14-10-2026).
//
// Aanleiding: de FAQ van locatiepagina's bij MAC Bouw was bijna overal gelijk ("Werkt MAC Bouw in [plaats]?",
// "Welke werkzaamheden...", "Helpt MAC Bouw bij een vergunning..."). Die vragen komen niet uit wat mensen echt
// zoeken. Dubbele vragen over pagina's heen zijn bovendien slecht voor SEO en AI antwoorden.
//
// Bron van de zoekvragen: de Google suggesties (publiek, zonder sleutel) bij een dienst met vraagwoorden ervoor.
// Dat zijn vragen die mensen echt intypen. Mislukt het ophalen, dan gaat de pagina gewoon door zonder deze lijst.
// Uitkomst wordt 24 uur onthouden per zoekopdracht.

const SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';
const TIMEOUT_MS = 5000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const PARALLEL = 4;
const MAX_VRAGEN = 14;

const VRAAGWOORDEN = ['hoe', 'wat', 'kan', 'mag', 'heb ik', 'moet ik', 'hoeveel', 'hoelang', 'waarom', 'wanneer', 'welke', 'is het', 'wat kost'];
const VRAAG_START_RE = /^(hoe|wat|kan|mag|heb|moet|hoeveel|hoelang|waarom|wanneer|welke|is|zijn|wie|waar|waarvoor|doe|krijg|bestaat|bestaan|wordt)\b/i;

const CACHE = new Map();

async function haalSuggesties(zoekterm, fetchImpl) {
  const sleutel = zoekterm.toLowerCase();
  const cached = CACHE.get(sleutel);
  if (cached && Date.now() - cached.tijd < CACHE_MS) return cached.lijst;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let lijst = [];
  try {
    const url = `${SUGGEST_URL}?client=firefox&hl=nl&gl=nl&q=${encodeURIComponent(zoekterm)}`;
    const res = await (fetchImpl || fetch)(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pagr-zoekvragen/1.0)' } });
    if (res.ok) {
      const json = JSON.parse(await res.text());
      lijst = Array.isArray(json && json[1]) ? json[1].filter((s) => typeof s === 'string') : [];
    }
  } catch (err) {
    lijst = [];
  } finally {
    clearTimeout(timer);
  }
  if (lijst.length) CACHE.set(sleutel, { tijd: Date.now(), lijst });
  return lijst;
}

async function inBatches(items, n, fn) {
  const uit = [];
  for (let i = 0; i < items.length; i += n) {
    uit.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  }
  return uit;
}

// Haalt de diensten uit een invoerveld als "verbouw, renovatie en onderhoud" (maximaal twee).
function dienstenUitTekst(tekst) {
  return String(tekst || '')
    .split(/,|\sen\s|&|\/|\sof\s/i)
    .map((d) => d.trim())
    .filter((d) => d.length >= 3)
    .slice(0, 2);
}

function schoonVraag(s) {
  let v = String(s || '').replace(/\s+/g, ' ').trim();
  if (!v) return '';
  v = v.charAt(0).toUpperCase() + v.slice(1);
  if (VRAAG_START_RE.test(v) && !/[?]$/.test(v)) v += '?';
  return v;
}

// Echte zoekvragen bij een dienst. Geeft een lijst { vraag, bron } terug, nooit een fout.
// Alleen suggesties die als vraag beginnen worden bewaard, en alleen als ze over de dienst gaan.
async function haalZoekvragen({ diensten, plaats, fetchImpl } = {}) {
  const lijst = (Array.isArray(diensten) ? diensten : dienstenUitTekst(diensten)).filter(Boolean).slice(0, 2);
  if (!lijst.length) return [];
  const zoektermen = [];
  for (const dienst of lijst) {
    VRAAGWOORDEN.forEach((w) => zoektermen.push({ q: `${w} ${dienst}`, dienst }));
    if (plaats) zoektermen.push({ q: `${dienst} ${plaats}`, dienst });
  }
  const resultaten = await inBatches(zoektermen, PARALLEL, async (z) => ({ z, suggesties: await haalSuggesties(z.q, fetchImpl) }));
  const gezien = new Set();
  const uit = [];
  for (const { z, suggesties } of resultaten) {
    const kernWoorden = z.dienst.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const s of suggesties) {
      const vraag = schoonVraag(s);
      if (!VRAAG_START_RE.test(vraag)) continue;
      if (vraag.length < 15 || vraag.length > 110) continue;
      const laag = vraag.toLowerCase();
      if (kernWoorden.length && !kernWoorden.some((w) => laag.includes(w.slice(0, Math.max(4, w.length - 2))))) continue;
      const sleutel = laag.replace(/[^a-z0-9 ]/g, '');
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      uit.push({ vraag, bron: 'Google suggesties' });
    }
  }
  return uit.slice(0, MAX_VRAGEN);
}

// Alle vragen uit de inhoud van een pagina (slotData met een lijst waarvan de items een vraag hebben).
function vragenUitContent(content) {
  const slotData = (content && (content.slotData || content)) || {};
  const uit = [];
  for (const waarde of Object.values(slotData)) {
    if (!Array.isArray(waarde)) continue;
    for (const item of waarde) {
      if (item && typeof item === 'object' && typeof (item.question || item.vraag) === 'string') uit.push((item.question || item.vraag).trim());
    }
  }
  return uit.filter(Boolean);
}

const STOPWOORDEN = new Set(['de', 'het', 'een', 'en', 'of', 'in', 'op', 'te', 'voor', 'van', 'met', 'ik', 'u', 'je', 'jij', 'we', 'wij', 'is', 'zijn', 'dat', 'die', 'dit', 'bij', 'om', 'aan', 'naar', 'ook', 'er']);

function kernWoorden(vraag, plaatsen) {
  let t = String(vraag || '').toLowerCase().replace(/[^a-z0-9àáâäçèéêëìíîïñòóôöùúûüý\s-]/g, ' ');
  (plaatsen || []).filter(Boolean).forEach((p) => { t = t.split(String(p).toLowerCase()).join(' '); });
  return new Set(t.split(/\s+/).filter((w) => w.length > 1 && !STOPWOORDEN.has(w)));
}

function gelijkenis(a, b) {
  if (!a.size || !b.size) return 0;
  let gemeen = 0;
  a.forEach((w) => { if (b.has(w)) gemeen += 1; });
  return gemeen / (a.size + b.size - gemeen);
}

// Vragen die (na weglaten van plaatsnamen en lidwoorden) vrijwel gelijk zijn aan een vraag van een zusterpagina.
// Geeft per dubbele vraag de vraag en de vraag van de zusterpagina terug. Drempel 0,7.
function vindDubbeleVragen({ vragen, zusterVragen, plaatsen, drempel = 0.7, negeer = /^werk(t|en)\b/i } = {}) {
  const zusters = (zusterVragen || []).map((v) => ({ v, k: kernWoorden(v, plaatsen) }));
  const dubbel = [];
  for (const vraag of vragen || []) {
    // De vraag of het bedrijf in deze plaats werkt mag op elke locatiepagina staan.
    if (negeer && negeer.test(vraag.trim())) continue;
    const k = kernWoorden(vraag, plaatsen);
    let beste = null;
    for (const z of zusters) {
      const g = gelijkenis(k, z.k);
      if (g >= drempel && (!beste || g > beste.g)) beste = { g, z: z.v };
    }
    if (beste) dubbel.push({ vraag, zusterVraag: beste.z });
  }
  return dubbel;
}

module.exports = { haalSuggesties, haalZoekvragen, dienstenUitTekst, vragenUitContent, vindDubbeleVragen, kernWoorden, gelijkenis, schoonVraag };
