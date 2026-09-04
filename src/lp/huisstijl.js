// LP Fabriek: huisstijl-analyse voor de klant-intake (nieuwe klant
// toevoegen). Anders dan referenceFetch.js (dat alleen STRUCTUUR van een
// referentiepagina ophaalt voor sjabloon-ontwerp) haalt dit bestand de
// EIGEN site van een nieuwe klant op en leidt daar een concreet
// tokens-voorstel uit af: kleuren, lettertype, korte samenvatting. Zie
// besluiten.md, "Klant-intake in het portaal" — Dylan wilde dat de AI hier
// echt van a-z de huisstijl analyseert, lettertype inbegrepen.
//
// Bewust een lichte, regex-gebaseerde parser, zelfde filosofie als
// referenceFetch.js: geen CSS-parser-dependency, alleen een globale indruk
// die door de AI daarna tot een voorstel wordt gemaakt. Dylan ziet en past
// het voorstel aan voordat het ergens wordt opgeslagen — dit bestand
// verzint niets definitiefs, het levert alleen ruwe aanwijzingen + een
// AI-voorstel.

const { callOpenAi } = require('./ai');
const { extractStructureOutline } = require('./referenceFetch');

const MAX_STYLESHEETS = 6;
const FETCH_TIMEOUT_MS = 8000;

async function fetchText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LP-Fabriek-huisstijl-analyse/1.0)' }
    });
    if (!res.ok) return { ok: false, fout: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (err) {
    return { ok: false, fout: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch (err) {
    return null;
  }
}

function findStylesheetLinks(html, baseUrl) {
  const hrefs = [...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => {
      const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
      return hrefMatch ? resolveUrl(hrefMatch[1], baseUrl) : null;
    })
    .filter(Boolean);
  return [...new Set(hrefs)].slice(0, MAX_STYLESHEETS);
}

// Google Fonts is het betrouwbaarste signaal voor het lettertype: als de
// site 'm zo laadt weten we de exacte naam, zonder te hoeven gokken op basis
// van font-family-declaraties (die vaak generieke fallback-stacks bevatten).
function findGoogleFonts(html) {
  const families = new Set();
  const linkMatches = [...html.matchAll(/<link[^>]*href=["']([^"']*fonts\.googleapis\.com[^"']+)["'][^>]*>/gi)];
  for (const m of linkMatches) {
    const href = m[1];
    const familyParams = [...href.matchAll(/family=([^&"']+)/gi)];
    for (const fm of familyParams) {
      fm[1].split('|').forEach((part) => {
        const naam = decodeURIComponent(part.split(':')[0]).replace(/\+/g, ' ').trim();
        if (naam) families.add(naam);
      });
    }
  }
  const importMatches = [...html.matchAll(/@import\s+url\(["']?([^"')]*fonts\.googleapis\.com[^"')]+)["']?\)/gi)];
  for (const m of importMatches) {
    const familyParams = [...m[1].matchAll(/family=([^&"']+)/gi)];
    for (const fm of familyParams) {
      fm[1].split('|').forEach((part) => {
        const naam = decodeURIComponent(part.split(':')[0]).replace(/\+/g, ' ').trim();
        if (naam) families.add(naam);
      });
    }
  }
  return [...families];
}

// Splitst CSS-tekst ruw in { selector, body }-blokken, puur om per blok het
// selector-type te kunnen wegen (bv. een kleur in ".btn-primary" telt zwaarder
// mee als CTA-kleur dan dezelfde kleur in ".sr-only"). Geen echte parser,
// dus genest/complexe CSS kan blokken missen — dat is acceptabel, dit voedt
// alleen een AI-voorstel, geen mechanische controle.
function splitCssBlocks(css) {
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    blocks.push({ selector: m[1].trim().toLowerCase(), body: m[2] });
  }
  return blocks;
}

const KLEUR_REGEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/gi;

function normalizeHex(hex) {
  if (hex.length === 3) {
    return '#' + hex.split('').map((c) => c + c).join('').toLowerCase();
  }
  return '#' + hex.toLowerCase();
}

function extractKleuren(cssBlocks) {
  const tally = new Map(); // kleur -> { frequentie, contexten: Set }
  for (const block of cssBlocks) {
    const matches = block.body.match(KLEUR_REGEX) || [];
    if (!matches.length) continue;
    let gewicht = 1;
    let contextLabel = 'algemeen';
    if (/\b(btn|button|cta|primary|accent)\b/.test(block.selector)) {
      gewicht = 3;
      contextLabel = 'knop/cta/accent';
    } else if (/\b(header|nav|footer)\b/.test(block.selector)) {
      gewicht = 2;
      contextLabel = 'header/nav/footer';
    } else if (/\b(bg|background)\b/.test(block.selector)) {
      contextLabel = 'achtergrond';
    }
    for (const raw of matches) {
      const kleur = raw.startsWith('#') ? normalizeHex(raw.slice(1)) : raw.replace(/\s+/g, '');
      if (!tally.has(kleur)) tally.set(kleur, { frequentie: 0, contexten: new Set() });
      const entry = tally.get(kleur);
      entry.frequentie += gewicht;
      entry.contexten.add(contextLabel);
    }
  }
  return [...tally.entries()]
    .map(([kleur, data]) => ({ kleur, frequentie: data.frequentie, contexten: [...data.contexten] }))
    .sort((a, b) => b.frequentie - a.frequentie)
    .slice(0, 15);
}

function extractLettertypeCandidates(cssBlocks) {
  const tally = new Map();
  for (const block of cssBlocks) {
    const fontMatches = [...block.body.matchAll(/font-family\s*:\s*([^;]+);?/gi)];
    if (!fontMatches.length) continue;
    let gewicht = 1;
    let contextLabel = 'algemeen';
    if (/^(body|html)\b/.test(block.selector) || block.selector === '*') {
      gewicht = 3;
      contextLabel = 'body';
    } else if (/\bh[1-6]\b/.test(block.selector) || /\bheading|\btitle\b/.test(block.selector)) {
      gewicht = 2;
      contextLabel = 'koppen';
    }
    for (const fm of fontMatches) {
      const naam = fm[1].split(',')[0].replace(/["']/g, '').trim();
      if (!naam || /^(inherit|initial|unset)$/i.test(naam)) continue;
      if (!tally.has(naam)) tally.set(naam, { frequentie: 0, contexten: new Set() });
      const entry = tally.get(naam);
      entry.frequentie += gewicht;
      entry.contexten.add(contextLabel);
    }
  }
  return [...tally.entries()]
    .map(([naam, data]) => ({ naam, frequentie: data.frequentie, contexten: [...data.contexten] }))
    .sort((a, b) => b.frequentie - a.frequentie)
    .slice(0, 8);
}

// Haalt de site op, verzamelt CSS (inline + gelinkte stylesheets) en levert
// de ruwe bevindingen. Een mislukte losse stylesheet-ophaal blokkeert de rest
// niet (zelfde aanpak als referenceFetch.js) — komt terug als "nietOpgehaald".
async function verzamelRuweHuisstijlData(url) {
  const pageRes = await fetchText(url);
  if (!pageRes.ok) {
    return { url, fout: pageRes.fout };
  }
  const html = pageRes.text;

  const inlineStyleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const stylesheetUrls = findStylesheetLinks(html, url);

  const opgehaaldeCss = [];
  const nietOpgehaald = [];
  for (const sheetUrl of stylesheetUrls) {
    const res = await fetchText(sheetUrl, 6000);
    if (res.ok) {
      opgehaaldeCss.push(res.text);
    } else {
      nietOpgehaald.push({ url: sheetUrl, fout: res.fout });
    }
  }

  const combinedCss = [...inlineStyleBlocks, ...opgehaaldeCss].join('\n');
  const cssBlocks = splitCssBlocks(combinedCss);

  return {
    url,
    kleuren: extractKleuren(cssBlocks),
    lettertypeCandidates: extractLettertypeCandidates(cssBlocks),
    googleFonts: findGoogleFonts(html),
    stylesheetsGevonden: stylesheetUrls.length,
    stylesheetsOpgehaald: opgehaaldeCss.length,
    nietOpgehaald,
    structuur: extractStructureOutline(html)
  };
}

function buildHuisstijlSystemPrompt() {
  return `Je bent een senior brand/webdesigner. Je krijgt RUWE, automatisch geextraheerde gegevens over
de website van een nieuwe klant (kleuren met frequentie/context, lettertype-kandidaten, eventueel een
exact gevonden Google Font, en een structuuroverzicht). Op basis daarvan stel je een concreet tokens-
voorstel op voor de LP Fabriek (dezelfde velden als het bestaande tokens-bestand), plus een korte
samenvatting van de huisstijl in gewone taal, plus een lijst twijfelpunten waar je niet zeker van bent
(bv. geen duidelijk lettertype gevonden, of de kleuren met de hoogste frequentie zijn waarschijnlijk
neutrale UI-kleuren in plaats van merkkleuren).

Regels:
- Kies bij voorkeur kleuren die vaker voorkomen in knop/cta/accent-contexten als primary/ctaBg.
- Puur wit/zwart/grijstinten zijn meestal tekst/achtergrond, geen merkkleur — kies die niet als primary
  tenzij er echt niets beters is.
- Voor lettertype: als er een Google Font expliciet gevonden is, gebruik die naam met een passende
  generieke fallback (bv. "'Poppins', sans-serif"). Zonder duidelijke winnaar: gebruik "inherit" en
  meld dat als twijfelpunt (dan volgt de pagina gewoon het lettertype van de WordPress-theme).
- radius en maxWidth mag je een redelijke standaardwaarde geven (bv. "8px", "1200px") tenzij de
  structuurdata een duidelijke andere indruk geeft.

Antwoord ALLEEN met een JSON-object met exact drie velden, geen tekst erbuiten:
{
  "tokensVoorstel": { "primary": string, "primaryDark": string, "secondary": string, "text": string,
    "textMuted": string, "bg": string, "bgAlt": string, "border": string, "maxWidth": string,
    "radius": string, "fontHeading": string, "fontBody": string, "ctaBg": string, "ctaText": string },
  "samenvatting": string,
  "twijfels": [string]
}`;
}

async function buildHuisstijlVoorstel(referentieUrl) {
  if (!referentieUrl || !referentieUrl.trim()) {
    throw new Error('Vul eerst een referentie-URL (de eigen website van de klant) in.');
  }
  const ruweData = await verzamelRuweHuisstijlData(referentieUrl.trim());
  if (ruweData.fout) {
    throw new Error(`Kon ${referentieUrl} niet ophalen: ${ruweData.fout}`);
  }

  const userPrompt = `Website: ${ruweData.url}

Gevonden kleuren (hex/rgb, frequentie, context):
${JSON.stringify(ruweData.kleuren, null, 2)}

Lettertype-kandidaten uit CSS (naam, frequentie, context):
${JSON.stringify(ruweData.lettertypeCandidates, null, 2)}

Expliciet gevonden Google Fonts (betrouwbaarste signaal, indien aanwezig):
${JSON.stringify(ruweData.googleFonts, null, 2)}

Structuuroverzicht van de pagina:
${JSON.stringify(ruweData.structuur, null, 2)}

Stylesheets gevonden: ${ruweData.stylesheetsGevonden}, opgehaald: ${ruweData.stylesheetsOpgehaald}${
    ruweData.nietOpgehaald.length ? ` (niet opgehaald: ${ruweData.nietOpgehaald.map((n) => n.url).join(', ')})` : ''
  }`;

  const result = await callOpenAi({ systemPrompt: buildHuisstijlSystemPrompt(), userPrompt });
  if (!result || !result.tokensVoorstel) {
    throw new Error('AI-antwoord miste het verwachte veld "tokensVoorstel".');
  }
  return {
    tokensVoorstel: result.tokensVoorstel,
    samenvatting: result.samenvatting || '',
    twijfels: Array.isArray(result.twijfels) ? result.twijfels : [],
    ruweData
  };
}

module.exports = { buildHuisstijlVoorstel, verzamelRuweHuisstijlData };
