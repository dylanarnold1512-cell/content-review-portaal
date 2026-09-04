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
- "linksItems" (type list, itemFields ["label","href","reason","zusterpagina"]) — interne links.
  BELANGRIJK: "reason" is uitsluitend voor intern review en mag NOOIT in de zichtbare HTML worden
  gebruikt (dus wel {{label}} en {{href}} in de {{#each linksItems}}-loop, nooit {{reason}}).
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
function buildContentSystemPrompt(template) {
  const slots = Array.isArray(template.slots) ? template.slots : [];
  const slotBeschrijving = slots
    .map(
      (s) =>
        `- ${s.key} (${s.type}${s.type === 'list' ? `, velden: ${(s.itemFields || []).join(', ')}` : ''}${
          s.verplicht ? ', verplicht' : ''
        }): ${s.label || ''}`
    )
    .join('\n');

  return `Je schrijft de INHOUD voor één landingspagina, binnen een AL GOEDGEKEURD sjabloon. De
structuur/opmaak ligt al vast (dat pas je niet aan) — jij vult alleen de genoemde slots met concrete,
Nederlandse tekst op basis van de aangeleverde informatie. Gebruik ALLEEN feiten die expliciet zijn
aangeleverd (feitensheet, invoervelden, "waar gaat deze pagina over") — verzin geen adressen, prijzen,
data of andere harde feiten.

Slots die gevuld moeten worden:
${slotBeschrijving}

Voor de slot "linksItems": kies uit de aangeleverde lijst "Bestaande pagina's van deze klant" de 2-3
meest relevante zusterpagina's (op basis van onderwerp-overlap met deze pagina), zet zusterpagina op
true, en schrijf een korte interne reden (reason) waarom de link relevant is — reason wordt NOOIT
publiek getoond. Gebruik de opgegeven href van die pagina.

Voor "metaTitle"/"metaDescription": schrijf SEO-vriendelijke varianten binnen de opgegeven lengte-eisen.

Antwoord ALLEEN met een JSON-object met exact één veld, geen tekst erbuiten:
{ "slotData": <object met per slot-key de ingevulde waarde (tekst of array van items)> }`;
}

async function generatePageContent({ klant, template, invoer, feiten, watGaatDezePaginaOver, ctaOverride, bestaandePaginas }) {
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

Bestaande pagina's van deze klant (kies hieruit voor de linksItems-slot):
${JSON.stringify(bestaandePaginas || [], null, 2)}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  if (!result || typeof result !== 'object' || !result.slotData) {
    throw new Error('OpenAI-antwoord miste het verwachte veld "slotData".');
  }
  return { slotData: result.slotData };
}

module.exports = {
  VASTE_ONDERDELEN_OPTIES,
  callOpenAi,
  generateTemplateProposal,
  refineTemplateProposal,
  generatePageContent
};
