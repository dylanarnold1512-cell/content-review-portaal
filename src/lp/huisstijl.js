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
const { meetHuisstijl, afgeleideVormtaal, isLichtNeutraal } = require('./huisstijlMeting');

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
    // Meting per rol en eigenschap (25-09-2026, zie huisstijlMeting.js): koppen, tekst, knoppen, kaarten,
    // achtergronden en randen los van elkaar, plus @font-face families en de afgeleide vormtaal.
    meting: meetHuisstijl(combinedCss),
    lettertypeCandidates: extractLettertypeCandidates(cssBlocks),
    googleFonts: findGoogleFonts(html),
    stylesheetsGevonden: stylesheetUrls.length,
    stylesheetsOpgehaald: opgehaaldeCss.length,
    nietOpgehaald,
    structuur: extractStructureOutline(html)
  };
}

// Controleert bij Google Fonts of een lettertype echt bestaat en welke gewichten het heeft. Een bestaand
// lettertype dat de site zelf gebruikt (in koppen of tekst, ook zelf gehost) is daarmee een BEWEZEN Google
// Font en mag gebruikt worden, in plaats van blind "inherit" te kiezen. Een onbekende familie geeft 400 en
// zou de hele lettertype-stylesheet breken, dus dat moeten we vooraf weten (zie ook GOOGLE_FONT_GEWICHTEN
// in style.js). fetchFn is injecteerbaar voor de tests.
const GENERIEKE_LETTERTYPES = /^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system|blinkmacsystemfont|arial|helvetica|georgia|times|verdana|tahoma|segoe ui|roboto)$/i;

async function controleerGoogleFont(naam, fetchFn = fetch) {
  const enc = encodeURIComponent(String(naam).trim()).replace(/%20/g, '+');
  const vraag = async (q) => {
    try {
      const res = await fetchFn(`https://fonts.googleapis.com/css2?family=${enc}${q}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      return res.ok;
    } catch (err) {
      return false;
    }
  };
  if (!(await vraag(''))) return null;
  const gewichten = [];
  for (const w of [400, 500, 600, 700]) {
    if (await vraag(`:wght@${w}`)) gewichten.push(w);
  }
  return { naam: String(naam).trim(), gewichten: gewichten.length ? gewichten : [400] };
}

async function bevestigdeGoogleFonts(meting, googleFontsUitLink, fetchFn) {
  const kandidaten = [];
  const voegToe = (n) => {
    const naam = String(n || '').replace(/["']/g, '').trim();
    if (naam && !GENERIEKE_LETTERTYPES.test(naam) && !kandidaten.some((k) => k.toLowerCase() === naam.toLowerCase())) kandidaten.push(naam);
  };
  (meting.koppen.fonts.slice(0, 2)).forEach((f) => voegToe(f.waarde));
  (meting.tekst.fonts.slice(0, 2)).forEach((f) => voegToe(f.waarde));
  (meting.knoppen.fonts.slice(0, 1)).forEach((f) => voegToe(f.waarde));
  (googleFontsUitLink || []).forEach(voegToe);
  const resultaat = [];
  for (const naam of kandidaten.slice(0, 4)) {
    const gevonden = await controleerGoogleFont(naam, fetchFn);
    if (gevonden) resultaat.push(gevonden);
  }
  return resultaat;
}

// Corrigeert een AI-voorstel met de harde metingen (deterministisch, geen AI): fout of verzonnen waarden
// worden vervangen door gemeten waarden, en elke ingreep komt als twijfelpunt terug zodat Dylan het ziet.
function corrigeerVoorstelMetMeting(voorstel, meting, googleFontsBevestigd) {
  const tokens = { ...(voorstel.tokensVoorstel || {}) };
  const twijfels = Array.isArray(voorstel.twijfels) ? [...voorstel.twijfels] : [];
  const gemeten = (lijst) => new Set((lijst || []).map((i) => i.waarde));

  // Achtergrond en rand: moeten voorkomen als echte vlak- of randkleur, anders is het een gok of ruis.
  const achtergronden = gemeten(meting.achtergronden);
  if (tokens.bgAlt && !achtergronden.has(String(tokens.bgAlt).toLowerCase())) {
    const alt = meting.lichtNeutraleAchtergronden[0] && meting.lichtNeutraleAchtergronden[0].waarde;
    twijfels.push(`bgAlt ${tokens.bgAlt} komt niet voor als achtergrondkleur in de CSS van de site, ${alt ? `vervangen door het gemeten lichtgrijs ${alt}` : 'leeggelaten'}.`);
    tokens.bgAlt = alt || '';
  } else if (tokens.bgAlt && !isLichtNeutraal(String(tokens.bgAlt).toLowerCase()) && meting.lichtNeutraleAchtergronden[0]) {
    const alt = meting.lichtNeutraleAchtergronden[0].waarde;
    twijfels.push(`bgAlt ${tokens.bgAlt} is geen neutraal lichtgrijs vlak; op de site is ${alt} gemeten, dat is gebruikt.`);
    tokens.bgAlt = alt;
  }
  const randen = gemeten(meting.randen);
  if (tokens.border && randen.size && !randen.has(String(tokens.border).toLowerCase())) {
    const rand = meting.randen.find((r) => isLichtNeutraal(r.waarde)) || meting.randen[0];
    twijfels.push(`border ${tokens.border} komt niet voor als randkleur in de CSS, vervangen door ${rand.waarde}.`);
    tokens.border = rand.waarde;
  }

  // Lettertypes per rol: alleen een BEWEZEN Google Font (bestaat echt bij Google) wordt gebruikt.
  const bewezen = new Map(googleFontsBevestigd.map((f) => [f.naam.toLowerCase(), f]));
  const kopFont = meting.koppen.fonts.map((f) => f.waarde).find((n) => bewezen.has(n.toLowerCase()));
  const tekstFont = meting.tekst.fonts.map((f) => f.waarde).find((n) => bewezen.has(n.toLowerCase()));
  const gebruikt = new Set();
  if (kopFont) { tokens.fontHeading = `'${bewezen.get(kopFont.toLowerCase()).naam}', sans-serif`; gebruikt.add(kopFont.toLowerCase()); }
  if (tekstFont) { tokens.fontBody = `'${bewezen.get(tekstFont.toLowerCase()).naam}', sans-serif`; gebruikt.add(tekstFont.toLowerCase()); }
  if (kopFont && !tekstFont) tokens.fontBody = tokens.fontBody || 'inherit';
  const fontsVoorLaden = googleFontsBevestigd.filter((f) => gebruikt.has(f.naam.toLowerCase()));
  if (fontsVoorLaden.length) {
    tokens.googleFonts = fontsVoorLaden.map((f) => f.naam);
    tokens.googleFontGewichten = Object.fromEntries(fontsVoorLaden.map((f) => [f.naam, f.gewichten]));
  }
  if (kopFont && tekstFont && kopFont.toLowerCase() !== tekstFont.toLowerCase()) {
    twijfels.push(`Koppen en tekst gebruiken een ander lettertype: koppen ${kopFont}, tekst ${tekstFont}.`);
  }

  // Vormtaal: alleen wat echt gemeten is.
  Object.assign(tokens, afgeleideVormtaal(meting));
  return { tokensVoorstel: tokens, twijfels };
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
- Voor lettertype geldt een harde alles-of-niets-regel: ALLEEN als er een Google Font EXPLICIET
  gevonden is (zie "Expliciet gevonden Google Fonts" hieronder — dus letterlijk als <link>/@import
  op de site zelf), gebruik je die EXACTE naam met een passende generieke fallback (bv. "'Poppins',
  sans-serif") voor fontHeading/fontBody, EN zet je diezelfde exacte naam (of namen) ook in
  tokensVoorstel.googleFonts — dat is wat de pagina straks daadwerkelijk laat laden (zie style.js).
  In ALLE andere gevallen — geen exacte Google Font gevonden, zelfs als er wel een duidelijke winnaar
  tussen de losse font-family-kandidaten in de CSS zit — is fontHeading/fontBody ALTIJD precies
  "inherit" en googleFonts ALTIJD leeg. Noem die CSS-kandidaat dan puur in twijfels als platte tekst
  (bv. "X komt het vaakst voor in de CSS maar is niet als Google Font gevonden, dus niet gebruikt").
  Verzin in dat geval NOOIT een ANDER, wél-laadbaar lettertype als "veilig alternatief" of "vervanger"
  voor de niet-bevestigde kandidaat (bv. zelf voor Ubuntu/Poppins/Open Sans kiezen "omdat het er
  vergelijkbaar uitziet") — dat is net zo goed gokken als de onbevestigde naam zelf gebruiken, en dus
  precies wat deze regel verbiedt. Een font-family-kandidaat uit gewone CSS is geen bewijs dat het
  een Google Font is (kan een systeemfont of een zelf-gehost font zijn) — bij twijfel is "inherit"
  altijd de juiste, veilige keuze, nooit een verzonnen vervanger.
- Je krijgt ook een METING per rol (koppen, tekst, knoppen, kaarten, achtergronden, randen, themakleuren) die
  uit de CSS is afgeleid. Gebruik die metingen als bewijs: bgAlt is een gemeten lichtgrijs vlak (nooit een
  gekleurde of roze tint tenzij de site die echt als vlak gebruikt), border een gemeten randkleur, en fontHeading
  en fontBody komen uit de gemeten rol (koppen en tekst kunnen VERSCHILLEN). Wat niet gemeten is, laat je
  leeg of "inherit". De vormtaal (hoofdletters, knop- en kaartrondingen, kopkleur) wordt los van jou uit de
  meting afgeleid; jij schrijft alleen "sfeer": een of twee zinnen in gewone taal over hoe de site aanvoelt
  (bv. stoer en strak, of licht en speels), op basis van de metingen en de structuur, zonder iets te verzinnen.
- radius en maxWidth mag je een redelijke standaardwaarde geven (bv. "8px", "1200px") tenzij de
  structuurdata een duidelijke andere indruk geeft.

Antwoord ALLEEN met een JSON-object met exact drie velden, geen tekst erbuiten:
{
  "tokensVoorstel": { "primary": string, "primaryDark": string, "secondary": string, "text": string,
    "textMuted": string, "bg": string, "bgAlt": string, "border": string, "maxWidth": string,
    "radius": string, "fontHeading": string, "fontBody": string, "googleFonts": string[],
    "ctaBg": string, "ctaText": string, "sfeer": string },
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

Meting per rol (uit de CSS):
${JSON.stringify(ruweData.meting, null, 2)}

Structuuroverzicht van de pagina:
${JSON.stringify(ruweData.structuur, null, 2)}

Stylesheets gevonden: ${ruweData.stylesheetsGevonden}, opgehaald: ${ruweData.stylesheetsOpgehaald}${
    ruweData.nietOpgehaald.length ? ` (niet opgehaald: ${ruweData.nietOpgehaald.map((n) => n.url).join(', ')})` : ''
  }`;

  const result = await callOpenAi({ systemPrompt: buildHuisstijlSystemPrompt(), userPrompt });
  if (!result || !result.tokensVoorstel) {
    throw new Error('AI-antwoord miste het verwachte veld "tokensVoorstel".');
  }
  const bewezenFonts = await bevestigdeGoogleFonts(ruweData.meting, ruweData.googleFonts);
  const gecorrigeerd = corrigeerVoorstelMetMeting(result, ruweData.meting, bewezenFonts);
  return {
    tokensVoorstel: gecorrigeerd.tokensVoorstel,
    samenvatting: result.samenvatting || '',
    twijfels: gecorrigeerd.twijfels,
    ruweData
  };
}

module.exports = { buildHuisstijlVoorstel, verzamelRuweHuisstijlData, corrigeerVoorstelMetMeting, controleerGoogleFont, bevestigdeGoogleFonts };
