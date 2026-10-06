// Analyse van een klantwebsite voor het intakeformulier: haalt de homepage op en
// stelt de naam, het Client ID, een korte omschrijving, de taal en of de site op
// WordPress draait voor. Het formulier vult alleen lege velden in, dus wat
// iemand al heeft getypt blijft staan. Geen AI: alleen wat de site zelf zegt.

const dns = require('dns').promises;
const net = require('net');

const TIMEOUT_MS = 8000;
const MAX_BYTES = 600 * 1024;
const MAX_HOPS = 3;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
  }
  return true;
}

// Alleen publieke websites: geen localhost, geen interne adressen.
async function controleerAdres(url) {
  if (!/^https?:$/.test(url.protocol)) throw new Error('Gebruik een website die met http of https begint.');
  const host = url.hostname;
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Dit adres kan niet worden opgehaald.');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Dit adres kan niet worden opgehaald.');
    return;
  }
  const adressen = await dns.lookup(host, { all: true });
  if (!adressen.length || adressen.some((a) => isPrivateIp(a.address))) throw new Error('Dit adres kan niet worden opgehaald.');
}

async function haal(urlTekst) {
  let url = new URL(urlTekst);
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    await controleerAdres(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdvertisrIntake/1.0)', Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' }
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_BYTES);
    return { ok: res.ok, status: res.status, url: url.toString(), tekst: buf.toString('utf8') };
  }
  throw new Error('Te veel doorverwijzingen.');
}

function decodeer(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function metaWaarde(html, sleutel) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const naam = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i);
    if (!naam || naam[1].toLowerCase() !== sleutel) continue;
    const inhoud = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i);
    if (inhoud) return decodeer(inhoud[1]);
  }
  return '';
}

function slugify(tekst) {
  return String(tekst || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' en ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

// "Basecamp Utrecht | Vergaderen en events" wordt "Basecamp Utrecht".
function naamUitTitel(titel) {
  const delen = String(titel || '').split(/\s+[|–—·:]\s+|\s+-\s+/).map((d) => d.trim()).filter(Boolean);
  return delen.length ? delen[0].slice(0, 80) : '';
}

function naamUitDomein(host) {
  const kern = String(host || '').replace(/^www\./, '').split('.')[0];
  return kern.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function analyseerHtml(html, pagina) {
  const titel = decodeer((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const siteNaam = metaWaarde(html, 'og:site_name');
  const beschrijving = metaWaarde(html, 'description') || metaWaarde(html, 'og:description');
  const taal = ((html.match(/<html[^>]*\blang\s*=\s*["']([a-zA-Z-]+)["']/i) || [])[1] || '').slice(0, 2).toLowerCase();
  const host = new URL(pagina).hostname;
  const naam = siteNaam || naamUitTitel(titel) || naamUitDomein(host);
  return { naam, beschrijving: beschrijving.slice(0, 400), taal, host };
}

async function analyseerWebsite(invoer) {
  let tekst = String(invoer || '').trim();
  if (!tekst) throw new Error('Vul eerst een website in.');
  if (!/^https?:\/\//i.test(tekst)) tekst = 'https://' + tekst;
  let start;
  try { start = new URL(tekst); } catch (err) { throw new Error('Dit is geen geldig webadres.'); }

  const pagina = await haal(start.origin + '/');
  if (!pagina.ok) throw new Error(`De website gaf een foutmelding (${pagina.status}).`);
  const basis = new URL(pagina.url);
  const origin = basis.origin;
  const info = analyseerHtml(pagina.tekst, pagina.url);

  let wordpress = false;
  try {
    const wp = await haal(origin + '/wp-json/');
    if (wp.ok) {
      const json = JSON.parse(wp.tekst);
      wordpress = Array.isArray(json.namespaces) && json.namespaces.includes('wp/v2');
    }
  } catch (err) {
    wordpress = /wp-content|wp-includes/i.test(pagina.tekst);
  }

  return {
    website: origin + '/',
    naam: info.naam,
    clientId: slugify(info.naam),
    beschrijving: info.beschrijving,
    taal: info.taal,
    wordpress,
    wordpressUrl: wordpress ? origin : '',
    searchConsoleUrl: origin + '/'
  };
}

module.exports = { analyseerWebsite, analyseerHtml, slugify, naamUitTitel, isPrivateIp };
