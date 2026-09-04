// LP Fabriek: minimale, dependency-vrije "template engine" voor de nieuwe
// AI-ontworpen bespoke sjablonen (bouwvolgorde-stap 3, koerswijziging naar
// vrije templates — zie besluiten.md). Een sjabloon is nu een los stuk HTML
// (met genoemde "slots") plus CSS, in plaats van een vast blokkenpalet.
//
// Syntax in htmlTemplate:
//   {{veldNaam}}                     tekstwaarde van data.veldNaam, ALTIJD
//                                    HTML-geescaped (ook veilig voor gebruik
//                                    in href/src-attributen).
//   {{#each lijstNaam}} ... {{veld}} ... {{/each}}
//                                    herhaalt het binnenste stuk voor elk
//                                    item in data.lijstNaam, met {{veld}}
//                                    verwijzend naar item.veld. Geen geneste
//                                    {{#each}} — bewust simpel gehouden.
//
// Er is GEEN "rauwe" ({{{ }}}) variant — alles wordt geescaped. Dat is een
// bewuste veiligheidskeuze: slot-inhoud komt uiteindelijk (deels) uit
// AI-gegenereerde paginacontent, en we willen nooit dat daar HTML/JS in kan
// zitten die als opmaak of script wordt uitgevoerd.

const { escapeHtml } = require('./utils');

// Kleine, veilige "markdown-achtige" linksyntax voor interne links die de AI (of Dylan
// handmatig) middenin een lopende tekst-slot kan zetten: [ankertekst](url). Alleen een echte
// http(s)-URL of een pad dat met "/" begint mag een link worden - dat sluit een "javascript:"
// of andere vieze schema's al op regex-niveau uit, nog los van de escaping hieronder. Ongeldige
// of niet-herkende invoer (bv. als de AI zich toch niet aan de syntax hield) wordt gewoon als
// platte, geescapete tekst weergegeven - er is geen manier waarop dit tot ongefilterde HTML kan
// leiden.
const INLINE_LINK_RE = /\[([^\[\]]{1,120})\]\((https?:\/\/[^\s()]+|\/[^\s()]*)\)/g;

function renderInlineLinks(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (!INLINE_LINK_RE.test(str)) return escapeHtml(str);
  INLINE_LINK_RE.lastIndex = 0;
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = INLINE_LINK_RE.exec(str))) {
    const [full, label, href] = match;
    result += escapeHtml(str.slice(lastIndex, match.index));
    result += `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    lastIndex = match.index + full.length;
  }
  result += escapeHtml(str.slice(lastIndex));
  return result;
}

// Loopt over alle tekstwaarden in slotData (top-level text-slots EN velden van list-items) en
// geeft elke waarde door aan fn(pad, waarde, setter). Gebruikt zowel om verzonnen links eruit te
// filteren na AI-generatie (ai.js) als om het aantal interne links te tellen voor de validator
// (validator.js) - één plek die weet hoe slotData is opgebouwd, in plaats van dat elders opnieuw
// te laten uitzoeken.
function forEachTextLeaf(slotData, fn) {
  if (!slotData || typeof slotData !== 'object') return;
  for (const [key, value] of Object.entries(slotData)) {
    if (typeof value === 'string') {
      fn(key, value, (nieuweWaarde) => {
        slotData[key] = nieuweWaarde;
      });
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item && typeof item === 'object') {
          for (const [itemKey, itemValue] of Object.entries(item)) {
            if (typeof itemValue === 'string') {
              fn(`${key}.${itemKey}`, itemValue, (nieuweWaarde) => {
                item[itemKey] = nieuweWaarde;
              });
            }
          }
        }
      });
    }
  }
}

function getPath(obj, path) {
  if (obj === null || obj === undefined) return undefined;
  return path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);
}

const EACH_RE = /{{#each\s+([\w.]+)\s*}}([\s\S]*?){{\/each}}/g;
const VAR_RE = /{{\s*([\w.]+)\s*}}/g;

function renderSlotTemplate(html, data) {
  const withLoops = String(html || '').replace(EACH_RE, (match, listKey, inner) => {
    const list = getPath(data, listKey);
    if (!Array.isArray(list) || !list.length) return '';
    return list
      .map((item) =>
        inner.replace(VAR_RE, (m, field) => {
          const value = field === 'this' ? item : getPath(item, field);
          return renderInlineLinks(value);
        })
      )
      .join('');
  });
  return withLoops.replace(VAR_RE, (match, field) => {
    const value = getPath(data, field);
    return renderInlineLinks(value);
  });
}

// Zet, ALLEEN voor het voorbeeldscherm (nooit voor de HTML die naar WordPress gaat), een
// data-lp-slot="sleutel" attribuut op elke <img> waarvan de src letterlijk {{sleutel}} is, voor
// een ImageSrc-slot uit het sjabloon. Werkt op de RAUWE htmlTemplate-tekst, vóór de gewone
// {{...}}-vervanging hierboven — zo weet de frontend (public/lp.js) op welke afbeelding in de
// preview-iframe iemand klikt, om 'm meteen te kunnen wisselen via de mediabibliotheek.
const IMG_TAG_RE = /<img\b[^>]*>/gi;

function tagImageSlotsForPreview(html, slots) {
  const imageSlotKeys = new Set(
    (Array.isArray(slots) ? slots : []).filter((s) => /ImageSrc$/.test(s.key)).map((s) => s.key)
  );
  if (!imageSlotKeys.size) return html;
  return String(html || '').replace(IMG_TAG_RE, (tag) => {
    const match = tag.match(/src=["']\{\{\s*([\w.]+)\s*\}\}["']/);
    if (match && imageSlotKeys.has(match[1])) {
      return tag.replace(/^<img\b/i, `<img data-lp-slot="${match[1]}"`);
    }
    return tag;
  });
}

// Veiligheidscheck voor een door AI gegenereerd (of handmatig geplakt)
// sjabloon, VOORDAT het opgeslagen wordt. Zie besluiten.md, "Veiligheidseisen
// voor AI-gegenereerde templates": geen <script>, geen externe resources,
// geen inline event-handlers, geen javascript:-links. Dit is een blokkade
// bij het opslaan van een sjabloon (POST/PUT /templates), niet per pagina.
function templateSafetyCheck(html, css) {
  const errors = [];
  const htmlStr = String(html || '');
  const cssStr = String(css || '');

  if (/<script\b/i.test(htmlStr) || /<script\b/i.test(cssStr)) {
    errors.push('Bevat een <script>-tag — niet toegestaan in een sjabloon.');
  }
  if (/<link\b/i.test(htmlStr)) {
    errors.push('Bevat een <link>-tag — externe resources zijn niet toegestaan, alles moet inline CSS zijn.');
  }
  if (/<iframe\b|<object\b|<embed\b/i.test(htmlStr)) {
    errors.push('Bevat een <iframe>/<object>/<embed>-tag — niet toegestaan.');
  }
  if (/\son\w+\s*=/i.test(htmlStr)) {
    errors.push('Bevat een inline event-handler (bv. onclick=) — niet toegestaan.');
  }
  if (/javascript\s*:/i.test(htmlStr)) {
    errors.push('Bevat een "javascript:"-link — niet toegestaan.');
  }
  if (/@import/i.test(cssStr)) {
    errors.push('CSS bevat @import — externe resources zijn niet toegestaan.');
  }
  if (/url\(\s*['"]?https?:\/\//i.test(cssStr)) {
    errors.push('CSS verwijst naar een externe URL via url(...) — niet toegestaan, afbeeldingen lopen via slots.');
  }
  if (/<img\b[^>]*\ssrc\s*=\s*["']https?:\/\//i.test(htmlStr)) {
    errors.push('HTML bevat een hardcoded externe afbeelding-URL — afbeeldingen moeten via een slot (bv. {{heroImageSrc}}) ingevuld worden, niet vast in het sjabloon staan.');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  renderSlotTemplate,
  templateSafetyCheck,
  tagImageSlotsForPreview,
  INLINE_LINK_RE,
  forEachTextLeaf
};
