// Aanpassingen per PAGINA (niet per sjabloon): onderdelen verbergen zonder het sjabloon aan te raken.
//
// Ze staan bij de pagina zelf, in de content JSON naast slotData:
//   content = { meta, slotData, overrides: { verborgenItems: [...], verborgenSecties: [...] } }
//   verborgenItems:   [{ lijst: "offerItems", index: 2, label: "Privékamers met eigen badkamer" }]
//   verborgenSecties: [{ index: 3, label: '<section class="reasons">' }]
//
// Het label is een controle: staat er op die plek (index) niet meer hetzelfde item of dezelfde
// sectie, bijvoorbeeld na opnieuw genereren van de content of na een sjabloonwijziging, dan wordt
// er NIETS verborgen en komt er een waarschuwing. Zo verdwijnt er nooit per ongeluk iets anders.
//
// Op de echte pagina (WordPress, deellink) is een verborgen onderdeel echt uit de HTML gehaald.
// Alleen in het voorbeeldscherm blijft het zichtbaar (vervaagd, met "Toon weer"), via
// data-lp-attributen die nooit naar WordPress gaan.

const EACH_RE = /{{#each\s+([\w.]+)\s*}}([\s\S]*?){{\/each}}/g;
const SECTION_TOKEN_RE = /<section(?=[\s>])[^>]*>|<\/section\s*>/gi;

function normaliseerTag(tag) {
  return String(tag || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Alle buitenste <section>-elementen van een sjabloon, in volgorde van voorkomen. Secties binnen een
// {{#each}}-lijst tellen niet mee (die horen bij een lijstitem, niet bij de pagina-opbouw).
function vindSecties(html) {
  const bron = String(html || '');
  const eachRanges = [];
  const eachRe = new RegExp(EACH_RE.source, 'g');
  let m;
  while ((m = eachRe.exec(bron))) eachRanges.push([m.index, m.index + m[0].length]);
  const inEach = (pos) => eachRanges.some(([a, b]) => pos >= a && pos < b);

  const secties = [];
  const tokenRe = new RegExp(SECTION_TOKEN_RE.source, 'gi');
  let depth = 0;
  let start = -1;
  let openTag = '';
  while ((m = tokenRe.exec(bron))) {
    if (m[0].charAt(1) === '/') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          secties.push({ start, end: m.index + m[0].length, openTag: normaliseerTag(openTag) });
          start = -1;
        }
      }
    } else {
      if (depth === 0) {
        start = inEach(m.index) ? -1 : m.index;
        openTag = m[0];
      }
      depth += 1;
    }
  }
  return secties;
}

// Leesbare naam van een lijstitem, ook gebruikt als controle-label. Zelfde logica op één plek.
function itemLabel(item) {
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object') return String(item).trim().slice(0, 80);
  const voorkeur = ['title', 'titel', 'label', 'question', 'name', 'naam', 'heading', 'kop'];
  for (const key of voorkeur) {
    if (typeof item[key] === 'string' && item[key].trim()) return item[key].trim().slice(0, 80);
  }
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string' && value.trim() && !/image|img|icon|href|src|url|alt/i.test(key)) {
      return value.trim().slice(0, 80);
    }
  }
  return '';
}

function normaliseerOverrides(raw) {
  const out = { verborgenItems: [], verborgenSecties: [] };
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.verborgenItems)) {
    raw.verborgenItems.forEach((e) => {
      if (e && typeof e.lijst === 'string' && /^[\w.]+$/.test(e.lijst) && Number.isInteger(e.index) && e.index >= 0) {
        out.verborgenItems.push({ lijst: e.lijst, index: e.index, label: typeof e.label === 'string' ? e.label : '' });
      }
    });
  }
  if (Array.isArray(raw.verborgenSecties)) {
    raw.verborgenSecties.forEach((e) => {
      if (e && Number.isInteger(e.index) && e.index >= 0) {
        out.verborgenSecties.push({ index: e.index, label: typeof e.label === 'string' ? e.label : '' });
      }
    });
  }
  return out;
}

// Bepaalt wat er daadwerkelijk verborgen wordt en wat niet meer klopt (waarschuwingen).
function berekenOverrides({ htmlTemplate, slotData, overrides }) {
  const data = slotData && typeof slotData === 'object' ? slotData : {};
  const o = normaliseerOverrides(overrides);
  const secties = vindSecties(htmlTemplate);
  const itemSets = new Map();
  const sectieSet = new Set();
  const waarschuwingen = [];

  o.verborgenItems.forEach((e) => {
    const lijst = data[e.lijst];
    const item = Array.isArray(lijst) ? lijst[e.index] : undefined;
    if (item === undefined || itemLabel(item) !== e.label) {
      waarschuwingen.push(
        `Een verborgen kaart in "${e.lijst}" ("${e.label || `nummer ${e.index + 1}`}") staat niet meer op dezelfde plek en wordt daarom weer getoond. Verberg hem opnieuw als je hem niet wilt tonen.`
      );
      return;
    }
    if (!itemSets.has(e.lijst)) itemSets.set(e.lijst, new Set());
    itemSets.get(e.lijst).add(e.index);
  });

  o.verborgenSecties.forEach((e) => {
    const sectie = secties[e.index];
    if (!sectie || sectie.openTag !== e.label) {
      waarschuwingen.push(
        `Een verborgen sectie (nummer ${e.index + 1}) is in het sjabloon niet meer dezelfde en wordt daarom weer getoond. Verberg hem opnieuw als je hem niet wilt tonen.`
      );
      return;
    }
    sectieSet.add(e.index);
  });

  let aantalItems = 0;
  itemSets.forEach((set) => { aantalItems += set.size; });
  return { secties, itemSets, sectieSet, waarschuwingen, aantalVerborgen: aantalItems + sectieSet.size };
}

// Past de sectie-verbergingen toe op de RAUWE sjabloon-HTML (vóór het invullen van de slots).
//  - Echte pagina: verborgen secties worden helemaal weggehaald.
//  - Voorbeeldscherm (forPreview): elke sectie krijgt data-lp-sectie="n", een verborgen sectie
//    daarnaast data-lp-verborgen="1".
// verborgenLijsten: lijst-sleutels die in een weggehaalde sectie stonden (nodig om bv. het FAQ
// schema niet te laten verwijzen naar tekst die niet meer op de pagina staat).
function pasSectiesToe(html, secties, sectieSet, forPreview) {
  let out = String(html || '');
  const verborgenLijsten = new Set();
  for (let i = secties.length - 1; i >= 0; i -= 1) {
    const s = secties[i];
    const verborgen = sectieSet.has(i);
    if (forPreview) {
      const pos = s.start + '<section'.length;
      const attrs = ` data-lp-sectie="${i}"${verborgen ? ' data-lp-verborgen="1"' : ''}`;
      out = out.slice(0, pos) + attrs + out.slice(pos);
    } else if (verborgen) {
      const binnen = out.slice(s.start, s.end);
      const eachRe = new RegExp(EACH_RE.source, 'g');
      let m;
      while ((m = eachRe.exec(binnen))) verborgenLijsten.add(m[1]);
      out = out.slice(0, s.start) + out.slice(s.end);
    }
  }
  return { html: out, verborgenLijsten };
}

// Kopie van slotData zonder verborgen items en zonder lijsten uit weggehaalde secties.
function filterSlotData(slotData, itemSets, verborgenLijsten) {
  const copy = { ...(slotData || {}) };
  if (itemSets) {
    itemSets.forEach((set, lijst) => {
      if (Array.isArray(copy[lijst])) copy[lijst] = copy[lijst].filter((_, i) => !set.has(i));
    });
  }
  if (verborgenLijsten) verborgenLijsten.forEach((lijst) => { delete copy[lijst]; });
  return copy;
}

// Eerste tag van een lijstitem-sjabloon voorzien van een data-attribuut, alleen in het voorbeeld
// en alleen als het itemsjabloon precies één hoofdelement heeft (anders weten we niet wat "de
// kaart" is en laten we het onaangeroerd).
function markeerItemWortel(inner, lijst, index, verborgen) {
  const m = /^(\s*)<([a-zA-Z][\w-]*)(?=[\s>\/])/.exec(inner);
  if (!m) return inner;
  const tag = m[2];
  if (/^(img|br|hr|input|meta|link)$/i.test(tag)) return inner;
  const tokenRe = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, 'gi');
  let depth = 0;
  let eind = -1;
  let t;
  while ((t = tokenRe.exec(inner))) {
    if (t[1] === '/') depth -= 1;
    else if (t[2] !== '/') depth += 1;
    if (depth === 0) { eind = t.index + t[0].length; break; }
  }
  if (eind < 0 || inner.slice(eind).trim() !== '') return inner;
  const pos = m[1].length + 1 + tag.length;
  const attrs = ` data-lp-item="${lijst}.${index}"${verborgen ? ' data-lp-verborgen="1"' : ''}`;
  return inner.slice(0, pos) + attrs + inner.slice(pos);
}

// Zet een onderdeel verborgen of zichtbaar in de content en geeft de NIEUWE content terug.
// type "item": { lijst, index }, type "sectie": { index }. Gooit een Nederlandse fout bij ongeldige invoer.
function zetVerborgen({ content, htmlTemplate, type, lijst, index, verborgen }) {
  const basis = content && typeof content === 'object' ? content : {};
  const slotData = basis.slotData && typeof basis.slotData === 'object' ? basis.slotData : {};
  const o = normaliseerOverrides(basis.overrides);
  if (!Number.isInteger(index) || index < 0) throw new Error('Ongeldig onderdeel (index).');
  const verberg = !!verborgen;

  if (type === 'item') {
    if (typeof lijst !== 'string' || !/^[\w.]+$/.test(lijst)) throw new Error('Ongeldige lijst.');
    const items = slotData[lijst];
    if (!Array.isArray(items) || !items[index]) throw new Error('Dit item bestaat niet (meer) in de opgeslagen content.');
    o.verborgenItems = o.verborgenItems.filter((e) => !(e.lijst === lijst && e.index === index));
    if (verberg) o.verborgenItems.push({ lijst, index, label: itemLabel(items[index]) });
  } else if (type === 'sectie') {
    const secties = vindSecties(htmlTemplate);
    if (!secties[index]) throw new Error('Deze sectie bestaat niet (meer) in het sjabloon.');
    o.verborgenSecties = o.verborgenSecties.filter((e) => e.index !== index);
    if (verberg) o.verborgenSecties.push({ index, label: secties[index].openTag });
  } else {
    throw new Error('Onbekend type onderdeel.');
  }

  const nieuw = { ...basis };
  if (o.verborgenItems.length || o.verborgenSecties.length) nieuw.overrides = o;
  else delete nieuw.overrides;
  return nieuw;
}

module.exports = {
  vindSecties,
  itemLabel,
  normaliseerOverrides,
  berekenOverrides,
  pasSectiesToe,
  filterSlotData,
  markeerItemWortel,
  zetVerborgen
};
