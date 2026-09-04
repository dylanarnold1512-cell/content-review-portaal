// LP Fabriek: AI-gestuurde sjabloon- en paginacontent-generatie.
//
// Sinds de koerswijziging naar vrije, op maat gegenereerde templates (zie
// besluiten.md, "Bouwvolgorde-stap 3: ... koers verlegd") ontwerpt de AI hier
// geen keuze meer uit een vast blokkenpalet, maar een COMPLEET bespoke
// HTML+CSS-sjabloon met genoemde "slots" — geinformeerd door een echt
// opgehaalde referentiepagina (zie referenceFetch.js) plus de vaste
// klanttokens (branding, automatisch, geen aparte vraag nodig) plus Dylans
// antwoorden op een klein, vast vragenlijstje (zie besluiten.md, "Openstaand:
// concrete vraagset").
//
// Gebruikt Dylans eigen OPENAI_API_KEY (nooit door Claude gezien). Model:
// GPT-5.5 (overschrijfbaar via OPENAI_MODEL). Geen temperature-parameter —
// GPT-5.5 accepteert alleen de standaardwaarde, zie besluiten.md.

const { getTokens } = require('./tokens');
const { fetchReferenceSummary } = require('./referenceFetch');
const { INLINE_LINK_RE, forEachTextLeaf } = require('./slotEngine');

// De optionele "vaste onderdelen"-checklist in het sjabloon-formulier (Stap
// 1, vraag 3). Hero, CTA en interne links zijn altijd al verplicht via de
// vaste slot-namen/regels hieronder, dus die staan hier expres niet in.
const VASTE_ONDERDELEN_OPTIES = ['usps', 'stappen', 'aanbod', 'praktisch', 'reviews', 'faq', 'doelgroep'];

const VASTE_ONDERDELEN_LABELS = {
  usps: "USP's",
  stappen: 'Stappenplan',
  aanbod: 'Aanbod/kaarten',
  praktisch: 'Praktische info',
  reviews: 'Reviews',
  faq: 'FAQ',
  doelgroep: 'Doelgroeptekst'
};

const SLOT_SCHEMA_REFERENCE = `
Een sjabloon (blueprint) is een JSON-object met exact deze velden:
{
  "templateFormat": "slots",
  "htmlTemplate": string,   // de VOLLEDIGE HTML van de pagina-inhoud (geen <html>/<head>/<body>,
                             // gewoon de sectie-HTML zoals die straks in het WordPress contentveld komt)
  "cssTemplate": string,    // ALLE CSS voor dit sjabloon, elke selector gescoped onder de vaste
                             // marker-class ".lpt" (bijvoorbeeld ".lpt .hero { ... }"). Gebruik de
                             // bestaande CSS-variabelen voor kleur/typografie/vorm in plaats van eigen
                             // hex-codes, zodat het sjabloon automatisch de klant-branding volgt:
                             // var(--lp-primary), var(--lp-primary-dark), var(--lp-secondary),
                             // var(--lp-text), var(--lp-text-muted), var(--lp-bg), var(--lp-bg-alt),
                             // var(--lp-border), var(--lp-radius), var(--lp-max-width),
                             // var(--lp-font-heading), var(--lp-font-body), var(--lp-cta-bg),
                             // var(--lp-cta-text).
  "slots": [ { "key": string, "label": string, "type": "text" | "list", "verplicht": boolean,
               "itemFields": string[] (alleen bij type "list", bv. ["question","answer"]) } ],
  "invoerVelden": [ { "key": string, "label": string, "verplicht": boolean } ],
  "uniciteitsbudget": { "minimumUniekeFeiten": number, "uitgeslotenVanUniciteit": string[] },
  "linkRegels": { "minimumInterneLinks": number, "minimumNaarZusterpaginas": number, "reasonRequired": boolean },
  "ctaRegel": { "verplicht": boolean },
  "seoRegels": { "exactEenH1": true, "metaTitleMin": number, "metaTitleMax": number, "metaDescriptionMin": number, "metaDescriptionMax": number }
}

VASTE SLOT-NAMEN (verplicht deze exacte "key"-waarden gebruiken voor deze onderdelen, ze worden
mechanisch gecontroleerd):
- "heroTitle" (type text, verplicht true) — de ENIGE <h1> van de pagina. De <h1> in htmlTemplate moet
  letterlijk {{heroTitle}} bevatten (mag genest in andere tags staan, bv. <h1><span>{{heroTitle}}</span></h1>).
- "heroIntro" (type text, optioneel) — korte introductietekst onder de hero-titel.
- "ctaLabel" en "ctaHref" (beide type text) — verplicht als ctaRegel.verplicht true is. Gebruik ze
  samen voor de call-to-action-knop(pen), mag op meerdere plekken in het sjabloon herhaald worden.
- "linksItems" (type list, itemFields ["label","href","reason","zusterpagina"], verplicht ALTIJD
  false) — interne links. Zet deze slot NOOIT op verplicht true: een pagina mag best 0 relevante
  links hebben (kwaliteit boven kwantiteit, zie de contentgeneratie-instructies), dus een lege lijst
  is een geldige uitkomst, geen ontbrekende content. BELANGRIJK: "reason" is uitsluitend voor intern
  review en mag NOOIT in de zichtbare HTML worden gebruikt (dus wel {{label}} en {{href}} in de
  {{#each linksItems}}-loop, nooit {{reason}}).
- "faqItems" (type list, itemFields ["question","answer"]) — als deze slot gebruikt wordt, genereert
  het systeem automatisch FAQPage-schema (JSON-LD), dus geen aparte schema-slot nodig.
- "practicalItems" (type list, itemFields ["label","value"]) — praktische informatie (bv. adres,
  openingstijden), alleen toevoegen als het paginatype dat logisch nodig heeft.
- "metaTitle" en "metaDescription" (beide type text, verplicht true) — komen NOOIT in htmlTemplate te
  staan, alleen gebruikt voor de WordPress SEO-velden.

Voor al het andere (USP's, stappenplan, aanbod/kaarten, reviews, doelgroeptekst, of iets anders dat
bij deze specifieke referentie/paginatype past) verzin je zelf passende slot-namen en itemFields, met
"list" voor herhalende onderdelen en "text" voor losse tekstblokken. Gebruik voor elke lijst-slot in
htmlTemplate een {{#each sleutelnaam}}...{{/each}}-blok — geen geneste {{#each}}.

Sjabloon-taal in htmlTemplate (mini-engine, GEEN volledige templatetaal):
- {{veldNaam}} voor een tekstwaarde (wordt automatisch HTML-geescaped).
- {{#each lijstNaam}} ... {{veld}} ... {{/each}} voor een herhalende lijst, {{veld}} verwijst naar het
  veld van het huidige item in de lijst.

Harde technische eisen (worden mechanisch gecontroleerd, een sjabloon dat hier niet aan voldoet wordt
geweigerd):
- Geen <script>-tags, geen <link>-tags, geen <iframe>/<object>/<embed>, geen inline event-handlers
  (onclick= e.d.), geen javascript:-links.
- Geen externe resources: geen @import in CSS, geen url(https://...) in CSS, geen hardcoded externe
  afbeelding-URL in de HTML — afbeeldingen lopen ALTIJD via een slot (bv. {{heroImageSrc}}), nooit vast
  in het sjabloon.
- Precies 1 <h1>, en die moet {{heroTitle}} gebruiken.
`.trim();

function buildTemplateSystemPrompt() {
  return `Je bent een senior webdesigner/frontend-developer voor een Nederlands marketingbureau. Je
ontwerpt een COMPLEET, BESPOKE HTML+CSS-sjabloon voor een terugkerend paginatype — niet de inhoud van
een individuele pagina, en NIET beperkt tot een vast blokkenpalet. Ontwerp zoals een goede
webdesigner dat zou doen: overweeg fotografie/iconen, ronde hoeken en zachte schaduwen op kaarten,
getinte/afwisselende sectie-achtergronden, asymmetrische tekst+beeld-layouts, een consistente
accentkleur, en gebruik een referentiepagina (indien gegeven) als concreet structuurvoorbeeld — niet
om te kopieren, maar om vergelijkbare kwaliteit en opbouw te evenaren.

${SLOT_SCHEMA_REFERENCE}

Antwoord ALLEEN met een JSON-object met exact twee velden, geen tekst erbuiten:
{
  "blueprint": <het blueprint-object hierboven>,
  "voorbeeldSlotData": <object met per slot-key een voorbeeldwaarde (tekst of array van items), met
    duidelijk herkenbare Nederlandse PLACEHOLDER-content, puur om meteen een visueel voorbeeld te tonen
    — dit wordt niet opgeslagen, het hoeft geen echte feiten te bevatten>
}`;
}

async function callOpenAi({ systemPrompt, userPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is niet gezet — kan geen sjabloon-voorstel genereren. Zie besluiten.md, Bouwstap 6.'
    );
  }
  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
      // Geen temperature-parameter: GPT-5.5 (redeneermodel) ondersteunt alleen
      // de standaardwaarde (1) — zie besluiten.md.
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI-aanroep faalde (status ${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI gaf geen bruikbaar antwoord terug (leeg).');
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI-antwoord was geen geldige JSON: ${err.message}`);
  }
}

function extractProposal(result) {
  if (!result || typeof result !== 'object' || !result.blueprint) {
    throw new Error('OpenAI-antwoord miste het verwachte veld "blueprint".');
  }
  const blueprint = { ...result.blueprint, templateFormat: 'slots' };
  return {
    blueprint,
    voorbeeldSlotData:
      result.voorbeeldSlotData && typeof result.voorbeeldSlotData === 'object' ? result.voorbeeldSlotData : {}
  };
}

function formatBrandingForPrompt(klant) {
  const tokens = getTokens(klant);
  return `Klant-huisstijl (via CSS-variabelen, gebruik deze in cssTemplate — verzin geen eigen kleuren):
- primair: ${tokens.primary} (var(--lp-primary)), donker-primair: ${tokens.primaryDark} (var(--lp-primary-dark))
- secundair: ${tokens.secondary} (var(--lp-secondary))
- tekst: ${tokens.text} (var(--lp-text)), gedempte tekst: ${tokens.textMuted} (var(--lp-text-muted))
- achtergrond: ${tokens.bg} (var(--lp-bg)), alternatieve achtergrond: ${tokens.bgAlt} (var(--lp-bg-alt))
- CTA-knop: achtergrond ${tokens.ctaBg} (var(--lp-cta-bg)), tekst ${tokens.ctaText} (var(--lp-cta-text))
- randradius: ${tokens.radius} (var(--lp-radius)), maximale breedte: ${tokens.maxWidth} (var(--lp-max-width))`;
}

async function formatReferenceForPrompt(referentieUrl) {
  if (!referentieUrl || !referentieUrl.trim()) {
    return 'Geen referentie-URL opgegeven — baseer de structuur op je eigen kennis van dit paginatype.';
  }
  const summary = await fetchReferenceSummary(referentieUrl.trim());
  if (summary.fout) {
    return (
      `Referentie-URL opgegeven (${referentieUrl}) maar kon niet opgehaald worden (${summary.fout}) — ` +
      'baseer de structuur op je eigen kennis van dit paginatype, negeer de referentie verder.'
    );
  }
  return `Structuuranalyse van de referentiepagina (${referentieUrl}), gebruik dit als concreet
voorbeeld voor opbouw en volgorde van secties (NIET letterlijk overtypen):
Koppen: ${summary.structuur.headings.join(' | ') || '(geen gevonden)'}
Knoppen/links: ${summary.structuur.knoppenEnLinks.slice(0, 15).join(' | ') || '(geen gevonden)'}
Aantal afbeeldingen op de pagina: ${summary.structuur.aantalAfbeeldingen}`;
}

function buildVasteOnderdelenTekst(verplichteOnderdelen) {
  const gekozen = (Array.isArray(verplichteOnderdelen) ? verplichteOnderdelen : [])
    .map((key) => VASTE_ONDERDELEN_LABELS[key])
    .filter(Boolean);
  return gekozen.length
    ? `Verplicht op elke pagina van dit type: ${gekozen.join(', ')} (naast de altijd-verplichte hero, CTA en interne links). Voeg zelf gerust extra secties toe als dat bij de referentie/het paginatype past.`
    : 'Geen specifieke onderdelen verplicht gesteld — gebruik je eigen inzicht welke secties bij dit paginatype passen (naast de altijd-verplichte hero, CTA en interne links).';
}

async function generateTemplateProposal({
  klant,
  naam,
  referentieUrl,
  paginatype,
  verplichteOnderdelen,
  visueleRichting,
  conversiedoel,
  overigeWensen
}) {
  const systemPrompt = buildTemplateSystemPrompt();
  const referentieTekst = await formatReferenceForPrompt(referentieUrl);
  const brandingTekst = formatBrandingForPrompt(klant);
  const userPrompt = `Klant: ${klant}
Naam van dit sjabloon: ${naam}
Paginatype / doel: ${paginatype || '(niet opgegeven)'}
Visuele richting: ${visueleRichting || '(geen voorkeur opgegeven, kies zelf iets passends)'}
Belangrijkste conversiedoel (primaire actie van de bezoeker): ${conversiedoel || '(niet opgegeven)'}
${buildVasteOnderdelenTekst(verplichteOnderdelen)}
${overigeWensen ? `Overige wensen: ${overigeWensen}` : ''}

${brandingTekst}

${referentieTekst}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  return extractProposal(result);
}

// Finetune-ronde: past een AL BESTAAND voorstel aan op basis van Dylans
// feedback, in plaats van opnieuw vanaf nul te genereren.
async function refineTemplateProposal({ klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback }) {
  if (!feedback || !feedback.trim()) {
    throw new Error('Vul feedback in om het voorstel aan te passen.');
  }
  const systemPrompt = `${buildTemplateSystemPrompt()}

Dit keer krijg je ook het HUIDIGE voorstel en feedback van de gebruiker daarop. Pas het voorstel aan
volgens de feedback en laat de rest ongewijzigd waar de feedback er niet over gaat — dit is een
finetune-ronde, geen nieuw ontwerp vanaf nul. Geef het VOLLEDIGE aangepaste resultaat terug, in
hetzelfde JSON-formaat als hierboven omschreven ({ "blueprint": ..., "voorbeeldSlotData": ... }).`;

  const userPrompt = `Klant: ${klant}
Naam van dit sjabloon: ${naam}

${formatBrandingForPrompt(klant)}

Huidig blueprint:
${JSON.stringify(huidigBlueprint, null, 2)}

Huidige voorbeeldSlotData:
${JSON.stringify(huidigeVoorbeeldSlotData, null, 2)}

Feedback van de gebruiker: ${feedback}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  return extractProposal(result);
}

// ---- Stap 2: content voor één pagina genereren binnen een goedgekeurd
// sjabloon. Vult de slots op basis van: de vaste invoerVelden (per sjabloon
// gedefinieerd), de twee vaste stap-2-vragen ("waar gaat deze pagina over"
// en een optionele CTA-override), de aangevinkte feiten uit de
// feitensheet, en een lijst bestaande pagina's van dezelfde klant waaruit de
// AI zelf 2-3 relevante zusterpagina's kiest voor de linksItems-slot
// (inclusief reden) — zie besluiten.md, Dylan wilde dit niet zelf per
// pagina hoeven te bepalen.
// Afbeelding-slots (herkenbaar aan de vaste "ImageSrc"/"ImageAlt"-naamgeving, zie besluit 7,
// besluiten.md) worden HIER expres nooit tekstueel ingevuld door de AI — die zou anders een
// verzonnen URL/placeholder neerzetten. Ze worden apart en pas na de gewone contentgeneratie
// gevuld, hetzij automatisch (zie pickImagesForPage hieronder) hetzij handmatig door Dylan via de
// mediakiezer.
const IMAGE_SRC_RE = /ImageSrc$/;
const IMAGE_ALT_RE = /ImageAlt$/;
// Zelfde soort vaste naamgevingsafspraak als ImageSrc/ImageAlt hierboven, nu voor een enkel,
// vast gepositioneerd linkveld in een sjabloon (bv. "roomsLinkHref": een link naar de
// kamers/verblijf-pagina) - dit is GEEN lijst zoals linksItems, maar verdient dezelfde
// bescherming: nooit een url laten verzinnen, alleen uit de aangeleverde kandidatenlijst kiezen.
// "ctaHref" matcht hier bewust niet op (dat is de losse boekingslink, geen contentlink).
const LINK_HREF_RE = /LinkHref$/;

function getImageSlots(template) {
  const slots = Array.isArray(template.slots) ? template.slots : [];
  return slots.filter((s) => IMAGE_SRC_RE.test(s.key));
}

function buildContentSystemPrompt(template) {
  const slots = Array.isArray(template.slots) ? template.slots : [];
  const tekstSlots = slots.filter((s) => !IMAGE_SRC_RE.test(s.key) && !IMAGE_ALT_RE.test(s.key));
  const afbeeldingSlots = slots.filter((s) => IMAGE_SRC_RE.test(s.key) || IMAGE_ALT_RE.test(s.key));
  const slotBeschrijving = tekstSlots
    .map(
      (s) =>
        `- ${s.key} (${s.type}${s.type === 'list' ? `, velden: ${(s.itemFields || []).join(', ')}` : ''}${
          s.verplicht ? ', verplicht' : ''
        }): ${s.label || ''}`
    )
    .join('\n');
  const afbeeldingNotitie = afbeeldingSlots.length
    ? `\n\nVul deze afbeelding-slots NIET in, ook niet met een placeholder-tekst of verzonnen URL — ze
worden apart (automatisch of handmatig) gevuld vanuit de mediabibliotheek: ${afbeeldingSlots
      .map((s) => s.key)
      .join(', ')}. Laat ze gewoon weg uit slotData.`
    : '';

  return `Je schrijft de INHOUD voor één landingspagina, binnen een AL GOEDGEKEURD sjabloon. De
structuur/opmaak ligt al vast (dat pas je niet aan) — jij vult alleen de genoemde slots met concrete,
Nederlandse tekst op basis van de aangeleverde informatie. Gebruik ALLEEN feiten die expliciet zijn
aangeleverd (feitensheet, invoervelden, "waar gaat deze pagina over") — verzin geen adressen, prijzen,
data of andere harde feiten.

Slots die gevuld moeten worden:
${slotBeschrijving}${afbeeldingNotitie}

Interne links — kwaliteit boven kwantiteit: je krijgt een lijst "Beschikbare linkbestemmingen" (een
mix van andere landingspagina's van deze klant en echte, bestaande pagina's op de eigen website).
Voeg een link ALLEEN toe als die inhoudelijk echt iets toevoegt op de plek waar je 'm zet — nooit om
een aantal te halen. Nul relevante links is prima als er niks passends is; forceer niets.
Twee manieren om een link te plaatsen, beide mogen, kies wat het beste past:
1. Middenin een lopende tekst-slot, met de schrijfwijze [ankertekst](url) — pas de zin er zelf op aan
   zodat de link natuurlijk leest (dus niet een toevallig woord als "Roots" onderstrepen, wel iets als
   "bekijk ook onze [kamers](url)" als dat ergens logisch past).
2. Als de slot "linksItems" in dit sjabloon bestaat: voeg 'm daaraan toe met een korte interne reden
   (reason, nooit publiek getoond) waarom de link relevant is, en zet zusterpagina op de waarde die de
   bestemming zelf al meekreeg in de kandidatenlijst.
Gebruik ALTIJD exact de opgegeven url uit de kandidatenlijst — verzin nooit zelf een URL, ook niet als
die logisch lijkt. Een niet-herkende URL wordt automatisch verwijderd.

Voor "metaTitle"/"metaDescription": schrijf SEO-vriendelijke varianten binnen de opgegeven lengte-eisen.
Gebruik hier NOOIT de [ankertekst](url)-linkschrijfwijze — dit zijn platte SEO-velden, geen webpagina-
tekst, een link erin zou alleen als rare tekst in de zoekresultaten verschijnen.

Voor een los slot met een naam die eindigt op "LinkHref" (bijvoorbeeld "roomsLinkHref" — een vaste
link op één plek in het sjabloon, geen lijst): vul deze ALLEEN met een exacte url uit de
kandidatenlijst hierboven, gekozen op basis van wat de slotnaam/label aangeeft (bijvoorbeeld de
kamers/verblijf-pagina voor een slot dat daarover gaat). Geen goede kandidaat gevonden? Laat de slot
dan leeg in plaats van zelf iets te verzinnen.

Antwoord ALLEEN met een JSON-object met exact één veld, geen tekst erbuiten:
{ "slotData": <object met per slot-key de ingevulde waarde (tekst of array van items)> }`;
}

async function generatePageContent({ klant, template, invoer, feiten, watGaatDezePaginaOver, ctaOverride, linkKandidaten }) {
  const systemPrompt = buildContentSystemPrompt(template);
  const userPrompt = `Klant: ${klant}

Invoervelden voor deze pagina:
${JSON.stringify(invoer || {}, null, 2)}

Waar deze pagina over gaat (door de gebruiker aangeleverd, gebruik dit als leidraad voor de
hero/intro-achtige slots en om de pagina te onderscheiden van vergelijkbare pagina's):
${watGaatDezePaginaOver || '(niet opgegeven)'}

${
  ctaOverride
    ? `CTA voor deze specifieke pagina (afwijkend van het sjabloon-default): ${ctaOverride}`
    : 'Geen CTA-afwijking opgegeven, gebruik een passende standaard-actie.'
}

Aangevinkte feiten uit de feitensheet (bronprincipe — gebruik uitsluitend deze, verzin niets extra's):
${JSON.stringify(feiten || [], null, 2)}

Beschikbare linkbestemmingen (zusterpagina: true = andere landingspagina van deze klant binnen LP
Fabriek, zusterpagina: false = een echte, bestaande pagina op de eigen live website — behandel beide
even serieus, gebruik uitsluitend de opgegeven url, kies alleen wat inhoudelijk relevant is):
${JSON.stringify(linkKandidaten || [], null, 2)}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  if (!result || typeof result !== 'object' || !result.slotData) {
    throw new Error('OpenAI-antwoord miste het verwachte veld "slotData".');
  }
  const slotData = { ...result.slotData };
  // Defensief: ook als het model zich niet aan de instructie hierboven houdt en toch een
  // afbeelding-slot invult, wordt die hier verwijderd — nooit een verzonnen URL laten staan.
  for (const key of Object.keys(slotData)) {
    if (IMAGE_SRC_RE.test(key) || IMAGE_ALT_RE.test(key)) delete slotData[key];
  }
  verwijderVerzonnenLinks(slotData, linkKandidaten);
  return { slotData };
}

// Verwijdert elke link (zowel [ankertekst](url) middenin tekst-slots als een linksItems-item) die
// niet exact overeenkomt met een aangeleverde kandidaat-url — het model mag ALLEEN linken naar wat
// wij zelf hebben aangeleverd, nooit naar iets dat het zelf verzint. Bij een tekst-slot blijft de
// ankertekst gewoon staan (alleen de link zelf verdwijnt, de zin blijft leesbaar); bij linksItems
// wordt het hele item weggegooid (een link-item zonder geldige href heeft geen bestaansrecht).
function verwijderVerzonnenLinks(slotData, linkKandidaten) {
  const toegestaneHrefs = new Set((Array.isArray(linkKandidaten) ? linkKandidaten : []).map((k) => k.url));

  // metaTitle/metaDescription zijn platte SEO-velden — daar hoort de linkschrijfwijze sowieso
  // nooit in, geldig of niet, dus die halen we hier hoe dan ook weg (niet alleen ongeldige).
  for (const metaKey of ['metaTitle', 'metaDescription']) {
    if (typeof slotData[metaKey] === 'string') {
      slotData[metaKey] = slotData[metaKey].replace(INLINE_LINK_RE, '$1');
    }
  }

  forEachTextLeaf(slotData, (path, value, set) => {
    if (path === 'metaTitle' || path === 'metaDescription') return;
    if (!INLINE_LINK_RE.test(value)) return;
    INLINE_LINK_RE.lastIndex = 0;
    const nieuweWaarde = value.replace(INLINE_LINK_RE, (full, label, href) =>
      toegestaneHrefs.has(href) ? full : label
    );
    if (nieuweWaarde !== value) set(nieuweWaarde);
  });

  if (Array.isArray(slotData.linksItems)) {
    slotData.linksItems = slotData.linksItems.filter((item) => item && toegestaneHrefs.has(item.href));
  }

  // Losse "*LinkHref"-slots (bv. roomsLinkHref) — zelfde bescherming als linksItems hierboven,
  // maar dan voor een los veld: een niet-herkende url wordt leeggemaakt in plaats van weggegooid
  // (er is geen "item" om te droppen), zodat de validator 'm als ontbrekende verplichte slot
  // meldt in plaats van dat er een dode/verzonnen link op de pagina blijft staan.
  for (const key of Object.keys(slotData)) {
    if (LINK_HREF_RE.test(key) && typeof slotData[key] === 'string' && slotData[key] && !toegestaneHrefs.has(slotData[key])) {
      slotData[key] = '';
    }
  }
}

// Kiest voor elke ImageSrc-slot van dit sjabloon automatisch de best passende foto uit de
// aangeleverde kandidatenlijst (afkomstig uit de WordPress-mediabibliotheek van de klant, zie
// searchMedia in wordpress.js). Aparte AI-aanroep met beeldherkenning, zodat een mislukte of
// afwijkende keuze hier nooit de gewone tekst-contentgeneratie hierboven kan blokkeren. Wijst een
// slot af (null) als geen enkele kandidaat er ECHT bij past — Dylan vult die dan zelf handmatig in,
// net als voorheen.
async function pickImagesForPage({ template, invoer, feiten, watGaatDezePaginaOver, kandidaten }) {
  const afbeeldingSlots = getImageSlots(template);
  if (!afbeeldingSlots.length || !Array.isArray(kandidaten) || !kandidaten.length) {
    return { picks: {} };
  }

  const slotsBeschrijving = afbeeldingSlots.map((s) => `- "${s.key}": ${s.label || s.key}`).join('\n');

  const systemPrompt = `Je kiest, voor een Nederlandse landingspagina, per genoemde afbeelding-slot de
best passende foto uit een aangeleverde lijst kandidaat-foto's (uit de eigen mediabibliotheek van de
klant). Beoordeel puur op wat je ECHT op de foto ziet.

Wijs een kandidaat AF (gebruik null) voor een slot als geen enkele kandidaat er inhoudelijk/qua sfeer
bij past — bijvoorbeeld: de foto toont een duidelijk andere doelgroep dan deze pagina beschrijft (zoals
kinderen/een gezin op de foto terwijl deze pagina duidelijk over volwassen festivalgangers/vrienden
gaat), of een heel andere ruimte/onderwerp dan de sectie beschrijft. Kies liever null dan een foto die
niet goed past — Dylan vult die dan zelf handmatig in.

Schrijf voor elke slot waar je WEL een kandidaat voor kiest ook meteen een korte, Nederlandse
alt-tekst (bondige feitelijke beschrijving van wat je ECHT op die foto ziet, geen marketingtaal) — de
mediabibliotheek van de klant heeft daar vaak zelf geen tekst voor ingevuld, dus reken niet op een
andere bron.

Antwoord ALLEEN met een JSON-object met exact één veld:
{ "picks": { "<slotKey>": { "kandidaatId": <getal, of null>, "alt": "<korte alt-tekst, leeg als kandidaatId null is>" }, ... } } — precies één entry per genoemde slot.`;

  const context = `Waar deze pagina over gaat: ${watGaatDezePaginaOver || '(niet opgegeven)'}

Invoervelden:
${JSON.stringify(invoer || {}, null, 2)}

Relevante feiten:
${JSON.stringify(feiten || [], null, 2)}

Afbeelding-slots om te vullen:
${slotsBeschrijving}

Kandidaat-foto's (id en titel staan steeds vlak voor de afbeelding):`;

  const contentParts = [{ type: 'text', text: context }];
  for (const item of kandidaten) {
    contentParts.push({ type: 'text', text: `Kandidaat-id ${item.id} — "${item.titel || '(zonder titel)'}"` });
    contentParts.push({ type: 'image_url', image_url: { url: item.thumbnail || item.url, detail: 'low' } });
  }

  const result = await callOpenAiVision({ systemPrompt, contentParts });
  const ruwePicks = (result && typeof result === 'object' && result.picks) || {};
  const kandidatenById = new Map(kandidaten.map((k) => [String(k.id), k]));
  const picks = {};
  for (const slot of afbeeldingSlots) {
    const ruw = ruwePicks[slot.key];
    const gekozenId = ruw && typeof ruw === 'object' ? ruw.kandidaatId : ruw; // tolerant voor oude platte vorm
    const kandidaat = gekozenId !== null && gekozenId !== undefined ? kandidatenById.get(String(gekozenId)) : null;
    if (!kandidaat) {
      picks[slot.key] = null;
      continue;
    }
    // Volgorde: alt-tekst die het model net zelf schreef (ziet de foto echt) -> bestaande WP
    // alt-tekst -> WP mediatitel (Dylan geeft zijn uploads bijna altijd een herkenbare titel,
    // zie besluiten.md) -> sjabloon-slotlabel. Zo blijft dit verplichte veld nooit leeg, ook als
    // het model een keer geen alt-tekst meegeeft.
    const modelAlt = ruw && typeof ruw === 'object' && typeof ruw.alt === 'string' ? ruw.alt.trim() : '';
    const alt = modelAlt || kandidaat.alt || kandidaat.titel || slot.label || slot.key;
    picks[slot.key] = { url: kandidaat.url, alt };
  }
  return { picks };
}

async function callOpenAiVision({ systemPrompt, contentParts }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is niet gezet — kan geen afbeeldingen kiezen.');
  }
  const model = process.env.OPENAI_MODEL || 'gpt-5.5';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts }
      ],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI-aanroep (afbeeldingen kiezen) faalde (status ${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI gaf geen bruikbaar antwoord terug bij het kiezen van afbeeldingen.');
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI-antwoord (afbeeldingen kiezen) was geen geldige JSON: ${err.message}`);
  }
}

module.exports = {
  VASTE_ONDERDELEN_OPTIES,
  callOpenAi,
  generateTemplateProposal,
  refineTemplateProposal,
  generatePageContent,
  pickImagesForPage
};
