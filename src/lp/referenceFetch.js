// LP Fabriek: haalt een referentiepagina op en maakt er een lichte
// structuuranalyse van (koppen, knop/linkteksten, aantal afbeeldingen) om in
// de AI-prompt van ai.js mee te geven. Render heeft, anders dan de
// dev-sandbox, gewoon internettoegang (zie besluiten.md).
//
// Bewust een lichte, regex-gebaseerde parser i.p.v. een HTML-parser-
// dependency: we hebben geen exacte DOM nodig, alleen een globale indruk van
// de opbouw van de pagina. Een mislukte ophaal-poging (netwerkfout, 403,
// timeout) blokkeert het genereren niet — die info komt gewoon terug in het
// resultaat, ai.js valt dan terug op alleen de overige input.

async function fetchReferenceSummary(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LP-Fabriek-referentie-analyse/1.0)' }
    });
    if (!res.ok) {
      return { url, fout: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { url, structuur: extractStructureOutline(html) };
  } catch (err) {
    return { url, fout: err.message };
  }
}

function stripHtml(fragment) {
  return fragment.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractStructureOutline(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const headings = [...stripped.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => `H${m[1]}: ${stripHtml(m[2])}`)
    .filter((t) => t.length > 3)
    .slice(0, 40);

  const knoppenEnLinks = [...stripped.matchAll(/<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t && t.length <= 60)
    .slice(0, 30);

  const aantalAfbeeldingen = (stripped.match(/<img\b/gi) || []).length;

  return { headings, knoppenEnLinks, aantalAfbeeldingen };
}

module.exports = { fetchReferenceSummary };
