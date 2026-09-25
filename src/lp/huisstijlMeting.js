// LP Fabriek: deterministische meting van de huisstijl uit de CSS van een klantsite (25-09-2026).
//
// Aanleiding: bij MAC Bouw gaf het AI-voorstel een rozige achtergrondkleur (#eae2e2) die nergens als vlak op
// de site staat, Jost voor ALLE tekst terwijl de koppen Titillium Web zijn, en niets over de vormtaal
// (hoofdletters, knoppen, rondingen). Oorzaak: de oude analyse telde alle kleuren en lettertypes bij elkaar,
// zonder te kijken WAARVOOR ze gebruikt worden (achtergrond of rand, kop of tekst, knop of kaart).
// Deze module meet per rol (koppen, tekst, knoppen, kaarten) en per eigenschap, zodat het AI-voorstel
// tegen harde metingen kan worden gecontroleerd en zo nodig gecorrigeerd (zie huisstijl.js).
//
// Bewust nog steeds een lichte, regex-gebaseerde parser (geen CSS-parser-dependency): het levert
// aanwijzingen op basis van de CSS-tekst, niet van een echte browser (geen cascade of overerving). De
// uitkomst blijft daarom een VOORSTEL dat Dylan ziet en aanpast, en bij twijfel blijft een veld leeg.

function splitBlokken(css) {
  const blokken = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(String(css || '')))) {
    blokken.push({ selector: m[1].trim().toLowerCase(), body: m[2] });
  }
  return blokken;
}

function declaraties(body) {
  return String(body || '')
    .split(';')
    .map((d) => {
      const i = d.indexOf(':');
      if (i < 0) return null;
      return { prop: d.slice(0, i).trim().toLowerCase(), waarde: d.slice(i + 1).replace(/!important/i, '').trim() };
    })
    .filter(Boolean);
}

function naarHex(kleurTekst) {
  const t = String(kleurTekst || '').trim().toLowerCase();
  let m = t.match(/^#([0-9a-f]{3})$/);
  if (m) return '#' + m[1].split('').map((c) => c + c).join('');
  m = t.match(/^#([0-9a-f]{6})$/);
  if (m) return '#' + m[1];
  m = t.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) < 0.9) return null; // doorzichtig: geen echte vlakkleur
    return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('');
  }
  return null;
}

// Eerste kleur uit een waarde, bv. "background: #fff url(...)" of "1px solid rgba(0,0,0,.1)".
function eersteKleur(waarde) {
  const m = String(waarde || '').match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)/);
  return m ? naarHex(m[0]) : null;
}

function helderheid(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  // chroma: hoe ver de kleurkanalen uit elkaar liggen (0 = zuiver grijs). Bij lichte tinten zegt de gewone
  // HSL-verzadiging weinig (een rozig #eae2e2 lijkt dan "bijna grijs"), chroma is hier strenger en duidelijker.
  return { licht: (max + min) / 2, chroma: max - min };
}

// Een neutraal lichtgrijs vlak (geschikt als alternatieve achtergrond): licht en vrijwel kleurloos.
function isLichtNeutraal(hex) {
  const { licht, chroma } = helderheid(hex);
  return licht > 0.9 && licht < 0.999 && chroma <= 0.025;
}

function telOp(lijst) {
  const tel = new Map();
  for (const item of lijst) tel.set(item, (tel.get(item) || 0) + 1);
  return [...tel.entries()].map(([waarde, aantal]) => ({ waarde, aantal })).sort((a, b) => b.aantal - a.aantal);
}

function selectorRol(selector) {
  const delen = selector.split(',').map((s) => s.trim()).filter((s) => s && !/:(hover|focus|active|disabled|before|after)/.test(s));
  const rollen = new Set();
  for (const s of delen) {
    if (/(^|[\s>+~.#])h[1-6]\b/.test(s) || /(heading|title)\b/.test(s)) rollen.add('kop');
    if (/^(html|body)\b/.test(s) || /(^|[\s>])p$/.test(s)) rollen.add('tekst');
    if (/(btn|button|cta|submit)\b/.test(s)) rollen.add('knop');
    if (/(card|tile|box|item|widget)\b/.test(s)) rollen.add('kaart');
  }
  return [...rollen];
}

function meetHuisstijl(css) {
  const blokken = splitBlokken(css);
  const achtergronden = [];
  const randen = [];
  const fontFaceFamilies = new Set();
  const rol = { kop: { fonts: [], kleuren: [], transform: [], gewicht: [] }, tekst: { fonts: [], kleuren: [] }, knop: { achtergronden: [], teksten: [], radius: [], transform: [], gewicht: [], fonts: [] }, kaart: { radius: [] } };
  const eigenschappen = [];

  for (const blok of blokken) {
    const decls = declaraties(blok.body);
    if (blok.selector.startsWith('@font-face')) {
      const f = decls.find((d) => d.prop === 'font-family');
      if (f) fontFaceFamilies.add(f.waarde.replace(/["']/g, '').trim());
      continue;
    }
    for (const d of decls) {
      if (d.prop.startsWith('--')) {
        const k = eersteKleur(d.waarde);
        if (k) eigenschappen.push({ naam: d.prop, kleur: k });
      }
      if (d.prop === 'background-color' || d.prop === 'background') {
        const k = eersteKleur(d.waarde);
        if (k && !/:(hover|focus|active)/.test(blok.selector)) achtergronden.push(k);
      }
      if (d.prop === 'border' || d.prop === 'border-color' || d.prop === 'border-top' || d.prop === 'border-bottom') {
        const k = eersteKleur(d.waarde);
        if (k) randen.push(k);
      }
    }
    const rollen = selectorRol(blok.selector);
    for (const r of rollen) {
      for (const d of decls) {
        const eersteFont = d.prop === 'font-family' ? d.waarde.split(',')[0].replace(/["']/g, '').trim() : null;
        if (r === 'kop') {
          if (eersteFont && !/^(inherit|initial|unset)$/i.test(eersteFont)) rol.kop.fonts.push(eersteFont);
          if (d.prop === 'color') { const k = eersteKleur(d.waarde); if (k) rol.kop.kleuren.push(k); }
          if (d.prop === 'text-transform') rol.kop.transform.push(d.waarde.toLowerCase());
          if (d.prop === 'font-weight') rol.kop.gewicht.push(d.waarde.toLowerCase());
        } else if (r === 'tekst') {
          if (eersteFont && !/^(inherit|initial|unset)$/i.test(eersteFont)) rol.tekst.fonts.push(eersteFont);
          if (d.prop === 'color') { const k = eersteKleur(d.waarde); if (k) rol.tekst.kleuren.push(k); }
        } else if (r === 'knop') {
          if (d.prop === 'background-color' || d.prop === 'background') { const k = eersteKleur(d.waarde); if (k) rol.knop.achtergronden.push(k); }
          if (d.prop === 'color') { const k = eersteKleur(d.waarde); if (k) rol.knop.teksten.push(k); }
          if (d.prop === 'border-radius') rol.knop.radius.push(d.waarde.split(/\s+/)[0].toLowerCase());
          if (d.prop === 'text-transform') rol.knop.transform.push(d.waarde.toLowerCase());
          if (d.prop === 'font-weight') rol.knop.gewicht.push(d.waarde.toLowerCase());
          if (eersteFont && !/^(inherit|initial|unset)$/i.test(eersteFont)) rol.knop.fonts.push(eersteFont);
        } else if (r === 'kaart') {
          if (d.prop === 'border-radius') rol.kaart.radius.push(d.waarde.split(/\s+/)[0].toLowerCase());
        }
      }
    }
  }

  const top = (l, n = 5) => telOp(l).slice(0, n);
  return {
    achtergronden: top(achtergronden, 10),
    lichtNeutraleAchtergronden: top(achtergronden.filter(isLichtNeutraal), 5),
    randen: top(randen, 6),
    themaKleuren: eigenschappen.slice(0, 10),
    fontFaceFamilies: [...fontFaceFamilies],
    koppen: { fonts: top(rol.kop.fonts), kleuren: top(rol.kop.kleuren), transform: top(rol.kop.transform), gewicht: top(rol.kop.gewicht) },
    tekst: { fonts: top(rol.tekst.fonts), kleuren: top(rol.tekst.kleuren) },
    knoppen: { achtergronden: top(rol.knop.achtergronden), teksten: top(rol.knop.teksten), radius: top(rol.knop.radius), transform: top(rol.knop.transform), gewicht: top(rol.knop.gewicht), fonts: top(rol.knop.fonts) },
    kaarten: { radius: top(rol.kaart.radius) }
  };
}

// Leidt uit de meting de vormtaal-velden af (zie tokens.js). Alleen invullen als er iets gemeten is, anders
// blijft het veld leeg (bronprincipe: nooit gokken).
function afgeleideVormtaal(meting) {
  const v = {};
  const topWaarde = (lijst) => (lijst && lijst.length ? lijst[0].waarde : '');
  const koppenTransform = meting.koppen.transform;
  if (koppenTransform.length && /uppercase/.test(topWaarde(koppenTransform))) v.headingTransform = 'uppercase';
  if (meting.koppen.kleuren.length) v.headingColor = topWaarde(meting.koppen.kleuren);
  const gewicht = topWaarde(meting.koppen.gewicht);
  if (/^[1-9]00$/.test(gewicht)) v.headingWeight = gewicht;
  if (/uppercase/.test(topWaarde(meting.knoppen.transform))) v.buttonTransform = 'uppercase';
  const normaliseerRadius = (r) => (r === '0' ? '0px' : r);
  const knopRadius = normaliseerRadius(topWaarde(meting.knoppen.radius));
  if (/^\d+(\.\d+)?(px|rem|em)$/.test(knopRadius)) v.buttonRadius = knopRadius;
  const kaartRadius = normaliseerRadius(topWaarde(meting.kaarten.radius));
  if (/^\d+(\.\d+)?(px|rem|em)$/.test(kaartRadius)) v.cardRadius = kaartRadius;
  return v;
}

module.exports = { meetHuisstijl, afgeleideVormtaal, isLichtNeutraal, naarHex, splitBlokken };
