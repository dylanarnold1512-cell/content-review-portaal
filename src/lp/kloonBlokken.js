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

function lijstSecties(blueprint, slotData) {
  if (!blueprint || blueprint.templateFormat !== 'slots') {
    throw new Error('Alleen sjablonen in het slot-formaat kunnen als blok in een kloon.');
  }
  return beschrijfSecties(blueprint.htmlTemplate, slotData).filter((s) => !s.isHero);
}

function renderSectieHtml({ blueprint, pagina, sectie }) {
  if (!blueprint || blueprint.templateFormat !== 'slots') {
    throw new Error('Alleen sjablonen in het slot-formaat kunnen als blok in een kloon.');
  }
  const html = String(blueprint.htmlTemplate || '');
  const secties = vindSecties(html);
  const index = Number(sectie);
  const s = Number.isInteger(index) ? secties[index] : null;
  if (!s) throw new Error(`Onderdeel ${Number.isInteger(index) ? index + 1 : '?'} bestaat niet (het sjabloon heeft ${secties.length} onderdelen).`);
  const stuk = html.slice(s.start, s.end);
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

module.exports = { lijstSecties, renderSectieHtml, MAX_BLOK_BYTES };
