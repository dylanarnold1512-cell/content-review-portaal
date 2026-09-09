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

// --- Iconen -----------------------------------------------------------------
// Vaste, curated set van inline SVG-iconen. Sjablonen kunnen een icoonveld
// gebruiken via een itemField genaamd exact "icon" in een lijst-slot (bv. de
// USP-kaarten), of een los slot waarvan de naam op "Icon" eindigt (bv.
// "heroIcon") - dezelfde soort naamgevingsafspraak als ImageSrc/Href hierboven.
// Zo'n veld wordt NOOIT als platte tekst afgedrukt (dat was precies de bug met
// "map-pin"/"clock"/"train" die letterlijk zichtbaar werden): renderSlotTemplate
// hieronder herkent het via isIconField en zet de waarde om naar een eigen,
// vaste SVG in plaats van geescapete tekst. Omdat de SVG-inhoud hier volledig
// uit onze eigen ICON_LIBRARY komt (nooit uit de waarde zelf), is dit veilig
// om ongeescaped in de HTML te zetten - de aangeleverde tekst wordt alleen als
// lookup-sleutel gebruikt, nooit zelf als markup weggeschreven. Dit is ook de
// enige betrouwbare manier om uberhaupt een icoon te tonen: een extern
// icoonlettertype/-bibliotheek laden kan niet, dat blokkeert templateSafetyCheck
// hieronder bewust (geen externe resources toegestaan).
const ICON_SIZE = 22;
function svgIcon(inner) {
  return `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

const ICON_LIBRARY = {
  'map-pin': svgIcon('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  clock: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  train: svgIcon('<rect x="5" y="3" width="14" height="12" rx="3"/><circle cx="8.5" cy="17.5" r="1.2"/><circle cx="15.5" cy="17.5" r="1.2"/><path d="M7 21l-2 2M17 21l2 2"/><path d="M5 9h14"/>'),
  bus: svgIcon('<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M3 12h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>'),
  car: svgIcon('<path d="M4 16v-3l2-5a2 2 0 0 1 2-1h8a2 2 0 0 1 2 1l2 5v3"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M4 16h16"/>'),
  bike: svgIcon('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-9h4l3 5M10 8h3M13 5h3"/>'),
  walk: svgIcon('<circle cx="13" cy="4" r="1.6"/><path d="M10 21l2-6 2 2 3 1M9 13l3-3 2 3 3-1"/>'),
  wifi: svgIcon('<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>'),
  bed: svgIcon('<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 14h18"/><path d="M7 12V9a2 2 0 0 1 2-2h1"/><path d="M3 18v3M21 18v3"/>'),
  shower: svgIcon('<path d="M4 8a4 4 0 0 1 4-4h2"/><path d="M9 4h7a2 2 0 0 1 2 2"/><path d="M3 10h18"/><path d="M7 14v2M11 14v2M15 14v2M19 14v2"/>'),
  luggage: svgIcon('<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M10 11v5M14 11v5"/>'),
  parking: svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>'),
  euro: svgIcon('<path d="M17 6a7 7 0 1 0 0 12"/><path d="M6 10h8M6 14h7"/>'),
  phone: svgIcon('<path d="M5 4h3l2 5-2 1a12 12 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  mail: svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 6l9 7 9-7"/>'),
  calendar: svgIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  star: svgIcon('<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9.3l7-.8z"/>'),
  check: svgIcon('<path d="M4 12l5 5L20 6"/>'),
  shield: svgIcon('<path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  users: svgIcon('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a5 5 0 0 1 6-4.8"/>'),
  home: svgIcon('<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
  coffee: svgIcon('<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z"/><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 4c0 1-1 1-1 2M11 4c0 1-1 1-1 2"/>'),
  food: svgIcon('<path d="M6 3v7a2 2 0 0 0 4 0V3"/><path d="M8 10v11"/><path d="M17 3c-1.5 0-3 1.5-3 4v3h2v7"/>'),
  music: svgIcon('<path d="M9 18V5l10-2v13"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/>'),
  ticket: svgIcon('<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'),
  tent: svgIcon('<path d="M12 4l9 16H3z"/><path d="M12 4v16"/><path d="M8 20l4-9 4 9"/>'),
  sun: svgIcon('<circle cx="12" cy="12" r="4.5"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
  moon: svgIcon('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  heart: svgIcon('<path d="M12 20s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6.5 5.5 5.5 0 0 1 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>'),
  info: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
  camera: svgIcon('<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  gift: svgIcon('<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 9h16v4H4z"/><path d="M12 9v11"/><path d="M12 9c0-2-2-4-3.5-4S6 6.5 8 8c1-1 3-1 4 1M12 9c0-2 2-4 3.5-4S18 6.5 16 8c-1-1-3-1-4 1"/>'),
  beer: svgIcon('<path d="M6 8h9v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M15 10h2a2 2 0 0 1 0 6h-2"/><path d="M6 8c0-2 1-4 3-4"/>')
};

const ICON_NAMES = Object.keys(ICON_LIBRARY);

// Neutrale fallback voor het (hopelijk zeldzame) geval dat er toch een niet-
// herkende icoonnaam in de data staat (bv. handmatig verkeerd getypt) - nooit
// de rauwe tekst tonen (dat was precies de oorspronkelijke bug), liever een
// neutraal sterretje. findUnknownIcons hieronder laat dit soort gevallen
// opvallen in plaats van dat het stilletjes op de fallback blijft staan.
const FALLBACK_ICON = svgIcon('<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7-6.2-3.6-6.2 3.6 1.4-7L2 9.3l7-.8z"/>');

function renderIcon(name) {
  const key = String(name === undefined || name === null ? '' : name).trim();
  return ICON_LIBRARY[key] || FALLBACK_ICON;
}

function isIconField(field) {
  return field === 'icon' || /Icon$/.test(field);
}

// Zoekt icoonvelden in slotData op met een waarde die NIET in ICON_LIBRARY
// voorkomt, zodat de contentgeneratie (ai.js) - net als bij linkWarning/
// imageWarning in routes/lp.js - hier een waarschuwing over kan teruggeven in
// plaats van dat een verkeerd icoon stilletjes op de fallback terechtkomt.
function findUnknownIcons(slotData) {
  const problemen = [];
  forEachTextLeaf(slotData, (path, value) => {
    const field = path.includes('.') ? path.split('.').pop() : path;
    if (isIconField(field) && value && !ICON_LIBRARY[String(value).trim()]) {
      problemen.push({ path, value });
    }
  });
  return problemen;
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
      .map((item, index) =>
        inner
          .replace(VAR_RE, (m, field) => {
            const value = field === 'this' ? item : getPath(item, field);
            return isIconField(field) ? renderIcon(value) : renderInlineLinks(value);
          })
          // Vult de itemindex in op de plek van een eventuele preview-only
          // data-lp-text-slot-tag (zie tagTextSlotsForPreview) - bij een normale
          // (niet-preview) render staat deze placeholder nergens in de tekst, dus dan
          // is dit een no-op.
          .replace(/__LP_EACH_INDEX__/g, String(index))
      )
      .join('');
  });
  return withLoops.replace(VAR_RE, (match, field) => {
    const value = getPath(data, field);
    return isIconField(field) ? renderIcon(value) : renderInlineLinks(value);
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

// Zelfde idee als tagImageSlotsForPreview hierboven, maar dan voor tekst-slots: markeert,
// ALLEEN voor het voorbeeldscherm, elke tag waarvan de VOLLEDIGE inhoud letterlijk {{sleutel}}
// is met een data-lp-text-slot-attribuut, zodat public/lp.js er een klikbaar bewerkveld van kan
// maken (een los tekstvakje om de ruwe waarde aan te passen, niet contenteditable op de gerenderde
// HTML - dat zou de [ankertekst](url)-linksyntax uit slotEngine.js kunnen slopen zodra iemand in
// een link-bevattende tekst klikt en die er als kale platte tekst weer uitkomt).
//
// Bewuste beperking: een slot dat MIDDENIN een langere zin staat (bv. "Welkom bij {{heroTitle}}")
// wordt niet getagd - we raden niet waar de rand van het bewerkbare stuk ligt, dat veld is dan
// simpelweg niet los klikbaar in de preview (nog steeds gewoon aan te passen via de Content
// JSON-tab). Voor list-items (bv. faqItems) wordt de padnaam "lijstsleutel.INDEX.veld"; de INDEX
// wordt pas ingevuld door renderSlotTemplate op het moment dat de lijst daadwerkelijk gerenderd
// wordt (zie __LP_EACH_INDEX__ hierboven), omdat het itemsjabloon zelf voor elk item identiek is.
const TEXT_WRAP_RE = /<([a-zA-Z][\w-]*)((?:\s[^<>]*)?)>\s*\{\{\s*([\w.]+)\s*\}\}\s*<\/\1>/g;

function wrapFieldsMetTextSlot(str, padVoorVeld) {
  return String(str || '').replace(TEXT_WRAP_RE, (full, tagName, attrs, field) => {
    // <summary> NOOIT taggen: dat is het klikbare, native uitklap-element van <details> (zie de
    // FAQ-sectie) - zonder JavaScript (niet toegestaan in sjablonen, zie templateSafetyCheck)
    // is dit de enige manier waarop een FAQ-item open-/dichtklapt. Een click-listener met
    // preventDefault() erop (voor het bewerk-overlay) zou die native toggle stukmaken, want een
    // click-event dat ergens binnen <summary> vandaan komt en waar preventDefault op is
    // aangeroepen, klapt <details> niet meer open/dicht.
    if (/^summary$/i.test(tagName)) return full;
    if (/data-lp-text-slot=/.test(attrs)) return full; // al getagd (voorkomt dubbel taggen)
    const pad = padVoorVeld(field);
    if (!pad) return full;
    return `<${tagName}${attrs} data-lp-text-slot="${pad}">{{${field}}}</${tagName}>`;
  });
}

function tagTextSlotsForPreview(html, slots) {
  const alleSlots = Array.isArray(slots) ? slots : [];
  const textSlotKeys = new Set(alleSlots.filter((s) => s.type === 'text').map((s) => s.key));
  const listItemVelden = new Map(); // listKey -> Set(veldnamen)
  alleSlots.forEach((s) => {
    if (s.type === 'list' && Array.isArray(s.itemFields)) {
      listItemVelden.set(s.key, new Set(s.itemFields));
    }
  });
  if (!textSlotKeys.size && !listItemVelden.size) return html;

  let result = String(html || '');
  const eachBlocks = [];
  // Zelfde patroon als EACH_RE hierboven, los gehouden zodat we de nog-ongerenderde
  // itemsjabloon-tekst eerst apart kunnen taggen voordat renderSlotTemplate 'm herhaalt.
  const EACH_TOKEN_RE = /{{#each\s+([\w.]+)\s*}}([\s\S]*?){{\/each}}/g;
  result = result.replace(EACH_TOKEN_RE, (match, listKey, inner) => {
    const toegestaneVelden = listItemVelden.get(listKey);
    const taggedInner = toegestaneVelden
      ? wrapFieldsMetTextSlot(inner, (field) => (toegestaneVelden.has(field) ? `${listKey}.__LP_EACH_INDEX__.${field}` : null))
      : inner;
    const token = `@@LP_EACH_BLOCK_${eachBlocks.length}@@`;
    eachBlocks.push(`{{#each ${listKey}}}${taggedInner}{{/each}}`);
    return token;
  });

  result = wrapFieldsMetTextSlot(result, (field) => (textSlotKeys.has(field) ? field : null));

  eachBlocks.forEach((block, i) => {
    result = result.replace(`@@LP_EACH_BLOCK_${i}@@`, block);
  });
  return result;
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

// ---- Rigid-grid detectie voor lijst-slots ----
// Ontstaan uit een echte bug (zie systeem-logboek.md, 09-09-2026): een grid-klasse met een VAST
// aantal kolommen (bv. repeat(3,...)) die een {{#each ...}}-lijst omwikkelt waarvan het aantal
// items per pagina/klant kan verschillen. Bij minder items dan kolommen blijft er een lege kolom
// staan, wat er visueel uitziet als "niet gecentreerd". Puur regex-gebaseerd (geen echte CSS/HTML-
// parser), zelfde pragmatische stijl als de rest van dit bestand — bedoeld als WAARSCHUWING bij het
// opslaan van een sjabloon (zie validator.js, validateTemplateStructure), nooit als blokkade: een
// vast aantal kolommen kan soms bewust zijn.
function findRigidListGrids(html, css) {
  const warnings = [];
  const htmlStr = String(html || '');
  const cssStr = String(css || '');

  // 1. Welke CSS-klassen hebben een vast aantal grid-kolommen? Bij meerdere regels voor dezelfde
  // klasse (bv. basisregel + media-query-override) onthouden we het hoogste gevonden aantal — elke
  // vaste waarde is al riskant, welke het ook is.
  const rigidGridClasses = new Map();
  const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
  let ruleMatch;
  while ((ruleMatch = RULE_RE.exec(cssStr))) {
    const [, selector, body] = ruleMatch;
    const kolomMatch = body.match(/grid-template-columns\s*:\s*repeat\(\s*(\d+)\s*,/i);
    if (!kolomMatch) continue;
    const classNamesInSelector = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    const className = classNamesInSelector[classNamesInSelector.length - 1];
    if (!className) continue;
    const aantal = Number(kolomMatch[1]);
    if (!rigidGridClasses.has(className) || aantal > rigidGridClasses.get(className)) {
      rigidGridClasses.set(className, aantal);
    }
  }
  if (!rigidGridClasses.size) return warnings;

  // 2. Welke {{#each ...}}-lijsten worden direct omwikkeld door zo'n klasse? We kijken naar het
  // laatste class="..."-attribuut vlak voor de {{#each}} (binnen een venster van 400 tekens) — dat
  // is in de praktijk de wrapper-<div> van de grid, precies zoals sjablonen dit hier opbouwen.
  const EACH_RE = /{{#each\s+([\w.]+)\s*}}/g;
  let eachMatch;
  const gewaarschuwdVoor = new Set();
  while ((eachMatch = EACH_RE.exec(htmlStr))) {
    const listKey = eachMatch[1];
    const voorkant = htmlStr.slice(Math.max(0, eachMatch.index - 400), eachMatch.index);
    const classMatches = [...voorkant.matchAll(/class\s*=\s*["']([^"']+)["']/g)];
    if (!classMatches.length) continue;
    const laatsteClassAttr = classMatches[classMatches.length - 1][1];
    const klassenNaarDitPunt = laatsteClassAttr.split(/\s+/);
    const gevondenKlasse = klassenNaarDitPunt.find((k) => rigidGridClasses.has(k));
    if (!gevondenKlasse) continue;
    const sleutel = `${gevondenKlasse}::${listKey}`;
    if (gewaarschuwdVoor.has(sleutel)) continue;
    gewaarschuwdVoor.add(sleutel);
    const aantalKolommen = rigidGridClasses.get(gevondenKlasse);
    warnings.push(
      `Grid-klasse ".${gevondenKlasse}" heeft een vast aantal kolommen (${aantalKolommen}) terwijl ` +
      `deze de lijst "{{#each ${listKey}}}" omwikkelt, waarvan het aantal items per pagina kan ` +
      `verschillen. Bij minder items dan kolommen blijft er een lege kolom staan, wat er visueel ` +
      `uitziet als "niet gecentreerd". Gebruik "grid-template-columns:repeat(auto-fit,minmax(...,1fr))" ` +
      `in plaats van een vast getal.`
    );
  }
  return warnings;
}

// Zelfde idee als tagImageSlotsForPreview/tagTextSlotsForPreview hierboven, maar dan voor
// LINKS: markeert, ALLEEN voor het voorbeeldscherm, elke <a>-tag waarvan het href-attribuut
// letterlijk {{sleutel}} is met een data-lp-link-slot-attribuut, zodat public/lp.js er een
// klikbaar linkveld van kan maken. Twee soorten worden herkend:
//  1. Een los tekst-slot waarvan de naam eindigt op "Href" (bv. "ctaHref", "roomsLinkHref") -
//     dezelfde naamgevingsafspraak die ai.js al gebruikt (zie LINK_HREF_RE aldaar), dus geen
//     apart schemaveld nodig om dit te herkennen.
//  2. Het "href"-itemveld van een lijst-slot (bv. "linksItems") - elk item krijgt de padnaam
//     "lijstsleutel.__LP_EACH_INDEX__.href", precies dezelfde __LP_EACH_INDEX__-truc als
//     tagTextSlotsForPreview hierboven gebruikt voor lijst-tekstvelden, zodat renderSlotTemplate
//     'm op dezelfde manier invult zodra de lijst daadwerkelijk gerenderd wordt.
// Eenzelfde <a>-tag kan ZOWEL een data-lp-text-slot (voor de klikbare linktekst) ALS een
// data-lp-link-slot (voor de url) dragen - bv. de CTA-knop <a href="{{ctaHref}}">{{ctaLabel}}</a>.
// De frontend (public/lp.js) toont dan beide velden in een gecombineerd bewerkvenster in plaats
// van een los linkvenster, zodat je label en url in een keer aanpast.
const A_TAG_RE = /<a\b[^>]*>/gi;
const HREF_ATTR_RE = /\shref=(["'])\{\{\s*([\w.]+)\s*\}\}\1/;

function tagAnchorHrefs(str, padVoorVeld) {
  return String(str || '').replace(A_TAG_RE, (tag) => {
    if (/data-lp-link-slot=/.test(tag)) return tag; // al getagd (voorkomt dubbel taggen)
    const match = tag.match(HREF_ATTR_RE);
    if (!match) return tag;
    const pad = padVoorVeld(match[2]);
    if (!pad) return tag;
    return tag.replace(/^<a\b/i, `<a data-lp-link-slot="${pad}"`);
  });
}

function tagLinkSlotsForPreview(html, slots) {
  const alleSlots = Array.isArray(slots) ? slots : [];
  const linkSlotKeys = new Set(alleSlots.filter((s) => s.type === 'text' && /Href$/.test(s.key)).map((s) => s.key));
  const listHrefVelden = new Set(
    alleSlots
      .filter((s) => s.type === 'list' && Array.isArray(s.itemFields) && s.itemFields.includes('href'))
      .map((s) => s.key)
  );
  if (!linkSlotKeys.size && !listHrefVelden.size) return html;

  let result = String(html || '');

  if (listHrefVelden.size) {
    // Zelfde patroon als in tagTextSlotsForPreview: eerst de {{#each ...}}-blokken los tillen,
    // ALLEEN daarbinnen het "href"-veld taggen (nooit een top-level "Href"-slot laten matchen op
    // het "href"-itemveld van een lijst, dat is bewust een andere naamgevingsafspraak), en dan
    // terugzetten.
    const EACH_TOKEN_RE = /{{#each\s+([\w.]+)\s*}}([\s\S]*?){{\/each}}/g;
    const eachBlocks = [];
    result = result.replace(EACH_TOKEN_RE, (match, listKey, inner) => {
      const taggedInner = listHrefVelden.has(listKey)
        ? tagAnchorHrefs(inner, (field) => (field === 'href' ? `${listKey}.__LP_EACH_INDEX__.href` : null))
        : inner;
      const token = `@@LP_LINK_EACH_BLOCK_${eachBlocks.length}@@`;
      eachBlocks.push(`{{#each ${listKey}}}${taggedInner}{{/each}}`);
      return token;
    });
    eachBlocks.forEach((block, i) => {
      result = result.replace(`@@LP_LINK_EACH_BLOCK_${i}@@`, block);
    });
  }

  if (linkSlotKeys.size) {
    result = tagAnchorHrefs(result, (field) => (linkSlotKeys.has(field) ? field : null));
  }

  return result;
}

module.exports = {
  renderSlotTemplate,
  templateSafetyCheck,
  tagImageSlotsForPreview,
  tagTextSlotsForPreview,
  INLINE_LINK_RE,
  forEachTextLeaf,
  tagLinkSlotsForPreview,
  ICON_LIBRARY,
  ICON_NAMES,
  renderIcon,
  isIconField,
  findUnknownIcons,
  findRigidListGrids
};
