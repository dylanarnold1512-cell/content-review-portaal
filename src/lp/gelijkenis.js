// SEO en GEO bij pagina's die op elkaar lijken (30-09-2026), bijvoorbeeld een dienstpagina per plaats.
// Pagina's die alleen een andere plaatsnaam hebben zijn "doorway pagina's": Google toont ze vaak niet en
// AI antwoorden citeren ze niet. Alles hier is deterministisch (geen AI) en geeft alleen WAARSCHUWINGEN:
//  1. gelijkenis: hoeveel tekst komt overeen met een zusterpagina (zelfde klant, zelfde sjabloon), met de
//     plaatsnamen eruit gehaald zodat een pure plaatswissel als 100 procent telt;
//  2. restanten: de plaatsnaam van een andere pagina staat nog in deze tekst;
//  3. werkgebied: de plaats staat niet in het werkgebied van de klant;
//  4. lokale gegevens: er zijn geen lokale feiten bij deze pagina.

const NEGEER_SLEUTELS = /(imagesrc|imagealt|icon|href|url|slug)$/i;
const PLAATS_SLEUTEL_RE = /plaats|stad|gemeente|locatie|regio/i;

// Alle zichtbare tekst van een pagina als een reeks strings (slotData en meta), zonder urls, iconen en afbeeldingen.
function verzamelTekst(content) {
  const uit = [];
  const loop = (waarde, sleutel) => {
    if (waarde === null || waarde === undefined) return;
    if (typeof waarde === 'string') {
      if (sleutel && NEGEER_SLEUTELS.test(sleutel)) return;
      if (/^https?:\/\//i.test(waarde.trim())) return;
      if (waarde.trim()) uit.push(waarde);
      return;
    }
    if (Array.isArray(waarde)) return waarde.forEach((w) => loop(w, sleutel));
    if (typeof waarde === 'object') Object.entries(waarde).forEach(([k, v]) => loop(v, k));
  };
  if (content && typeof content === 'object') {
    loop(content.slotData || {});
    loop(content.meta || {});
  }
  return uit;
}

function plaatsWaarde(invoer) {
  if (!invoer || typeof invoer !== 'object') return '';
  const sleutel = Object.keys(invoer).find((k) => !k.startsWith('_') && PLAATS_SLEUTEL_RE.test(k) && typeof invoer[k] === 'string' && invoer[k].trim());
  return sleutel ? invoer[sleutel].trim() : '';
}

function escRe(t) {
  return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function woorden(tekst) {
  return String(tekst || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

// Vervangt plaatsnamen door een vast woord, zodat een pure plaatswissel niet als "uniek" telt.
function neutraliseer(tekst, plaatsen) {
  let t = String(tekst || '');
  [...new Set(plaatsen.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .forEach((p) => { t = t.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(p)}(?![\\p{L}\\p{N}])`, 'giu'), '$1plaatsnaam'); });
  return t;
}

function schuifelSet(tekst, n = 4) {
  const w = woorden(tekst);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i += 1) set.add(w.slice(i, i + n).join(' '));
  return set;
}

// Aandeel van de kleinste tekst dat ook in de andere staat (0 tot 1). Zinnen van 4 woorden.
function gelijkenis(tekstA, tekstB, plaatsen = []) {
  const a = schuifelSet(neutraliseer(tekstA, plaatsen));
  const b = schuifelSet(neutraliseer(tekstB, plaatsen));
  if (!a.size || !b.size) return 0;
  let gemeen = 0;
  a.forEach((s) => { if (b.has(s)) gemeen += 1; });
  return gemeen / Math.min(a.size, b.size);
}

// pagina: { titel, invoer, content }. zusters: zelfde vorm. Geeft een lijst waarschuwingen (strings).
function gelijkenisWaarschuwingen(pagina, zusters, { grens = 0.6 } = {}) {
  const waarschuwingen = [];
  const eigen = verzamelTekst(pagina.content).join('\n');
  if (!eigen.trim()) return waarschuwingen;
  const eigenPlaats = plaatsWaarde(pagina.invoer);
  (zusters || []).forEach((z) => {
    const tekst = verzamelTekst(z.content).join('\n');
    if (!tekst.trim()) return;
    const zPlaats = plaatsWaarde(z.invoer);
    const score = gelijkenis(eigen, tekst, [eigenPlaats, zPlaats]);
    if (score >= grens) {
      waarschuwingen.push(
        `Deze pagina lijkt voor ${Math.round(score * 100)}% op "${z.titel}" (als de plaatsnamen worden weggelaten). Pagina's die vooral in de plaatsnaam verschillen kunnen door Google als doorway pagina worden gezien. Voeg lokale gegevens toe of laat de tekst opnieuw schrijven.`
      );
    }
  });
  return waarschuwingen;
}

// De plaatsnaam van een andere pagina staat nog in deze tekst (bijvoorbeeld na een kopie).
function restantWaarschuwingen(pagina, zusters) {
  const eigenPlaats = plaatsWaarde(pagina.invoer);
  const eigen = verzamelTekst(pagina.content).join('\n');
  if (!eigen.trim()) return [];
  const gemeld = new Set();
  const waarschuwingen = [];
  (zusters || []).forEach((z) => {
    const p = plaatsWaarde(z.invoer);
    if (!p || gemeld.has(p.toLowerCase())) return;
    if (eigenPlaats && (eigenPlaats.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(eigenPlaats.toLowerCase()))) return;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(p)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(eigen)) {
      gemeld.add(p.toLowerCase());
      waarschuwingen.push(`De plaatsnaam "${p}" (van de pagina "${z.titel}") staat nog in de tekst van deze pagina. Klopt dat, of is het een restant van een kopie?`);
    }
  });
  return waarschuwingen;
}

// werkgebiedTekst: alle teksten waarin de klant zijn werkgebied noemt (feit "Werkgebied", profile.bedrijf.werkgebied).
function werkgebiedWaarschuwing(plaats, werkgebiedTekst) {
  const p = String(plaats || '').trim();
  const w = String(werkgebiedTekst || '').trim();
  if (!p || !w) return null;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(p)}(?![\\p{L}\\p{N}])`, 'iu');
  if (re.test(w)) return null;
  return `"${p}" staat niet in het werkgebied van de klant ("${w.slice(0, 120)}"). Maak alleen een pagina voor een plaats waar de klant echt werkt, anders is het een doorway pagina. Werkt de klant er wel, zet de plaats dan bij de feiten (Werkgebied).`;
}

// Zijn er lokale feiten bij deze pagina (extra feiten met het label "Lokale informatie")?
function heeftLokaleGegevens(feitensheet) {
  const extra = feitensheet && Array.isArray(feitensheet.extra) ? feitensheet.extra : [];
  return extra.some((f) => f && /^lokale informatie/i.test(String(f.label || '')) && String(f.waarde || '').trim());
}

module.exports = {
  verzamelTekst,
  plaatsWaarde,
  neutraliseer,
  gelijkenis,
  gelijkenisWaarschuwingen,
  restantWaarschuwingen,
  werkgebiedWaarschuwing,
  heeftLokaleGegevens,
  PLAATS_SLEUTEL_RE
};
