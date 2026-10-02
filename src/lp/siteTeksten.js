// LP Fabriek: de teksten van de eigen website van de klant als bron voor een landingspagina (Dylan, 02-10-2026).
//
// Aanleiding: een locatiepagina voor MAC Bouw had weinig inhoud (dienstkaarten van een zin, algemene stappen), terwijl
// de eigen site van de klant veel meer vertelt (bijvoorbeeld 860 woorden over nieuwbouw en verbouw). De AI mocht
// alleen schrijven wat in de feitenbibliotheek stond (14 korte feiten), dus kon hij niets anders dan herhalen.
// Dylan wil niet zelf feiten uitzoeken: de AI leest standaard de hele website en gebruikt de teksten als bron.
//
// Werking, zonder inlog en zonder kennis van het thema:
//  1. De pagina's van de klantsite worden gevonden via de publieke WordPress REST lijst (/wp-json/wp/v2/pages) en
//     de links op de homepage. Eigen landingspagina's van LP Fabriek (uitsluit) worden NIET gelezen, anders gaat de
//     AI zijn eigen eerdere tekst als bron gebruiken. Privacy, voorwaarden, winkel en dergelijke worden overgeslagen.
//  2. Per pagina wordt de hoofdtekst uit de HTML gehaald (zonder menu, header, footer en formulieren).
//  3. De uitkomst gaat als brontekst mee in de prompt van generatePageContent (ai.js). Het bronprincipe blijft:
//     de AI mag alleen gebruiken wat in de bronteksten, de feitensheet of de invoer staat.
// Resultaat wordt 6 uur onthouden per site, zodat een reeks pagina's niet steeds de hele site ophaalt.

const FETCH_TIMEOUT_MS = 8000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_PAGINAS = 14;
const MAX_KANDIDATEN = 24;
const MAX_WOORDEN_PER_PAGINA = 1800;
const MAX_WOORDEN_TOTAAL = 9000;
const MIN_WOORDEN = 40;
const PARALLEL = 4;

const OVERSLAAN_RE = /privacy|cookie|voorwaarden|disclaimer|sitemap|winkelwagen|\/cart|checkout|mijn-account|\/account|login|bedankt|thank|zoeken|search|404|configurator|vacature|wp-content|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)(\?|$)/i;
const PRIORITEIT_RE = /diens|renovat|verbouw|nieuwbouw|timmer|dakkap|onderhoud|aanbod|werkwijze|over-ons|over|project|faq|vragen|team|service|contact/i;

const CACHE = new Map();

async function fetchTekst(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LP-Fabriek-brontekst/1.0)', ...(accept ? { Accept: accept } : {}) }
    });
    if (!res.ok) return { ok: false, fout: `HTTP ${res.status}` };
    return { ok: true, text: await res.text(), url: res.url || url };
  } catch (err) {
    return { ok: false, fout: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntiteiten(t) {
  return String(t)
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;|&#038;/g, '&')
    .replace(/&quot;|&#8220;|&#8221;|&#34;/g, '"')
    .replace(/&#8217;|&#8216;|&#039;|&apos;/g, "'")
    .replace(/&#8211;|&ndash;/g, ',')
    .replace(/&#8212;|&mdash;/g, ',')
    .replace(/&hellip;|&#8230;/g, '...')
    .replace(/&euro;|&#8364;/g, 'euro')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch (e) { return ' '; } });
}

// Hoofdtekst van een pagina als platte tekst met "## " voor koppen en "- " voor opsommingen. Geen bibliotheek, regex.
function hoofdTekst(html) {
  let h = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|button|select|textarea)\b[\s\S]*?<\/\1>/gi, ' ');
  const kies = (naam) => {
    const m = h.match(new RegExp(`<${naam}\\b[^>]*>([\\s\\S]*)<\\/${naam}>`, 'i'));
    return m ? m[1] : '';
  };
  const kern = kies('main') || kies('article') || (h.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [])[1] || h;
  const tekst = decodeEntiteiten(
    kern
      .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t) => `\n## ${t.replace(/<[^>]+>/g, ' ')}\n`)
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|ul|ol|tr|table|blockquote|figure|dd|dt)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  const gezien = new Set();
  const regels = [];
  for (const rauw of tekst.split('\n')) {
    const regel = rauw.replace(/\s+/g, ' ').trim();
    if (regel.length < 3 || /^[-#\s]*$/.test(regel)) continue;
    const sleutel = regel.toLowerCase();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    regels.push(regel);
  }
  return regels.join('\n');
}

function telWoorden(t) {
  return String(t).split(/\s+/).filter(Boolean).length;
}

function kapAfOpWoorden(t, max) {
  const woorden = String(t).split(/\s+/);
  if (woorden.length <= max) return String(t);
  // Op regelniveau afkappen zodat een zin niet halverwege stopt.
  let uit = [];
  let n = 0;
  for (const regel of String(t).split('\n')) {
    const w = telWoorden(regel);
    if (n + w > max) break;
    uit.push(regel);
    n += w;
  }
  return uit.join('\n');
}

function normaliseerUrl(url, basis) {
  try {
    const u = new URL(url, basis);
    u.hash = '';
    u.search = '';
    let s = u.toString();
    if (!s.endsWith('/')) s += '/';
    return s;
  } catch (err) {
    return null;
  }
}

function zelfdeHost(a, b) {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch (err) {
    return false;
  }
}

// Pagina's van de klantsite: homepage, WordPress REST lijst en links op de homepage. Volgorde: homepage, daarna
// pagina's met een dienst- of bedrijfsachtige naam, daarna de rest. Landingspagina's van LP Fabriek (uitsluit) vallen af.
function kiesUrls({ basis, restPaginas, homepageLinks, uitsluit }) {
  const uitgesloten = new Set((uitsluit || []).map((u) => normaliseerUrl(u, basis)).filter(Boolean));
  const home = normaliseerUrl(basis, basis);
  const gezien = new Set();
  const lijst = [];
  const voegToe = (url, titel) => {
    const n = normaliseerUrl(url, basis);
    if (!n || gezien.has(n) || !zelfdeHost(n, basis) || uitgesloten.has(n) || OVERSLAAN_RE.test(n)) return;
    gezien.add(n);
    lijst.push({ url: n, titel: titel || '' });
  };
  voegToe(basis, 'Homepage');
  (restPaginas || []).forEach((p) => voegToe(p.url, p.titel));
  (homepageLinks || []).forEach((u) => voegToe(u, ''));
  const prioriteit = (p) => (p.url === home ? 0 : PRIORITEIT_RE.test(p.url) || PRIORITEIT_RE.test(p.titel) ? 1 : 2);
  return lijst
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => prioriteit(a) - prioriteit(b) || a.i - b.i)
    .slice(0, MAX_KANDIDATEN)
    .map(({ url, titel }) => ({ url, titel }));
}

function linksUitHtml(html, basis) {
  return [...String(html).matchAll(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi)].map((m) => m[1]).filter((h) => !/^(mailto:|tel:|javascript:)/i.test(h)).map((h) => normaliseerUrl(h, basis)).filter(Boolean);
}

async function inBatches(items, n, fn) {
  const uit = [];
  for (let i = 0; i < items.length; i += n) {
    uit.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  }
  return uit;
}

// Leest de klantsite. Gooit nooit: bij een fout komt { paginas: [], fout } terug.
async function haalSiteTeksten({ url, uitsluit }) {
  if (!url) return { paginas: [], totaalWoorden: 0, fout: 'Geen website opgegeven voor deze klant.' };
  const basis = String(url).replace(/\/+$/, '') + '/';
  const sleutel = `${basis}|${(uitsluit || []).slice().sort().join(',')}`;
  const cached = CACHE.get(sleutel);
  if (cached && Date.now() - cached.tijd < CACHE_MS) return cached.waarde;
  let waarde;
  try {
    const home = await fetchTekst(basis);
    if (!home.ok) {
      waarde = { paginas: [], totaalWoorden: 0, fout: `Homepage ${basis} kon niet opgehaald worden (${home.fout}).` };
    } else {
      let restPaginas = [];
      const rest = await fetchTekst(`${basis}wp-json/wp/v2/pages?per_page=100&status=publish&_fields=link,title`, 'application/json');
      if (rest.ok) {
        try {
          restPaginas = (JSON.parse(rest.text) || []).map((p) => ({ url: p.link, titel: decodeEntiteiten((p.title && p.title.rendered) || '').replace(/<[^>]+>/g, '') }));
        } catch (err) { /* geen WordPress REST, dan alleen de links van de homepage */ }
      }
      const kandidaten = kiesUrls({ basis, restPaginas, homepageLinks: linksUitHtml(home.text, basis), uitsluit });
      const gelezen = await inBatches(kandidaten, PARALLEL, async (k) => {
        const homepage = normaliseerUrl(k.url, basis) === normaliseerUrl(basis, basis);
        const res = homepage ? home : await fetchTekst(k.url);
        if (!res.ok) return null;
        const titel = (res.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
        const tekst = hoofdTekst(res.text);
        if (telWoorden(tekst) < MIN_WOORDEN) return null;
        return { url: k.url, titel: decodeEntiteiten(k.titel || titel || k.url).replace(/\s+/g, ' ').trim(), tekst: kapAfOpWoorden(tekst, MAX_WOORDEN_PER_PAGINA) };
      });
      const paginas = [];
      let totaal = 0;
      for (const p of gelezen.filter(Boolean)) {
        if (paginas.length >= MAX_PAGINAS) break;
        const w = telWoorden(p.tekst);
        if (totaal + w > MAX_WOORDEN_TOTAAL) {
          const rest2 = MAX_WOORDEN_TOTAAL - totaal;
          if (rest2 < 150) break;
          paginas.push({ ...p, tekst: kapAfOpWoorden(p.tekst, rest2) });
          totaal = MAX_WOORDEN_TOTAAL;
          break;
        }
        paginas.push(p);
        totaal += w;
      }
      waarde = { paginas, totaalWoorden: totaal, fout: paginas.length ? null : 'Geen leesbare pagina\'s gevonden op de klantsite.' };
    }
  } catch (err) {
    waarde = { paginas: [], totaalWoorden: 0, fout: err.message };
  }
  if (!waarde.fout) CACHE.set(sleutel, { tijd: Date.now(), waarde });
  return waarde;
}

function formatSiteTekstenVoorPrompt(res) {
  if (!res || !Array.isArray(res.paginas) || !res.paginas.length) return '';
  return res.paginas.map((p) => `--- ${p.titel} (${p.url}) ---\n${p.tekst}`).join('\n\n');
}

module.exports = { haalSiteTeksten, formatSiteTekstenVoorPrompt, hoofdTekst, kiesUrls, kapAfOpWoorden, telWoorden, normaliseerUrl, OVERSLAAN_RE };
