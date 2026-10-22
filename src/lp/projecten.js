// Projecten van de eigen klantsite op een Pagr. pagina (22-10-2026, Dylan).
//
// Aanleiding: Hirs Installaties heeft veel projecten op /projecten/, maar de pagina kreeg alleen losse foto's omdat het
// systeem de projecten nooit las. Voor elke klant met WordPress lezen we nu de publieke berichten (REST, zonder inlog),
// laten de blogcategorie buiten beschouwing (profile.wordpress.blogCategorie) en kiezen per pagina de projecten die
// bij het onderwerp passen. Titel, foto en link komen letterlijk van de site. De korte tekst schrijft de AI opnieuw
// in de stem van de klant (ai.schrijfProjectTeksten), alleen op basis van het uittreksel van de site.
//
// Heeft een klant een aparte categorie voor projecten, zet dan profile.wordpress.projectCategorie (slug).

const FETCH_TIMEOUT_MS = 8000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const CACHE = new Map();

function ontsmet(t) {
  return String(t == null ? '' : t)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[(?:&hellip;|…|\.\.\.)\]/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;|&#038;/g, '&')
    .replace(/&quot;|&#8220;|&#8221;|&#34;/g, '"')
    .replace(/&#8217;|&#8216;|&#039;|&apos;/g, "'")
    .replace(/&#8211;|&ndash;|&#8212;|&mdash;/g, ', ')
    .replace(/&hellip;|&#8230;/g, '')
    .replace(/&euml;/g, 'ë').replace(/&eacute;/g, 'é')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function kortAf(tekst, max = 420) {
  const t = ontsmet(tekst);
  if (t.length <= max) return t;
  const stuk = t.slice(0, max);
  const punt = Math.max(stuk.lastIndexOf('. '), stuk.lastIndexOf('! '), stuk.lastIndexOf('? '));
  return punt > 120 ? stuk.slice(0, punt + 1) : stuk.replace(/\s+\S*$/, '');
}

async function haalJson(url, fetchFn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; LP-Fabriek-projecten/1.0)' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function postNaarProject(post) {
  const media = ((post._embedded || {})['wp:featuredmedia'] || [])[0] || {};
  const formaten = (media.media_details || {}).sizes || {};
  const foto = (formaten.large || formaten.medium_large || {}).source_url || media.source_url || '';
  const titel = ontsmet((post.title || {}).rendered);
  return {
    id: post.id,
    titel,
    link: post.link || '',
    tekst: kortAf((post.excerpt || {}).rendered),
    foto,
    alt: ontsmet(media.alt_text) || titel
  };
}

// Geeft de projecten van de klantsite, nieuwste eerst. Gooit nooit: bij een fout komt een lege lijst terug.
async function haalProjecten(profile, { fetchFn = globalThis.fetch } = {}) {
  const wp = (profile && profile.wordpress) || {};
  const url = String(((profile && profile.bedrijf) || {}).url || '').replace(/\/+$/, '');
  if (!url || !wp || !fetchFn) return [];
  const sleutel = `${url}|${wp.blogCategorie || ''}|${wp.projectCategorie || ''}`;
  const cached = CACHE.get(sleutel);
  if (cached && Date.now() - cached.tijd < CACHE_MS) return cached.waarde;
  const categorieId = async (slug) => {
    if (!slug) return null;
    const r = await haalJson(`${url}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}&_fields=id`, fetchFn);
    return Array.isArray(r) && r[0] ? r[0].id : null;
  };
  const [blogId, projectId] = await Promise.all([categorieId(wp.blogCategorie), categorieId(wp.projectCategorie)]);
  const filter = projectId ? `&categories=${projectId}` : (blogId ? `&categories_exclude=${blogId}` : '');
  const posts = await haalJson(`${url}/wp-json/wp/v2/posts?per_page=100&status=publish&_embed=wp:featuredmedia&_fields=id,link,title,excerpt,_embedded${filter}`, fetchFn);
  const waarde = (Array.isArray(posts) ? posts : []).map(postNaarProject).filter((p) => p.titel && p.foto);
  if (waarde.length) CACHE.set(sleutel, { tijd: Date.now(), waarde });
  return waarde;
}

const sleutelWoord = (w) => w.slice(0, 6);

// Kiest de projecten die het best bij de pagina passen. Een project zonder overlap met het onderwerp wordt nooit gekozen.
function kiesProjecten(projecten, { onderwerpWoorden = [], plaats = '', max = 3 } = {}) {
  const stammen = [...new Set((onderwerpWoorden || []).map((w) => String(w).toLowerCase()).filter((w) => w.length >= 4))].map(sleutelWoord);
  const plaatsLc = String(plaats || '').toLowerCase();
  const gescoord = (projecten || []).map((p, i) => {
    const haystack = `${p.titel} ${p.tekst}`.toLowerCase();
    const titel = p.titel.toLowerCase();
    let score = 0;
    stammen.forEach((s) => { if (titel.includes(s)) score += 3; else if (haystack.includes(s)) score += 1; });
    if (score && plaatsLc && haystack.includes(plaatsLc)) score += 2;
    return { p, score, i };
  }).filter((x) => x.score > 0);
  gescoord.sort((a, b) => b.score - a.score || a.i - b.i);
  return gescoord.slice(0, max).map((x) => x.p);
}

const veld = (slot, naam) => (slot.itemFields || []).find((f) => f.toLowerCase() === naam.toLowerCase());

// Zet gekozen projecten in de projectlijst van het sjabloon. teksten: { [projectId]: korte tekst } van de AI.
function vulProjectItems(slot, slotData, gekozen, teksten = {}) {
  const items = gekozen.map((p) => {
    const item = {};
    (slot.itemFields || []).forEach((f) => { item[f] = ''; });
    const zet = (naam, waarde) => { const f = veld(slot, naam); if (f) item[f] = waarde; };
    zet('title', p.titel);
    zet('text', teksten[p.id] || '');
    zet('imageSrc', p.foto);
    zet('imageAlt', p.alt);
    if (p.link) { zet('href', p.link); zet('linkHref', p.link); if (veld(slot, 'linkLabel') || veld(slot, 'ctaLabel')) { zet('linkLabel', 'Bekijk dit project'); zet('ctaLabel', 'Bekijk dit project'); } }
    return item;
  });
  slotData[slot.key] = items;
  const deel = (d) => slot.key.replace(/Items$/, d);
  const standaard = { Kicker: 'Projecten', Title: 'Eerder uitgevoerd werk' };
  Object.keys(standaard).forEach((d) => {
    const k = deel(d);
    if (k !== slot.key && items.length && typeof slotData[k] === 'string' && !slotData[k].trim()) slotData[k] = standaard[d];
  });
  return slotData;
}

module.exports = { haalProjecten, kiesProjecten, vulProjectItems, ontsmet, kortAf, postNaarProject, _wisCache: () => CACHE.clear() };
