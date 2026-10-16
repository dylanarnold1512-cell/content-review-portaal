// Past het uitgevoerde werk (projecten, galerij) bij waar de pagina over gaat? (Pagr., 16-10-2026)
// Voorbeeld: een pagina over dakkapellen met een projectensectie vol tuinhuizen en zolderverbouwingen. Alleen een
// aandachtspunt, nooit een fout. Deterministisch: geen van de projecten noemt het onderwerp van de pagina.
const { vindSecties } = require('./overrides');

const PROJECT_LIJST_RE = /project|portfolio|galerij|gallery|uitgevoerd|referentie/i;
const GENERIEK = new Set(['plaatsen', 'plaatsing', 'pagina', 'website', 'informatie', 'bouwbedrijf', 'aannemer', 'aannemersbedrijf', 'nieuwe', 'maken', 'laten', 'installeren', 'omgeving', 'omstreken', 'werkgebied', 'regio', 'gemeente', 'diensten', 'bedrijf', 'klant', 'voordelen', 'vragen', 'prijzen', 'kosten', 'offerte', 'over']);

function woordenUit(tekst) {
  return String(tekst || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

// Eerste zes letters van elk betekenisvol woord, zodat "dakkapel" ook "dakkapellen" vindt.
function onderwerpStammen(teksten, plaatsen) {
  const plaatsWoorden = new Set((plaatsen || []).flatMap(woordenUit));
  const stammen = new Set();
  for (const t of teksten || []) {
    for (const w of woordenUit(t)) {
      if (w.length < 6 || GENERIEK.has(w) || plaatsWoorden.has(w)) continue;
      stammen.add(w.slice(0, 6));
    }
  }
  return [...stammen];
}

function itemTekst(item) {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return '';
  return Object.entries(item).filter(([k, v]) => typeof v === 'string' && !/src|href|url|icon$/i.test(k)).map(([, v]) => v).join(' ');
}

// slotData, htmlTemplate van het sjabloon, onderwerpTeksten (bv. de zin van de beheerder), plaatsen (om weg te laten).
function onderwerpFit({ slotData, htmlTemplate, onderwerpTeksten, plaatsen }) {
  const stammen = onderwerpStammen(onderwerpTeksten, plaatsen);
  if (!stammen.length || !slotData || typeof slotData !== 'object') return [];
  const secties = vindSecties(htmlTemplate);
  const bron = String(htmlTemplate || '');
  const uit = [];
  for (const [lijst, items] of Object.entries(slotData)) {
    if (!PROJECT_LIJST_RE.test(lijst) || !Array.isArray(items) || items.length < 2) continue;
    const teksten = items.map((i) => itemTekst(i).toLowerCase());
    if (teksten.every((t) => t.trim().length < 3)) continue;
    if (teksten.some((t) => stammen.some((s) => t.includes(s)))) continue;
    const sectieIndex = secties.findIndex((s, i) => i > 0 && new RegExp(`{{#each\\s+${lijst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*}}`).test(bron.slice(s.start, s.end)));
    const noem = items.slice(0, 3).map((i) => `"${(itemTekst(i).split(/\s+/).slice(0, 4).join(' ')).trim()}"`).filter((x) => x !== '""').join(', ');
    uit.push({
      lijst,
      sectieIndex: sectieIndex >= 0 ? sectieIndex : null,
      tekst: `Het uitgevoerde werk past mogelijk niet bij het onderwerp van deze pagina. Geen van de ${items.length} projecten noemt "${stammen.slice(0, 2).join('" of "')}"${noem ? ` (nu bijvoorbeeld ${noem})` : ''}. Verberg de sectie of laat andere foto's kiezen.`
    });
  }
  return uit;
}

module.exports = { onderwerpFit, onderwerpStammen, itemTekst };
