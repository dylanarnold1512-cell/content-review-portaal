// LP Fabriek: een onderdeel van een pagina overnemen op andere pagina's van dezelfde klant (20-10-2026).
// Aanleiding: bij MAC Bouw stond de sectie "Recente projecten" op Sassenheim goed (drie foto's en een intro), en op
// de andere pagina's nog alleen het tuinhuis. Opnieuw laten schrijven zou alle tekst vervangen. Hiermee neem je
// alleen dat ene onderdeel letterlijk over van een voorbeeldpagina, op zoveel pagina's als je wilt.
// Dit bestand bevat alleen de pure logica (zonder Notion of WordPress). De routes staan in src/routes/lp.js.

// Velden die bij de pagina zelf horen en nooit als onderdeel worden overgenomen.
const NOOIT = /^(meta|seo|schema|slug)/i;

// Het onderdeel van een veld is het eerste woord van de sleutel: projectsTitle, projectsIntro en projectsItems
// horen samen bij "projects".
function onderdeelVan(sleutel) {
  const m = /^[a-z]+/.exec(String(sleutel || ''));
  return m ? m[0] : String(sleutel || '');
}

const LEESBARE_NAMEN = {
  hero: 'Bovenaan (hero)', answer: 'Antwoordblok', location: 'Antwoordblok', offer: 'Aanbod', services: 'Diensten',
  projects: 'Projecten', project: 'Projecten', reviews: 'Reviews', review: 'Reviews', testimonials: 'Reviews',
  faq: 'Veelgestelde vragen', reasons: 'Waarom wij', why: 'Waarom wij', steps: 'Werkwijze', process: 'Werkwijze',
  contact: 'Contact', practical: 'Praktische informatie', gallery: 'Galerij', cta: 'Offertebalk', links: 'Interne links',
  about: 'Over ons', usp: 'Voordelen', usps: 'Voordelen'
};

function naamVan(id, slots) {
  if (LEESBARE_NAMEN[id]) return LEESBARE_NAMEN[id];
  const metLabel = slots.find((s) => s.label);
  if (metLabel) return String(metLabel.label).split(/\s+/)[0];
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// Alle onderdelen van een sjabloon, in de volgorde van de slots.
function onderdelenVan(template) {
  const slots = Array.isArray(template && template.slots) ? template.slots : [];
  const groepen = new Map();
  for (const s of slots) {
    if (!s || !s.key || NOOIT.test(s.key)) continue;
    const id = onderdeelVan(s.key);
    if (!groepen.has(id)) groepen.set(id, []);
    groepen.get(id).push(s);
  }
  return [...groepen.entries()].map(([id, groep]) => ({
    id,
    naam: naamVan(id, groep),
    slots: groep.map((s) => s.key),
    verplicht: groep.filter((s) => s.verplicht).map((s) => s.key)
  }));
}

function kopie(w) { return w === undefined ? undefined : JSON.parse(JSON.stringify(w)); }

function escapeRe(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Vervangt de plaatsnaam van de voorbeeldpagina door die van de doelpagina, alleen als heel woord.
function vervangPlaats(waarde, van, naar, teller) {
  if (!van || !naar || van === naar) return waarde;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(van)}(?=$|[^\\p{L}\\p{N}])`, 'gu');
  const loop = (w) => {
    if (typeof w === 'string') {
      return w.replace(re, (_m, voor) => { teller.aantal += 1; return voor + naar; });
    }
    if (Array.isArray(w)) return w.map(loop);
    if (w && typeof w === 'object') {
      const uit = {};
      for (const [k, v] of Object.entries(w)) uit[k] = /imagesrc|href|url$/i.test(k) ? v : loop(v);
      return uit;
    }
    return w;
  };
  return loop(waarde);
}

// Korte omschrijving van wat er in een onderdeel staat, voor in het scherm.
function samenvatting(slotData, slotKeys) {
  const delen = [];
  for (const k of slotKeys) {
    const w = slotData ? slotData[k] : undefined;
    if (Array.isArray(w)) {
      const fotos = w.filter((i) => i && Object.entries(i).some(([f, v]) => /imagesrc/i.test(f) && String(v || '').trim())).length;
      delen.push(fotos ? `${w.length} items (${fotos} met foto)` : `${w.length} items`);
    } else if (typeof w === 'string' && w.trim()) {
      delen.push(w.trim().length > 90 ? `${w.trim().slice(0, 90)}...` : w.trim());
    }
  }
  return delen;
}

// Neemt de velden van een onderdeel over van de voorbeeldpagina. Verborgen items in een lijst op de voorbeeldpagina
// gaan niet mee (anders verschijnen ze op de doelpagina), en eerder verborgen items in die lijst op de doelpagina
// vervallen, want hun plek klopt niet meer.
function neemOnderdeelOver({ bronContent, doelContent, slotKeys, bronPlaats, doelPlaats }) {
  const bron = (bronContent && bronContent.slotData) || {};
  const bronVerborgen = ((bronContent && bronContent.overrides) || {}).verborgenItems || [];
  const slotData = { ...((doelContent && doelContent.slotData) || {}) };
  const teller = { aantal: 0 };
  for (const k of slotKeys) {
    let w = kopie(bron[k]);
    if (Array.isArray(w)) {
      const weg = new Set(bronVerborgen.filter((v) => v && v.lijst === k).map((v) => v.index));
      w = w.filter((_i, idx) => !weg.has(idx));
    }
    if (w === undefined) delete slotData[k];
    else slotData[k] = vervangPlaats(w, String(bronPlaats || '').trim(), String(doelPlaats || '').trim(), teller);
  }
  const overrides = { ...((doelContent && doelContent.overrides) || {}) };
  if (Array.isArray(overrides.verborgenItems)) overrides.verborgenItems = overrides.verborgenItems.filter((v) => !(v && slotKeys.includes(v.lijst)));
  const nieuw = { ...(doelContent || {}), slotData };
  if (doelContent && doelContent.overrides) nieuw.overrides = overrides;
  return { content: nieuw, plaatsVervangen: teller.aantal };
}

module.exports = { onderdelenVan, onderdeelVan, neemOnderdeelOver, samenvatting };
