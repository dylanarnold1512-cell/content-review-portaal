// LP Fabriek: portaalsecties als blok in een WordPress kloon (hybride werkwijze).
// De kloon (Beaver Builder pagina) blijft de basis. Een sectie uit het sjabloon van een portaalpagina
// (bv. de polaroid blokjes) wordt hier gerenderd en als HTML module in de kloon geplaatst, op een plek
// die de gebruiker kiest. Zie kennisbank claude/lp-fabriek-wp-kloon.md.
//
// Bewust: we renderen alleen die ene sectie, zonder aanpassingen per pagina (overrides), zonder
// JSON-LD schema's en zonder scripts. De pagina in WordPress heeft zijn eigen schema en scripts.

const { vindSecties } = require('./overrides');
const { beschrijfSecties } = require('./sectieRefine');
const { renderPageHtml } = require('./render');

const MAX_BLOK_BYTES = 200 * 1024;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
const MAX_DIEPTE = 4;

function platteTekst(html, slotData) {
  const data = slotData && typeof slotData === 'object' ? slotData : {};
  return String(html || '')
    .replace(/{{#each[^}]*}}|{{\/each}}/g, ' ')
    .replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => (typeof data[k] === 'string' ? data[k] : ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Elementen met een class binnen een sectie (tot MAX_DIEPTE niveaus diep), zodat een deel van een sectie
// gekozen kan worden, bv. de drie blokjes in de header. Posities zijn relatief aan de sectie HTML.
function vindDelen(sectieHtml, slotData) {
  const html = String(sectieHtml || '');
  const stapel = [];
  const delen = [];
  const re = new RegExp(TAG_RE.source, 'g');
  let m;
  while ((m = re.exec(html))) {
    const sluit = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (sluit) {
      for (let i = stapel.length - 1; i >= 0; i -= 1) {
        if (stapel[i].tag === tag) {
          const el = stapel[i];
          stapel.length = i;
          if (el.klasse && el.diepte >= 1 && el.diepte <= MAX_DIEPTE) {
            delen.push({ start: el.start, end: m.index + m[0].length, tag, klasse: el.klasse, diepte: el.diepte });
          }
          break;
        }
      }
      continue;
    }
    if (VOID.has(tag) || m[3] === '/') continue;
    const cls = /\sclass=["']([^"']+)["']/i.exec(m[0]);
    stapel.push({ tag, start: m.index, diepte: stapel.length, klasse: cls ? cls[1].trim().split(/\s+/)[0] : '' });
  }
  delen.sort((a, b) => a.start - b.start || b.end - a.end);
  return delen
    .map((d) => ({ ...d, tekst: platteTekst(html.slice(d.start, d.end), slotData) }))
    .filter((d) => d.tekst.length > 0 || /<img\b|{{/i.test(html.slice(d.start, d.end)))
    .map((d, index) => {
      const kort = d.tekst.length > 50 ? `${d.tekst.slice(0, 47)}...` : d.tekst;
      return { index, start: d.start, end: d.end, label: `${'  '.repeat(Math.max(0, d.diepte - 1))}${d.klasse}${kort ? `: ${kort}` : ''}` };
    });
}

function lijstSecties(blueprint, slotData) {
  if (!blueprint || blueprint.templateFormat !== 'slots') {
    throw new Error('Alleen sjablonen in het slot-formaat kunnen als blok in een kloon.');
  }
  const html = String(blueprint.htmlTemplate || '');
  const secties = vindSecties(html);
  return beschrijfSecties(html, slotData).map((s) => {
    const sec = secties[s.index];
    const delen = vindDelen(html.slice(sec.start, sec.end), slotData).map((d) => ({ index: d.index, label: d.label }));
    return { ...s, delen };
  });
}

function renderSectieHtml({ blueprint, pagina, sectie, deel }) {
  if (!blueprint || blueprint.templateFormat !== 'slots') {
    throw new Error('Alleen sjablonen in het slot-formaat kunnen als blok in een kloon.');
  }
  const html = String(blueprint.htmlTemplate || '');
  const secties = vindSecties(html);
  const index = Number(sectie);
  const s = Number.isInteger(index) ? secties[index] : null;
  if (!s) throw new Error(`Onderdeel ${Number.isInteger(index) ? index + 1 : '?'} bestaat niet (het sjabloon heeft ${secties.length} onderdelen).`);
  let stuk = html.slice(s.start, s.end);
  if (deel !== undefined && deel !== null && deel !== '') {
    const delen = vindDelen(stuk, (pagina.content && pagina.content.slotData) || {});
    const d = delen[Number(deel)];
    if (!d) throw new Error(`Deel ${Number(deel) + 1} van dit onderdeel bestaat niet.`);
    stuk = stuk.slice(d.start, d.end);
  }
  if (/{{\s*formulier\s*}}/.test(stuk)) throw new Error('Een onderdeel met het formulier kan niet als blok in een kloon.');
  const mini = { ...blueprint, htmlTemplate: stuk };
  let uit = renderPageHtml(
    { clientId: pagina.klant, slug: pagina.slug, template: mini, slotData: (pagina.content && pagina.content.slotData) || {}, invoer: pagina.invoer || {} },
    {}
  );
  uit = uit
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .trim();
  if (!uit) throw new Error('Het onderdeel gaf geen inhoud.');
  if (Buffer.byteLength(uit, 'utf8') > MAX_BLOK_BYTES) throw new Error('Het onderdeel is te groot om als blok in een kloon te zetten.');
  return uit;
}

// ---- Stijlvoorbeeld voor door de AI gemaakte blokken ----
// Een eigen blok (bv. "voeg hier drie blokjes toe met ...") moet er hetzelfde uitzien als de portaalblokken van de klant.
// We zoeken daarvoor een bestaand blokonderdeel in een portaalpagina (lijstje, kaarten, blokjes) en splitsen de
// gerenderde HTML in stijl (de style tags), een wrapper en de binnenkant. De AI schrijft alleen een nieuwe binnenkant
// met dezelfde class namen; stijl en wrapper zetten wij er zelf omheen.
const STIJL_RE = /(travel|blokje|blok|kaart|card|polaroid|list)/i;

function splitsRender(html) {
  const m = /^([\s\S]*?)(<div class="lp-root-[^"]*">)\s*([\s\S]*?)\s*<\/div>\s*$/.exec(String(html || '').trim());
  if (!m) return null;
  return { styles: m[1].trim(), open: m[2], inner: m[3], close: '</div>' };
}

async function zoekStijlvoorbeeld({ klant, lpNotion, templates, max = 8 }) {
  const paginas = (await lpNotion.listPages({ klant })).slice(0, max);
  for (const p of paginas) {
    try {
      const page = await lpNotion.getPage(p.id);
      const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
      const secties = lijstSecties(blueprint, page.content && page.content.slotData);
      for (const sec of secties) {
        const deel = (sec.delen || []).find((d) => STIJL_RE.test(d.label.trim().split(':')[0]) && !/(^|[-_])(wrap|wrapper|container|inner|tekst|text|copy|content)([-_]|$)/i.test(d.label.trim().split(':')[0]));
        if (!deel) continue;
        const html = renderSectieHtml({ blueprint, pagina: page, sectie: sec.index, deel: deel.index });
        const delen = splitsRender(html);
        if (delen && delen.inner.length < 12000) return { ...delen, bron: `${page.titel}: ${deel.label.trim()}` };
      }
    } catch (err) {
      // deze pagina heeft geen bruikbaar sjabloon, volgende proberen
    }
  }
  return null;
}

// Haalt scripts, iframes en event handlers uit HTML die van de AI of de browser komt.
function schoonBlokHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

module.exports = { splitsRender, zoekStijlvoorbeeld, schoonBlokHtml, vindDelen, lijstSecties, renderSectieHtml, MAX_BLOK_BYTES };
