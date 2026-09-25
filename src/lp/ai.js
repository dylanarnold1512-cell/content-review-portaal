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
const { afgeleideVormtaal } = require('./huisstijlMeting');
const { INLINE_LINK_RE, forEachTextLeaf, ICON_NAMES, findUnknownIcons } = require('./slotEngine');

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
  "invoerVelden": [ { "key": string, "label": string, "verplicht": boolean,
                       "voorbeeld": string (kort, realistisch voorbeeld van een goed ingevulde waarde voor dit
                         veld, bv. "5 september 2026" bij een datumveld — wordt als placeholder getoond in het
                         invoerformulier zodat Dylan/Marc meteen zien wat voor antwoord verwacht wordt) } ],
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
- FORMULIER: wil je op een plek in het sjabloon een contactformulier tonen, zet daar exact de tekst
  {{formulier}} (bv. <div class="contact-formulier">{{formulier}}</div>). Dit is GEEN slot: voeg het
  NIET toe aan "slots" en verzin zelf geen formulier, velden of shortcode. Het echte formulier van de
  klant wordt automatisch op die plek gezet en krijgt vanzelf de kleuren en het lettertype van de
  pagina. Zet {{formulier}} hoogstens een keer in het sjabloon. Geef de omliggende sectie zelf wel
  een duidelijke kop en een korte intro (via gewone slots).
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

Iconen: wil je bij een lijst-slot (bv. USP-kaarten) een icoon per item, gebruik dan exact het
itemField-naam "icon" (of, voor een los icoon buiten een lijst, een slotnaam die eindigt op "Icon",
bv. "heroIcon"). Zo'n icoonveld wordt NOOIT als tekst afgedrukt maar automatisch omgezet naar een
echt SVG-icoon uit een vaste set — gebruik in htmlTemplate gewoon {{icon}} zoals elk ander veld, de
weergave gaat vanzelf goed. Belangrijk: de WAARDE van dit veld (die je later, bij het genereren van
paginacontent, invult) moet dan exact een van deze namen zijn, niets anders: ${ICON_NAMES.join(', ')}.
Vermeld dat in je blueprint niet als losse regel, dit is puur voor jou als ontwerper — het
contentgeneratie-model krijgt deze lijst apart nog een keer te zien.

Accentlabel/kicker boven een titel (21-09-2026, optioneel, alleen gebruiken als het qua look & feel past): heeft de klant een apart, kort accent-lettertype voor korte hoofdletter-labels boven een titel (bv. "WELKOM BIJ" boven een hero-titel)? Gebruik dan de vaste CSS-klasse "lp-kicker" op een klein element (span of p) VOOR de eigenlijke kop, nooit op de kop zelf (h1-h6 blijven altijd het gewone koppen-lettertype gebruiken). Dit is een losse, optionele hulpklasse — niet elk sjabloon hoeft hem te gebruiken, en niet elke klant heeft er een apart lettertype voor (dan valt "lp-kicker" gewoon terug op het gewone koppen-lettertype, geen zichtbaar verschil).

Grids met een lijst-slot: als een sectie meerdere items uit een {{#each}}-lijst in een grid toont
(bv. USP-kaarten, badges, stappenplan), gebruik dan ALTIJD
"grid-template-columns:repeat(auto-fit,minmax(<minimumbreedte>px,1fr))" (voeg "justify-content:center"
toe op de grid-container zelf als de rij optisch gecentreerd moet blijven bij minder items), NOOIT
een vast aantal kolommen zoals "repeat(3,...)". Het aantal items in zo'n lijst kan per pagina en per
klant verschillen; een vast kolomaantal laat bij minder items dan kolommen een lege kolom staan, wat
er visueel uitziet als niet gecentreerd. Dit wordt ook mechanisch gecontroleerd bij het opslaan
(waarschuwing, geen blokkade), maar voorkom het liever meteen in je eigen ontwerp.

Klassenamen (21-09-2026): het sjabloon draait op de echte site van de klant, binnen het WordPress thema, dat zelf ook CSS heeft. Gebruik daarom GEEN generieke klassenamen die thema's en frameworks (Bootstrap) zelf stijlen: container, row, col-*, clearfix, wrapper, content, main, header, footer, nav, btn, btn-primary, btn-secondary, button, card, badge, alert. Geef eigen klassen een duidelijk voorvoegsel, bijvoorbeeld "lp-container", "lp-btn" of "festival-card". Dit wordt ook gecontroleerd bij het opslaan (waarschuwing).

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


// Ontwerp-toolkit (25-09-2026): aanleiding was een handgebouwde dienstenpagina van een collega die veel
// dynamischer en gedetailleerder was dan wat de AI tot dan toe maakte. Die pagina gebruikte alleen
// technieken die in een sjabloon WEL mogen (puur HTML + CSS + inline SVG): gradient-achtergronden,
// zachte "blobs", zwevende beeldkaarten, golf-scheidingen tussen secties, hover-effecten op kaarten,
// kleine label-pillen boven koppen, een gemarkeerd woord in de kop en een formulierkaart. De AI kreeg
// dit nooit expliciet mee, dus koos die veilig en kaal. Scripts, externe bestanden en scroll-JS mogen
// NIET (zie templateSafetyCheck in slotEngine.js), daarom staat hieronder ook hoe je dezelfde
// scroll-animaties zonder JavaScript doet.
const ONTWERP_TOOLKIT = `ONTWERP-TOOLKIT (gebruik dit standaard, met mate en passend bij de visuele richting; kwaliteit en
leesbaarheid gaan voor effect):
- Sectie-achtergronden: wissel wit af met subtiele verlopen (linear-gradient in een lichte tint van de
  merkkleur) en getinte vlakken. Gebruik uitsluitend de merkkleuren via var(--lp-primary), var(--lp-secondary),
  var(--lp-bg-alt) enz., verzin geen eigen kleurenpalet.
- Golf- of schuine scheidingen tussen secties met een inline <svg> (viewBox met preserveAspectRatio="none",
  fill in de kleur van de volgende sectie). Alleen inline SVG, nooit een extern bestand.
- Zachte decoratieve vlakken ("blobs"): grote ronde elementen met filter: blur(60px) en lage opacity achter
  de hero, met een trage keyframes-beweging (18 tot 22 seconden).
- Hero met beeld: een grote afbeeldingskaart met afgeronde hoeken en zachte schaduw, eventueel een tweede
  kleinere kaart met witte rand die deels overlapt, en een klein "badge"-kaartje met een kernpunt. Laat
  kaarten heel rustig zweven (keyframes translateY van hooguit 10 tot 12 px).
- Kaarten en knoppen: een subtiele hover-lift (transform: translateY(-6px) plus iets grotere schaduw), afbeeldingen
  in kaarten die bij hover licht inzoomen (transform: scale(1.06)), soepele overgangen (transition van
  .25 tot .4 seconde).
- Kopjes: een klein label-pilletje boven een sectiekop (kicker), en in de hero-kop een enkel woord
  benadrukken met de accentkleur en een handgetekende onderstreping (inline SVG path met stroke-linecap round).
- Nummerstappen (werkwijze), checklist-iconen in een rond vlak, een galerij-raster met bijschriften over de
  onderkant van het beeld, en een contact-sectie met een formulierkaart (witte kaart, grote afronding, zachte schaduw).
- Golf-scheidingen goed opbouwen (dit ging eerder mis): de <svg> staat ABSOLUUT onderaan de sectie (bottom: -1px,
  width 100%), het pad vult het ONDERSTE deel van de svg (het pad eindigt met L1440,86 L0,86 Z) en de fill is
  PRECIES de achtergrondkleur van de VOLGENDE sectie. Vul dus nooit het bovenste deel van de svg. Geef de sectie
  erboven geen kleurverloop dat bij de golf zichtbaar wordt.
- Elementen die over de rand van een kaart of foto steken (bv. een rond icoon dat half over de onderrand van een
  foto hangt) mogen NIET binnen een container met overflow: hidden staan, anders wordt het icoon afgesneden. Zet
  overflow: hidden op de foto zelf of laat het icoon buiten de foto-container staan en positioneer het op de kaart.
- Scroll-animaties ZONDER JavaScript: laat onderdelen inschuiven bij scrollen met CSS scroll-driven animations,
  ALLEEN binnen @supports (animation-timeline: view()) { ... }, zodat alles ook zonder die ondersteuning gewoon
  zichtbaar is.
  Gebruik als bereik ALTIJD animation-range: entry 0% entry 60% (klaar zodra het element goed in beeld is) en
  NOOIT een bereik met "cover". Met cover blijven elementen onderaan de pagina, die niet ver genoeg kunnen
  scrollen, half doorzichtig en lijkt het einde van de pagina vaag of verbleekt. Zet nooit opacity: 0 als basisstijl buiten die @supports.
- Respecteer altijd @media (prefers-reduced-motion: reduce): zet dan alle animaties en overgangen uit.
- Alle @keyframes krijgen een naam met het voorvoegsel "lpt-" (bv. lpt-zweef), omdat keyframe-namen wereldwijd
  gelden op de pagina en anders kunnen botsen met het thema.
- Werk mobielfirst genoeg: gebruik @media (max-width: 900px) om grids naar een kolom te brengen en de
  hero-tekst kleiner te zetten.
- NIET toegestaan (wordt geblokkeerd bij het opslaan): <script>, <link>, @import, url(http...), inline
  event-handlers, iframes. Fonts en merkkleuren komen automatisch van de klant, laad dus zelf geen lettertypes.`;

const VISUELE_RICHTINGEN = {
  'dynamisch-modern':
    'Dynamisch en modern: gebruik de ontwerp-toolkit volop (verlopen, zachte blobs, zwevende beeldkaarten, golf-scheidingen, ' +
    'hover-effecten, scroll-inschuiven met CSS). Veel beeld, veel ademruimte, ronde vormen.',
  'fotografie-gedreven':
    'Fotografie-gedreven: grote, aansprekende beelden bepalen de pagina, tekst is ondersteunend. Gebruik de toolkit ' +
    'met mate (rustige hover-effecten, ronde beeldkaarten).',
  'icoon-gedreven-zakelijk':
    'Icoon-gedreven en zakelijk: iconen en korte, feitelijke blokken, weinig beeld. Gebruik de toolkit terughoudend ' +
    '(getinte vlakken, nette kaarten met hover-lift, geen zwevende beelden).',
  'minimalistisch-tekstueel':
    'Minimalistisch en tekstueel: veel witruimte, sterke typografie, weinig decoratie. Alleen heel subtiele hover- en ' +
    'overgangseffecten, geen blobs en geen golf-scheidingen.'
};

function beschrijfVisueleRichting(sleutel) {
  if (!sleutel) return '(geen voorkeur opgegeven, kies zelf iets passends en gebruik de ontwerp-toolkit met mate)';
  return VISUELE_RICHTINGEN[sleutel] ? `${sleutel}: ${VISUELE_RICHTINGEN[sleutel]}` : String(sleutel);
}

// SEO en GEO (25-09-2026): regels voor zowel het ONTWERP van een sjabloon als het SCHRIJVEN van een pagina, zodat elke
// pagina van elke klant meteen organisch kan scoren en goed geciteerd kan worden door zoekmachines en AI-antwoorden
// (GEO, generative engine optimization). Zonder deze regels wist de AI er niets van en koos de structuur zelf.
const SEO_GEO_SJABLOON_REGELS = `SEO EN GEO IN HET SJABLOON (elke pagina moet organisch kunnen scoren en goed te citeren zijn):
- Semantische HTML: <section> per onderwerp, precies een <h1> (bevat de dienst en waar relevant de plaats), daarna
  een logische h2 tot h3 hierarchie zonder niveaus over te slaan. Lijsten (<ul>/<ol>) voor opsommingen van diensten
  of stappen. Tekst hoort in echte tekst, nooit in een afbeelding.
- Direct onder de hero komt een kort antwoordblok (een of twee zinnen) dat zonder de rest van de pagina te lezen
  beantwoordt: wie doet wat, waar, voor wie. Dit is wat zoekmachines en AI-antwoorden citeren. Gebruik daarvoor de
  hero-introductie of de eerste introductietekst, en houd die feitelijk.
- Een gegevensblok met de bedrijfsgegevens in een <address>-element of duidelijke lijst (naam, werkgebied, adres,
  telefoonnummer, e-mail), gevuld uit de feiten van de klant, nooit verzonnen. Maak hier een aparte lijst-slot voor
  (bv. "practicalItems") als het sjabloon een praktische sectie heeft.
- Een veelgestelde-vragen-sectie met echte vragen als vraagtekst (het systeem maakt daar automatisch FAQ-schema van).
- Elke afbeelding krijgt een eigen alt-tekst-slot (beschrijvend, geen "afbeelding van").
- Interne links op logische plekken, met beschrijvende ankertekst (geen "klik hier").
- Denk aan snelheid en leesbaarheid: geen onnodig zware effecten, tekst blijft leesbaar zonder animatie.`;

const SEO_GEO_CONTENT_REGELS = `SEO EN GEO BIJ HET SCHRIJVEN (elke pagina moet organisch kunnen scoren en goed te citeren zijn):
- Kop (h1): begin met de dienst, noem de plaats natuurlijk (bv. "Aannemer in Amersfoort voor verbouw en renovatie").
  Geen keyword stuffing: de plaatsnaam en dienst komen natuurlijk terug (ongeveer drie tot vijf keer op de pagina).
- Antwoord eerst: de allereerste alinea (hero-introductie of eerste introductietekst) beantwoordt in een tot twee
  zinnen wie het bedrijf is, wat het doet, voor wie en waar. Feitelijk, zonder superlatieven, zodat het letterlijk te
  citeren is door een zoekmachine of AI-antwoord.
- Meta titel: patroon "[Dienst] in [plaats] | [merknaam]", binnen de lengte-eisen. Meta beschrijving: noem de plaats,
  een concreet feit of voordeel uit de aangeleverde feiten en een duidelijke oproep, binnen de lengte-eisen.
- Veelgestelde vragen: schrijf ze als echte vragen zoals mensen ze stellen (bv. "Werken jullie ook in [plaats]?",
  "Hoe verloopt een verbouwing van begin tot eind?"). Begin elk antwoord met het directe antwoord in een tot twee
  zinnen en licht daarna kort toe. Alleen antwoorden die door de aangeleverde feiten gedekt zijn: geen prijzen,
  doorlooptijden, garanties of cijfers verzinnen (bronprincipe).
- Entiteiten kloppen: gebruik de bedrijfsnaam, het werkgebied en de contactgegevens EXACT zoals in de feiten. Noem
  geen andere plaatsen, wijken, straten, klanten of projecten die niet in de feiten of de invoer staan.
- Lokale relevantie zonder verzinsels: maak elke pagina uniek met wat je echt weet over deze plaats uit de invoer
  en de feiten (werkgebied, afstand tot het kantoor als dat in de feiten staat). Kopieer geen tekst tussen pagina's
  van andere plaatsen door alleen de plaatsnaam te wisselen.
- Concreet en citeerbaar: korte, feitelijke zinnen, stappenplannen als genummerde stappen, diensten als opsomming.
- Alt-teksten: beschrijf wat er te zien is en noem de dienst of plaats alleen als dat klopt.`;

function buildTemplateSystemPrompt() {
  return `Je bent een senior webdesigner/frontend-developer voor een Nederlands marketingbureau. Je
ontwerpt een COMPLEET, BESPOKE HTML+CSS-sjabloon voor een terugkerend paginatype — niet de inhoud van
een individuele pagina, en NIET beperkt tot een vast blokkenpalet. Ontwerp zoals een goede
webdesigner dat zou doen: overweeg fotografie/iconen, ronde hoeken en zachte schaduwen op kaarten,
getinte/afwisselende sectie-achtergronden, asymmetrische tekst+beeld-layouts, een consistente
accentkleur, en gebruik een referentiepagina (indien gegeven) als concreet structuurvoorbeeld — niet
om te kopieren, maar om vergelijkbare kwaliteit en opbouw te evenaren.

${ONTWERP_TOOLKIT}

${SEO_GEO_SJABLOON_REGELS}

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
  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
    throw new Error('callOpenAi: systemPrompt ontbreekt of is leeg (typfout in de aanroep?).');
  }
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
- randradius: ${tokens.radius} (var(--lp-radius)), maximale breedte: ${tokens.maxWidth} (var(--lp-max-width))
VORMTAAL van deze klant (verplicht volgen, gaat voor de ontwerp-toolkit als die botst):
- koppen (h1 tot h3): kleur var(--lp-heading-color) (${tokens.headingColor || tokens.primaryDark}), text-transform var(--lp-heading-transform) (${tokens.headingTransform || 'none'}), font-weight var(--lp-heading-weight) (${tokens.headingWeight || '700'})
- knoppen: border-radius var(--lp-button-radius) (${tokens.buttonRadius || tokens.radius}), text-transform var(--lp-button-transform) (${tokens.buttonTransform || 'none'})
- kaarten, foto's en beeldkaders: border-radius var(--lp-card-radius) (${tokens.cardRadius || tokens.radius}). Vermenigvuldig of vergroot dit NIET (dus geen calc(var(--lp-card-radius) * 3)) en kies geen eigen, grotere rondingen.
${tokens.sfeer ? `- sfeer van de klantsite: ${tokens.sfeer}` : '- sfeer: geen specifieke beschrijving, kies passend bij de branche.'}`;
}

// De AI kijkt bij het bouwen van een sjabloon mee met de ECHTE klantsite (25-09-2026): de site wordt
// opgehaald en gemeten (CSS-tekst per rol: koppen, knoppen, kaarten, achtergronden) plus de opbouw van de
// homepage (koppen, knoppen). Zo bouwt de AI niet alleen op tokens en een sfeertekst. Geen echte browser en
// geen screenshot, dus dit is een meting van de CSS en geen visueel oordeel. Mislukt het ophalen, dan gaat
// het sjabloon gewoon door op de tokens. Resultaat een uur in het geheugen bewaard (scheelt tijd bij finetunen).
const KLANTSITE_CACHE = new Map();
const KLANTSITE_CACHE_MS = 60 * 60 * 1000;

function lijstTekst(lijst) {
  return (lijst || []).map((x) => x.waarde).filter(Boolean).slice(0, 4).join(', ') || 'niet gemeten';
}

async function formatKlantSiteVoorPrompt(klant) {
  let url = '';
  try {
    const { getLpClient } = require('./clients');
    url = (getLpClient(klant).profile.bedrijf || {}).url || '';
  } catch (err) {
    return '';
  }
  if (!url) return '';
  const cached = KLANTSITE_CACHE.get(url);
  if (cached && Date.now() - cached.tijd < KLANTSITE_CACHE_MS) return cached.tekst;
  let tekst = '';
  try {
    // Pas hier laden: huisstijl.js laadt zelf ai.js (callOpenAi), een bovenaan-import geeft een kringverwijzing.
    const { verzamelRuweHuisstijlData } = require('./huisstijl');
    const data = await verzamelRuweHuisstijlData(url);
    if (data.fout || !data.meting) {
      tekst = `Klantsite (${url}) kon niet gemeten worden (${data.fout || 'geen CSS'}), ga uit van de tokens hierboven.`;
    } else {
      const m = data.meting;
      const vormtaal = afgeleideVormtaal(m);
      const structuur = data.structuur || {};
      tekst = `GEMETEN OP DE ECHTE KLANTSITE ${url} (uit de CSS-tekst, geen echte browser). Dit gaat boven je eigen smaak en boven de ontwerp-toolkit:
- koppen: lettertype ${lijstTekst(m.koppen.fonts)}, kleur ${lijstTekst(m.koppen.kleuren)}, hoofdletters ${lijstTekst(m.koppen.transform)}, gewicht ${lijstTekst(m.koppen.gewicht)}
- tekst: lettertype ${lijstTekst(m.tekst.fonts)}, kleur ${lijstTekst(m.tekst.kleuren)}
- knoppen: achtergrond ${lijstTekst(m.knoppen.achtergronden)}, hoeken ${lijstTekst(m.knoppen.radius)}, hoofdletters ${lijstTekst(m.knoppen.transform)}
- kaarten: hoeken ${lijstTekst(m.kaarten.radius)}
- achtergrondvlakken op de site: ${lijstTekst(m.achtergronden)}; randen: ${lijstTekst(m.randen)}
- afgeleide vormtaal: ${Object.keys(vormtaal).length ? JSON.stringify(vormtaal) : 'niets betrouwbaar af te leiden'}
- koppen op de homepage: ${(structuur.headings || []).slice(0, 12).join(' | ') || 'niet gevonden'}
- knoppen en links op de homepage: ${(structuur.knoppenEnLinks || []).slice(0, 10).join(' | ') || 'niet gevonden'}
ONTWERPPRINCIPE "de 2.0 versie van deze site": de HUISSTIJL is vast en komt letterlijk van de site: kleuren, lettertypes, hoofdletters, gewichten, knopvorm en hoeken. Daarbinnen bouw je een modernere, sterkere pagina dan de huidige site: betere hierarchie, meer witruimte, duidelijker secties, sterke hero, sfeervolle foto-inzet, subtiele beweging en hover-effecten. Vernieuwing zit dus in lay-out, ritme en details, NIET in andere kleuren, lettertypes of vormen.
Regel: gebruik geen decoratie (verlopen, blobs, golven, schaduwen, extra ronde hoeken) die niet bij deze meting en de sfeer past. Twijfel je, kies dan de strakkere variant die bij de site past.`;
    }
  } catch (err) {
    tekst = `Klantsite (${url}) kon niet gemeten worden (${err.message}), ga uit van de tokens hierboven.`;
  }
  KLANTSITE_CACHE.set(url, { tijd: Date.now(), tekst });
  return tekst;
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
  const brandingTekst = formatBrandingForPrompt(klant) + '\n\n' + (await formatKlantSiteVoorPrompt(klant));
  const userPrompt = `Klant: ${klant}
Naam van dit sjabloon: ${naam}
Paginatype / doel: ${paginatype || '(niet opgegeven)'}
Visuele richting: ${beschrijfVisueleRichting(visueleRichting)}
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

${await formatKlantSiteVoorPrompt(klant)}

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
  const iconSlotsAanwezig = slots.some(
    (s) =>
      (s.type === 'list' && Array.isArray(s.itemFields) && s.itemFields.includes('icon')) ||
      (s.type === 'text' && /Icon$/.test(s.key))
  );
  const iconNotitie = iconSlotsAanwezig
    ? `\n\nVoor het icoonveld ("icon", of een slot die eindigt op "Icon"): kies ALTIJD een waarde uit
exact deze lijst, nooit een andere of zelfverzonnen naam — een naam die hier niet in staat wordt niet
als icoon herkend en toont een neutraal fallback-icoontje in plaats van het bedoelde icoon:
${ICON_NAMES.join(', ')}.`
    : '';

  return `Je schrijft de INHOUD voor één landingspagina, binnen een AL GOEDGEKEURD sjabloon. De
structuur/opmaak ligt al vast (dat pas je niet aan) — jij vult alleen de genoemde slots met concrete,
Nederlandse tekst op basis van de aangeleverde informatie. Gebruik ALLEEN feiten die expliciet zijn
aangeleverd (feitensheet, invoervelden, "waar gaat deze pagina over") — verzin geen adressen, prijzen,
data of andere harde feiten.

Slots die gevuld moeten worden:
${slotBeschrijving}${afbeeldingNotitie}${iconNotitie}

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

${SEO_GEO_CONTENT_REGELS}

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
  const iconProblemen = findUnknownIcons(slotData);
  const iconWarning = iconProblemen.length
    ? `Niet-herkende icoonwaarde(n) gevonden (${iconProblemen
        .map((p) => `${p.path}: "${p.value}"`)
        .join(', ')}) — deze tonen nu een neutraal fallback-icoon. Pas de content aan met een geldige icoonnaam.`
    : null;
  return { slotData, iconWarning };
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
  formatBrandingForPrompt,
  VISUELE_RICHTINGEN,
  ONTWERP_TOOLKIT,
  SEO_GEO_SJABLOON_REGELS,
  SEO_GEO_CONTENT_REGELS,
  beschrijfVisueleRichting,
  buildTemplateSystemPrompt,
  buildContentSystemPrompt,
  callOpenAi,
  generateTemplateProposal,
  refineTemplateProposal,
  generatePageContent,
  pickImagesForPage,
  // Puur voor de geautomatiseerde tests (test/ai.test.js) - geen aparte OpenAI-aanroep nodig om
  // de anti-hallucinatie-filtering op linkvelden te controleren.
  verwijderVerzonnenLinks
};
