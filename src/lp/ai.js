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
const { schoonScreenshots, screenshotUitleg } = require('./screenshots');
const { fetchReferenceSummary } = require('./referenceFetch');
const { afgeleideVormtaal } = require('./huisstijlMeting');
const { zorgVoorGalerijSlot } = require('./galerij');
const { INLINE_LINK_RE, forEachTextLeaf, ICON_NAMES, findUnknownIcons } = require('./slotEngine');

// De optionele "vaste onderdelen"-checklist in het sjabloon-formulier (Stap
// 1, vraag 3). Hero, CTA en interne links zijn altijd al verplicht via de
// vaste slot-namen/regels hieronder, dus die staan hier expres niet in.
const { verwijderReviewAanhalingstekens } = require('./aanhalingstekens');
const { PAGINA_OPBOUW_REGELS, paginaOpbouwRegels, bouwKlantverhaalBlok, derdePersoonBlok, mixBlok } = require('./klantverhaal');

// Schrijft deze klant in de derde persoon? Dan gaat derdePersoonBlok mee in elke schrijfopdracht.
// Geeft ook de eigen regels van de klant mee (Klantgegevens: wat niet mag en de toon). Die gingen eerder alleen naar de
// WordPress en festival flows en niet naar de paginatekst, waardoor Hirs wij-vorm, reviews en superlatieven kreeg (21-10-2026).
// De stem van een klant is op een plek bepaald: schrijfvorm 'derde' in het profiel. Elke stap leest het hier.
function schrijftInDerdePersoon(klant) {
  try { return require('./clients').getLpClient(klant).profile.schrijfvorm === 'derde'; } catch (err) { return false; }
}

function schrijftInMix(klant) {
  try { return require('./clients').getLpClient(klant).profile.schrijfvorm === 'mix'; } catch (err) { return false; }
}

function derdePersoonVoor(klant, bedrijfsnaam) {
  try {
    const { getLpClient } = require('./clients');
    const profile = getLpClient(klant).profile;
    const delen = [];
    const niet = (profile && Array.isArray(profile.nietToegestaan) ? profile.nietToegestaan : []).filter(Boolean);
    if (niet.length || (profile && profile.toonNotitie)) {
      delen.push(`REGELS VAN DEZE KLANT (harde voorwaarden, gaan voor op alles hierboven):
${niet.length ? `Dit mag NIET:\n${niet.map((n) => `- ${n}`).join('\n')}` : ''}
${profile.toonNotitie ? `Toon: ${profile.toonNotitie}` : ''}
Controleer de tekst voordat je antwoordt tegen elke regel hierboven. Staat er iets in dat niet mag, schrijf die zin dan opnieuw.`);
    }
    if (profile && profile.schrijfvorm === 'mix') delen.push(mixBlok(bedrijfsnaam || (profile.bedrijf && profile.bedrijf.naam) || profile.naam, profile.nietNoemen));
    if (profile && profile.schrijfvorm === 'derde') delen.push(derdePersoonBlok(bedrijfsnaam || (profile.bedrijf && profile.bedrijf.naam) || profile.naam, profile.nietNoemen));
    return delen.join('\n\n');
  } catch (err) { /* onbekende klant: geen override */ }
  return '';
}
const leren = require('./leren');
const verhaal = require('./verhaal');
const campagneKennis = require('./campagneKennis');
const VASTE_ONDERDELEN_OPTIES = ['usps', 'stappen', 'aanbod', 'praktisch', 'reviews', 'faq', 'doelgroep', 'galerij'];

const VASTE_ONDERDELEN_LABELS = {
  usps: "USP's",
  stappen: 'Stappenplan',
  aanbod: 'Aanbod/kaarten',
  praktisch: 'Praktische info',
  reviews: 'Reviews',
  faq: 'FAQ',
  doelgroep: 'Doelgroeptekst',
  galerij: 'Galerij / slideshow'
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
               "rol": "hero" | "aanbod" | "waarom" | "werkwijze" | "bewijs" | "twijfels" | "actie" | "overig" (optioneel, de plek van dit
                 onderdeel in het verhaal van de pagina; zonder "rol" wordt hij uit de naam van het slot afgeleid),
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

VERHAALLIJN VAN DE PAGINA (zo bouw je het sjabloon op, de teksten volgen deze volgorde):
1. hero: herkenning en belofte. 2. aanbod: wat het bedrijf doet. 3. waarom: redenen om te kiezen.
4. werkwijze: zo gaat het na de aanvraag. 5. bewijs: reviews en projecten. 6. twijfels: veelgestelde vragen.
7. actie: formulier of knop. Zet het aanbod altijd voor de werkwijze en het bewijs voor het formulier. Maak per rol
een onderdeel en niet drie onderdelen die hetzelfde zeggen (bijvoorbeeld geen losse blokken "voordelen", "redenen" en
"kenmerken" op een pagina). Slotnamen die beginnen met hero, offer of aanbod, usp of waarom, steps of werkwijze,
reviews of projects, faq en cta krijgen automatisch de passende rol.

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
  een duidelijke kop en een korte intro (via gewone slots). Een echt formulier heeft veel ruimte nodig
  (keuzetegels, vinkjes, velden naast elkaar): geef de plek van {{formulier}} liefst de volle breedte
  van de sectie, onder de kop en intro, of anders minstens 600 px. Het formulier past zich bij een
  smalle plek wel aan, maar een zijkolom van 450 px of minder ziet er altijd krap uit.
- GALERIJ / SLIDESHOW: wil je een fotogalerij of slideshow, zet dan op die plek exact de tekst {{galerij}}
  (bv. <div class="werk-galerij">{{galerij}}</div>) in een eigen sectie met een kop en een korte intro
  (via gewone slots). Het systeem bouwt daar zelf een swipebare slideshow met pijltjes en puntjes in de
  huisstijl van de klant, en maakt het slot "galleryItems" vanzelf aan. Schrijf dus GEEN eigen
  galerij-HTML, geen carrousel, geen script en geen eigen CSS voor de slides. Zet {{galerij}} hoogstens een
  keer in het sjabloon, en gebruik nooit een eigen lijst-slot voor een galerij als je {{galerij}} gebruikt.
- KNOPPEN: geef elke CTA-knop (elke <a> met href {{ctaHref}} of vergelijkbare hoofdactie) naast je eigen
  klasse ook de klasse "lp-cta-button". Die klasse regelt kleur, lettertype, hoofdletters en afronding van
  de klant. Zet op een knop dus geen eigen border-radius, text-transform of font-family, en gebruik
  var(--lp-button-radius) en var(--lp-button-transform) als je iets aan de vorm wilt aanvullen. Alle knoppen
  op de pagina moeten er hetzelfde uitzien.
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
Elementen (02-10-2026): WordPress thema's geven ook eigen opmaak aan HTML elementen, zoals blockquote (groot aanhalingsteken, gecentreerde grote tekst), q, cite, figure, address en dl. Gebruik voor een review of citaat daarom een gewone div met eigen klasse (bijvoorbeeld "lp-review-kaart") en zet de tekst, naam en functie in p en span. Zet in je CSS expliciet lettergrootte, uitlijning en kleur van de tekst in zo'n kaart, en zet ::before en ::after van de kaart op content:none, zodat het thema er niets overheen legt.

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
- Antwoordblok onder de hero (slots als answerTitle en locationAnswer): stel de bezoeker geen ja of nee vraag zoals "Kun je je woning in [plaats] laten verbouwen?" en begin het antwoord niet met "Ja". De bezoeker weet al dat het kan. Schrijf een stellige kop met iets nieuws (hoe en vanuit waar jullie in deze plaats werken) en een antwoord van een tot twee zinnen met alleen feiten uit het werkgebied, het kantoor en de diensten. Herhaal de hero niet.
- Labels op een foto (badge): titel hooguit 4 woorden, tekst hooguit 10 woorden, een kort feit.
- Antwoord eerst: de allereerste alinea (hero-introductie of eerste introductietekst) beantwoordt in een tot twee
  zinnen wie het bedrijf is, wat het doet, voor wie en waar. Feitelijk, zonder superlatieven, zodat het letterlijk te
  citeren is door een zoekmachine of AI-antwoord.
- Meta titel: patroon "[Dienst] in [plaats] | [merknaam]", binnen de lengte-eisen. Meta beschrijving: noem de plaats,
  een concreet feit of voordeel uit de aangeleverde feiten en een duidelijke oproep, binnen de lengte-eisen.
- Veelgestelde vragen: schrijf ze als echte vragen zoals mensen ze stellen (bv. "Werken jullie ook in [plaats]?",
  "Hoe verloopt een verbouwing van begin tot eind?"). Begin elk antwoord met het directe antwoord in een tot twee
  zinnen en licht daarna kort toe. Alleen antwoorden die door de aangeleverde feiten of bronteksten gedekt zijn: geen prijzen,
  doorlooptijden, garanties of cijfers verzinnen (bronprincipe).
  Feiten met het label "Veelgestelde vraag" zijn echte vragen met antwoord van de klantsite zelf. Gebruik ze als
  basis van de FAQ: herschrijf ze voor deze dienst en plaats en kopieer ze niet letterlijk (dat geeft dubbele
  content met de hoofdsite). Voeg daarnaast zelf vragen toe die mensen bij deze dienst en plaats echt stellen,
  bijvoorbeeld over het werkgebied, de aanpak of de offerte, zodat de FAQ ook nieuwe zoekvragen dekt. Ook die
  antwoorden moeten door de feiten of bronteksten gedekt zijn. Behandel een zin uit een klant FAQ die er niet klopt of onvolledig
  uitziet nooit als feit.
  ONDERWERP VAN DE FAQ: alle vragen gaan over het onderwerp van deze pagina (bij een badkamerpagina dus over badkamers en
  sanitair, bij een lekkagepagina over lekkages). Een vraag of "Veelgestelde vraag"-feit over een andere dienst van het bedrijf
  (zoals een cv-ketel op een badkamerpagina) gebruik je niet, ook niet als de bron er een antwoord op heeft. Schrijf altijd
  minstens vier en liefst zes vragen over het onderwerp. Zijn er te weinig kant en klare vragen, maak ze dan zelf uit de feiten,
  de bronteksten en de zoekvragen (kosten, doorlooptijd, werkgebied, aanpak, merken, offerte). Een antwoord mag feiten van de
  pagina gebruiken, in eigen woorden. Een lege FAQ is nooit goed.
- Entiteiten kloppen: gebruik de bedrijfsnaam, het werkgebied en de contactgegevens EXACT zoals in de feiten. Noem
  geen andere plaatsen, wijken, straten, klanten of projecten die niet in de feiten, de bronteksten of de invoer staan.
- Lokale relevantie zonder verzinsels: maak elke pagina uniek met wat je echt weet over deze plaats uit de invoer
  en de feiten (werkgebied, afstand tot het kantoor als dat in de feiten staat). Kopieer geen tekst tussen pagina's
  van andere plaatsen door alleen de plaatsnaam te wisselen.
- Concreet en citeerbaar: korte, feitelijke zinnen, stappenplannen als genummerde stappen, diensten als opsomming.
- Alt-teksten: beschrijf wat er te zien is en noem de dienst of plaats alleen als dat klopt.`;

// Bronteksten van de klantsite (02-10-2026, zie siteTeksten.js). Aanleiding: pagina's waren te karig omdat de AI
// alleen een korte feitenlijst had, terwijl de eigen site van de klant veel meer vertelt. De AI krijgt nu de teksten
// van de hele site mee en moet daar de inhoud uit halen, zonder dat Dylan feiten hoeft uit te zoeken.
const SITE_BRON_REGELS = `BRONTEKSTEN VAN DE KLANTSITE (als ze zijn meegegeven, zijn ze je belangrijkste bron):
- Haal hier de inhoud uit: wat de diensten inhouden, wat er inbegrepen is, de werkwijze, voordelen, voor wie het is, ervaring,
  soorten werk en de manier van praten (tone of voice). Vul elk onderdeel van de pagina met concrete informatie uit deze
  teksten, niet met algemene zinnen. Een dienstkaart, stap of voordeel krijgt twee tot drie concrete zinnen als de bron dat
  toelaat, binnen de lengte-eisen van het sjabloon. Een kaart met alleen "Bekijk de mogelijkheden voor ..." is te weinig.
- Schrijf in eigen woorden en pas de tekst aan op deze pagina (dienst en plaats). Neem geen zin van meer dan acht woorden
  letterlijk over: dezelfde tekst op de hoofdsite en op de landingspagina is dubbele content. Behoud wel de feiten.
- Gebruik ALLEEN wat in de bronteksten, de feitensheet of de invoer staat. Prijzen, aantallen, jaartallen, garanties en
  certificeringen alleen als ze er exact zo staan. Bij tegenstrijdige teksten gaat de homepage of de dienstpagina voor.
- Een plaats of project uit de bronteksten blijft bij wat de bron zegt: schrijf bijvoorbeeld niet dat het kantoor in een andere
  plaats zit dan de bron zegt. Noem een plaats alleen als die in de invoer of de bronteksten staat.
- Reviews: gebruik alleen echte reviews die in de bronteksten, de feitensheet of de invoer staan, met de naam zoals de bron die geeft.
  De tekst van een review neem je LETTERLIJK over uit de bron: je mag een review inkorten door hele zinnen weg te laten, maar nooit
  herschrijven, samenvatten of woorden veranderen. Laat je een veld leeg omdat de bron niets noemt, gebruik dan een lege tekst (""),
  nooit "Niet vermeld", "Onbekend" of een streepje.
  Bij elke review zet je in het veld onder de naam (bijvoorbeeld "project") altijd hetzelfde soort gegeven: de soort klus als de
  bron die noemt (bijvoorbeeld "Verbouwing" of "Dakkapel"), anders de plaats van de klant als die er staat, anders laat je het
  veld leeg. Zet daar nooit een eigenschap of onderwerp uit de tekst, zoals "Communicatie" of "Service". Verzin geen reviews, namen of sterren.
- Mis je voor een onderdeel bronmateriaal, maak het onderdeel dan korter en feitelijker. Vul het nooit met verzinsels.`;

// Intro onder een sectiekop (13-10-2026). Aanleiding: bij MAC Bouw stond onder "Projecten" op meerdere pagina's de verzonnen
// vulzin "MAC Bouw toont uiteenlopende projecten, van verbouw en timmerwerk tot werkzaamheden buiten de woning."
const SECTIE_INTRO_REGELS = `INTRO ONDER EEN SECTIEKOP (slots die eindigen op "Intro", zoals projectsIntro, offerIntro, uspIntro, stepsIntro, reviewsIntro en faqIntro; heroIntro valt hier niet onder):
- Schrijf een of twee korte, concrete zinnen die de bezoeker helpen bij wat hij in die sectie ziet, op basis van de bronteksten, de feiten of de invoer.
- Schrijf het bedrijf nooit als iemand die iets "toont", "laat zien", "presenteert" of "een overzicht biedt". Dus niet: "[Bedrijf] toont uiteenlopende projecten, van ... tot ...". Zo'n zin zegt niets en is geen feit.
- Bij projecten, reviews en foto's: noem alleen wat echt in de bron of in de lijst van de sectie staat. Noem geen soorten werk of plaatsen die niet in de bron staan.
- De intro bij projecten (projectsIntro) gaat over de getoonde projecten zelf, nooit over de ervaring of het aantal jaren van het bedrijf. Dat staat al in de hero of bij waarom klanten kiezen.
- Heb je voor zo'n intro geen bron of niets concreets te zeggen, laat het veld dan leeg (""). Een lege intro is beter dan een vulzin.`;

// Volledige zinnen (21-10-2026): een kop, label of intro is een zin die op zichzelf klopt. Geen losse zinsdelen als
// "zonder zelf alle vakmensen te organiseren?" (dat is de helft van een zin met een vraagteken erachter).
const VOLLEDIGE_ZINNEN_REGELS = `VOLLEDIGE ZINNEN (geldt voor elk tekstveld):
- Elke zin staat op zichzelf en klopt grammaticaal. Een zin begint met een hoofdletter en heeft een onderwerp en een werkwoord, tenzij het een kort label of een kop is.
- Schrijf nooit een los zinsdeel met een vraagteken, zoals "zonder zelf alle vakmensen te organiseren?". Een vraag is een echte vraag ("Wil je ... ?", "Hoe ... ?"), anders schrijf je een gewone zin.
- Lees elk veld na voordat je antwoordt, alsof een bezoeker het voor het eerst leest. Klopt de zin niet of mist er iets, schrijf hem dan opnieuw.`;

function buildTemplateSystemPrompt({ campagne } = {}) {
  return `Je bent een senior webdesigner/frontend-developer voor een Nederlands marketingbureau. Je
ontwerpt een COMPLEET, BESPOKE HTML+CSS-sjabloon voor een terugkerend paginatype — niet de inhoud van
een individuele pagina, en NIET beperkt tot een vast blokkenpalet. Ontwerp zoals een goede
webdesigner dat zou doen: overweeg fotografie/iconen, ronde hoeken en zachte schaduwen op kaarten,
getinte/afwisselende sectie-achtergronden, asymmetrische tekst+beeld-layouts, een consistente
accentkleur, en gebruik een referentiepagina (indien gegeven) als concreet structuurvoorbeeld — niet
om te kopieren, maar om vergelijkbare kwaliteit en opbouw te evenaren.

${ONTWERP_TOOLKIT}

${campagne ? campagneKennis.CAMPAGNE_SJABLOON_REGELS : SEO_GEO_SJABLOON_REGELS}

${SLOT_SCHEMA_REFERENCE}

Antwoord ALLEEN met een JSON-object met exact twee velden, geen tekst erbuiten:
{
  "blueprint": <het blueprint-object hierboven>,
  "voorbeeldSlotData": <object met per slot-key een voorbeeldwaarde (tekst of array van items), puur om
    meteen een visueel voorbeeld te tonen, dit wordt niet opgeslagen. Staat er in de gegevens van de klant een
    blok "ECHTE GEGEVENS VAN DE KLANT", gebruik dan daaruit de echte bedrijfsnaam, plaats, diensten, werkwijze,
    voordelen en toon, en verzin geen andere plaatsen of cijfers. Een veld waarvoor de bron niets zegt maak je kort
    of laat je leeg. Is er geen bron, dan is duidelijk herkenbare Nederlandse placeholder tekst goed>
}`;
}

// model (optioneel): overschrijft OPENAI_MODEL voor deze ene aanroep. Bouwen met chat gebruikt zo OPENAI_MODEL_CHAT.
async function callOpenAi({ systemPrompt, userPrompt, beelden, reasoningEffort, model: modelOverride }) {
  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
    throw new Error('callOpenAi: systemPrompt ontbreekt of is leeg (typfout in de aanroep?).');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is niet gezet — kan geen sjabloon-voorstel genereren. Zie besluiten.md, Bouwstap 6.'
    );
  }
  const model = modelOverride || process.env.OPENAI_MODEL || 'gpt-5.5';
  const basis = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        // Met screenshots (zie screenshots.js) gaat de prompt als tekst plus afbeeldingen mee.
        content: Array.isArray(beelden) && beelden.length
          ? [{ type: 'text', text: userPrompt }, ...beelden.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))]
          : userPrompt
      }
    ],
    response_format: { type: 'json_object' }
    // Geen temperature-parameter: GPT-5.5 (redeneermodel) ondersteunt alleen
    // de standaardwaarde (1) — zie besluiten.md.
  };
  const verstuur = (body) => fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  // reasoningEffort (29-09-2026): minder nadenken = sneller. Alleen meegestuurd als een aanroeper erom vraagt
  // (feedback per onderdeel). Accepteert het model de parameter niet, dan proberen we het zonder.
  let res = await verstuur(reasoningEffort ? { ...basis, reasoning_effort: reasoningEffort } : basis);
  if (!res.ok && reasoningEffort && res.status === 400) {
    const tekst = await res.clone().text().catch(() => '');
    if (/reasoning/i.test(tekst)) res = await verstuur(basis);
  }
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
  const blueprint = zorgVoorGalerijSlot({ ...result.blueprint, templateFormat: 'slots' });
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
- achtergrond: ${tokens.bg} (var(--lp-bg)), alternatieve achtergrond: ${tokens.bgAlt} (var(--lp-bg-alt)), donkere achtergrond: ${tokens.bgDark || tokens.primaryDark} (var(--lp-bg-dark), voor donkere secties met witte tekst, bv. een sfeervolle band, cijfers of de afsluitende CTA; gebruik dit ritme van licht en donker als de klantsite dat ook doet)
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

// Echte gegevens van de klant voor het ontwerpen van een sjabloon en het voorbeeld (Pagr., 14-10-2026).
// Aanleiding: het sjabloonvoorbeeld voor MAC Bouw toonde verzonnen tekst ("Dakkapel laten plaatsen in Amsterdam"),
// omdat de AI alleen de huisstijl kreeg en niet wat de klant doet en waar. Nu krijgt hij bedrijf, plaats, werkgebied
// en een deel van de teksten van de eigen site. Nooit blokkerend: lukt het niet, dan gaat het sjabloon door zonder.
const SJABLOON_BRON_MAX_WOORDEN = 9000; // gelijk aan MAX_WOORDEN_TOTAAL in siteTeksten.js (was 3500)

// maxWoorden: standaard 3500 (sjablonen). De chat (Bouwen met chat) vraagt 9000, gelijk aan Content genereren,
// omdat hij echte teksten schrijft en dus de hele site (tot 14 pagina's) als bron nodig heeft.
async function formatKlantBronnenVoorSjabloon(klant, { maxWoorden = SJABLOON_BRON_MAX_WOORDEN } = {}) {
  let profile = null;
  try {
    const { getLpClient } = require('./clients');
    profile = getLpClient(klant).profile;
  } catch (err) {
    return '';
  }
  const bedrijf = (profile && profile.bedrijf) || {};
  const regels = [];
  if (bedrijf.naam) regels.push(`- bedrijfsnaam: ${bedrijf.naam}`);
  if (bedrijf.adres && bedrijf.adres.plaats) regels.push(`- vestigingsplaats: ${bedrijf.adres.plaats}`);
  if (Array.isArray(bedrijf.werkgebied) && bedrijf.werkgebied.length) regels.push(`- werkgebied: ${bedrijf.werkgebied.join(', ')}`);
  if (bedrijf.url) regels.push(`- website: ${bedrijf.url}`);
  if (profile && profile.toonNotitie) regels.push(`- toon: ${profile.toonNotitie}`);
  let teksten = '';
  try {
    const { haalSiteTeksten, formatSiteTekstenVoorPrompt, kapAfOpWoorden } = require('./siteTeksten');
    const site = await haalSiteTeksten({ url: bedrijf.url });
    teksten = kapAfOpWoorden(formatSiteTekstenVoorPrompt(site), maxWoorden);
  } catch (err) {
    teksten = '';
  }
  if (!regels.length && !teksten) return '';
  return `ECHTE GEGEVENS VAN DE KLANT (gebruik deze voor de voorbeeldtekst, verzin geen andere plaatsen, diensten of cijfers):
${regels.join('\n')}${teksten ? `\n\nTeksten van de eigen website van de klant (bron voor diensten, werkwijze, voordelen en toon):\n${teksten}` : ''}`;
}

function buildVasteOnderdelenTekst(verplichteOnderdelen) {
  const keys = (Array.isArray(verplichteOnderdelen) ? verplichteOnderdelen : []).filter((k) => VASTE_ONDERDELEN_LABELS[k]);
  const metGalerij = keys.includes('galerij');
  const gekozen = keys.filter((k) => k !== 'galerij').map((key) => VASTE_ONDERDELEN_LABELS[key]);
  const galerijTekst = metGalerij
    ? ' Neem ook een galerij / slideshow op: maak een sectie met een kop en een korte intro en zet daarin exact de marker {{galerij}} (zie de uitleg over de galerij hierboven). Verzin zelf geen slideshow, geen scripts en geen eigen galerij-HTML.'
    : '';
  return keys.length
    ? `Verplicht op elke pagina van dit type: ${gekozen.length ? gekozen.join(', ') : 'geen vaste tekstonderdelen'} (naast de altijd-verplichte hero, CTA en interne links). Voeg zelf gerust extra secties toe als dat bij de referentie/het paginatype past.${galerijTekst}`
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
  overigeWensen,
  screenshots,
  campagne
}) {
  const systemPrompt = buildTemplateSystemPrompt({ campagne: Boolean(campagne) });
  const beelden = schoonScreenshots(screenshots);
  const referentieTekst = await formatReferenceForPrompt(referentieUrl);
  const [klantSiteTekst, klantBronnen] = await Promise.all([formatKlantSiteVoorPrompt(klant), formatKlantBronnenVoorSjabloon(klant)]);
  const brandingTekst = formatBrandingForPrompt(klant) + '\n\n' + klantSiteTekst + (klantBronnen ? '\n\n' + klantBronnen : '');
  const userPrompt = `Klant: ${klant}
Naam van dit sjabloon: ${naam}
Paginatype / doel: ${paginatype || '(niet opgegeven)'}
Visuele richting: ${beschrijfVisueleRichting(visueleRichting)}
Belangrijkste conversiedoel (primaire actie van de bezoeker): ${conversiedoel || '(niet opgegeven)'}
${buildVasteOnderdelenTekst(verplichteOnderdelen)}
${overigeWensen ? `Overige wensen: ${overigeWensen}` : ''}

${brandingTekst}

${referentieTekst}${beelden.length ? `\n\n${screenshotUitleg(beelden.length)}` : ''}`;

  const result = await callOpenAi({ systemPrompt, userPrompt, beelden });
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

${await formatKlantBronnenVoorSjabloon(klant)}

Huidig blueprint:
${JSON.stringify(huidigBlueprint, null, 2)}

Huidige voorbeeldSlotData:
${JSON.stringify(huidigeVoorbeeldSlotData, null, 2)}

Feedback van de gebruiker: ${feedback}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  return extractProposal(result);
}

// Feedback per onderdeel (29-09-2026, zie sectieRefine.js): de AI past ALLEEN de gekozen sectie aan (of maakt
// een nieuw onderdeel na een sectie) en geeft alleen de wijziging terug. Veel korter dan het hele sjabloon
// opnieuw schrijven, en de rest van het sjabloon blijft mechanisch onaangeroerd.
async function refineSectionProposal({ klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback, sectie }) {
  if (!feedback || !feedback.trim()) {
    throw new Error('Vul feedback in om het voorstel aan te passen.');
  }
  const { haalSectie, slotSleutelsIn, pasSectiePatchToe } = require('./sectieRefine');
  const modus = sectie && sectie.modus === 'voeg_toe_na' ? 'voeg_toe_na' : 'vervang';
  const doel = haalSectie(huidigBlueprint && huidigBlueprint.htmlTemplate, Number(sectie && sectie.index));
  const nr = Number(sectie.index) + 1;
  const sample = huidigeVoorbeeldSlotData && typeof huidigeVoorbeeldSlotData === 'object' ? huidigeVoorbeeldSlotData : {};
  const sleutels = slotSleutelsIn(doel.html);
  const slots = Array.isArray(huidigBlueprint.slots) ? huidigBlueprint.slots : [];
  const sampleDeel = {};
  sleutels.forEach((k) => { if (k in sample) sampleDeel[k] = sample[k]; });

  const systemPrompt = `Je bent een senior webdesigner/frontend-developer voor een Nederlands marketingbureau. Je past
een ONDERDEEL van een bestaand landingspagina-sjabloon aan op basis van feedback. Je werkt op precies een
onderdeel (een <section>); de rest van het sjabloon raak je niet aan en krijg je alleen als referentie.

${ONTWERP_TOOLKIT}

${SEO_GEO_SJABLOON_REGELS}

${SLOT_SCHEMA_REFERENCE}

${modus === 'vervang'
  ? `OPDRACHT: pas onderdeel ${nr} aan volgens de feedback. Geef het VOLLEDIGE nieuwe onderdeel terug in "sectieHtml".`
  : `OPDRACHT: maak een NIEUW onderdeel dat direct NA onderdeel ${nr} komt, volgens de feedback. "sectieHtml" is alleen dat nieuwe onderdeel.`}

Antwoord ALLEEN met een JSON-object, geen tekst erbuiten:
{
  "sectieHtml": string,   // precies een <section ...>...</section>, gebruik alleen bestaande slot-keys of nieuwe uit "slotsToevoegen"
  "cssToevoegen": string, // nieuwe CSS voor dit onderdeel, elke selector onder ".lpt", gebruik NIEUWE unieke klassenamen voor nieuwe stijlen
  "cssVervangen": [ { "zoek": string, "vervang": string } ], // alleen als een BESTAANDE regel moet veranderen. "zoek" staat letterlijk en precies een keer in de huidige CSS en hoort alleen bij dit onderdeel. Leeg laten als niet nodig.
  "slotsToevoegen": [ ],  // nieuwe slot-definities (zelfde vorm als in het blueprint), alleen als dit onderdeel echt nieuwe velden nodig heeft
  "voorbeeldSlotDataToevoegen": { }, // voorbeeldwaarden voor die nieuwe slots (herkenbare Nederlandse placeholder)
  "uitleg": string        // een zin: wat je hebt veranderd
}
Regels: verander niets buiten dit onderdeel. Wijzig bestaande CSS-regels zo min mogelijk, want klassen kunnen ook bij andere
onderdelen horen; geef nieuwe stijlen liever een nieuwe klasse. Bevat het onderdeel de <h1>, dan blijft die {{heroTitle}}.
Hernoem of verwijder geen bestaande slots.`;

  const userPrompt = `Klant: ${klant}
Naam van dit sjabloon: ${naam}

${formatBrandingForPrompt(klant)}

${await formatKlantSiteVoorPrompt(klant)}

Huidige HTML van onderdeel ${nr} (van ${doel.aantal}):
${doel.html}

Huidige CSS van het hele sjabloon (alleen ter referentie):
${huidigBlueprint.cssTemplate || ''}

Bestaande slots:
${JSON.stringify(slots.map((s) => ({ key: s.key, type: s.type, itemFields: s.itemFields })))}

Voorbeeldwaarden van de slots in dit onderdeel:
${JSON.stringify(sampleDeel, null, 2)}

Feedback van de gebruiker: ${feedback}`;

  const patch = await callOpenAi({
    systemPrompt,
    userPrompt,
    reasoningEffort: process.env.OPENAI_REFINE_EFFORT || 'low'
  });
  const toegepast = pasSectiePatchToe(huidigBlueprint, sample, { modus, index: Number(sectie.index) }, patch);
  return {
    blueprint: { ...toegepast.blueprint, templateFormat: 'slots' },
    voorbeeldSlotData: toegepast.voorbeeldSlotData,
    waarschuwingen: toegepast.waarschuwingen,
    uitleg: typeof patch.uitleg === 'string' ? patch.uitleg : ''
  };
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
const IMAGE_SRC_RE = /imagesrc$/i;
const IMAGE_ALT_RE = /imagealt$/i;
// Zelfde soort vaste naamgevingsafspraak als ImageSrc/ImageAlt hierboven, nu voor een enkel,
// vast gepositioneerd linkveld in een sjabloon (bv. "roomsLinkHref": een link naar de
// kamers/verblijf-pagina) - dit is GEEN lijst zoals linksItems, maar verdient dezelfde
// bescherming: nooit een url laten verzinnen, alleen uit de aangeleverde kandidatenlijst kiezen.
// "ctaHref" matcht hier bewust niet op (dat is de losse boekingslink, geen contentlink).
const LINK_HREF_RE = /LinkHref$/;

function getImageSlots(template, slotData) {
  const slots = Array.isArray(template.slots) ? template.slots : [];
  const result = [];
  slots.forEach((s) => {
    if (s.type === 'list' && Array.isArray(s.itemFields)) {
      const velden = s.itemFields.filter((f) => IMAGE_SRC_RE.test(f));
      if (!velden.length) return;
      const items = Array.isArray(slotData && slotData[s.key]) ? slotData[s.key] : [];
      items.forEach((item, idx) => {
        velden.forEach((veld) => {
          const context = item && typeof item === 'object' ? item.title || item.text || item.label || '' : '';
          result.push({ key: `${s.key}.${idx}.${veld}`, label: `${s.label || s.key} #${idx + 1}`, context });
        });
      });
      return;
    }
    if (IMAGE_SRC_RE.test(s.key)) {
      result.push({ key: s.key, label: s.label || s.key, context: '' });
    }
  });
  return result;
}

function buildContentSystemPrompt(template, { derde, mix, campagne } = {}) {
  const slots = Array.isArray(template.slots) ? template.slots : [];
  const tekstSlots = slots.filter((s) => !IMAGE_SRC_RE.test(s.key) && !IMAGE_ALT_RE.test(s.key));
  // Zowel losse afbeelding-slots als een afbeelding-itemveld binnen een lijst (bv.
  // offerItems[].imageSrc) horen hier - anders verzint de AI hieronder een placeholder-pad voor
  // dat lijstveld, precies de fout die bij Roots/Festivals op 28-09-2026 gevonden is.
  const afbeeldingVeldNamen = [];
  slots.forEach((s) => {
    if (s.type === 'list' && Array.isArray(s.itemFields)) {
      const velden = s.itemFields.filter((f) => IMAGE_SRC_RE.test(f) || IMAGE_ALT_RE.test(f));
      if (velden.length) afbeeldingVeldNamen.push(`${s.key} (${velden.join(', ')})`);
    } else if (IMAGE_SRC_RE.test(s.key) || IMAGE_ALT_RE.test(s.key)) {
      afbeeldingVeldNamen.push(s.key);
    }
  });
  const slotBeschrijving = tekstSlots
    .map(
      (s) =>
        `- ${s.key} (${s.type}${s.type === 'list' ? `, velden: ${(s.itemFields || []).join(', ')}` : ''}${
          s.verplicht ? ', verplicht' : ''
        }): ${s.label || ''}`
    )
    .join('\n');
  const galerijNotitie = slots.some((s) => s.key === 'galleryItems')
    ? `\n\nGalerij: geef bij "galleryItems" precies 6 items terug, elk alleen { "caption": "" }. Foto's, alt-teksten en
bijschriften worden later apart gevuld uit de mediabibliotheek. Verzin geen bijschriften.`
    : '';
  const afbeeldingNotitie = afbeeldingVeldNamen.length
    ? `\n\nVul geen enkel afbeelding-veld in, ook niet met een placeholder-tekst of verzonnen URL —
dit geldt zowel voor een los afbeelding-slot als voor het afbeeldingveld binnen een lijst-item:
${afbeeldingVeldNamen.join(', ')}. Bij een lijst-item laat je dat ene veld gewoon weg uit het
item-object, de overige velden van dat item vul je wel gewoon in. Deze velden worden apart
(automatisch of handmatig) gevuld vanuit de mediabibliotheek.`
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
${ICON_NAMES.join(', ')}.\nKies per item het icoon dat het best bij dat onderwerp past (bijvoorbeeld hammer voor verbouw, layers voor renovatie, wrench voor onderhoud en reparatie). Gebruik binnen een lijst elk icoon hooguit een keer.`
    : '';

  return `Je schrijft de INHOUD voor één landingspagina, binnen een AL GOEDGEKEURD sjabloon. De
structuur/opmaak ligt al vast (dat pas je niet aan) — jij vult alleen de genoemde slots met concrete,
Nederlandse tekst op basis van de aangeleverde informatie. Gebruik ALLEEN feiten die expliciet zijn
aangeleverd (bronteksten van de klantsite, feitensheet, invoervelden, "waar gaat deze pagina over") — verzin
geen adressen, prijzen, data of andere harde feiten.

${SITE_BRON_REGELS}

${SECTIE_INTRO_REGELS}

${VOLLEDIGE_ZINNEN_REGELS}

${paginaOpbouwRegels({ derde: Boolean(derde), mix: Boolean(mix) })}

Slots die gevuld moeten worden:
${slotBeschrijving}${afbeeldingNotitie}${galerijNotitie}${iconNotitie}

${campagne ? campagneTekstRegels() : seoTekstRegels()}

Antwoord ALLEEN met een JSON-object met exact één veld, geen tekst erbuiten:
{ "slotData": <object met per slot-key de ingevulde waarde (tekst of array van items)> }`;
}

// Een campagnepagina (24-10-2026): geen interne links en geen SEO/GEO regels, wel de campagnekennis.
function campagneTekstRegels() {
  return `${campagneKennis.CAMPAGNE_CONTENT_REGELS}

Voor "metaTitle"/"metaDescription": platte tekst binnen de lengte-eisen, nooit de [ankertekst](url)-schrijfwijze.
Een slot met een naam die eindigt op "LinkHref" en geen "#aanvraag" is: laat leeg.`;
}

function seoTekstRegels() {
  return `Interne links — kwaliteit boven kwantiteit: je krijgt een lijst "Beschikbare linkbestemmingen" (een
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
dan leeg in plaats van zelf iets te verzinnen.`;
}

// Goedgekeurd voorbeeld (21-10-2026): een pagina van deze klant en dit sjabloon die door Dylan is aangepast en goedgekeurd.
// Voorbeelden werken beter dan regels: de AI kopieert opbouw, stem, naamgebruik, lengtes en detailniveau van het voorbeeld
// en wijzigt alleen onderwerp, plaats en feiten. Elke verbetering in het voorbeeld geldt zo voor elke volgende pagina.
function bouwVoorbeeldBlok(voorbeeld) {
  if (!voorbeeld || !voorbeeld.slotData) return '';
  const velden = {};
  verhaal.tekstVelden(voorbeeld.slotData).forEach((v) => { velden[v.pad] = v.tekst; });
  const tekst = JSON.stringify(velden, null, 1);
  if (tekst.length < 50) return '';
  return `\n\nGOEDGEKEURD VOORBEELD (pagina "${voorbeeld.titel || ''}", door de klant en de opdrachtgever zelf aangepast en goedgekeurd; pad: tekst):
${tekst.slice(0, 12000)}

Dit voorbeeld gaat voor op alle andere stijlregels. Schrijf de nieuwe pagina op dezelfde manier:
- Zelfde opbouw en dezelfde soort inhoud per onderdeel. Zelfde aanspreekvorm en dezelfde manier om het bedrijf te noemen, inclusief hoe vaak en waar de bedrijfsnaam staat.
- Koppen, labels en intro's even lang en met dezelfde zinsbouw als in het voorbeeld. Zelfde aantal items per lijst, tenzij de feiten minder of meer toelaten.
- Dezelfde toon, hetzelfde detailniveau en dezelfde manier om veelgestelde vragen en antwoorden te formuleren.
- Wijzig alleen het onderwerp, de plaats en de feiten die bij deze pagina horen. Kopieer geen zinnen letterlijk: elke zin die over de dienst of de plaats gaat schrijf je opnieuw. Heeft het voorbeeld iets dat niet bij dit onderwerp past (een andere dienst), neem dat dan niet over.`
    + bouwExtraVoorbeeldenBlok(voorbeeld.extra);
}

// Meer live pagina's als voorbeeld (23-10-2026): het eerste voorbeeld bepaalt de opbouw, deze laten zien hoe de stijl varieert.
// Nooit zinnen overnemen, anders gaan de pagina's op elkaar lijken.
function bouwExtraVoorbeeldenBlok(extra) {
  const lijst = (Array.isArray(extra) ? extra : []).filter((e) => e && e.slotData);
  if (!lijst.length) return '';
  const delen = lijst.map((e) => {
    const velden = {};
    verhaal.tekstVelden(e.slotData).forEach((v) => { velden[v.pad] = v.tekst; });
    return `--- ${e.titel || 'pagina'} ---\n${JSON.stringify(velden, null, 1).slice(0, 5000)}`;
  });
  return `\n\nNOG ${lijst.length === 1 ? 'EEN' : lijst.length} LIVE ${lijst.length === 1 ? 'PAGINA' : "PAGINA'S"} VAN DEZE KLANT (alleen om de stijl te herkennen, het eerste voorbeeld gaat voor):\n${delen.join('\n\n')}\n\nKijk wat deze pagina's gemeen hebben: toon, aanspreekvorm, lengte, manier van noemen van het bedrijf. Dat doe jij ook. Kopieer geen zinnen en geen voorbeelden: elke zin schrijf je opnieuw voor het nieuwe onderwerp.`;
}

// Teksten van zusterpagina's (zelfde klant en sjabloon), zodat de nieuwe pagina er niet op gaat lijken.
// Pagina's die alleen in de plaatsnaam verschillen zijn slecht voor SEO en GEO (doorway pagina's).
function bouwZusterBlok(zusterInhoud, { metVoorbeeld } = {}) {
  const lijst = Array.isArray(zusterInhoud) ? zusterInhoud.filter((z) => z && z.tekst) : [];
  if (!lijst.length) return '';
  return `

Bestaande zusterpagina's van deze klant met hetzelfde sjabloon (alleen ter vergelijking):
${lijst.map((z) => `--- ${z.titel} ---\n${z.tekst}`).join('\n\n')}

Belangrijk voor SEO en GEO: deze nieuwe pagina mag NIET op deze zusterpagina's lijken. ${metVoorbeeld ? 'Opbouw, stem en lengtes volgen het goedgekeurde voorbeeld. Gebruik wel andere zinnen en andere voorbeelden dan deze zusterpagina\'s.' : 'Gebruik andere zinnen, een andere volgorde van argumenten, andere voorbeelden en andere kopjes.'} Kopieer geen zinnen en verander niet alleen de plaatsnaam. Onderscheid de pagina met wat er specifiek is voor deze plaats of dit onderwerp, maar alleen als dat in de feiten staat (zoals "Lokale informatie"). Noem geen plaatsnamen van de zusterpagina's, tenzij de feiten dat vragen.`;
}

// Echte zoekvragen en de vragen die al op zusterpagina's staan (Pagr., 14-10-2026). Zie zoekvragen.js.
// De AI moet de FAQ opbouwen uit wat mensen echt zoeken en geen vragen herhalen die al op een zusterpagina staan.
function bouwVragenBlok({ zoekvragen, zusterVragen } = {}) {
  const echte = (Array.isArray(zoekvragen) ? zoekvragen : []).map((z) => (typeof z === 'string' ? z : z && z.vraag)).filter(Boolean);
  const bezet = Array.isArray(zusterVragen) ? zusterVragen.filter(Boolean) : [];
  if (!echte.length && !bezet.length) return '';
  let tekst = '';
  if (echte.length) {
    tekst += `\n\nECHTE ZOEKVRAGEN bij deze dienst (Google suggesties, dit zoeken mensen echt):\n${echte.map((v) => `- ${v}`).join('\n')}\nBouw de veelgestelde vragen hier vooral uit op: kies er drie tot vijf die bij deze pagina passen en herschrijf ze natuurlijk (voeg de plaats toe als dat logisch is). Gebruik alleen vragen die over het onderwerp van deze pagina gaan en sla vragen over andere diensten van het bedrijf over. Beantwoord alleen wat de bronteksten, de feiten of de invoer dekken. Is een vraag niet te beantwoorden zonder te verzinnen, sla hem dan over.`;
  }
  if (bezet.length) {
    tekst += `\n\nVRAGEN DIE AL OP ZUSTERPAGINA'S STAAN (gebruik deze NIET opnieuw, ook niet met alleen een andere plaatsnaam):\n${bezet.slice(0, 40).map((v) => `- ${v}`).join('\n')}\nHooguit een vraag mag er sterk op lijken, namelijk de vraag of het bedrijf in deze plaats werkt. Alle andere vragen moeten anders zijn.`;
  }
  return tekst;
}

// Waar de pagina's van dit sjabloon over gaan (16-10-2026). Een sjabloon kan een gedupliceerde variant zijn met dezelfde
// opzet maar een ander onderwerp (bv. dakkapellen naast algemene verbouw). De opzet blijft gelijk, de inhoud volgt het onderwerp.
function bouwFocusBlok(focus) {
  if (!focus || (!focus.onderwerp && !focus.instructie)) return '';
  return `\n\nONDERWERP VAN DIT SJABLOON (geldt voor elke pagina die op dit sjabloon wordt gemaakt):
${focus.onderwerp ? `Onderwerp: ${focus.onderwerp}\n` : ''}${focus.instructie ? `Hier moet de pagina rekening mee houden: ${focus.instructie}\n` : ''}Regels:
- De hele pagina gaat over dit onderwerp: kop, intro, diensten of onderdelen, voordelen, stappen en veelgestelde vragen. Andere diensten van het bedrijf noem je hooguit kort en niet als hoofdonderwerp.
- Gebruik uit de bronteksten van de klantsite vooral wat over dit onderwerp gaat (pagina's, feiten, werkwijze, voorbeelden). Verzin niets: staat er in de bronteksten of feiten niets over een deel van het onderwerp, laat dat deel dan weg of formuleer het algemeen.
- De opbouw en het aantal onderdelen blijven zoals het sjabloon ze vraagt.`;
}


// ---- Stap 2 van de verhaallijn (19-10-2026): eerst een plan per onderdeel, dan pas de tekst ----

function sectieOverzichtVoorPrompt(template) {
  return verhaal.verhaalSecties(template).map((sec) => ({
    rol: sec.rol,
    naam: verhaal.ROL_TAKEN[sec.rol].naam,
    taak: verhaal.ROL_TAKEN[sec.rol].taak,
    slots: sec.slots.map((x) => ({ key: x.key, label: x.label, type: x.type, velden: x.itemFields }))
  }));
}

const SCHRIJFPLAN_SYSTEEMPROMPT = `Je bent eindredacteur van een landingspagina. Je schrijft nog geen tekst. Je maakt het PLAN dat een tekstschrijver straks volgt, zodat de pagina een verhaal wordt dat de bezoeker van begin tot eind meeneemt en nergens hetzelfde zegt.

De bezoeker stelt in deze volgorde vragen: herkent dit bedrijf mijn vraag (hero), wat doen ze precies voor mij (aanbod), waarom zij (waarom), wat gebeurt er na mijn aanvraag (werkwijze), is dit echt waar (bewijs), wat als het misgaat (twijfels), hoe begin ik (actie). Elk onderdeel van de pagina beantwoordt een van die vragen en bouwt voort op het vorige.

REGELS
- Gebruik alleen punten die in de feiten, het klantverhaal of de bronteksten staan. Verzin niets.
- Elk punt (feit, voordeel of reden) krijgt een plek waar het uitgebreid staat ("uitgebreid") en hooguit een plek waar het kort terugkomt ("kort"). Nooit op drie plekken.
- Geef elk onderdeel een eigen kernboodschap in een zin, die duidelijk anders is dan die van de andere onderdelen.
- Schrijf per onderdeel wat het voor de bezoeker oplevert (rust, tijd, zekerheid) en niet alleen wat het bedrijf doet.
- Gebruik bij bewijs alleen echte reviews en projecten uit het klantverhaal of de bronteksten. Is er geen bewijs, zeg dat dan bij "bewijs" en laat het onderdeel zo kort mogelijk.
- Zijn er twijfels van klanten bekend (klantverhaal), laat dan de twijfel-onderdelen die beantwoorden. Anders de gebruikelijke zorgen bij dit soort werk, alleen als de bronteksten er iets over zeggen.
{{HERO_STEM}}
- Schrijf eenvoudig Nederlands. Gebruik geen streepjes als leesteken.

ANTWOORD ALLEEN MET JSON:
{
  "leidraad": "twee zinnen: wat voelt en doet de bezoeker aan het einde van de pagina",
  "secties": [ { "rol": "hero", "slots": ["heroTitle","heroIntro"], "kernboodschap": "een zin", "gebruik": ["korte aanduiding van feit of klantverhaalpunt"], "nietHier": ["wat hier juist niet mag staan omdat het elders staat"] } ],
  "verdeling": [ { "punt": "feit of reden in een paar woorden", "uitgebreid": "slotnaam", "kort": "slotnaam of leeg" } ]
}
"secties" bevat precies de onderdelen die je in de lijst krijgt, in dezelfde volgorde en met dezelfde slotnamen.`;

function schoonPlan(ruw, template) {
  if (!ruw || typeof ruw !== 'object' || !Array.isArray(ruw.secties)) return null;
  const tekst = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const lijst = (v, max, n) => (Array.isArray(v) ? v : []).map((x) => tekst(x, max)).filter(Boolean).slice(0, n);
  const geldig = new Set((Array.isArray(template && template.slots) ? template.slots : []).map((x) => x.key));
  const secties = ruw.secties.map((sec) => ({
    rol: verhaal.ROLLEN.includes(sec && sec.rol) ? sec.rol : 'overig',
    slots: lijst(sec && sec.slots, 60, 12).filter((k) => geldig.has(k)),
    kernboodschap: tekst(sec && sec.kernboodschap, 240),
    gebruik: lijst(sec && sec.gebruik, 160, 6),
    nietHier: lijst(sec && sec.nietHier, 160, 6)
  })).filter((sec) => sec.slots.length && sec.kernboodschap).slice(0, 12);
  if (!secties.length) return null;
  const verdeling = (Array.isArray(ruw.verdeling) ? ruw.verdeling : []).map((v) => ({
    punt: tekst(v && v.punt, 120), uitgebreid: tekst(v && v.uitgebreid, 60), kort: tekst(v && v.kort, 60)
  })).filter((v) => v.punt && v.uitgebreid).slice(0, 20);
  return { leidraad: tekst(ruw.leidraad, 400), secties, verdeling };
}

function bouwSchrijfplanBlok(plan) {
  if (!plan) return '';
  const regels = [`SCHRIJFPLAN (door de eindredacteur opgesteld, volg dit plan; het voorkomt dat onderdelen hetzelfde zeggen)`];
  if (plan.leidraad) regels.push(`Leidraad van de pagina: ${plan.leidraad}`);
  regels.push('Per onderdeel:');
  plan.secties.forEach((sec) => {
    const naam = verhaal.ROL_TAKEN[sec.rol] ? verhaal.ROL_TAKEN[sec.rol].naam : sec.rol;
    regels.push(`- ${naam} (${sec.slots.join(', ')}): ${sec.kernboodschap}${sec.gebruik.length ? ` Gebruik: ${sec.gebruik.join('; ')}.` : ''}${sec.nietHier.length ? ` Niet hier: ${sec.nietHier.join('; ')}.` : ''}`);
  });
  if (plan.verdeling.length) {
    regels.push('Waar elk punt staat (op de aangewezen plek uitgebreid, op de korte plek hooguit een zin, nergens anders):');
    plan.verdeling.forEach((v) => regels.push(`- ${v.punt}: uitgebreid bij ${v.uitgebreid}${v.kort ? `, kort bij ${v.kort}` : ''}`));
  }
  regels.push('Schrijf elk onderdeel vanuit de kernboodschap van dat onderdeel. Geen enkele zin mag op twee plekken staan.');
  return regels.join('\n');
}

// Ronde 1. Mislukt dit, dan schrijft de AI toch een pagina (zonder plan): nooit blokkerend.
async function maakSchrijfPlan({ klant, template, invoer, feiten, watGaatDezePaginaOver, siteTeksten, klantverhaal, bedrijfsnaam, campagneBlok }) {
  const overzicht = sectieOverzichtVoorPrompt(template);
  if (!overzicht.length) return null;
  const userPrompt = `Klant: ${klant}
Onderwerp van de pagina: ${watGaatDezePaginaOver || '(niet opgegeven)'}${campagneBlok ? `${campagneBlok}\nMaak het plan voor een campagnepagina: de hero sluit aan op het zoekwoord of de advertentie, elk onderdeel helpt de bezoeker naar de aanvraag, de vragen nemen twijfels weg. Bepaal in het plan eerst de ene dienst waar de pagina over gaat en welke diensten, projecten en feiten van de klant NIET op deze pagina horen. De kicker en de kop in de hero zijn verschillende woorden, het slot voor de aanbieding bevat een echte aanbieding of blijft leeg.` : ''}
Invoervelden: ${JSON.stringify(invoer || {})}

Onderdelen van de pagina, in de volgorde waarin ze staan:
${JSON.stringify(overzicht, null, 2)}

Feiten (alleen wat hier of in het klantverhaal of de bronteksten staat mag gebruikt worden):
${JSON.stringify(feiten || [])}

${bouwKlantverhaalBlok(klantverhaal, { bedrijfsnaam, derde: schrijftInDerdePersoon(klant), mix: schrijftInMix(klant) }) || 'Er is geen goedgekeurd klantverhaal.'}
${derdePersoonVoor(klant, bedrijfsnaam)}

${siteTeksten ? `Bronteksten van de klantsite (ingekort):\n${String(siteTeksten).slice(0, 14000)}` : 'Er zijn geen bronteksten van de klantsite.'}`;
  const derde = schrijftInDerdePersoon(klant);
  const ruw = await callOpenAi({ systemPrompt: SCHRIJFPLAN_SYSTEEMPROMPT.replace('{{HERO_STEM}}', schrijftInMix(klant)
    ? '- Kies voor de hero een persoonlijke opening: de bezoeker direct aanspreken met "je", de bedrijfsnaam een keer bij naam noemen en daarna "wij". Volg het blok AANSPREEKVORM VOOR DEZE KLANT.'
    : derde
    ? '- Kies voor de hero een persoonlijke opening: de bezoeker direct aanspreken met "je" en het bedrijf in de derde persoon. Nooit "wij".'
    : '- Kies voor de hero een persoonlijke opening: de bezoeker direct aanspreken en het bedrijf als "wij".'), userPrompt });
  const plan = schoonPlan(ruw, template);
  if (!plan) console.warn('[schrijfplan] geen bruikbaar plan, ruwe uitvoer:', JSON.stringify(ruw).slice(0, 800));
  return plan;
}

// ---- Stap 3: een tweede, onafhankelijke lezer en het herschrijven van alleen de aangewezen onderdelen ----

const REDACTIE_SYSTEEMPROMPT = `Je bent een kritische eindredacteur die een landingspagina leest zoals een bezoeker: iemand die een aanvraag overweegt en twijfelt. Je hebt de pagina niet geschreven en je bent niet aardig voor de schrijver.

Beoordeel in deze volgorde van belang:
1. {{STEM_VRAAG}}
2. Staat dezelfde boodschap op meer dan twee plekken, of beginnen onderdelen met hetzelfde idee?
3. Klopt de verhaallijn: eerst herkenning, dan wat het bedrijf doet, waarom zij, hoe het werkt, bewijs, twijfels, actie? Staat iets op een verkeerde plek of ontbreekt een stap?
4. Is er bewijs (echte reviews, echte projecten, echte cijfers) of alleen beweringen?
5. Staan er lege zinnen die niets zeggen, of beloften zonder feit?
6. Wordt een echte twijfel van de bezoeker (kosten, planning, overlast, vergunning) beantwoord?
7. Gaat elke veelgestelde vraag over het onderwerp van de pagina? Een vraag over een andere dienst (cv-ketel op een badkamerpagina) is een verbetering: wijs de FAQ-slots aan en vraag om vragen over het onderwerp, of om minder vragen.

REGELS
- Geef maximaal 5 verbeteringen, de belangrijkste eerst. Liever 2 raak dan 5 vaag. Is de pagina goed, geef dan een lege lijst.
- Elke verbetering wijst naar de slots (sleutels uit de pagina) die herschreven moeten worden, en geeft een concrete opdracht aan de schrijver. Geen algemene adviezen.
- Verzin geen nieuwe feiten in je opdracht. Gebruik alleen wat in de pagina, het klantverhaal of de feiten staat.
- Herhaal geen punt dat al in de lijst "al gevonden" staat.
- Schrijf eenvoudig Nederlands. Gebruik geen streepjes als leesteken.

ANTWOORD ALLEEN MET JSON: { "verbeteringen": [ { "slots": ["slotnaam"], "probleem": "wat een bezoeker hier merkt, een zin", "aanwijzing": "concrete opdracht aan de schrijver" } ] }`;

async function redactieReview({ klant, template, slotData, klantverhaal, bedrijfsnaam, alGevonden }) {
  const velden = verhaal.tekstVelden(slotData);
  if (velden.length < 3) return [];
  const pagina = {};
  velden.forEach((v) => { pagina[v.pad] = v.tekst; });
  const sleutels = [...new Set(velden.map((v) => v.slot))];
  const userPrompt = `Klant: ${klant}
Onderdelen en hun rol in het verhaal:
${JSON.stringify(sectieOverzichtVoorPrompt(template), null, 2)}

De pagina (pad: tekst):
${JSON.stringify(pagina, null, 2)}

${bouwKlantverhaalBlok(klantverhaal, { bedrijfsnaam, derde: schrijftInDerdePersoon(klant), mix: schrijftInMix(klant) }) || 'Er is geen goedgekeurd klantverhaal.'}
${derdePersoonVoor(klant, bedrijfsnaam)}

Al gevonden door de automatische controle (herhaal deze niet):
${(alGevonden || []).map((t) => `- ${t}`).join('\n') || '(niets)'}

Toegestane slotnamen voor "slots": ${sleutels.join(', ')}`;
  const derde = schrijftInDerdePersoon(klant);
  const ruw = await callOpenAi({ systemPrompt: REDACTIE_SYSTEEMPROMPT.replace('{{STEM_VRAAG}}', schrijftInMix(klant)
    ? 'Spreekt de pagina de bezoeker direct aan met "je", met de bedrijfsnaam op de vaste plekken en "wij" in de rest (nooit een persoon, nooit hij of hem)? Laat de stem zoals hij is en beoordeel alleen of de tekst concreet en leesbaar is in plaats van een opsomming van beweringen.'
    : derde
    ? 'Spreekt de pagina de bezoeker direct aan met "je", terwijl het bedrijf in de derde persoon blijft (de bedrijfsnaam of "het bedrijf", nooit wij, we of onze, nooit een persoon)? Laat de stem zoals hij is en beoordeel alleen of de tekst concreet en leesbaar is in plaats van een opsomming van beweringen.'
    : 'Spreekt de pagina de bezoeker persoonlijk aan, of klinkt het als een brochure (bedrijfsnaam voluit, "het bedrijf", lijdende vorm)?'), userPrompt });
  const toegestaan = new Set(sleutels);
  const tekst = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  return (Array.isArray(ruw && ruw.verbeteringen) ? ruw.verbeteringen : [])
    .map((v) => ({
      slots: [...new Set((Array.isArray(v && v.slots) ? v.slots : []).map((k) => tekst(k, 60)).filter((k) => toegestaan.has(k)))],
      probleem: tekst(v && v.probleem, 300),
      aanwijzing: tekst(v && v.aanwijzing, 600)
    }))
    .filter((v) => v.slots.length && v.probleem && v.aanwijzing)
    .slice(0, 5);
}

const HERSCHRIJF_SYSTEEMPROMPT = `Je herschrijft een DEEL van een bestaande landingspagina. De rest van de pagina blijft zoals hij is en staat hieronder ter context, zodat je niets herhaalt wat er al staat en de toon gelijk blijft.

REGELS
- Je krijgt de slots die je moet herschrijven en een opdracht. Geef alleen die slots terug, in dezelfde vorm: een tekstslot als tekst, een lijstslot als lijst met precies dezelfde velden per item en hetzelfde aantal items in dezelfde volgorde.
- Gebruik alleen feiten uit de feiten, het klantverhaal en de bronteksten. Verzin geen cijfers, namen of beloften. Reviews blijven letterlijk zoals ze zijn.
- Vul geen afbeeldingvelden in. Laat die velden weg.
- Behoud links in de vorm [tekst](url) alleen als de url al in de huidige tekst staat.
- {{STEM_REGEL}} Eenvoudig Nederlands, zonder streepjes als leesteken.

ANTWOORD ALLEEN MET JSON: { "slotData": { "<slotnaam>": ... } }`;

const NIET_HERSCHRIJFBAAR_RE = /^(meta|cta|links)|(Href|Src|Alt)$/i;

async function herschrijfOnderdelen({ klant, template, slotData, slots, aanwijzing, klantverhaal, bedrijfsnaam, feiten, siteTeksten, voorbeeld, correcties }) {
  const definitie = new Map((Array.isArray(template && template.slots) ? template.slots : []).map((x) => [x.key, x]));
  const gevraagd = [...new Set(Array.isArray(slots) ? slots : [])].filter((k) => definitie.has(k) && !NIET_HERSCHRIJFBAAR_RE.test(k) && slotData && slotData[k] !== undefined);
  if (!gevraagd.length) throw new Error('Er is geen onderdeel gekozen dat herschreven kan worden.');
  const huidig = {};
  gevraagd.forEach((k) => { huidig[k] = slotData[k]; });
  const rest = {};
  verhaal.tekstVelden(slotData).forEach((v) => { if (!gevraagd.includes(v.slot)) rest[v.pad] = v.tekst; });
  const userPrompt = `Klant: ${klant}

Opdracht: ${String(aanwijzing || '').slice(0, 800) || 'Maak deze onderdelen persoonlijker en haal herhaling weg.'}

Te herschrijven slots (huidige inhoud):
${JSON.stringify(huidig, null, 2)}

Beschrijving van die slots:
${JSON.stringify(gevraagd.map((k) => ({ key: k, type: definitie.get(k).type, label: definitie.get(k).label, velden: definitie.get(k).itemFields })), null, 2)}

De rest van de pagina (pad: tekst), niet aanpassen:
${JSON.stringify(rest, null, 2)}

Feiten: ${JSON.stringify(feiten || [])}

${bouwKlantverhaalBlok(klantverhaal, { bedrijfsnaam, derde: schrijftInDerdePersoon(klant), mix: schrijftInMix(klant) }) || 'Er is geen goedgekeurd klantverhaal.'}
${derdePersoonVoor(klant, bedrijfsnaam)}

${paginaOpbouwRegels({ derde: schrijftInDerdePersoon(klant), mix: schrijftInMix(klant) })}

${bouwVoorbeeldBlok(voorbeeld)}${leren.bouwCorrectiesBlok(correcties)}

${siteTeksten ? `Bronteksten van de klantsite (ingekort):\n${String(siteTeksten).slice(0, 14000)}` : ''}`;
  const ruw = await callOpenAi({ systemPrompt: HERSCHRIJF_SYSTEEMPROMPT.replace('{{STEM_REGEL}}', schrijftInMix(klant)
    ? 'Spreek de bezoeker direct aan met "je". Gebruik de bedrijfsnaam alleen op de vaste plekken uit het blok AANSPREEKVORM VOOR DEZE KLANT en schrijf in de rest "wij", "we" en "ons". Nooit een persoonsnaam, nooit hij of hem.'
    : schrijftInDerdePersoon(klant)
    ? 'Spreek de bezoeker direct aan met "je" en schrijf over het bedrijf in de derde persoon. Nooit wij, we, ons, onze of een persoonsnaam.'
    : 'Schrijf persoonlijk en direct.'), userPrompt });
  const nieuw = ruw && typeof ruw.slotData === 'object' && ruw.slotData ? ruw.slotData : null;
  if (!nieuw) throw new Error('Het AI-antwoord miste het veld "slotData". Er is niets veranderd.');
  const resultaat = {};
  gevraagd.forEach((k) => {
    const waarde = nieuw[k];
    const def = definitie.get(k);
    if (def.type === 'list') {
      if (!Array.isArray(waarde) || !waarde.length) return;
      const oud = Array.isArray(slotData[k]) ? slotData[k] : [];
      resultaat[k] = waarde.filter((i) => i && typeof i === 'object').map((item, i) => {
        const samen = { ...item };
        // Afbeeldingen en andere niet herschreven velden blijven bij hun item.
        const vorig = oud[i] && typeof oud[i] === 'object' ? oud[i] : {};
        Object.keys(vorig).forEach((veld) => {
          if (IMAGE_SRC_RE.test(veld) || IMAGE_ALT_RE.test(veld) || !(def.itemFields || []).includes(veld)) samen[veld] = vorig[veld];
          // Een herschrijving mag nooit bestaande tekst wissen: komt een veld leeg terug, dan blijft de oude tekst staan.
          else if (typeof vorig[veld] === 'string' && vorig[veld].trim() && !String(samen[veld] == null ? '' : samen[veld]).trim()) samen[veld] = vorig[veld];
        });
        return samen;
      });
    } else if (typeof waarde === 'string' && waarde.trim()) {
      resultaat[k] = waarde;
    }
  });
  if (!Object.keys(resultaat).length) throw new Error('Het AI-antwoord bevatte geen bruikbare tekst voor deze onderdelen. Er is niets veranderd.');
  // Dezelfde veiligheidsnetten als bij het schrijven van een pagina.
  const toegestaneLinks = [];
  const bekijk = (t) => { String(t || '').replace(INLINE_LINK_RE, (m, label, href) => { toegestaneLinks.push({ url: href }); return m; }); };
  forEachTextLeaf(slotData, (pad, w) => bekijk(w));
  verwijderVerzonnenLinks(resultaat, toegestaneLinks);
  verwijderPlaceholderWaarden(resultaat);
  verwijderReviewAanhalingstekens(resultaat);
  return { slotData: { ...slotData, ...resultaat }, gewijzigd: Object.keys(resultaat) };
}


// Korte projectteksten in de stem van de klant (22-10-2026). Bron is alleen het uittreksel van de klantsite:
// niets erbij verzinnen, geen cijfers of plaatsen die er niet staan. Geeft { [projectId]: tekst }.
async function schrijfProjectTeksten({ klant, bedrijfsnaam, projecten }) {
  if (!Array.isArray(projecten) || !projecten.length) return {};
  const derde = schrijftInDerdePersoon(klant);
  const stem = schrijftInMix(klant)
    ? `Schrijf met "wij", "we" of "ons", of met de bedrijfsnaam "${bedrijfsnaam}". Nooit een persoonsnaam en nooit hij of hem.`
    : derde
    ? `Schrijf in de derde persoon met de bedrijfsnaam "${bedrijfsnaam}" als onderwerp. Nooit wij, we, ons, onze, jullie of een persoonsnaam.`
    : 'Schrijf persoonlijk en direct, wij mag.';
  const systemPrompt = `Je schrijft voor een Nederlandse landingspagina bij elk project van een bedrijf een korte tekst van een of twee volledige zinnen (maximaal 35 woorden).
Gebruik ALLEEN wat in het uittreksel staat. Verzin niets, noem geen cijfers, prijzen, plaatsen of materialen die niet in het uittreksel staan. Gebruik geen superlatieven.
Elke zin is grammaticaal compleet. ${stem}
Heeft een uittreksel te weinig inhoud, geef dan een lege tekst.
Antwoord ALLEEN met JSON: { "teksten": { "<id>": "<tekst>" } }`;
  const userPrompt = `Projecten:\n${JSON.stringify(projecten.map((p) => ({ id: String(p.id), titel: p.titel, uittreksel: p.tekst })), null, 2)}`;
  const ruw = await callOpenAi({ systemPrompt, userPrompt });
  const teksten = ruw && typeof ruw.teksten === 'object' && ruw.teksten ? ruw.teksten : {};
  const uit = {};
  projecten.forEach((p) => { const t = teksten[String(p.id)]; if (typeof t === 'string' && t.trim()) uit[p.id] = t.trim(); });
  return uit;
}

// Binnen een lijst (bijvoorbeeld de dienstkaarten) krijgt elk item een eigen icoon. Dubbele iconen worden vervangen door
// het best passende icoon dat nog vrij is, op basis van woorden in de titel en tekst van het item.
const ICOON_TREFWOORDEN = [
  [/(verbouw|uitbreid|aanbouw|dakopbouw|nieuwbouw|bouw)/i, 'hammer'],
  [/(renovat|vernieuw|opknap)/i, 'layers'],
  [/(timmer|onderhoud|herstel|reparat|houtrot)/i, 'wrench'],
  [/(schilder|verf|afwerk)/i, 'paint'],
  [/(dakkapel|zon|licht)/i, 'sun'],
  [/(vergunning|tekening|ontwerp|plan|begroting|offerte)/i, 'ruler'],
  [/(kosten|prijs|tarief|betaal)/i, 'euro'],
  [/(contact|bel|telefoon|vraag)/i, 'phone'],
  [/(ervaring|jaar|sinds|actief)/i, 'calendar'],
  [/(review|beoordel|tevreden)/i, 'star'],
  [/(persoon|team|vakman|eigenaar|samen)/i, 'users'],
  [/(garantie|zeker|veilig)/i, 'shield'],
  [/(woning|huis|woon)/i, 'home']
];
const ICOON_RESERVE = ['check', 'shield', 'star', 'users', 'info', 'key', 'ruler', 'hammer', 'wrench', 'layers', 'home', 'calendar'];

function verdeelIconen(slotData) {
  if (!slotData || typeof slotData !== 'object') return;
  Object.values(slotData).forEach((lijst) => {
    if (!Array.isArray(lijst) || lijst.length < 2) return;
    const items = lijst.filter((it) => it && typeof it === 'object' && typeof it.icon === 'string' && it.icon);
    if (items.length < 2) return;
    const gebruikt = new Set();
    items.forEach((it) => {
      if (!gebruikt.has(it.icon)) { gebruikt.add(it.icon); return; }
      const tekst = `${it.title || ''} ${it.text || ''}`;
      const passend = ICOON_TREFWOORDEN.filter(([re, naam]) => re.test(tekst) && !gebruikt.has(naam) && ICON_NAMES.includes(naam)).map(([, naam]) => naam);
      const keuze = passend[0] || ICOON_RESERVE.find((n) => !gebruikt.has(n) && ICON_NAMES.includes(n));
      if (keuze) { it.icon = keuze; gebruikt.add(keuze); }
    });
  });
}

async function generatePageContent({ klant, template, invoer, feiten, watGaatDezePaginaOver, ctaOverride, linkKandidaten, zusterInhoud, siteTeksten, zoekvragen, zusterVragen, klantverhaal, bedrijfsnaam, zonderPlan, voorbeeld, correcties, campagne, campagneVoorkeuren }) {
  const systemPrompt = buildContentSystemPrompt(template, { derde: schrijftInDerdePersoon(klant), mix: schrijftInMix(klant), campagne: Boolean(campagne) });
  const campagneBlok = campagneKennis.bouwCampagneBlok(campagne, campagneVoorkeuren);
  // Een campagnepagina heeft geen interne links: geen kandidaten, dan verwijdert verwijderVerzonnenLinks ook elke link.
  if (campagne) linkKandidaten = [];
  // Ronde 1: een plan per onderdeel. Mislukt het, dan schrijven we gewoon zonder plan.
  let schrijfplan = null;
  let planWaarschuwing = null;
  if (!zonderPlan) {
    try {
      schrijfplan = await maakSchrijfPlan({ klant, template, invoer, feiten, watGaatDezePaginaOver, siteTeksten, klantverhaal, bedrijfsnaam, campagneBlok });
    } catch (planErr) {
      planWaarschuwing = `Het plan voor de verhaallijn kon niet gemaakt worden (${planErr.message}), de tekst is zonder plan geschreven.`;
    }
    if (!schrijfplan && !planWaarschuwing) {
      planWaarschuwing = 'De AI gaf geen bruikbaar schrijfplan terug, dus de tekst is zonder plan geschreven. Probeer het nog een keer.';
    }
  }
  const userPrompt = `Klant: ${klant}

Invoervelden voor deze pagina:
${JSON.stringify(invoer || {}, null, 2)}

Waar deze pagina over gaat (door de gebruiker aangeleverd, gebruik dit als leidraad voor de
hero/intro-achtige slots en om de pagina te onderscheiden van vergelijkbare pagina's):
${watGaatDezePaginaOver || '(niet opgegeven)'}${bouwFocusBlok(template.focus)}${campagneBlok}

${
  ctaOverride
    ? `CTA voor deze specifieke pagina (afwijkend van het sjabloon-default): ${ctaOverride}`
    : 'Geen CTA-afwijking opgegeven, gebruik een passende standaard-actie.'
}

Aangevinkte feiten uit de feitensheet (bronprincipe — gebruik uitsluitend deze, verzin niets extra's):
${JSON.stringify(feiten || [], null, 2)}

${siteTeksten ? `Bronteksten van de eigen website van de klant (automatisch gelezen, ${siteTeksten.split('\n--- ').length} pagina's). Dit is je hoofdbron voor de inhoud, volg de regels voor brontekst hierboven:\n${siteTeksten}` : 'Er zijn geen bronteksten van de klantsite beschikbaar, werk alleen met de feiten en de invoer.'}

${bouwKlantverhaalBlok(klantverhaal, { bedrijfsnaam, derde: schrijftInDerdePersoon(klant), mix: schrijftInMix(klant) }) || 'Er is voor deze klant nog geen goedgekeurd klantverhaal, volg de opbouwregels hierboven en werk alleen met de bronteksten en de feiten.'}

${derdePersoonVoor(klant, bedrijfsnaam)}

${bouwSchrijfplanBlok(schrijfplan)}${bouwVoorbeeldBlok(voorbeeld)}${leren.bouwCorrectiesBlok(correcties)}

Feiten met "standaard": true zijn vaste praktische gegevens van de klant (bv. in- en uitchecktijden, kamertypes, ligging). Neem ze op in de praktische informatie en de kamertypes van de pagina, voor zover het sjabloon daar een plek voor heeft, en gebruik de formulering (bv. namen van kamertypes en tijden) precies zoals ze er staan.
${campagne ? '' : `
Beschikbare linkbestemmingen (zusterpagina: true = andere landingspagina van deze klant binnen LP
Fabriek, zusterpagina: false = een echte, bestaande pagina op de eigen live website — behandel beide
even serieus, gebruik uitsluitend de opgegeven url, kies alleen wat inhoudelijk relevant is):
${JSON.stringify(linkKandidaten || [], null, 2)}`}${bouwZusterBlok(zusterInhoud, { metVoorbeeld: Boolean(voorbeeld && voorbeeld.slotData) })}${bouwVragenBlok({ zoekvragen, zusterVragen })}`;

  const result = await callOpenAi({ systemPrompt, userPrompt });
  if (!result || typeof result !== 'object' || !result.slotData) {
    throw new Error('OpenAI-antwoord miste het verwachte veld "slotData".');
  }
  const slotData = { ...result.slotData };
  verwijderVerzonnenAfbeeldingen(slotData, template);
  verwijderVerzonnenLinks(slotData, linkKandidaten);
  verwijderPlaceholderWaarden(slotData);
  verwijderReviewAanhalingstekens(slotData);
  verdeelIconen(slotData);
  const iconProblemen = findUnknownIcons(slotData);
  const iconWarning = iconProblemen.length
    ? `Niet-herkende icoonwaarde(n) gevonden (${iconProblemen
        .map((p) => `${p.path}: "${p.value}"`)
        .join(', ')}) — deze tonen nu een neutraal fallback-icoon. Pas de content aan met een geldige icoonnaam.`
    : null;
  return { slotData, iconWarning, schrijfplan, planWaarschuwing };
}

// Een veld in een lijst-item zonder bron (bv. de soort klus onder een review) hoort leeg te blijven. Het model vult
// soms toch een tekst als "Niet vermeld" in omdat het slot verplicht lijkt; die tekst zou dan zichtbaar op de pagina
// komen (02-10-2026, bloemendaal). Alleen velden binnen een lijst, nooit losse tekstvelden.
const PLACEHOLDER_WAARDE_RE = /^\s*(niet vermeld|niet bekend|onbekend|n\.?\s?v\.?\s?t\.?|n\/a|geen|unknown|-+|\u2014)\s*\.?\s*$/i;
function verwijderPlaceholderWaarden(slotData) {
  forEachTextLeaf(slotData, (path, value, set) => {
    if (!path.includes('.')) return;
    if (PLACEHOLDER_WAARDE_RE.test(value)) set('');
  });
}

// Defensief: ook als het model zich niet aan de instructie in buildContentSystemPrompt houdt en
// toch een afbeelding-veld invult (een los ImageSrc/ImageAlt-slot, of zo'n veld binnen een
// lijst-item, bv. offerItems[].imageSrc), wordt dat hier verwijderd — nooit een verzonnen URL of
// placeholder-pad laten staan. Los geëxporteerd zodat dit zonder een echte OpenAI-aanroep te
// testen is, zelfde opzet als verwijderVerzonnenLinks hieronder.
function verwijderVerzonnenAfbeeldingen(slotData, template) {
  for (const key of Object.keys(slotData)) {
    if (IMAGE_SRC_RE.test(key) || IMAGE_ALT_RE.test(key)) delete slotData[key];
  }
  const slots = Array.isArray(template && template.slots) ? template.slots : [];
  slots.forEach((s) => {
    if (s.type !== 'list' || !Array.isArray(slotData[s.key])) return;
    slotData[s.key].forEach((item) => {
      if (!item || typeof item !== 'object') return;
      for (const veld of Object.keys(item)) {
        if (IMAGE_SRC_RE.test(veld) || IMAGE_ALT_RE.test(veld)) delete item[veld];
      }
    });
  });
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
async function pickImagesForPage({
  template,
  invoer,
  feiten,
  watGaatDezePaginaOver,
  kandidaten,
  slotData,
  afbeeldingSlots: afbeeldingSlotsOverride,
  fotoRichtlijn
}) {
  // afbeeldingSlotsOverride: optioneel, voor een aanroeper die zelf al een beperkte lijst heeft
  // (bv. vulVoorbeeldAan in routes/lp.js, die alleen nog LEGE afbeeldingvelden wil laten kiezen).
  // Zonder override: alle afbeelding-slots van dit sjabloon, inclusief één entry per item van een
  // lijst met een afbeeldingveld (bv. offerItems.0.imageSrc, offerItems.1.imageSrc, ...) - slotData
  // is nodig om te weten hoeveel items zo'n lijst heeft.
  const afbeeldingSlots = afbeeldingSlotsOverride || getImageSlots(template, slotData);
  if (!afbeeldingSlots.length || !Array.isArray(kandidaten) || !kandidaten.length) {
    return { picks: {} };
  }

  const slotsBeschrijving = afbeeldingSlots
    .map((s) => {
      const projectHint = /project/i.test(s.key) && !s.context ? ' (gaat over: een foto van een afgerond project van het bedrijf, zoals een verbouwing, uitbreiding, keuken of tuinhuis; geen portret, logo of foto met tekst)' : '';
      return `- "${s.key}": ${s.label || s.key}${s.context ? ` (gaat over: ${s.context})` : projectHint}`;
    })
    .join('\n');

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

Kies voor elk slot een andere foto: gebruik nooit twee keer dezelfde kandidaat, ook niet voor verschillende slots.

Antwoord ALLEEN met een JSON-object met exact één veld:
{ "picks": { "<slotKey>": { "kandidaatId": <getal, of null>, "alt": "<korte alt-tekst, leeg als kandidaatId null is>" }, ... } } — precies één entry per genoemde slot.`;

  const context = `Waar deze pagina over gaat: ${watGaatDezePaginaOver || '(niet opgegeven)'}

Invoervelden:
${JSON.stringify(invoer || {}, null, 2)}

Relevante feiten:
${JSON.stringify(feiten || [], null, 2)}
${fotoRichtlijn ? `\nRichtlijn van de klant voor de fotokeuze (geef hier de voorkeur aan als er een foto is die erbij past; past er niets, volg dan gewoon de regels hierboven): ${fotoRichtlijn}\n` : ''}
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
  SLOT_SCHEMA_REFERENCE,
  SITE_BRON_REGELS,
  VOLLEDIGE_ZINNEN_REGELS,
  formatKlantSiteVoorPrompt,
  schrijftInMix,
  schrijfProjectTeksten,
  verdeelIconen,
  bouwFocusBlok,
  VASTE_ONDERDELEN_OPTIES,
  VASTE_ONDERDELEN_LABELS,
  formatBrandingForPrompt,
  VISUELE_RICHTINGEN,
  ONTWERP_TOOLKIT,
  SEO_GEO_SJABLOON_REGELS,
  SEO_GEO_CONTENT_REGELS,
  SECTIE_INTRO_REGELS,
  beschrijfVisueleRichting,
  buildTemplateSystemPrompt,
  buildContentSystemPrompt,
  buildVasteOnderdelenTekst,
  callOpenAi,
  generateTemplateProposal,
  refineTemplateProposal,
  refineSectionProposal,
  generatePageContent,
  maakSchrijfPlan,
  bouwSchrijfplanBlok,
  schoonPlan,
  redactieReview,
  herschrijfOnderdelen,
  bouwZusterBlok,
  bouwVoorbeeldBlok,
  bouwVragenBlok,
  formatKlantBronnenVoorSjabloon,
  getImageSlots,
  pickImagesForPage,
  // Puur voor de geautomatiseerde tests - geen aparte OpenAI-aanroep nodig om de
  // anti-hallucinatie-filtering op link- en afbeeldingvelden te controleren.
  verwijderVerzonnenLinks,
  verwijderPlaceholderWaarden,
  verwijderVerzonnenAfbeeldingen
};
