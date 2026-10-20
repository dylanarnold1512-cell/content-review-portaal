// Linkkandidaten naar blogs voor Pagr. pagina's van klanten die ook Blogr. hebben (product Beide).
// Een pagina mag naar 2 of 3 passende blogs linken (sectie Meer lezen of in de tekst), zodat blog en pagina
// elkaar versterken. Pagr. klanten zonder Blogr. krijgen dit niet: die hebben geen blogs.
//
// De kandidaten komen rechtstreeks uit WordPress (gepubliceerde berichten), dus de AI verzint nooit een URL.
// Het filter verwijderVerzonnenLinks in ai.js verwijdert daarna alles wat niet in de lijst staat.

const MAX_BLOG_KANDIDATEN = 30;
const MAX_BLOG_LINKS_PER_PAGINA = 3;

function bouwBlogKandidaten(posts, max = MAX_BLOG_KANDIDATEN) {
  const gezien = new Set();
  const uit = [];
  for (const p of Array.isArray(posts) ? posts : []) {
    const url = p && p.url ? String(p.url).trim() : '';
    if (!url || gezien.has(url)) continue;
    const label = String(p.titel || '').replace(/<[^>]+>/g, '').trim();
    if (!label) continue;
    gezien.add(url);
    uit.push({
      label,
      url,
      omschrijving: String(p.omschrijving || '').trim(),
      zusterpagina: false,
      blog: true
    });
    if (uit.length >= max) break;
  }
  return uit;
}

// Tekst voor in de prompt, alleen als er blogkandidaten zijn.
function blogLinkRegels(kandidaten) {
  const aantal = (kandidaten || []).filter((k) => k && k.blog).length;
  if (!aantal) return '';
  return `Blogs van deze klant: in de lijst met linkbestemmingen staan ${aantal} kandidaten met "blog": true (gepubliceerde blogs op de eigen website). Link naar maximaal ${MAX_BLOG_LINKS_PER_PAGINA} blogs per pagina, en alleen naar blogs die de bezoeker op deze pagina echt verder helpen (bijvoorbeeld een uitleg bij een dienst). Plaats ze in de lopende tekst of in de sectie voor interne links, nooit in de hero of de offertebalk. Geen passende blog, dan geen link.`;
}

module.exports = { bouwBlogKandidaten, blogLinkRegels, MAX_BLOG_KANDIDATEN, MAX_BLOG_LINKS_PER_PAGINA };
