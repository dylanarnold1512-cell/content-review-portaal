// LP Fabriek: een Beaver Builder pagina (live HTML + de layout CSS) omzetten naar een portaalsjabloon met slots.
// Doel: de Breda pagina van Hostel Roots als sjabloon, zodat pagina's er in het portaal van gemaakt en bijgesteld
// kunnen worden met de gewone sjabloongereedschappen. Geen dependencies: kleine eigen HTML parser.
//
// Wat er gebeurt:
// - de inhoud van .fl-builder-content blijft zoals hij is (klassen en structuur), dus de opmaak blijft die van Beaver Builder;
// - elke tekst wordt een slot (een alinea, kop of knoptekst is een slot), elke afbeelding een ImageSrc en ImageAlt slot,
//   elke echte link een Href slot;
// - animaties die op JavaScript wachten worden uitgezet (anders blijft alles onzichtbaar op een pagina zonder Beaver Builder script);
// - elke rij wordt een <section>, zodat de portaal functies "onderdeel verbergen" werken.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea']);
const BLOK = new Set(['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figure', 'figcaption', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'th', 'tr', 'thead', 'ul', 'details', 'summary', 'svg', 'picture', 'button', 'select', 'label']);
const INLINE_TEKST = new Set(['strong', 'b', 'em', 'i', 'u', 'small', 'sup', 'sub', 'mark', 'span', 'a', 'br', 'abbr', 'cite', 'code', 'del', 'ins', 's']);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euml: 'ë', eacute: 'é', egrave: 'è', iuml: 'ï', ouml: 'ö', uuml: 'ü', euro: '€', copy: '©' };
function decodeer(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : m));
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Parser ----
function parseer(html) {
  const wortel = { type: 'el', name: '#root', attrs: [], children: [] };
  const stapel = [wortel];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+|<)/gi;
  let m;
  while ((m = re.exec(html))) {
    const top = stapel[stapel.length - 1];
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {
      const naam = m[1].toLowerCase();
      for (let i = stapel.length - 1; i > 0; i--) {
        if (stapel[i].name === naam) { stapel.length = i; break; }
      }
    } else if (m[2]) {
      const naam = m[2].toLowerCase();
      const attrs = [];
      const aRe = /([^\s"'<>\/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let a;
      while ((a = aRe.exec(m[3] || ''))) attrs.push([a[1], a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : a[5] !== undefined ? a[5] : null]);
      const el = { type: 'el', name: naam, attrs, children: [] };
      top.children.push(el);
      if (RAW.has(naam) && !m[4]) {
        const eind = html.toLowerCase().indexOf(`</${naam}`, re.lastIndex);
        const stuk = eind === -1 ? html.slice(re.lastIndex) : html.slice(re.lastIndex, eind);
        el.children.push({ type: 'raw', text: stuk });
        re.lastIndex = eind === -1 ? html.length : html.indexOf('>', eind) + 1;
      } else if (!VOID.has(naam) && !m[4]) {
        stapel.push(el);
      }
    } else if (m[5] !== undefined) {
      top.children.push({ type: 'text', text: m[5] });
    }
  }
  return wortel;
}

const attr = (el, k) => { const a = el.attrs.find((x) => x[0] === k); return a ? a[1] : undefined; };
const zetAttr = (el, k, v) => {
  const a = el.attrs.find((x) => x[0] === k);
  if (a) a[1] = v; else el.attrs.push([k, v]);
};
const delAttr = (el, k) => { el.attrs = el.attrs.filter((x) => x[0] !== k); };
const klassen = (el) => String(attr(el, 'class') || '').split(/\s+/).filter(Boolean);

function serialiseer(n) {
  if (n.type === 'text') return n.text;
  if (n.type === 'raw') return n.text;
  if (n.name === '#root') return n.children.map(serialiseer).join('');
  const a = n.attrs.map(([k, v]) => (v === null ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)).join('');
  if (VOID.has(n.name)) return `<${n.name}${a}>`;
  return `<${n.name}${a}>${n.children.map(serialiseer).join('')}</${n.name}>`;
}

function vind(n, test, uit = []) {
  if (n.type !== 'el') return uit;
  if (test(n)) uit.push(n);
  n.children.forEach((c) => vind(c, test, uit));
  return uit;
}

function platTekst(n) {
  if (n.type === 'text') return n.text;
  if (n.type === 'raw') return '';
  if (n.name === 'br') return ' ';
  return n.children.map(platTekst).join('');
}
const schoon = (s) => decodeer(s).replace(/\s+/g, ' ').trim();

function bevatBlok(n) {
  return n.children.some((c) => c.type === 'el' && (BLOK.has(c.name) || bevatBlok(c)));
}

// ---- Omzetten ----
const ANIMATIE_RE = /^fl-(animation|fade|slide|zoom|bounce|flip|rotate|lightspeed|roll|jack|pulse|rubber|shake|swing|tada|wobble|jello|heartbeat|flash|hinge)\b|^fl-(animation|fadeIn|fadeIn\w+|slideIn\w+)$|^(animated|wow|fl-animation)$/;

function bouwSjabloon({ html, css, titel, basisBlueprint }) {
  const waarschuwingen = [];
  const wortel = parseer(String(html || ''));
  const inhoud = vind(wortel, (n) => klassen(n).includes('fl-builder-content'))[0];
  if (!inhoud) throw new Error('Geen Beaver Builder inhoud gevonden op deze pagina (geen element met de klasse fl-builder-content).');

  // 1. Opruimen
  const extraCss = [];
  (function opruimen(n) {
    if (n.type !== 'el') return;
    n.children = n.children.filter((c) => {
      if (c.type === 'text' && /^\s*$/.test(c.text)) return true;
      if (c.type !== 'el') return c.type === 'text';
      if (['script', 'noscript', 'template', 'iframe', 'object', 'embed', 'link', 'meta'].includes(c.name)) return false;
      if (c.name === 'style') { extraCss.push(c.children.map((x) => x.text || '').join('')); return false; }
      return true;
    });
    n.children.forEach(opruimen);
    for (const [k] of [...n.attrs]) {
      if (/^on/i.test(k) || /^data-(?!lp|src$|lazy-src$)/i.test(k) || k === 'srcset' || k === 'sizes' || k === 'loading' || k === 'decoding') delAttr(n, k);
    }
    const kl = klassen(n);
    if (kl.some((c) => ANIMATIE_RE.test(c))) zetAttr(n, 'class', kl.filter((c) => !ANIMATIE_RE.test(c)).join(' '));
    const st = attr(n, 'style');
    if (st && /opacity\s*:\s*0|visibility\s*:\s*hidden/i.test(st)) zetAttr(n, 'style', st.replace(/opacity\s*:\s*0\s*;?/gi, '').replace(/visibility\s*:\s*hidden\s*;?/gi, ''));
  }(inhoud));

  // 2. Rijen worden secties
  const rijen = inhoud.children.length ? vind(inhoud, (n) => n.name === 'div' && klassen(n).includes('fl-row') && !vindOuder(inhoud, n, (o) => o !== inhoud && klassen(o).includes('fl-row'))) : [];
  rijen.forEach((r) => { r.name = 'section'; });

  // 3. Slots
  const slots = [];
  const data = {};
  const gebruikt = new Set();
  let sectieNr = 0;
  let sectieNaam = 'Pagina';
  const tellers = {};
  const unieke = (basis) => {
    let k = basis;
    let i = 2;
    while (gebruikt.has(k)) { k = `${basis}${i}`; i += 1; }
    gebruikt.add(k);
    return k;
  };
  const voegSlot = (key, label, waarde, verplicht = false) => {
    slots.push({ key, label, type: 'text', verplicht });
    data[key] = waarde;
  };
  let h1Gedaan = false;
  let ctaGedaan = false;
  let fotoNr = 0;
  let linkNr = 0;

  function slotVoorTekst(el, soortNaam, kopEl) {
    const tekst = schoon(platTekst(el));
    if (!tekst) return;
    let key;
    let label;
    if (!h1Gedaan && soortNaam === 'Kop') {
      h1Gedaan = true;
      (kopEl || el).name = 'h1';
      key = 'heroTitle';
      label = 'Hoofdkop (H1)';
      gebruikt.add(key);
    } else {
      tellers[soortNaam] = (tellers[soortNaam] || 0) + 1;
      key = unieke(`s${sectieNr}${soortNaam}${tellers[soortNaam]}`);
      label = `${sectieNaam}, ${soortNaam === 'Kop' ? 'kop' : soortNaam === 'Knop' ? 'knoptekst' : 'tekst'} ${tellers[soortNaam]}: ${tekst.slice(0, 40)}`;
    }
    if (soortNaam === 'Knop' && !ctaGedaan && el.__cta) { key = 'ctaLabel'; label = 'Knoptekst hoofdknop'; gebruikt.add(key); ctaGedaan = true; }
    voegSlot(key, label, tekst, key === 'heroTitle');
    el.children = [{ type: 'text', text: `{{${key}}}` }];
  }

  function loop(n, kopEl) {
    if (n.type !== 'el') return;
    if (/^h[1-6]$/.test(n.name)) kopEl = n;
    if (n.name === 'section' && rijen.includes(n)) {
      sectieNr += 1;
      const kop = vind(n, (x) => /^h[1-6]$/.test(x.name))[0];
      sectieNaam = `Sectie ${sectieNr}${kop ? ` (${schoon(platTekst(kop)).slice(0, 30)})` : ''}`;
      Object.keys(tellers).forEach((k) => delete tellers[k]);
    }
    if (n.name === 'img') {
      let src = attr(n, 'src') || '';
      const lui = attr(n, 'data-src') || attr(n, 'data-lazy-src');
      if (/^data:/.test(src) && lui) src = lui;
      if (src && !/^data:/.test(src)) {
        fotoNr += 1;
        const sleutel = unieke(`foto${fotoNr}ImageSrc`);
        const alt = unieke(`foto${fotoNr}ImageAlt`);
        voegSlot(sleutel, `${sectieNaam}, foto ${fotoNr}`, src);
        voegSlot(alt, `${sectieNaam}, alttekst foto ${fotoNr}`, decodeer(attr(n, 'alt') || ''));
        zetAttr(n, 'src', `{{${sleutel}}}`);
        zetAttr(n, 'alt', `{{${alt}}}`);
        delAttr(n, 'data-src'); delAttr(n, 'data-lazy-src');
      }
      return;
    }
    if (n.name === 'a') {
      const href = attr(n, 'href');
      if (href && href !== '#' && !/^(javascript:|mailto:|tel:)/i.test(href)) {
        const isKnop = klassen(n).some((c) => /button|btn/.test(c)) || vind(n, (x) => klassen(x).some((c) => /button-text|btn/.test(c))).length > 0;
        let key;
        if (isKnop && !ctaGedaan) { key = 'ctaHref'; gebruikt.add(key); n.children.forEach((c) => { if (c.type === 'el') c.__cta = true; }); n.__cta = true; }
        else { linkNr += 1; key = unieke(`link${linkNr}Href`); }
        voegSlot(key, key === 'ctaHref' ? 'Link hoofdknop' : `${sectieNaam}, link ${linkNr}`, decodeer(href));
        zetAttr(n, 'href', `{{${key}}}`);
      }
    }
    const heeftEigenTekst = n.children.some((c) => c.type === 'text' && c.text.trim() !== '');
    if (heeftEigenTekst && !bevatBlok(n) && !['style', 'script', 'svg'].includes(n.name)) {
      const soort = (kopEl || /^h[1-6]$/.test(n.name)) ? 'Kop' : (n.__cta || klassen(n).some((c) => /button/.test(c))) ? 'Knop' : 'Tekst';
      slotVoorTekst(n, soort, kopEl);
      return;
    }
    // een element zonder eigen tekst waarvan alle kinderen inline zijn en minstens 1 inline element tekst heeft, bv. <p><strong>Tekst</strong></p>
    n.children.forEach((c) => loop(c, kopEl));
  }
  loop(inhoud, null);

  // 4. Achtergrondafbeeldingen in de layout CSS worden slots op het element zelf
  let layoutCss = String(css || '') + '\n' + extraCss.join('\n');
  const bgRe = /(\.fl-node-([a-z0-9]+)[^{}]*)\{([^{}]*?)background-image\s*:\s*url\(\s*['"]?(https?:[^'")]+)['"]?\s*\)\s*;?([^{}]*)\}/gi;
  let bgNr = 0;
  layoutCss = layoutCss.replace(bgRe, (m, sel, node, voor, url, na) => {
    const wortelEl = vind(inhoud, (x) => klassen(x).includes(`fl-node-${node}`))[0];
    const rest = sel.trim().replace(/^\.fl-node-[a-z0-9]+/, '').replace(/[>\s]+$/, '').trim();
    const klasse = /\.([\w-]+)\s*$/.exec(rest);
    let doel = null;
    if (wortelEl && !rest) doel = wortelEl;
    else if (wortelEl && klasse && !/[,:\[+~]/.test(rest)) doel = vind(wortelEl, (x) => klassen(x).includes(klasse[1]))[0] || null;
    const regels = `${voor}${na}`;
    if (!doel) {
      waarschuwingen.push(`Een achtergrondafbeelding (${url.split('/').pop()}) kon niet als invulveld worden gezet en is uit de opmaak gehaald.`);
      return `${sel}{${regels}}`;
    }
    bgNr += 1;
    const sleutel = unieke(`achtergrond${bgNr}ImageSrc`);
    voegSlot(sleutel, `Achtergrondfoto ${bgNr}`, url);
    const bestaand = attr(doel, 'style') || '';
    zetAttr(doel, 'style', `${bestaand}${bestaand && !bestaand.trim().endsWith(';') ? ';' : ''}background-image:url({{${sleutel}}});`);
    return `${sel}{${regels}}`;
  });
  const overigeUrls = layoutCss.match(/url\(\s*['"]?https?:[^)]*\)/gi) || [];
  if (overigeUrls.length) {
    waarschuwingen.push(`${overigeUrls.length} externe url() verwijzing(en) in de CSS zijn eruit gehaald (lettertypen of afbeeldingen). Lettertypen komen van het thema van de site.`);
    layoutCss = layoutCss.replace(/url\(\s*['"]?https?:[^)]*\)/gi, 'none');
  }
  layoutCss = layoutCss.replace(/@import[^;]*;/gi, '')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim();

  const htmlTemplate = serialiseer({ type: 'el', name: '#root', attrs: [], children: [{ ...inhoud, name: 'div' }] });

  // 5. Blueprint: metadata van een bestaand sjabloon (SEO regels, uniciteitsbudget, enz.), de rest eigen
  const basis = basisBlueprint && typeof basisBlueprint === 'object' ? JSON.parse(JSON.stringify(basisBlueprint)) : {};
  voegSlot('metaTitle', 'SEO titel', String(titel || '').slice(0, 60), false);
  voegSlot('metaDescription', 'SEO beschrijving', '', false);
  if (!gebruikt.has('heroTitle')) waarschuwingen.push('Er is geen kop gevonden die de H1 kan worden.');
  const blueprint = {
    ...basis,
    templateFormat: 'slots',
    htmlTemplate,
    cssTemplate: layoutCss,
    slots,
    voorbeeldSlotData: data,
    invoerVelden: basis.invoerVelden || [],
    ctaRegel: { verplicht: ctaGedaan },
    linkRegels: { minimumInterneLinks: 0, minimumNaarZusterpaginas: 0, reasonRequired: false }
  };
  return { blueprint, waarschuwingen, statistiek: { slots: slots.length, secties: sectieNr, fotos: fotoNr, links: linkNr } };
}

function vindOuder(wortel, kind, test) {
  let gevonden = false;
  (function loop(n, ouders) {
    if (gevonden || n.type !== 'el') return;
    if (n === kind) { gevonden = ouders.some(test); return; }
    n.children.forEach((c) => loop(c, [...ouders, n]));
  }(wortel, []));
  return gevonden;
}

// Zoekt de stylesheet met de layout van Beaver Builder in de HTML van de pagina.
function vindLayoutCssUrls(html, baseUrl) {
  const uit = [];
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(m[0]);
    if (!href) continue;
    const h = decodeer(href[1]);
    if (/bb-plugin\/cache\/\d+-layout(?:-partial)?\.css/i.test(h) || /bb-plugin\/css\/fl-builder-layout\b/i.test(h)) {
      try { uit.push(new URL(h, baseUrl).toString()); } catch { /* sla over */ }
    }
  }
  return [...new Set(uit)];
}

module.exports = { bouwSjabloon, vindLayoutCssUrls, parseer, serialiseer, decodeer };
